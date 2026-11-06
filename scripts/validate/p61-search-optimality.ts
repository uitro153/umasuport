import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { buildP5AvailabilityContext } from '../../src/engine/p5-availability';
import { getP3Availability } from '../../src/engine/support-acquisition';
import { buildSupportEventModel } from '../../src/engine/event-acquisition';
import { recommendSupportDecks, type P4RecommendationRequest, type P4RecommendationResult } from '../../src/engine/support-deck-optimizer';

/** Actual DB-only audit: supplied decks are validation witnesses, never engine seeds or rules. */
const protectedPaths = ['data/local/p3-skill-support.json', 'data/local/p5-forecast.json', 'data/local/p1-reference.json', 'data/local/p3-integrated.sqlite'];
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const protectedHashes = new Map<string, string>();
for (const path of protectedPaths) protectedHashes.set(path, hash(await readFile(path)));
const baseline = JSON.parse(await readFile('data/local/p6-user-skill-priority.validation.json', 'utf8')) as { immutableSources: Record<string, string> };
for (const [path, actual] of protectedHashes) assert.equal(actual, baseline.immutableSources[path], `Source differs from protected P6 baseline: ${path}`);
const calculationPath = 'src/engine/support-deck-optimizer.ts';
const calculationHash = hash(await readFile(calculationPath));
const snapshot = validateP3Snapshot(JSON.parse(await readFile(protectedPaths[0]!, 'utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(await readFile(protectedPaths[1]!, 'utf8')) as unknown, snapshot);
const names = new Map(snapshot.skills.map((row) => [row.skillId, row.displayName]));
const priorities = [{ skillId: '201601', priority: 'required' }, { skillId: '201322', priority: 'preferred' }] as const;
const A = ['30175', '30108', '10122', '30231', '10005', '30159'];
const B = ['30175', '30113', '30140', '10126', '30226', '30107'];
const directory = 'data/local/p61-search-optimality';
const evaluationScope = {
  fixedSix: 'ownedOnly with six LB4 cards is an audit device fixing the six-card domain; ownership itself adds no score',
  unionEleven: 'ownedOnly with the 11-card A/B union enumerates 462 possible six-card subsets under the same objective',
  helperFeasibilityBudget: 'Fixed-six maxStates=1 can mark the auxiliary required-mask DP limited; exact six-card evaluation still proves the returned witness',
  globalOptimal: 'true on fixed-six/union-eleven means only that declared owned domain and modeled event plans, never all 566 supports',
};
await mkdir(directory, { recursive: true });
function requestFor(eventId: string): P4RecommendationRequest {
  const event = p5.tournaments.find((row) => row.eventId === eventId)!;
  assert.ok(event);
  const course = snapshot.courses.find((row) => row.courseId === event.courseId)!;
  return { course: { courseId: event.courseId, trackId: course.trackId, distanceM: event.conditions.distance,
    surface: event.conditions.surface === 1 ? 'turf' : 'dirt', rotation: event.conditions.direction,
    season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
  runningStyle: 'pace', cutoffDate: p5.asOf, allowForecast: true, includeUnknown: true,
  preference: 'balanced', scenarioId: '11', forecast: buildP5AvailabilityContext(snapshot, p5, eventId)!, skillPriorities: priorities };
}
function difference(a: readonly string[], b: readonly string[]) { return a.filter((id) => !b.includes(id)).sort(); }
function named(ids: readonly string[]) { return ids.map((skillId) => ({ skillId, name: names.get(skillId) ?? skillId })); }
function fixedRequest(request: P4RecommendationRequest, ids: readonly string[], eventPlanLimit = 32): P4RecommendationRequest {
  return { ...request, ownedSupports: ids.map((supportId) => ({ supportId, limitBreak: 4 })), ownedOnly: true,
    allowBorrow: false, search: { candidateLimit: 6, beamWidth: 1, maxStates: 1, eventPlanLimit } };
}
function summarize(result: P4RecommendationResult, request: P4RecommendationRequest) {
  const deck = result.recommendations[0];
  const rows = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
  return { status: result.status, failure: result.skillPriorities?.failure ?? null,
    ids: deck?.cards.map((card) => card.supportId) ?? [], score: deck?.score ?? null,
    compatibleCount: deck?.compatibleSkillIds.length ?? 0, potentialCount: deck?.potentialSkillIds.length ?? 0,
    duplicateDistinctCount: deck?.duplicateSkillIds.length ?? 0,
    duplicateOccurrences: deck ? deck.cards.reduce((sum, card) => sum + card.skillIds.length, 0) - deck.skillIds.length : 0,
    greenSkills: named(deck?.greenSkillIds ?? []),
    priorityGreenSkills: named(deck?.greenSkillIds.filter((id) => rows.get(id)?.grade === 'priority') ?? []),
    unresolved: named(deck?.unresolvedEventSkillIds ?? []),
    goals: priorities.map((selection) => ({ ...selection, name: names.get(selection.skillId), attained: deck?.skillIds.includes(selection.skillId) ?? false,
      grade: rows.get(selection.skillId)?.grade, applicability: rows.get(selection.skillId)?.applicability,
      providers: deck?.cards.filter((card) => card.skillIds.includes(selection.skillId)).map((card) => ({ supportId: card.supportId,
        routes: card.routes.filter((route) => route.skillId === selection.skillId),
        eventDecisions: card.eventDecisions.filter((decision) => decision.skillIds.includes(selection.skillId)) })) ?? [] })),
    cards: deck?.cards.map((card) => ({ supportId: card.supportId, name: card.name, ownerBaseId: card.ownerBaseId,
      limitBreak: card.limitBreak, ownership: card.ownership, acquisitionBasis: card.acquisitionBasis,
      availability: getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast, request.forecast),
      skills: named(card.skillIds), unresolved: named(card.unresolvedEventSkillIds), eventDecisions: card.eventDecisions })) ?? [],
    skillIds: deck?.skillIds ?? [], eventDecisions: deck?.eventDecisions ?? [], search: result.search, warnings: result.warnings };
}
function verify(result: P4RecommendationResult, request: P4RecommendationRequest) {
  assert.equal(result.status, 'ready');
  const deck = result.recommendations[0]!;
  assert.equal(deck.cards.length, 6);
  assert.equal(new Set(deck.cards.map((card) => card.ownerBaseId ?? card.supportId)).size, 6);
  assert.ok(deck.skillIds.includes('201601'));
  assert.equal(deck.score.preferenceBonus, deck.skillIds.includes('201322') ? 8 : 0);
  assert.equal(deck.score.customizedValue, deck.score.coverageValue + (deck.score.preferenceBonus ?? 0));
  const rows = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
  const weight = (id: string) => {
    const row = rows.get(id)!;
    return row.grade === 'conditional'
      ? { 'course-valid': 10, 'window-dependent': 8, 'race-order-dependent': 6, 'course-ineffective-or-low': 2, unverified: 0 }[row.conditionClass]
      : { priority: 16, useful: 10, supplementary: 2, excluded: 0, unverified: 0 }[row.grade];
  };
  assert.equal(deck.score.coverageValue, deck.skillIds.reduce((sum, id) => sum + weight(id), 0), 'Independently sum unchanged P5 qualitative values');
  assert.deepEqual(deck.guaranteedSkillIds, []);
  for (const card of deck.cards) {
    assert.equal(card.limitBreak, 4);
    assert.equal(getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast, request.forecast).state, 'available');
    const eventModel = buildSupportEventModel(snapshot, card.supportId, { scenarioId: request.scenarioId ?? undefined, allowJpReference: true });
    const decisions = new Map(card.eventDecisions.map((row) => [row.groupId, row]));
    assert.equal(decisions.size, card.eventDecisions.length);
    assert.ok(card.eventDecisions.every((decision) => decision.probability === null));
    for (const route of card.routes) {
      const server = route.sourceServer ?? (card.acquisitionBasis === 'jp-reference-forecast' ? 'JP' : 'KR');
      assert.ok(snapshot.supportSkills.some((row) => row.server === server && row.supportId === card.supportId
        && row.skillId === route.sourceSkillId && row.acquisition === route.sourceKind));
      assert.notEqual(getP3Availability(snapshot, 'skill', route.sourceSkillId, request.cutoffDate, request.allowForecast, request.forecast).state, 'unavailable');
    }
    for (const id of card.skillIds) assert.ok(card.routes.some((route) => route.skillId === id && (route.sourceKind === 'hint'
      || (() => { const groups = eventModel.groups.filter((group) => group.options.some((option) => option.sourceSkillIds.includes(route.sourceSkillId)));
        return groups.length > 0 && groups.every((group) => group.status === 'modeled' && group.options.some((option) => option.optionId === decisions.get(group.groupId)?.optionId && option.sourceSkillIds.includes(route.sourceSkillId))); })())), `No compatible route for ${card.supportId}/${id}`);
  }
  assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
}
const cases: { caseId: string; request: P4RecommendationRequest; summary: ReturnType<typeof summarize>; elapsedMs: number }[] = [];
const results = new Map<string, P4RecommendationResult>();
async function run(caseId: string, request: P4RecommendationRequest) {
  const start = performance.now();
  const result = recommendSupportDecks(snapshot, request);
  verify(result, request);
  const summary = summarize(result, request);
  const elapsedMs = Math.round(performance.now() - start);
  cases.push({ caseId, request, summary, elapsedMs }); results.set(caseId, result);
  await writeFile(`${directory}/${caseId}.json`, JSON.stringify({ request, result }, null, 2));
  console.log(JSON.stringify({ caseId, ids: summary.ids, score: summary.score, count: summary.compatibleCount,
    greens: summary.greenSkills.length, priorityGreens: summary.priorityGreenSkills.length, eventPlansPruned: summary.search.eventPlansPruned, elapsedMs }));
  return result;
}
const request = requestFor('kr-cm-39');
const a = await run('CM39-A-original', fixedRequest(request, A));
const b = await run('CM39-B-p6-mixed', fixedRequest(request, B));
await run('CM39-standard', request);
const comparison = { aOnly: named(difference(a.recommendations[0]!.skillIds, b.recommendations[0]!.skillIds)),
  bOnly: named(difference(b.recommendations[0]!.skillIds, a.recommendations[0]!.skillIds)),
  aGreenOnly: named(difference(a.recommendations[0]!.greenSkillIds, b.recommendations[0]!.greenSkillIds)),
  bGreenOnly: named(difference(b.recommendations[0]!.greenSkillIds, a.recommendations[0]!.greenSkillIds)) };
await writeFile(`${directory}/comparison-initial.json`, JSON.stringify({ cases, comparison, calculationHash }, null, 2));
console.log(JSON.stringify({ comparison }, null, 2));

const union = [...new Set([...A, ...B])];
await run('CM39-union11-exhaustive', { ...request, ownedSupports: union.map((supportId) => ({ supportId, limitBreak: 4 })),
  ownedOnly: true, allowBorrow: false, search: { candidateLimit: union.length, maxStates: 100_000 } });
await run('CM39-A-events256', fixedRequest(request, A, 256));
await run('CM39-B-events256', fixedRequest(request, B, 256));
for (const eventId of ['kr-cm-40', 'kr-cm-44']) {
  const sampleRequest = requestFor(eventId);
  const standard = await run(`${eventId}-standard`, sampleRequest);
  await run(`${eventId}-fixed-standard`, fixedRequest(sampleRequest, standard.recommendations[0]!.cards.map((card) => card.supportId)));
  await run(`${eventId}-expanded-budget`, { ...sampleRequest, search: { candidateLimit: 160, beamWidth: 160, maxStates: 300_000, eventPlanLimit: 128 } });
}

const byId = (id: string) => cases.find((row) => row.caseId === id)!;
const requireSamePlan = (left: string, right: string) => {
  const before = results.get(left)!.recommendations[0]!; const after = results.get(right)!.recommendations[0]!;
  assert.equal(after.deckId, before.deckId, `${left}/${right}: six-card witness changed`);
  assert.deepEqual(after.score, before.score);
  assert.deepEqual(after.skillIds, before.skillIds);
  assert.deepEqual(after.eventDecisions, before.eventDecisions);
};
// Independent balanced final-state ordering: higher value/priority/core first,
// then less SR excess and fewer duplicate provider occurrences, then stable IDs.
const balancedKey = (caseId: string) => {
  const item = byId(caseId).summary; const score = item.score!;
  return [-(score.customizedValue ?? score.coverageValue), -score.prioritySkillCount,
    -score.coreSkillCount, score.extremeSrPenalty, item.duplicateOccurrences];
};
const independentCompare = (left: string, right: string) => {
  const a = balancedKey(left); const b = balancedKey(right);
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index]! - b[index]!;
  return [...byId(left).summary.ids].sort().join('|').localeCompare([...byId(right).summary.ids].sort().join('|'));
};
assert.deepEqual(balancedKey('CM39-A-original'), [-382, -4, -10, 0, 7]);
assert.deepEqual(balancedKey('CM39-B-p6-mixed'), [-382, -4, -10, 0, 4]);
assert.ok(independentCompare('CM39-B-p6-mixed', 'CM39-A-original') < 0, 'B wins the unchanged balanced tie policy');
requireSamePlan('CM39-B-p6-mixed', 'CM39-standard');
requireSamePlan('CM39-A-original', 'CM39-A-events256');
requireSamePlan('CM39-B-p6-mixed', 'CM39-B-events256');
requireSamePlan('CM39-B-p6-mixed', 'CM39-union11-exhaustive');
assert.equal(byId('CM39-union11-exhaustive').summary.search.algorithm, 'exhaustive');
assert.equal(byId('CM39-union11-exhaustive').summary.search.examinedStates, 462);
assert.equal(byId('CM39-union11-exhaustive').summary.search.eventPlansPruned, false);
assert.equal(byId('CM39-union11-exhaustive').summary.search.globalOptimal, true, 'Only the declared 11-card owned domain is exhaustive');
for (const eventId of ['kr-cm-40', 'kr-cm-44']) {
  requireSamePlan(`${eventId}-standard`, `${eventId}-fixed-standard`);
  requireSamePlan(`${eventId}-standard`, `${eventId}-expanded-budget`);
  assert.equal(byId(`${eventId}-standard`).summary.search.globalOptimal, false, 'A stable bounded sample is not a global certificate');
}

for (const [path, expected] of protectedHashes) assert.equal(hash(await readFile(path)), expected, `Protected source changed: ${path}`);
assert.equal(hash(await readFile(calculationPath)), calculationHash, 'Engine changed during audit');
await writeFile('data/local/p61-search-optimality.validation.json', JSON.stringify({ checkedOn: p5.asOf,
  immutableSources: Object.fromEntries(protectedHashes), calculationHash, evaluationScope, cases, comparison,
  verdict: { winnerUnderUnchangedBalancedPolicy: 'B', reason: 'equal value, priority, core and SR-excess; duplicate provider occurrences B4 < A7',
    independentComparatorKeys: { A: balancedKey('CM39-A-original'), B: balancedKey('CM39-B-p6-mixed') },
    originalEngineModified: false, fixedBranches32And256Identical: true, ownedUnion11ExhaustiveCombinations: 462,
    samePlanOnOtherEventsWithExpandedBudget: ['kr-cm-40', 'kr-cm-44'],
    globalOptimalScope: 'Only the declared 11-card owned domain; no global full-DB certificate' },
  quantitativeAppliedRows: 0 }, null, 2));
