import { describe, expect, it } from 'vitest';
import { allocateRedFactors } from '../../src/engine/red-factor-allocator';
import { evaluateLineage } from '../../src/engine/lineage-evaluation';
import { createLineagePlan, getInheritedNodeIds, getLineageSlotMap, getProtectedNodeIds, setLineageLock, type LineageConstraints, type LineagePlan } from '../../src/domain/lineage';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

function sample() {
  const { snapshot, pedigree } = makeReferenceEngineFixture();
  const plan = createLineagePlan(pedigree);
  const positions = getLineageSlotMap(plan);
  const constraints: LineageConstraints = { grandparentGoals: {}, preserveParentFactorTargets: true };
  return { snapshot, plan, positions, constraints };
}

function blockStars(plan: LineagePlan, grandId: string, type: string): number {
  return getInheritedNodeIds(plan, grandId).reduce((sum, id) => sum + (plan.nodes[id]!.redFactor?.type === type ? plan.nodes[id]!.redFactor!.stars : 0), 0);
}

describe('automatic 31-node planned-factor allocation', () => {
  it('meets a grandparent factor-generation target using the public initial-aptitude table', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: null };
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.status).toBe('feasible');
    expect(result.after?.hardSatisfied).toBe(true);
    expect(result.after?.nodeEvaluations[positions.grandA1]!.changes.find((change) => change.type === 'mile'))
      .toMatchObject({ base: 'C', result: 'A', totalStars: 4 });
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.every((change) => Number(change.nodeId.replace('ancestor_', '')) >= 7)).toBe(true);
  });

  it('prefers twelve gene stars whenever hard conditions can be preserved', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: 'mile' };
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.status).toBe('feasible');
    expect(result.after?.genes).toContainEqual(expect.objectContaining({ nodeId: positions.grandA1, level: 12, totalStars: 12 }));
    expect(blockStars(result.plan!, positions.grandA1, 'mile')).toBe(12);
  });

  it('falls back to six when twelve would displace the required rotation aptitude', () => {
    const { snapshot, plan, positions, constraints } = sample();
    // G→C needs ten dirt stars; twelve mile stars cannot coexist in six slots.
    // Six mile + ten dirt stars occupy exactly two + four factors.
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: { dirt: 'C' }, geneType: 'mile' };
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.status).toBe('feasible');
    expect(result.after?.genes[0]).toMatchObject({ level: 6, totalStars: 6 });
    expect(result.after?.checks.every((check) => check.satisfied)).toBe(true);
    expect(blockStars(result.plan!, positions.grandA1, 'dirt')).toBe(10);
    expect(result.reasons.some((reason) => reason.includes('6성 대안'))).toBe(true);
  });

  it('keeps parent target conditions before upgrading both grandparent gene goals', () => {
    const { snapshot, plan, positions, constraints } = sample();
    const parentCostume = snapshot.costumes.find((row) => row.costumeId === plan.nodes[positions.parentA]!.costumeId)!;
    parentCostume.aptitudes.turf = 'B';
    plan.nodes[positions.parentA]!.redFactor = { type: 'turf', stars: 1 };
    for (const id of [positions.grandA1, positions.grandA2]) {
      constraints.grandparentGoals[id] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: 'dirt' };
    }
    // Each 12 dirt + 4 mile solution fills all six slots. At least one must use
    // its 6-star alternative to leave a great-generation slot for the parent's turf.
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.status).toBe('feasible');
    expect(result.after?.genes.map((gene) => gene.level).sort((a, b) => a - b)).toEqual([6, 12]);
    expect(result.after?.checks.find((check) => check.nodeId === positions.parentA && check.type === 'turf'))
      .toMatchObject({ satisfied: true, actualGrade: 'A' });
    const withoutParentConstraint = allocateRedFactors(plan, snapshot, { ...constraints, preserveParentFactorTargets: false });
    expect(withoutParentConstraint.after?.genes.map((gene) => gene.level)).toEqual([12, 12]);
  });

  it('concentrates identical factors in one three-node branch for the same twelve stars', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: null, rotationRequirements: {}, geneType: 'mile' };
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.status).toBe('feasible');
    // A branch can hold at most nine stars: the concentrated alternative is 9+3.
    expect(result.after?.genes[0]).toMatchObject({ totalStars: 12, concentration: 9 });
    expect(result.reasons.some((reason) => reason.includes('획득 확률 증가를 뜻하지 않습니다'))).toBe(true);
  });

  it('never changes identities, connections, younger factors or protected ancestry', () => {
    const { snapshot, plan, positions, constraints } = sample();
    const grand = plan.nodes[positions.grandA1]!;
    const fixedGreat = grand.parentIds![0];
    plan.nodes[fixedGreat]!.costumeId = 'costume_h';
    plan.nodes[fixedGreat]!.redFactor = { type: 'turf', stars: 2 };
    const locked = setLineageLock(plan, fixedGreat, true);
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: 'mile' };
    const before = structuredClone(locked);
    const result = allocateRedFactors(locked, snapshot, constraints);
    expect(result.status).toBe('feasible');
    expect(result.after?.genes[0]!.level).toBe(6);
    const protectedIds = getProtectedNodeIds(locked);
    for (const node of Object.values(before.nodes)) {
      expect(result.plan!.nodes[node.nodeId]!.costumeId).toBe(node.costumeId);
      expect(result.plan!.nodes[node.nodeId]!.parentIds).toEqual(node.parentIds);
      if (protectedIds.has(node.nodeId) || !node.nodeId.startsWith('ancestor_')) {
        expect(result.plan!.nodes[node.nodeId]!.redFactor).toEqual(node.redFactor);
      }
    }
    expect(locked).toEqual(before);
  });

  it('does not invent character identities for newly planned factors', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: null };
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.changes.every((change) => result.plan!.nodes[change.nodeId]!.costumeId === null)).toBe(true);
    expect(result.after?.nodeEvaluations[positions.grandA1]!.plannedContributorIds.length).toBeGreaterThan(0);
  });

  it('distinguishes a mathematically impossible four-rank cap from missing selections', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'dirt', rotationRequirements: {}, geneType: null };
    const impossible = allocateRedFactors(plan, snapshot, constraints);
    expect(impossible.status).toBe('infeasible');
    expect(impossible.reasons.some((reason) => reason.includes('최대 4단계'))).toBe(true);
    plan.nodes[positions.grandA1]!.costumeId = null;
    expect(allocateRedFactors(plan, snapshot, constraints).status).toBe('incomplete');
  });

  it('does not call a resource-limited search impossible or apply a partial result', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: 'mile' };
    const original = structuredClone(plan);
    const result = allocateRedFactors(plan, snapshot, constraints, { maxSearchStates: 1 });
    expect(result).toMatchObject({ status: 'search-limited', plan: null, changes: [] });
    expect(plan).toEqual(original);
  });

  it('reports a locked minimum-six gene condition that cannot be met', () => {
    const { snapshot, plan, positions, constraints } = sample();
    const grand = plan.nodes[positions.grandA1]!;
    for (const id of getInheritedNodeIds(plan, grand.nodeId)) {
      plan.nodes[id]!.costumeId = 'costume_h';
      plan.nodes[id]!.redFactor = { type: 'turf', stars: 3 };
    }
    const locked = setLineageLock(plan, grand.nodeId, true);
    constraints.grandparentGoals[grand.nodeId] = { targetFactorType: null, rotationRequirements: {}, geneType: 'mile' };
    const result = allocateRedFactors(locked, snapshot, constraints);
    expect(result.status).toBe('infeasible');
    expect(result.plan).toBeNull();
  });

  it('uses great factors for a parent but never great-great factors directly', () => {
    const { snapshot, plan, positions, constraints } = sample();
    const parentCostume = snapshot.costumes.find((row) => row.costumeId === plan.nodes[positions.parentA]!.costumeId)!;
    parentCostume.aptitudes.turf = 'B';
    plan.nodes[positions.parentA]!.redFactor = { type: 'turf', stars: 1 };
    const result = allocateRedFactors(plan, snapshot, constraints);
    expect(result.status).toBe('feasible');
    const parentEvaluation = result.after!.nodeEvaluations[positions.parentA]!;
    const turf = parentEvaluation.changes.find((change) => change.type === 'turf')!;
    expect(turf.totalStars).toBe(1);
    const directGreat = plan.nodes[positions.parentA]!.parentIds!.flatMap((grandId) => [...plan.nodes[grandId]!.parentIds!]);
    expect(turf.contributors.every((contributor) => directGreat.includes(contributor.nodeId))).toBe(true);
    expect(evaluateLineage(result.plan!, snapshot, constraints).hardSatisfied).toBe(true);
  });

  it('derives missing explicit grandparent goals and preserves default parent targets', () => {
    const { snapshot, plan, positions } = sample();
    plan.nodes[positions.grandA1]!.redFactor = { type: 'mile', stars: 1 };
    const result = allocateRedFactors(plan, snapshot, { grandparentGoals: {} });
    expect(result.status).toBe('feasible');
    expect(result.after?.checks.find((check) => check.nodeId === positions.grandA1)).toMatchObject({ satisfied: true, targetGrade: 'A' });
  });

  it('is deterministic and returns an independent plan', () => {
    const { snapshot, plan, positions, constraints } = sample();
    constraints.grandparentGoals[positions.grandA1] = { targetFactorType: 'mile', rotationRequirements: {}, geneType: 'mile' };
    const first = allocateRedFactors(plan, snapshot, constraints);
    const second = allocateRedFactors(plan, snapshot, constraints);
    expect(first.plan).toEqual(second.plan);
    expect(first.changes).toEqual(second.changes);
    first.plan!.nodes[first.changes[0]!.nodeId]!.redFactor = null;
    expect(second.plan!.nodes[first.changes[0]!.nodeId]!.redFactor).not.toBeNull();
  });
});
