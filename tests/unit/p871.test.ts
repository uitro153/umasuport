import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLineagePlan, setLineageLock } from '../../src/domain/lineage';
import { workspaceInputsSchema } from '../../src/domain/saved-plan';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { findLineageCharacterIssues, lineageEditIssue } from '../../src/engine/lineage-validity';
import { enumerateLineageArrangements } from '../../src/engine/lineage-arrangements';
import { normalizeSkillPriorities, resolveCanonicalWhiteSkillId } from '../../src/engine/skill-priorities';
import { inspectSupportLineup, type P4RecommendationRequest } from '../../src/engine/support-deck-optimizer';
import { buildP5AvailabilityContext } from '../../src/engine/p5-availability';
import { createDefaultWorkspace } from '../../src/engine/plan-persistence';
import { factorOnlyConstraints } from '../../src/engine/lineage-goals';
import { savedPlanLineageConstraints } from '../../src/engine/plan-comparison';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

describe('P8.7.1 local lineage validity (fictional identities, no game rule estimates)', () => {
  it('blocks parent pairs and child/direct-parent identity across outfits, but allows cross-branch reuse', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture(); const plan = createLineagePlan(pedigree);
    snapshot.costumes.push({ ...snapshot.costumes[3]!, costumeId: 'another-outfit' });
    plan.nodes.grandA2!.costumeId = 'another-outfit';
    expect(findLineageCharacterIssues(plan, snapshot)).toHaveLength(1);
    plan.nodes.grandA2!.costumeId = 'costume_e'; plan.nodes.parentA!.costumeId = 'another-outfit';
    expect(findLineageCharacterIssues(plan, snapshot)[0]!.message).toContain('직접 부모');
    plan.nodes.parentA!.costumeId = 'costume_b'; plan.nodes.grandB1!.costumeId = 'another-outfit';
    expect(findLineageCharacterIssues(plan, snapshot)).toEqual([]);
  });
  it('excludes impossible arrangements rather than lowering their score, and keeps locks', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture(); const plan = createLineagePlan(pedigree);
    plan.nodes.grandA2!.costumeId = plan.nodes.grandA1!.costumeId;
    const before = structuredClone(plan); const rows = enumerateLineageArrangements(plan, snapshot);
    expect(rows).toHaveLength(4);
    expect(rows.every(row => findLineageCharacterIssues(row.plan, snapshot).length === 0)).toBe(true);
    expect(enumerateLineageArrangements(setLineageLock(plan, 'parentA', true), snapshot)).toEqual([]);
    expect(plan).toEqual(before);
  });
  it('P8.7.3 preserves legacy deep owners as mob archives without duplicate-character conflicts', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture(); const plan = createLineagePlan(pedigree);
    plan.nodes.ancestor_7!.costumeId = 'costume_a'; plan.nodes.ancestor_8!.costumeId = 'costume_a';
    expect(findLineageCharacterIssues(plan, snapshot)).toHaveLength(0);
    const next = structuredClone(plan); next.nodes.ancestor_8!.costumeId = 'costume_h';
    expect(lineageEditIssue(plan, next, snapshot)).toBeUndefined();
    expect(plan.nodes.ancestor_8!.costumeId).toBe('costume_a');
  });
  it('builds only red-factor goals with no hidden rotation/gene constraints', () => {
    const { pedigree } = makeReferenceEngineFixture(); const plan = createLineagePlan(pedigree);
    plan.nodes.grandA1!.redFactor = { type: 'dirt', stars: 3 };
    const constraints = factorOnlyConstraints(plan);
    expect(constraints.preserveParentFactorTargets).toBe(true);
    expect(constraints.grandparentGoals.grandA1).toEqual({ targetFactorType: 'dirt', rotationRequirements: {}, geneType: null });
    expect(Object.values(constraints.grandparentGoals).every(goal => goal.geneType === null && !Object.keys(goal.rotationRequirements).length)).toBe(true);
    const legacy = createDefaultWorkspace(); legacy.referencePlan = plan;
    legacy.lineageDesign = { profileId: 'mixed-mile-middle', rotationGrade: 'A', geneEnabled: true, geneType: 'dirt' };
    expect(savedPlanLineageConstraints(legacy)).toEqual(constraints);
  });
});

it('evaluates all ten actual goals, ten required bits, V1 roundtrip and explicit overflow rejection', () => {
  const snapshot = validateP3Snapshot(JSON.parse(readFileSync('data/local/p3-skill-support.json', 'utf8')));
  const p5 = validateP5Snapshot(JSON.parse(readFileSync('data/local/p5-forecast.json', 'utf8')), snapshot);
  const event = p5.tournaments.find(row => row.eventId === 'kr-cm-39')!; const course = snapshot.courses.find(row => row.courseId === event.courseId)!;
  const request: P4RecommendationRequest = { course: { courseId: course.courseId, trackId: course.trackId, distanceM: event.conditions.distance,
    surface: 'turf', rotation: event.conditions.direction, season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
    runningStyle: 'pace', scenarioId: '11', preference: 'balanced', cutoffDate: p5.asOf, includeUnknown: true, allowForecast: true,
    forecast: buildP5AvailabilityContext(snapshot, p5, event.eventId)! };
  const cards = ['30175', '30113', '30140', '10126', '30226', '30107'].map(supportId => ({ supportId, limitBreak: 4 }));
  const base = inspectSupportLineup(snapshot, request, cards); expect(base.deck).not.toBeNull();
  const ids = base.deck!.compatibleSkillIds.filter(id => resolveCanonicalWhiteSkillId(snapshot, id) === id).slice(0, 11);
  expect(ids).toHaveLength(11);
  const preferred = ids.slice(0, 10).map(skillId => ({ skillId, priority: 'preferred' as const }));
  const result = inspectSupportLineup(snapshot, { ...request, skillPriorities: preferred }, cards);
  expect(result.skillPriorities!.targets).toHaveLength(10);
  expect(result.skillPriorities!.targets.every(target => target.attained)).toBe(true);
  expect(result.deck!.score.preferenceBonus).toBe(80);
  const required = inspectSupportLineup(snapshot, { ...request, skillPriorities: preferred.map(row => ({ ...row, priority: 'required' })) }, cards);
  expect(required.status).toBe('ready'); expect(required.skillPriorities!.targets.every(target => target.attained)).toBe(true);
  const inputs = createDefaultWorkspace(snapshot, '2026-11-05'); inputs.globalPriorities = preferred;
  expect(workspaceInputsSchema.parse(JSON.parse(JSON.stringify(inputs))).globalPriorities).toEqual(preferred);
  expect(normalizeSkillPriorities(snapshot, [...preferred, preferred[0]!])).toHaveLength(10);
  expect(() => normalizeSkillPriorities(snapshot, [...preferred, { skillId: ids[10]!, priority: 'preferred' }])).toThrow('최대 10개');
  expect(workspaceInputsSchema.safeParse({ ...inputs, globalPriorities: [...preferred, { skillId: ids[10]!, priority: 'preferred' }] }).success).toBe(false);
}, 20000);
