import { describe, expect, it } from 'vitest';
import actualSource from '../golden/p3-engine-real-subset.json';
import p5Source from '../golden/p5-real-contract-subset.json';
import scenarioSource from '../golden/p7-scenario-applications.json';
import { p3ApplicationSchema, validateP3Snapshot } from '../../src/domain/skill-support';
import { createLineagePlan } from '../../src/domain/lineage';
import { createDefaultWorkspace, createSavedPlan, synchronizeFactorInstances } from '../../src/engine/plan-persistence';
import { buildSavedPlanRecommendationRequest, compareFreshSupportDecks, compareRecommendationContexts, compareSavedPlanInputs, completeSetDifference, evaluateSavedPlanLineage, evaluateSavedSupportLineup, getCompatiblePlanRoutes } from '../../src/engine/plan-comparison';
import { recommendSupportDecks, type P4DeckRecommendation, type P4RecommendationRequest } from '../../src/engine/support-deck-optimizer';
import { makeReferenceEngineFixture } from './reference-engine-fixture';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';

const actual = validateP3Snapshot(actualSource);
const reference = makeReferenceEngineFixture();
const snapshots = { reference: reference.snapshot.snapshotId, p3: actual.snapshotId, p5: null };
const now = '2026-11-05T12:00:00+09:00';
function savedPlan() {
  const inputs = createDefaultWorkspace(actual, '2026-11-05');
  inputs.referencePlan = createLineagePlan(reference.pedigree);
  let next = 1;
  inputs.factorInstances = synchronizeFactorInstances(inputs.referencePlan, inputs.whiteFactors, {}, () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`);
  inputs.referenceFilters.includeUnknown = true;
  inputs.skillSettings.mode = 'current'; inputs.skillSettings.eventId = 'kr-cm-39-undated'; inputs.skillSettings.runningStyle = 'pace';
  return createSavedPlan(inputs, { name: '합성 사용자 계획 ○◎ ★', appVersion: 'p8-test', snapshotIds: snapshots }, { now, uuid: () => '00000000-0000-4000-8000-999999999999' });
}
const actualRequest: P4RecommendationRequest = { course: { courseId: '10903', distanceM: 1600, surface: 'turf', trackId: '10009', rotation: 1, season: 1, weather: 1, groundCondition: 1 }, runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true };

describe('P8 current-rule lineage and input comparison', () => {
  it('uses the common reference engine and reports physical instance changes for the same costume', () => {
    const left = savedPlan(); const right = structuredClone(left);
    right.inputs.factorInstances.parentA!.factorInstanceId = '00000000-0000-4000-8000-111111111111';
    right.inputs.referencePlan.nodes.parentA!.redFactor = { type: 'dirt', stars: 3 };
    expect(evaluateSavedPlanLineage(left, reference.snapshot).affinity?.previewTotal).toBe(25);
    const differences = compareSavedPlanInputs(left, right, snapshots);
    expect(differences.nodes).toHaveLength(1);
    expect(differences.nodes[0]).toMatchObject({ nodeId: 'parentA', changed: ['instance', 'red-factor'] });
    expect(differences.nodes[0]!.changed).not.toContain('costume');
    const dirt = evaluateSavedPlanLineage(right, reference.snapshot).aptitudes?.changes.find((row) => row.type === 'dirt');
    expect(dirt).toMatchObject({ base: 'G', result: 'F', totalStars: 3 });
  });
  it('blocks dependent lineage calculations for retained but unconfirmed bloodlines', () => {
    const saved = savedPlan(); saved.inputs.factorInstances.parentA!.bloodlineStatus = 'unconfirmed';
    expect(evaluateSavedPlanLineage(saved, reference.snapshot)).toMatchObject({ blocked: true, affinity: null, aptitudes: null, lineage: null });
    expect(saved.inputs.referencePlan.nodes.parentA!.parentIds).toEqual(['grandA1', 'grandA2']);
  });
  it('keeps unknown IDs and release exclusions visible instead of certifying a partial graph', () => {
    const saved = savedPlan(); saved.inputs.referencePlan.nodes.parentA!.costumeId = 'missing'; saved.inputs.factorInstances.parentA!.ownerCostumeId = 'missing';
    expect(evaluateSavedPlanLineage(saved, reference.snapshot).issues.join(' ')).toContain('의상 ID missing');
    const filtered = savedPlan(); filtered.inputs.referenceFilters.includeUnknown = false;
    expect(evaluateSavedPlanLineage(filtered, reference.snapshot).blocked).toBe(true);
  });
  it('detects goal/white-input differences and both saved data-version changes', () => {
    const left = savedPlan(); const right = structuredClone(left);
    right.inputs.globalPriorities = [{ skillId: '200012', priority: 'preferred' }];
    right.inputs.lineageDesign.rotationGrade = 'A';
    const diff = compareSavedPlanInputs(left, right, { ...snapshots, p3: 'new-current-db' });
    expect(diff.changedSettings).toEqual(['globalPriorities', 'lineageDesign']);
    expect(diff.snapshotChanges).toEqual([
      { side: 'left', key: 'p3', saved: actual.snapshotId, current: 'new-current-db' },
      { side: 'right', key: 'p3', saved: actual.snapshotId, current: 'new-current-db' },
    ]);
  });
});

describe('P8 current support requests and complete differences', () => {
  it('builds current acquisition conditions from saved inputs and never reads a saved score', () => {
    const saved = savedPlan();
    const request = buildSavedPlanRecommendationRequest(saved, actual, null, '2026-11-05');
    expect(request).toMatchObject({ runningStyle: 'pace', cutoffDate: '2026-11-05', course: { courseId: '10906', distanceM: 2200, season: 2, weather: 2, groundCondition: 2 }, skillPriorities: [] });
    expect(request.forecast).toBeUndefined();
    const changedToday = buildSavedPlanRecommendationRequest(saved, actual, null, '2026-11-06');
    expect(changedToday.cutoffDate).toBe('2026-11-06');
  });
  it('rejects missing events, missing skills and undated tournament requests atomically', () => {
    const saved = savedPlan(); const original = structuredClone(saved);
    saved.inputs.skillSettings.mode = 'tournament';
    expect(() => buildSavedPlanRecommendationRequest(saved, actual, null, '2026-11-05')).toThrow('대회 시점');
    saved.inputs.skillSettings.mode = 'current'; saved.inputs.skillSettings.eventId = 'missing-event';
    expect(() => buildSavedPlanRecommendationRequest(saved, actual, null, '2026-11-05')).toThrow('missing-event');
    saved.inputs.skillSettings.eventId = original.inputs.skillSettings.eventId; saved.inputs.globalPriorities = [{ skillId: 'missing-skill', priority: 'required' }];
    expect(() => buildSavedPlanRecommendationRequest(saved, actual, null, '2026-11-05')).toThrow('missing-skill');
    expect(original.inputs.globalPriorities).toEqual([]);
  });
  it('matches the current P5 UI effective scenario fallback while preserving the saved selector input', () => {
    const original = validateP3Snapshot(p5Source.base);
    const base = { ...original,
      scenarios: [...actual.scenarios.filter((row) => row.scenarioId === '1'), ...original.scenarios.filter((row) => row.scenarioId !== '1')],
      applications: original.applications.filter((row) => row.entityType !== 'scenario' || row.entityId !== '1').concat(scenarioSource.applications.filter((row) => row.entityId === '1').map((row) => p3ApplicationSchema.parse(row))) };
    const pack = validateP5Snapshot(p5Source.p5, base, new Set());
    const inputs = createDefaultWorkspace(base, '2026-11-05');
    inputs.skillSettings.eventId = 'kr-cm-44'; inputs.skillSettings.scenarioId = '13'; inputs.skillSettings.mode = 'tournament';
    inputs.skillSettings.allowForecast = false;
    const saved = createSavedPlan(inputs, { name: '실제 CM44 시나리오 선택', appVersion: 'test', snapshotIds: { reference: null, p3: base.snapshotId, p5: pack.snapshotId } });
    const current = buildSavedPlanRecommendationRequest(saved, base, pack, '2026-11-05');
    expect(current.scenarioId).toBe('1');
    expect(saved.inputs.skillSettings.scenarioId).toBe('13');
    saved.inputs.skillSettings.allowForecast = true;
    expect(buildSavedPlanRecommendationRequest(saved, base, pack, '2026-11-05').scenarioId).toBe('13');
  });
  it('distinguishes different course/style/scenario/time and different user objectives', () => {
    expect(compareRecommendationContexts(actualRequest, { ...actualRequest, runningStyle: 'end' })).toMatchObject({ sameConditions: false, differentConditions: ['runningStyle'] });
    expect(compareRecommendationContexts(actualRequest, { ...actualRequest, skillPriorities: [{ skillId: '200012', priority: 'required' }] })).toMatchObject({ sameConditions: true, sameUserGoals: false });
    expect(compareRecommendationContexts({ ...actualRequest, ownedSupports: [{ supportId: '30007', limitBreak: 4 }, { supportId: '30009', limitBreak: 3 }] }, { ...actualRequest, ownedSupports: [{ supportId: '30009', limitBreak: 3 }, { supportId: '30007', limitBreak: 4 }] }).sameConditions).toBe(true);
  });
  it('compares all skills beyond a twelve-row screen preview and excludes potential-only acquisitions', () => {
    const original = recommendSupportDecks(actual, actualRequest).recommendations[0]!;
    expect(original).toBeDefined();
    const left: P4DeckRecommendation = { ...original, compatibleSkillIds: Array.from({ length: 30 }, (_, index) => `skill-${index}`), potentialSkillIds: ['potential-only'], greenSkillIds: ['skill-0'] };
    const right = { ...left, compatibleSkillIds: [...left.compatibleSkillIds.slice(0, 29), 'last-new'], potentialSkillIds: ['another-potential'], greenSkillIds: ['last-new'] };
    expect(compareFreshSupportDecks(left, right)).toMatchObject({ gainedSkillIds: ['last-new'], lostSkillIds: ['skill-29'], gainedGreenSkillIds: ['last-new'], lostGreenSkillIds: ['skill-0'] });
    expect(completeSetDifference(['a', 'a', 'b'], ['b'])).toEqual(['a']);
  });
  it('freshly audits an actual six-card subset regardless of saved score/skill union', () => {
    const result = recommendSupportDecks(actual, actualRequest); const deck = result.recommendations[0]!;
    const saved = savedPlan();
    saved.resultSnapshot = { inputSignature: 'historical-only', calculatedAt: now, snapshotIds: snapshots,
      cards: deck.cards.map((card) => ({ supportId: card.supportId, limitBreak: card.limitBreak, ownership: card.ownership })),
      score: { coverageValue: 999999, preferenceBonus: 999, customizedValue: 1000998 }, skillIds: ['invented-old-union'], greenSkillIds: [] };
    const audit = evaluateSavedSupportLineup(saved, actual, actualRequest);
    expect(audit.issues).toEqual([]);
    expect(audit.inspection?.deck?.score.coverageValue).toBe(deck.score.coverageValue);
    expect(audit.inspection?.deck?.compatibleSkillIds).toEqual(deck.compatibleSkillIds);
    expect(audit.inspection?.deck?.compatibleSkillIds).not.toContain('invented-old-union');
    const restricted = evaluateSavedSupportLineup(saved, actual, { ...actualRequest, ownedOnly: true, allowBorrow: true, ownedSupports: [] });
    expect(restricted.inspection).toBeNull(); expect(restricted.issues.join(' ')).toContain('최대 1장');
  });
  it('does not certify events without selected modeled groups even when another hint covers the skill', () => {
    const deck = recommendSupportDecks(actual, actualRequest).recommendations[0]!;
    const changed = structuredClone(deck);
    const card = changed.cards[0]!; const hint = card.routes.find((route) => route.sourceKind === 'hint')!;
    expect(hint).toBeDefined();
    card.routes.push({ ...hint, sourceKind: 'event', kind: 'event', sourceSkillId: 'unmodeled-source' });
    const routes = getCompatiblePlanRoutes(actual, changed);
    expect(routes.some((route) => route.sourceSkillId === 'unmodeled-source')).toBe(false);
    expect(routes.some((route) => route.sourceKind === 'hint')).toBe(true);
  });
});
