import { describe, expect, it } from 'vitest';
import { createLineagePlan, getInheritedNodeIds, getLineageSlotMap, updateLineageNode, type LineageConstraints } from '../../src/domain/lineage';
import { evaluateLineage, requiredStars } from '../../src/engine/lineage-evaluation';
import { calculateReferenceAptitudes, applyReferenceRedStars } from '../../src/engine/reference-aptitude';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

const noGoals: LineageConstraints = { grandparentGoals: {}, preserveParentFactorTargets: false };
const change = (evaluation: ReturnType<typeof evaluateLineage>, nodeId: string, type = 'mile') => evaluation.nodeEvaluations[nodeId]!.changes.find((row) => row.type === type)!;

describe('lineage generation windows and public initial aptitude rules', () => {
  it('matches the existing seven-person aptitude engine at the root', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    pedigree.parentA.redFactor = { type: 'mile', stars: 3 };
    pedigree.grandA1.redFactor = { type: 'dirt', stars: 2 };
    const evaluated = evaluateLineage(createLineagePlan(pedigree), snapshot, noGoals);
    const expected = calculateReferenceAptitudes(pedigree, snapshot);
    const summary = ({ type, base, result, totalStars, gradeSteps }: { type: string; base: string; result: string; totalStars: number; gradeSteps: number }) => ({ type, base, result, totalStars, gradeSteps });
    expect(evaluated.nodeEvaluations.target!.changes.map(summary)).toEqual(expected.changes.map(summary));
  });

  it('depth three affects a grandparent and parent; depth four affects that grandparent only', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    let plan = updateLineageNode(createLineagePlan(pedigree), 'ancestor_7', { redFactor: { type: 'mile', stars: 3 } });
    let evaluation = evaluateLineage(plan, snapshot, noGoals);
    expect(change(evaluation, 'grandA1')).toMatchObject({ base: 'C', result: 'B', totalStars: 3 });
    expect(change(evaluation, 'parentA')).toMatchObject({ base: 'C', result: 'B', totalStars: 3 });
    expect(change(evaluation, 'target')).toMatchObject({ base: 'C', result: 'C', totalStars: 0 });
    expect(evaluation.nodeEvaluations.grandA1!.plannedContributorIds).toContain('ancestor_7');
    plan = updateLineageNode(plan, 'ancestor_15', { redFactor: { type: 'mile', stars: 3 } });
    evaluation = evaluateLineage(plan, snapshot, noGoals);
    expect(change(evaluation, 'grandA1')).toMatchObject({ result: 'A', totalStars: 6 });
    expect(change(evaluation, 'parentA')).toMatchObject({ result: 'B', totalStars: 3 });
    expect(change(evaluation, 'target').totalStars).toBe(0);
  });

  it.each([['E', 'A', 10], ['D', 'A', 7], ['C', 'A', 4], ['B', 'A', 1], ['A', 'A', 0], ['G', 'A', null], ['G', 'C', 10], ['A', 'S', null], ['S', 'S', 0]] as const)('minimum stars %s -> %s is %s', (base, goal, expected) => {
    expect(requiredStars(base, goal)).toBe(expected);
  });

  it('uses the public four-step maximum at 18 stars, preserves S and rejects invalid totals', () => {
    expect(applyReferenceRedStars('G', 18)).toBe('C');
    expect(applyReferenceRedStars('E', 18)).toBe('A');
    expect(applyReferenceRedStars('S', 18)).toBe('S');
    expect(() => applyReferenceRedStars('G', 19)).toThrow();
    expect(() => applyReferenceRedStars('G', -1)).toThrow();
    expect(() => applyReferenceRedStars('G', 1.5)).toThrow();
  });

  it('checks generation A and the caller-selected rotation without fixed universal grades', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    const plan = createLineagePlan(pedigree);
    const constraints: LineageConstraints = { grandparentGoals: { grandA1: { targetFactorType: 'mile', rotationRequirements: { dirt: 'D', long: 'C' }, geneType: null } }, preserveParentFactorTargets: false };
    const evaluated = evaluateLineage(plan, snapshot, constraints);
    expect(evaluated.checks.find((row) => row.kind === 'factor-target')).toMatchObject({ type: 'mile', targetGrade: 'A', actualGrade: 'C', requiredStars: 4, satisfied: false });
    expect(evaluated.checks.find((row) => row.type === 'dirt')).toMatchObject({ targetGrade: 'D', requiredStars: 7 });
    expect(evaluated.checks.find((row) => row.type === 'long')).toMatchObject({ targetGrade: 'C', satisfied: true });
    expect(evaluated.hardSatisfied).toBe(false);
  });

  it('preserves parent factor-generation conditions across the great-grandparent window', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    pedigree.parentA.redFactor = { type: 'mile', stars: 3 };
    const plan = createLineagePlan(pedigree);
    const evaluated = evaluateLineage(plan, snapshot, { grandparentGoals: {} });
    expect(evaluated.checks).toContainEqual(expect.objectContaining({ nodeId: 'parentA', type: 'mile', requiredStars: 4, kind: 'parent-factor-target', satisfied: false }));
    expect(evaluateLineage(plan, snapshot, noGoals).checks).toHaveLength(0);
  });

  it('counts genotype stars from exactly six older owners and measures branch concentration', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    let plan = createLineagePlan(pedigree);
    const inherited = getInheritedNodeIds(plan, 'grandA1');
    expect(inherited).toHaveLength(6);
    for (const id of ['ancestor_7', 'ancestor_15', 'ancestor_16', 'ancestor_8']) plan = updateLineageNode(plan, id, { redFactor: { type: 'dirt', stars: 3 } });
    // The grandparent's own stars are excluded from its own six-ancestor gene condition.
    plan = updateLineageNode(plan, 'grandA1', { redFactor: { type: 'dirt', stars: 3 } });
    const constraints: LineageConstraints = { grandparentGoals: { grandA1: { targetFactorType: null, rotationRequirements: {}, geneType: 'dirt' } }, preserveParentFactorTargets: false };
    const result = evaluateLineage(plan, snapshot, constraints);
    expect(result.genes[0]).toMatchObject({ nodeId: 'grandA1', totalStars: 12, level: 12, concentration: 9, validation: 'planning-thresholds-kr-pending' });
    expect(result.genes[0]!.contributorIds).not.toContain('grandA1');
    plan = updateLineageNode(plan, 'ancestor_16', { redFactor: null });
    plan = updateLineageNode(plan, 'ancestor_8', { redFactor: null });
    expect(evaluateLineage(plan, snapshot, constraints).genes[0]).toMatchObject({ totalStars: 6, level: 6, concentration: 6 });
  });

  it('distinguishes invalid selectable owners from archived mob IDs without hiding missing selections', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    let plan = createLineagePlan(pedigree);
    const impossible: LineageConstraints = { grandparentGoals: { grandA1: { targetFactorType: 'dirt', rotationRequirements: {}, geneType: null } }, preserveParentFactorTargets: false };
    expect(evaluateLineage(plan, snapshot, impossible).checks[0]).toMatchObject({ requiredStars: null, satisfied: false });
    plan = updateLineageNode(plan, 'grandA1', { costumeId: null });
    expect(evaluateLineage(plan, snapshot, impossible)).toMatchObject({ status: 'incomplete', hardSatisfied: false });
    plan = updateLineageNode(plan, 'ancestor_15', { costumeId: 'unknown' });
    const before = structuredClone(plan);
    // P8.7.3 preserves historical deep owners but treats these slots as mobs.
    // An archived ID must neither invalidate the plan nor fill a missing grandparent.
    expect(evaluateLineage(plan, snapshot, impossible)).toMatchObject({ status: 'incomplete', hardSatisfied: false });
    expect(plan).toEqual(before);
    plan = updateLineageNode(plan, 'grandA1', { costumeId: pedigree.grandA1.costumeId });
    expect(evaluateLineage(plan, snapshot, impossible).status).toBe('valid');
    // Invalid actual selections remain errors at every selectable generation.
    for (const nodeId of ['target', 'parentA', 'grandA1']) {
      const invalid = updateLineageNode(plan, nodeId, { costumeId: 'unknown' });
      const evaluated = evaluateLineage(invalid, snapshot, impossible);
      expect(evaluated.status).toBe('invalid');
      expect(evaluated.issues.some(issue => issue.includes('의상 데이터를 찾을 수 없습니다 (unknown)'))).toBe(true);
      expect(evaluated.nodeEvaluations).toEqual({});
    }
  });

  it('rejects stale goals after a node is no longer a grandparent and leaves inputs untouched', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    const plan = createLineagePlan(pedigree);
    const before = structuredClone(plan);
    const invalid: LineageConstraints = { grandparentGoals: { ancestor_7: { targetFactorType: 'mile', rotationRequirements: {}, geneType: null } } };
    expect(evaluateLineage(plan, snapshot, invalid).status).toBe('invalid');
    expect(evaluateLineage(plan, snapshot, noGoals).nodeEvaluations[getLineageSlotMap(plan).target]!.depth).toBe(0);
    expect(plan).toEqual(before);
  });
});
