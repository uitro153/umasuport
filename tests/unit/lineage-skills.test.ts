import { describe, expect, it } from 'vitest';
import actualIdentity from '../golden/p6-priority-identities.json';
import actualSource from '../golden/p3-real-ui-subset.json';
import actualScenarios from '../golden/p7-scenario-applications.json';
import { p3ApplicationSchema, p3SkillRelationSchema, p3SkillSchema, validateP3Snapshot, type P3Snapshot } from '../../src/domain/skill-support';
import { applyLineageGrandparentArrangement, createLineagePlan, getLineageSlotMap, setLineageLock, updateLineageNode } from '../../src/domain/lineage';
import { createEmptyLineageSkills, validateLineageSkillState } from '../../src/domain/lineage-skills';
import { analyzeLineageSkills, buildLineageRecommendationRequest, classifyWhiteFactor, getLineageSkillPresence,
  getNodeSkillPriorities, mergeLineagePriorities, reconcileLineageSkills, removeWhiteFactor, setNodeSkillPriorities,
  setWhiteInventoryStatus, upsertWhiteFactor } from '../../src/engine/lineage-skills';
import type { P4RecommendationRequest } from '../../src/engine/support-deck-optimizer';
import { resolveCanonicalWhiteSkillId } from '../../src/engine/skill-priorities';
import type { P5AvailabilityContext } from '../../src/engine/p5-availability';

// Actual source extracts test identity and release dates. The selected node
// owners/white records below are explicit test user input, not observed factors.
const source = validateP3Snapshot(actualSource);
const additions = actualIdentity.skills.map((row) => p3SkillSchema.parse(row));
const snapshot: P3Snapshot = { ...source,
  skills: source.skills.concat(additions.filter((row) => !source.skills.some((old) => old.skillId === row.skillId))),
  skillRelations: source.skillRelations.concat(actualIdentity.skillRelations.map((row) => p3SkillRelationSchema.parse(row))),
  applications: source.applications.filter((row) => row.entityType !== 'scenario').concat(actualScenarios.applications.map((row) => p3ApplicationSchema.parse(row))),
  scenarioSkillRoutes: actualScenarios.scenarioSkillRoutes,
};
const request: P4RecommendationRequest = { course: { courseId: '10906', distanceM: 2200, surface: 'turf', trackId: '10009', rotation: 1, season: 2, weather: 2, groundCondition: 2 },
  runningStyle: 'pace', cutoffDate: '2026-11-05', allowForecast: false, includeUnknown: true, preference: 'balanced', scenarioId: '11', deck: [] };
function userPlan() {
  let plan = createLineagePlan();
  for (const id of Object.keys(plan.nodes)) plan = updateLineageNode(plan, id, { costumeId: '100901' });
  return plan;
}
const observed = (skillId = '201601', stars: 1 | 2 | 3 | null = 2) => ({ skillId, stars, status: 'owned' as const });
const required = [{ skillId: '201601', priority: 'required' as const }];

describe('P7 separate user white-factor layer and owner invariants', () => {
  it('keeps actual ordinary/gold identities while leaving eligibility uncertified', () => {
    expect(classifyWhiteFactor(snapshot, '201601')).toMatchObject({ skillId: '201601', status: 'review-required' });
    expect(classifyWhiteFactor(snapshot, '201602')).toMatchObject({ skillId: '201601', status: 'review-required' });
    for (const id of ['900011', '100011', 'unknown']) expect(classifyWhiteFactor(snapshot, id).status).toBe('unsupported');
    expect(classifyWhiteFactor(snapshot, '1000011').status).toBe('review-required');
  });
  it('does not elevate scenario acquisition metadata to factor eligibility', () => {
    const scenarioSkill = snapshot.scenarioSkillRoutes?.find((row) => snapshot.skills.some((skill) => skill.skillId === row.skillId && skill.rarity === 1));
    expect(scenarioSkill).toBeDefined();
    expect(classifyWhiteFactor(snapshot, scenarioSkill!.skillId).status).toBe('review-required');
  });
  it('binds same-character factors to distinct stable owner nodes', () => {
    const plan = userPlan(); let state = createEmptyLineageSkills();
    state = upsertWhiteFactor(state, plan, snapshot, 'parentA', observed('201601', 1));
    state = upsertWhiteFactor(state, plan, snapshot, 'parentB', observed('200452', 3));
    expect(state.nodes.parentA!.records.map((row) => row.skillId)).toEqual(['201601']);
    expect(state.nodes.parentB!.records.map((row) => row.skillId)).toEqual(['200452']);
    expect(state.nodes.parentA!.records[0]).toMatchObject({ userEntered: true, stars: 1, nameKo: '터다지기', nameJa: '地固め' });
  });
  it('keeps owned and planned versions separate and unknown stars distinct from zero', () => {
    const plan = userPlan(); let state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'parentA', observed('201602', null));
    state = upsertWhiteFactor(state, plan, snapshot, 'parentA', { skillId: '201601', stars: 3, status: 'planned' });
    expect(state.nodes.parentA!.records).toHaveLength(2);
    expect(state.nodes.parentA!.records.map((row) => [row.skillId, row.status, row.stars])).toEqual([['201601', 'owned', null], ['201601', 'planned', 3]]);
    state = removeWhiteFactor(state, plan, 'parentA', '201601', 'planned');
    expect(state.nodes.parentA!.records[0]!.status).toBe('owned');
  });
  it('does not turn a plan into an actual inventory or a missing record into absence', () => {
    const plan = userPlan(); let state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'parentA', { ...observed(), status: 'planned' });
    expect(state.nodes.parentA!.inventoryStatus).toBe('unentered');
    let presence = getLineageSkillPresence(analyzeLineageSkills(plan, state, 'target'), '201601');
    expect(presence.ownedLocations).toHaveLength(0);
    expect(presence.plannedLocations.map((row) => row.nodeId)).toEqual(['parentA']);
    expect(presence.unknownNodeIds).toContain('parentA');
    expect(presence.confirmedAbsentNodeIds).not.toContain('parentA');
    state = setWhiteInventoryStatus(state, plan, 'parentA', 'reviewed');
    presence = getLineageSkillPresence(analyzeLineageSkills(plan, state, 'target'), '201601');
    expect(presence.confirmedAbsentNodeIds).toContain('parentA');
    expect(presence.ownedLocations).toHaveLength(0);
  });
  it('marks a partially recorded inventory without claiming its other goals absent', () => {
    const plan = userPlan(); const state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'parentA', observed());
    expect(state.nodes.parentA!.inventoryStatus).toBe('partial');
    const analysis = analyzeLineageSkills(plan, state, 'target');
    expect(getLineageSkillPresence(analysis, '201601').parentOwned).toHaveLength(1);
    expect(getLineageSkillPresence(analysis, '200452').unknownNodeIds).toContain('parentA');
    expect(() => setWhiteInventoryStatus(state, plan, 'parentA', 'unentered')).toThrow(/부분 입력/);
  });
  it('rejects actual ownership without a selected owner, invalid stars and duplicate raw records', () => {
    const plan = createLineagePlan();
    expect(() => upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'parentA', observed())).toThrow(/소유 캐릭터/);
    expect(() => setWhiteInventoryStatus(createEmptyLineageSkills(), plan, 'parentA', 'reviewed')).toThrow();
    const selected = userPlan(); const state = upsertWhiteFactor(createEmptyLineageSkills(), selected, snapshot, 'parentA', observed());
    expect(() => validateLineageSkillState({ ...state, nodes: { ...state.nodes, parentA: { ...state.nodes.parentA, records: [{ ...state.nodes.parentA!.records[0], stars: 4 }] } } })).toThrow();
    expect(() => validateLineageSkillState({ ...state, nodes: { ...state.nodes, parentA: { ...state.nodes.parentA, records: [...state.nodes.parentA!.records, ...state.nodes.parentA!.records] } } })).toThrow();
  });
  it('preserves owner records and local goals through grandparent reattachment', () => {
    const plan = userPlan(); let state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'grandA1', observed());
    state = setNodeSkillPriorities(state, plan, snapshot, 'grandA1', required);
    const next = applyLineageGrandparentArrangement(plan, ['grandB1', 'grandB2', 'grandA1', 'grandA2']);
    const preserved = reconcileLineageSkills(plan, next, state);
    expect(preserved).toEqual(state);
    expect(getLineageSlotMap(next).grandB1).toBe('grandA1');
    expect(getLineageSkillPresence(analyzeLineageSkills(next, preserved, 'parentB'), '201601').parentOwned[0]!.nodeId).toBe('grandA1');
  });
  it('clears both past white records and hidden node requirements on owner replacement', () => {
    const plan = userPlan(); let state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'parentA', observed());
    state = upsertWhiteFactor(state, plan, snapshot, 'parentB', observed('200452'));
    state = setNodeSkillPriorities(state, plan, snapshot, 'parentA', required);
    const next = updateLineageNode(plan, 'parentA', { costumeId: '100301' });
    expect(getNodeSkillPriorities(state, next, 'parentA')).toEqual([]);
    expect(analyzeLineageSkills(next, state, 'parentA').self.owned).toEqual([]);
    const reconciled = reconcileLineageSkills(plan, next, state);
    expect(reconciled.nodes.parentA).toBeUndefined(); expect(reconciled.nodePriorities.parentA).toBeUndefined();
    expect(reconciled.nodes.parentB).toEqual(state.nodes.parentB);
  });
  it('allows an explicit locked-factor edit without changing any P2 record or lock', () => {
    const plan = setLineageLock(userPlan(), 'parentA', true); const before = structuredClone(plan);
    let state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'parentA', observed());
    state = setWhiteInventoryStatus(state, plan, 'parentA', 'reviewed');
    expect(plan).toEqual(before);
    expect(reconcileLineageSkills(plan, plan, state)).toEqual(state);
    expect(plan.nodes.parentA!.locked).toBe(true);
  });
});

describe('P7 relative generations and recommendation request boundaries', () => {
  it('reads parents/grandparents from live links for final, parent and grandparent targets', () => {
    const plan = userPlan(); const state = createEmptyLineageSkills();
    const root = analyzeLineageSkills(plan, state, 'target');
    expect(root.parents.map((row) => row.nodeId)).toEqual(['parentA', 'parentB']);
    expect(root.grandparents.map((row) => row.nodeId)).toEqual(['grandA1', 'grandA2', 'grandB1', 'grandB2']);
    const parent = analyzeLineageSkills(plan, state, 'parentA');
    expect(parent.parents.map((row) => row.nodeId)).toEqual(['grandA1', 'grandA2']);
    expect(parent.grandparents.map((row) => row.nodeId)).toEqual(['ancestor_7', 'ancestor_8', 'ancestor_9', 'ancestor_10']);
    const grandparent = analyzeLineageSkills(plan, state, 'grandA1');
    expect(grandparent.parents.map((row) => row.nodeId)).toEqual(['ancestor_7', 'ancestor_8']);
    expect(grandparent.grandparents.map((row) => row.nodeId)).toEqual(['ancestor_15', 'ancestor_16', 'ancestor_17', 'ancestor_18']);
    expect([root, parent, grandparent].map((row) => row.missingAncestorSlots)).toEqual([0, 0, 0]);
  });
  it('keeps deep and other-lineage observations apart from direct inherited opportunities', () => {
    const plan = userPlan(); let state = upsertWhiteFactor(createEmptyLineageSkills(), plan, snapshot, 'ancestor_7', observed());
    state = upsertWhiteFactor(state, plan, snapshot, 'parentB', observed());
    const root = getLineageSkillPresence(analyzeLineageSkills(plan, state, 'target'), '201601');
    expect(root.deeperOwned.map((row) => row.nodeId)).toEqual(['ancestor_7']);
    expect(root.grandparentOwned).toEqual([]);
    const parent = getLineageSkillPresence(analyzeLineageSkills(plan, state, 'parentA'), '201601');
    expect(parent.grandparentOwned.map((row) => row.nodeId)).toEqual(['ancestor_7']);
    expect(parent.otherOwned.map((row) => row.nodeId)).toEqual(['parentB']);
    expect(parent.duplicateOwnedCount).toBe(2);
  });
  it('reports ancestors outside the 31-owner plan for depth3/4', () => {
    const plan = userPlan(); const state = createEmptyLineageSkills();
    expect(analyzeLineageSkills(plan, state, 'ancestor_7')).toMatchObject({ stage: 'deep', missingAncestorSlots: 4 });
    expect(analyzeLineageSkills(plan, state, 'ancestor_15')).toMatchObject({ stage: 'deep', missingAncestorSlots: 6 });
  });
  it('preserves strongest canonical requirements and rejects an eleven-goal merge without silent removal', () => {
    expect(mergeLineagePriorities(snapshot, required, [{ skillId: '201602', priority: 'preferred' }])).toEqual(required);
    const ids = snapshot.skills.filter(row => resolveCanonicalWhiteSkillId(snapshot, row.skillId) === row.skillId).slice(0, 11).map(row => row.skillId);
    const ten = ids.slice(0, 10).map(skillId => ({ skillId, priority: 'required' as const }));
    expect(() => mergeLineagePriorities(snapshot, ten, [{ skillId: ids[10]!, priority: 'preferred' }])).toThrow(/최대 10/);
    expect(ten.every(row => row.priority === 'required')).toBe(true);
  });
  it('keeps node-only goals separate from global and other node requirements', () => {
    const plan = userPlan(); const state = setNodeSkillPriorities(createEmptyLineageSkills(), plan, snapshot, 'parentA', required);
    const base = { ...request, skillPriorities: [{ skillId: '200452', priority: 'required' as const }] };
    const options = { plan, state, nodeId: 'parentA', mode: 'current' as const, today: '2026-11-05', globalPriorities: base.skillPriorities };
    expect(buildLineageRecommendationRequest(snapshot, base, options).skillPriorities).toEqual(required);
    expect(buildLineageRecommendationRequest(snapshot, base, { ...options, nodeId: 'parentB' }).skillPriorities).toBeUndefined();
    expect(buildLineageRecommendationRequest(snapshot, base, { ...options, includeGlobal: true }).skillPriorities).toEqual([...base.skillPriorities, ...required]);
  });
  it('does not remove an owned or planned target and leaves an empty layer equivalent', () => {
    const plan = userPlan(); const empty = createEmptyLineageSkills();
    expect(buildLineageRecommendationRequest(snapshot, request, { plan, state: empty, nodeId: 'target', mode: 'current', today: '2026-11-05' })).toEqual({ ...request, forecast: undefined });
    let state = upsertWhiteFactor(empty, plan, snapshot, 'grandA1', observed());
    state = setNodeSkillPriorities(state, plan, snapshot, 'parentA', required);
    expect(buildLineageRecommendationRequest(snapshot, request, { plan, state, nodeId: 'parentA', mode: 'current', today: '2026-11-05' }).skillPriorities).toEqual(required);
  });
  it('retains final main-support input but never copies it into parent/grandparent training', () => {
    const plan = userPlan(); const base = { ...request, deck: [{ supportId: '30024', limitBreak: 2 }] };
    const options = { plan, state: createEmptyLineageSkills(), mode: 'current' as const, today: '2026-11-05' };
    expect(buildLineageRecommendationRequest(snapshot, base, { ...options, nodeId: 'target' }).deck).toEqual(base.deck);
    for (const id of ['parentA', 'grandA1', 'ancestor_7']) expect(buildLineageRecommendationRequest(snapshot, base, { ...options, nodeId: id }).deck).toEqual([]);
    expect(base.deck).toEqual([{ supportId: '30024', limitBreak: 2 }]);
  });
  it('uses present KR availability by default and only accepts an explicit backed forecast', () => {
    const plan = userPlan(); const options = { plan, state: createEmptyLineageSkills(), nodeId: 'parentA', today: '2026-11-05' };
    const forecast: P5AvailabilityContext = { kind: 'jp-event-order', asOf: '2026-11-05', eventId: 'test-jp-context', jpEventId: 'jp-test', jpEventDate: '2026-03-22', krExpectedDate: '2027-06-14', krExpectedWindow: null, releaseOverrides: [] };
    const base = { ...request, cutoffDate: '2027-06-14', allowForecast: true, forecast };
    expect(buildLineageRecommendationRequest(snapshot, base, { ...options, mode: 'current' })).toMatchObject({ cutoffDate: '2026-11-05', allowForecast: false, forecast: undefined });
    expect(buildLineageRecommendationRequest(snapshot, base, { ...options, mode: 'forecast' })).toMatchObject({ cutoffDate: '2027-06-14', allowForecast: true, forecast });
    expect(buildLineageRecommendationRequest(snapshot, { ...base, scenarioId: '13' }, { ...options, mode: 'forecast' }).scenarioId).toBe('13');
    expect(() => buildLineageRecommendationRequest(snapshot, request, { ...options, mode: 'forecast' })).toThrow(/일본 출시 순서/);
  });
  it('blocks an unavailable or unknown current scenario instead of using its future source environment', () => {
    const plan = userPlan(); const options = { plan, state: createEmptyLineageSkills(), nodeId: 'parentA', today: '2026-11-05', mode: 'current' as const };
    expect(() => buildLineageRecommendationRequest(snapshot, { ...request, scenarioId: '13' }, options)).toThrow(/시나리오/);
    expect(() => buildLineageRecommendationRequest(snapshot, { ...request, scenarioId: 'unmapped' }, options)).toThrow(/시나리오/);
    expect(() => buildLineageRecommendationRequest(snapshot, request, { ...options, today: 'invalid' })).toThrow();
  });
});
