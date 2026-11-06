import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { buildSupportEventModel } from '../../src/engine/event-acquisition';
import { buildP5AvailabilityContext } from '../../src/engine/p5-availability';
import { getP3Availability } from '../../src/engine/support-acquisition';
import { normalizeSkillPriorities, type UserSkillPriority } from '../../src/engine/skill-priorities';
import { inspectSupportLineup, recommendPersonalizedSupportDecks, recommendSupportDecks, type P4DeckRecommendation, type P4DeckScore,
  type P4RecommendationRequest, type P4RecommendationResult } from '../../src/engine/support-deck-optimizer';

/** Actual source data only. Synthetic branch/ownership protocols live in unit tests. */
const sourcePaths = ['data/local/p3-skill-support.json', 'data/local/p5-forecast.json', 'data/local/p1-reference.json', 'data/local/p3-integrated.sqlite'];
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const baseline = JSON.parse(await readFile('data/local/p6-baseline/metadata.json', 'utf8')) as {
  files: { path: string; sha256: string }[]; ids: string[]; compatibleCount: number; potentialCount: number; score: P4DeckScore;
};
const sourceHashes = new Map<string, string>();
for (const path of sourcePaths) {
  const hash = sha256(await readFile(path));
  assert.equal(hash, baseline.files.find((row) => row.path === path)?.sha256, `Protected P6 source changed: ${path}`);
  sourceHashes.set(path, hash);
}
const calculationPaths = ['src/engine/support-deck-optimizer.ts', 'src/engine/skill-priorities.ts',
  'src/engine/event-acquisition.ts', 'src/engine/skill-evaluation.ts', 'src/engine/support-acquisition.ts',
  'src/engine/p5-availability.ts', 'scripts/validate/p6-user-skill-priority.ts'];
const calculationHashes = new Map<string, string>();
for (const path of calculationPaths) calculationHashes.set(path, sha256(await readFile(path)));
const snapshot = validateP3Snapshot(JSON.parse(await readFile(sourcePaths[0]!, 'utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(await readFile(sourcePaths[1]!, 'utf8')) as unknown, snapshot);
const names = new Map(snapshot.skills.map((row) => [row.skillId, row.displayName]));
const skillList = (ids: readonly string[]) => ids.map((skillId) => ({ skillId, name: names.get(skillId) ?? skillId }));
const difference = (left: readonly string[], right: readonly string[]) => left.filter((id) => !right.includes(id)).sort();
type PriorityRequest = P4RecommendationRequest & { skillPriorities?: UserSkillPriority[]; skillPriorityBonuses?: { preferred: number; strong: number } };
type PriorityScore = P4DeckScore & { preferenceBonus?: number; customizedValue?: number };
const priority = (skillId: string, level: UserSkillPriority['priority']): UserSkillPriority => ({ skillId, priority: level });

function forEvent(eventId: string, runningStyle: P4RecommendationRequest['runningStyle'] = 'pace'): PriorityRequest {
  const event = p5.tournaments.find((row) => row.eventId === eventId)!;
  assert.ok(event);
  const course = snapshot.courses.find((row) => row.courseId === event.courseId)!;
  return { course: { courseId: event.courseId, trackId: course.trackId, distanceM: event.conditions.distance,
    surface: event.conditions.surface === 1 ? 'turf' : 'dirt', rotation: event.conditions.direction,
    season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
  runningStyle, cutoffDate: p5.asOf, allowForecast: true, includeUnknown: true, preference: 'balanced', scenarioId: '11',
  forecast: buildP5AvailabilityContext(snapshot, p5, eventId)! };
}
function basicWeight(row: P4RecommendationResult['skillEvaluations'][number]): number {
  if (row.grade !== 'conditional') return { priority: 16, useful: 10, supplementary: 2, excluded: 0, unverified: 0 }[row.grade];
  return { 'course-valid': 10, 'window-dependent': 8, 'race-order-dependent': 6, 'course-ineffective-or-low': 2, unverified: 0 }[row.conditionClass];
}
function scoreOf(deck: P4DeckRecommendation) { return deck.score as PriorityScore; }
function reasonOf(result: P4RecommendationResult): string | null {
  const meta = Reflect.get(result, 'skillPriorities') as { failure?: { reason?: string } } | undefined;
  return meta?.failure?.reason ?? null;
}

function verify(result: P4RecommendationResult, request: PriorityRequest) {
  assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
  const priorities = normalizeSkillPriorities(snapshot, request.skillPriorities);
  const rows = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
  for (const deck of result.recommendations) {
    assert.equal(result.status, 'ready');
    assert.equal(deck.cards.length, 6);
    assert.equal(new Set(deck.cards.map((card) => card.ownerBaseId ?? card.supportId)).size, 6);
    assert.deepEqual(deck.guaranteedSkillIds, []);
    assert.deepEqual(deck.skillIds, [...new Set(deck.cards.flatMap((card) => card.skillIds))].sort());
    assert.ok(deck.eventDecisions.every((choice) => choice.probability === null));
    assert.equal(new Set(deck.eventDecisions.map((choice) => choice.groupId)).size, deck.eventDecisions.length);
    const bonus = priorities.reduce((sum, item) => !deck.skillIds.includes(item.skillId) || item.priority === 'required' ? sum
      : sum + (item.priority === 'preferred' ? request.skillPriorityBonuses?.preferred ?? 8 : request.skillPriorityBonuses?.strong ?? 24), 0);
    assert.equal(scoreOf(deck).preferenceBonus ?? 0, bonus, 'One preference bonus per distinct canonical goal');
    assert.equal(scoreOf(deck).customizedValue ?? deck.score.coverageValue, deck.score.coverageValue + bonus);
    assert.equal(deck.score.coverageValue, deck.skillIds.reduce((sum, id) => sum + basicWeight(rows.get(id)!), 0), 'Base qualitative score must remain separately reproducible');
    for (const item of priorities.filter((row) => row.priority === 'required')) assert.ok(deck.skillIds.includes(item.skillId), `Missing hard goal ${item.skillId}`);
    for (const card of deck.cards) {
      assert.equal(getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast, request.forecast).state, 'available');
      if (request.ownedOnly) {
        const registered = request.ownedSupports?.find((row) => row.supportId === card.supportId);
        if (registered) assert.equal(card.limitBreak, registered.limitBreak);
      }
      const model = buildSupportEventModel(snapshot, card.supportId, { scenarioId: request.scenarioId ?? undefined, allowJpReference: true });
      const decisions = new Map(card.eventDecisions.map((choice) => [choice.groupId, choice]));
      for (const route of card.routes) {
        const server = route.sourceServer ?? (card.acquisitionBasis === 'jp-reference-forecast' ? 'JP' : 'KR');
        assert.ok(snapshot.supportSkills.some((link) => link.server === server && link.supportId === card.supportId
          && link.skillId === route.sourceSkillId && link.acquisition === route.sourceKind));
        assert.notEqual(getP3Availability(snapshot, 'skill', route.sourceSkillId, request.cutoffDate, request.allowForecast, request.forecast).state, 'unavailable');
      }
      for (const id of card.skillIds) {
        const routes = card.routes.filter((route) => route.skillId === id);
        assert.ok(routes.length);
        const possible = routes.some((route) => route.sourceKind === 'hint' || (() => {
          const groups = model.groups.filter((group) => group.options.some((option) => option.sourceSkillIds.includes(route.sourceSkillId)));
          return groups.length > 0 && groups.every((group) => group.status === 'modeled'
            && group.options.some((option) => option.optionId === decisions.get(group.groupId)?.optionId && option.sourceSkillIds.includes(route.sourceSkillId)));
        })());
        assert.ok(possible, `No jointly compatible original route: ${card.supportId}/${id}`);
      }
    }
    if (request.ownedOnly) assert.ok(deck.cards.filter((card) => card.ownership === 'borrowed').length <= (request.allowBorrow ? 1 : 0));
  }
  if (result.status !== 'ready') assert.deepEqual(result.recommendations, [], 'A failed required search may not return a normal deck');
  if (result.search.candidatePoolLimited || result.search.beamPruned || result.search.eventPlansPruned || result.search.searchLimitReached) assert.equal(result.search.globalOptimal, false);
}

const requests = new Map<string, PriorityRequest>();
const bases = new Map<string, P4RecommendationResult>();
for (const eventId of ['kr-cm-39', 'kr-cm-40', 'kr-cm-44']) {
  const request = forEvent(eventId); requests.set(eventId, request);
  const actual = recommendSupportDecks(snapshot, request); verify(actual, request); bases.set(eventId, actual);
  const recorded = JSON.parse(await readFile(`data/local/p6-baseline/${eventId}.json`, 'utf8')) as { result: P4RecommendationResult };
  const best = actual.recommendations[0]!; const old = recorded.result.recommendations[0]!;
  assert.equal(actual.status, 'ready');
  assert.deepEqual(best.cards.map((card) => card.supportId), old.cards.map((card) => card.supportId));
  assert.deepEqual(best.skillIds, old.skillIds);
  assert.deepEqual(best.eventDecisions, old.eventDecisions);
  for (const [key, value] of Object.entries(old.score)) assert.equal(Reflect.get(best.score, key), value, `Default P5 score changed: ${eventId}/${key}`);
}
const baseRequest = requests.get('kr-cm-39')!;
const baseResult = bases.get('kr-cm-39')!;
assert.equal(baseResult.recommendations[0]!.score.coverageValue, 384);
assert.equal(baseResult.recommendations[0]!.skillIds.length, 50);
assert.deepEqual(recommendSupportDecks(snapshot, { ...baseRequest, skillPriorities: [] }), baseResult, 'Empty priorities must be the same request result');
const runs: { caseId: string; request: PriorityRequest; result: P4RecommendationResult; elapsedMs: number; base: P4RecommendationResult }[] = [];
const baseCache = new Map([...requests].map(([eventId, request]) => [JSON.stringify(request), bases.get(eventId)!]));
function baselineFor(request: PriorityRequest) {
  const plain = { ...request, skillPriorities: undefined, skillPriorityBonuses: undefined };
  const key = JSON.stringify(plain);
  const cached = baseCache.get(key); if (cached) return cached;
  const actual = recommendSupportDecks(snapshot, plain); verify(actual, plain);
  baseCache.set(key, actual); return actual;
}
function run(caseId: string, request: PriorityRequest, base = baselineFor(request)) {
  const started = performance.now(); const result = recommendSupportDecks(snapshot, request);
  verify(result, request);
  runs.push({ caseId, request, result, base, elapsedMs: Math.round(performance.now() - started) });
  console.log(JSON.stringify({ caseId, status: result.status, reason: reasonOf(result), ids: result.recommendations[0]?.cards.map((card) => card.supportId),
    score: result.recommendations[0]?.score, goals: result.recommendations[0]?.skillIds.length, elapsedMs: runs.at(-1)!.elapsedMs }));
  return result;
}
run('B-ground-preferred-8', { ...baseRequest, skillPriorities: [priority('201601', 'preferred')] });
const strong = run('B-ground-strong-24', { ...baseRequest, skillPriorities: [priority('201601', 'strong')] });
const required = run('C-ground-required', { ...baseRequest, skillPriorities: [priority('201601', 'required')] });
assert.equal(required.status, 'ready');
assert.ok(required.recommendations.every((deck) => deck.skillIds.includes('201601')));
assert.ok(required.recommendations[0]!.score.coverageValue >= strong.recommendations[0]!.score.coverageValue,
  'The already found soft-preference deck is a feasible lower bound for the same hard requirement');
for (const level of ['preferred', 'strong', 'required'] as const) run(`corner-${level}`, { ...baseRequest, skillPriorities: [priority('201322', level)] });
run('mixed-ground-required-corner-preferred', { ...baseRequest, skillPriorities: [priority('201601', 'required'), priority('201322', 'preferred')] });
const frontRequest = forEvent('kr-cm-39', 'front');
const frontBase = recommendSupportDecks(snapshot, frontRequest); verify(frontBase, frontRequest);
const pair = run('D-avoid-position-both-required', { ...frontRequest, skillPriorities: [priority('201262', 'required'), priority('200452', 'required')] }, frontBase);
assert.equal(pair.status, 'ready');
assert.ok(pair.recommendations.every((deck) => ['201262', '200452'].every((id) => deck.skillIds.includes(id))));
run('warning-inapplicable-required', { ...baseRequest, skillPriorities: [priority('201262', 'required')] });
run('warning-unverified-required', { ...baseRequest, skillPriorities: [priority('200432', 'required')] });

for (const points of [4, 12]) run(`sensitivity-ground-preferred-${points}`, { ...baseRequest,
  skillPriorities: [priority('201601', 'preferred')], skillPriorityBonuses: { preferred: points, strong: 24 } });
for (const points of [12, 16, 32, 48]) run(`sensitivity-ground-strong-${points}`, { ...baseRequest,
  skillPriorities: [priority('201601', 'strong')], skillPriorityBonuses: { preferred: 8, strong: points } });
for (const eventId of ['kr-cm-40', 'kr-cm-44']) {
  const request = requests.get(eventId)!;
  for (const level of ['preferred', 'strong'] as const) run(`sensitivity-${eventId}-ground-${level}`, { ...request,
    skillPriorities: [priority('201601', level)] }, bases.get(eventId)!);
  run(`sensitivity-${eventId}-ground-corner-strong`, { ...request, skillPriorities: [priority('201601', 'strong'), priority('201322', 'strong')] }, bases.get(eventId)!);
}

const futureEarly = run('E-future-early-CM39', { ...baseRequest, skillPriorities: [priority('203842', 'required')] });
assert.notEqual(futureEarly.status, 'ready');
const futureLateRequest = { ...requests.get('kr-cm-40')!, skillPriorities: [priority('203842', 'required')] };
const futureLate = run('E-future-CM40-enabled', futureLateRequest, bases.get('kr-cm-40')!);
assert.equal(futureLate.status, 'ready');
assert.ok(futureLate.recommendations.every((deck) => deck.skillIds.includes('203842')));
const futureOff = run('E-future-CM40-disabled', { ...futureLateRequest, allowForecast: false });
assert.notEqual(futureOff.status, 'ready');
assert.equal(reasonOf(futureEarly), 'unverified-source');
assert.equal(reasonOf(futureOff), 'unverified-source');
const futureOnly = run('E-no-released-source-203812', { ...baseRequest, skillPriorities: [priority('203812', 'required')] });
assert.notEqual(futureOnly.status, 'ready');
assert.equal(reasonOf(futureOnly), 'no-released-source');

const ownedSupports = baseResult.recommendations[0]!.cards.map((card) => ({ supportId: card.supportId, limitBreak: 2 }));
const ownedFailure = run('F-owned-no-borrow-ground-required', { ...baseRequest, ownedSupports, ownedOnly: true, allowBorrow: false,
  skillPriorities: [priority('201601', 'required')] });
assert.notEqual(ownedFailure.status, 'ready');
assert.equal(reasonOf(ownedFailure), 'ownership-borrow-limit');
const borrowed = run('F-owned-one-borrow-ground-required', { ...baseRequest, ownedSupports, ownedOnly: true, allowBorrow: true,
  skillPriorities: [priority('201601', 'required')] });
assert.equal(borrowed.status, 'ready');
const twoBorrowFailure = run('F-owned-one-borrow-insufficient-for-two-goals', { ...frontRequest, ownedSupports, ownedOnly: true, allowBorrow: true,
  skillPriorities: [priority('201262', 'required'), priority('200452', 'required')] });
assert.notEqual(twoBorrowFailure.status, 'ready');
assert.equal(reasonOf(twoBorrowFailure), 'ownership-borrow-limit');
run('main-training-same-target-retained', { ...baseRequest, deck: [{ supportId: '30024', limitBreak: 4 }],
  skillPriorities: [priority('201601', 'required')] });

const duplicates = run('canonical-duplicate-bonus-once', { ...baseRequest,
  skillPriorities: [priority('201321', 'preferred'), priority('201322', 'strong')] });
assert.ok(duplicates.recommendations.every((deck) => (scoreOf(deck).preferenceBonus ?? 0) <= 24));
const gold = run('explicit-gold-lower-required', { ...baseRequest, skillPriorities: [priority('201602', 'required')] });
assert.equal(gold.status, 'ready');
assert.ok(gold.recommendations.every((deck) => deck.skillIds.includes('201601') && !deck.skillIds.includes('201602')));

const comparisonRequest = { ...baseRequest, skillPriorities: [priority('201601', 'strong')] };
const compared = recommendPersonalizedSupportDecks(snapshot, comparisonRequest);
assert.deepEqual(compared.base, baseResult);
assert.deepEqual(compared.customized, strong);
assert.ok(compared.comparison);
assert.deepEqual(compared.comparison.gainedSkillIds, difference(strong.recommendations[0]!.skillIds, baseResult.recommendations[0]!.skillIds));
assert.deepEqual(compared.comparison.lostSkillIds, difference(baseResult.recommendations[0]!.skillIds, strong.recommendations[0]!.skillIds));
assert.equal(compared.comparison.baseCoverageDelta, strong.recommendations[0]!.score.coverageValue - baseResult.recommendations[0]!.score.coverageValue);
const untouched = recommendPersonalizedSupportDecks(snapshot, baseRequest);
assert.deepEqual(untouched.base, baseResult);
assert.equal(untouched.customized, null);
assert.equal(untouched.comparison, null);
const sameLineupRequest = { ...requests.get('kr-cm-40')!, skillPriorities: [priority('201601', 'strong'), priority('201322', 'strong')] };
const sameLineup = recommendPersonalizedSupportDecks(snapshot, sameLineupRequest);
assert.ok(sameLineup.comparison?.sameLineup, 'A satisfied request may retain the same six cards');
assert.equal(sameLineup.comparison.baseCoverageDelta, 0);
assert.deepEqual(sameLineup.comparison.gainedSkillIds, []);
assert.deepEqual(sameLineup.comparison.lostSkillIds, []);
const failedCustomized = recommendPersonalizedSupportDecks(snapshot, { ...futureLateRequest, allowForecast: false });
assert.equal(failedCustomized.base.status, 'ready', 'An infeasible custom goal must preserve the ordinary recommendation');
assert.notEqual(failedCustomized.customized?.status, 'ready');
assert.equal(failedCustomized.comparison, null, 'No fabricated gain/loss comparison against an empty deck');

// Previous independently recorded feasible deck, not a fitted target lineup.
const knownIds = ['30175', '30108', '10122', '30231', '10005', '30159'];
const knownFeasible = inspectSupportLineup(snapshot, { ...baseRequest, skillPriorities: [priority('201601', 'strong')] },
  knownIds.map((supportId) => ({ supportId, limitBreak: 4 })));
assert.ok(knownFeasible.deck?.skillIds.includes('201601'));
const independentKnownBound = scoreOf(knownFeasible.deck!).customizedValue!;
// This is a quality observation under a bounded search, not a global optimum certificate.
const reachesKnownBound = strong.status === 'ready' && scoreOf(strong.recommendations[0]!).customizedValue! >= independentKnownBound;

const describe = (result: P4RecommendationResult, base: P4RecommendationResult, request: PriorityRequest) => {
  const deck = result.recommendations[0]; const original = base.recommendations[0]!;
  const rows = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
  const priorities = normalizeSkillPriorities(snapshot, request.skillPriorities);
  return { status: result.status, failureReason: reasonOf(result), priorityMetadata: Reflect.get(result, 'skillPriorities') ?? null,
    search: result.search, warnings: result.warnings,
    ids: deck?.cards.map((card) => card.supportId) ?? [], cards: deck?.cards.map((card) => ({ supportId: card.supportId, name: card.name,
      limitBreak: card.limitBreak, ownership: card.ownership, acquisitionBasis: card.acquisitionBasis })) ?? [],
    score: deck?.score ?? null, baseScore: original.score.coverageValue,
    baseScoreDelta: deck ? deck.score.coverageValue - original.score.coverageValue : null,
    compatibleCount: deck?.skillIds.length ?? 0, potentialCount: deck?.potentialSkillIds.length ?? 0,
    greenSkills: skillList(deck?.greenSkillIds ?? []), duplicateSkills: skillList(deck?.duplicateSkillIds ?? []),
    chosen: priorities.map((item) => ({ ...item, name: names.get(item.skillId), present: deck?.skillIds.includes(item.skillId) ?? false,
      grade: rows.get(item.skillId)?.grade ?? null, applicability: rows.get(item.skillId)?.applicability ?? null,
      availability: rows.get(item.skillId)?.availability ?? null,
      providers: deck?.cards.filter((card) => card.skillIds.includes(item.skillId)).map((card) => ({ supportId: card.supportId,
        sourceRoutes: card.routes.filter((route) => route.skillId === item.skillId), eventDecisions: card.eventDecisions.filter((choice) => choice.skillIds.includes(item.skillId)) })) ?? [] })),
    gained: skillList(deck ? difference(deck.skillIds, original.skillIds) : []), lost: skillList(deck ? difference(original.skillIds, deck.skillIds) : []),
    lostCore: skillList(deck ? difference(original.skillIds, deck.skillIds).filter((id) => base.skillEvaluations.find((row) => row.skillId === id)?.valueEvidence.core.status === 'guide-priority') : []),
    lostGreens: skillList(deck ? difference(original.greenSkillIds, deck.greenSkillIds) : []), eventDecisions: deck?.eventDecisions ?? [],
    swaps: deck?.swaps ?? [],
  };
};
await mkdir('data/local/p6-recommendations', { recursive: true });
const summarized = [];
for (const item of runs) {
  const summary = { caseId: item.caseId, request: item.request, elapsedMs: item.elapsedMs, ...describe(item.result, item.base, item.request) };
  summarized.push(summary);
  await writeFile(`data/local/p6-recommendations/${item.caseId}.json`, `${JSON.stringify({ request: item.request, result: item.result }, null, 2)}\n`, 'utf8');
}
for (const [path, hash] of sourceHashes) assert.equal(sha256(await readFile(path)), hash, `P6 validation changed source: ${path}`);
for (const [path, hash] of calculationHashes) assert.equal(sha256(await readFile(path)), hash, `Calculation changed during P6 validation: ${path}`);
const report = { checkedOn: p5.asOf, baseSnapshotId: snapshot.snapshotId, p5SnapshotId: p5.snapshotId,
  immutableSources: Object.fromEntries(sourceHashes), calculationSources: Object.fromEntries(calculationHashes),
  quantitativeAppliedRows: 0, sourceSkillEffectsOrDatesModified: false,
  defaultRegression: { status: 'passed', ids: baseline.ids, score: baseline.score, compatibleCount: 50, potentialCount: 51, greenCount: 10 },
  preferencePolicy: { preferred: 8, strong: 24, required: 'compatible-path hard constraint, zero preference bonus',
    valuesAreUserPolicyNotGameMeasurements: true, noFittedCardCombination: true },
  knownFeasibleStrongBound: { ids: knownIds, basicScore: knownFeasible.deck!.score.coverageValue,
    preferenceBonus: scoreOf(knownFeasible.deck!).preferenceBonus, customizedValue: independentKnownBound, reachesKnownBound },
  personalizedWrapperComparison: compared.comparison,
  personalizedWrapperProtocol: { emptySelectionUnchanged: true, satisfiedSameLineup: sameLineup.comparison,
    infeasibleGoalRetainsBase: failedCustomized.base.status, infeasibleComparison: failedCustomized.comparison },
  outsideOriginalCandidateEvidence: { caseId: 'C-ground-required', ...required.search.priorityCandidateExpansion,
    selectedAddedProviders: required.recommendations[0]!.cards.filter((card) => required.search.priorityCandidateExpansion?.addedProviderSupportIds.includes(card.supportId)
      && card.skillIds.includes('201601')).map((card) => ({ supportId: card.supportId, name: card.name })) },
  runs: summarized,
  limitations: ['Preference values are user policy points, not race gain, activation or inheritance probability.',
    'Compatible hint/event opportunities are not acquisition, factor creation, inheritance or training-completion guarantees.',
    'Candidate, beam and branch budgets remain; a missed solution is not a proof of global impossibility.'],
};
await writeFile('data/local/p6-user-skill-priority.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ defaultRegression: report.defaultRegression, knownFeasibleStrongBound: report.knownFeasibleStrongBound,
  runs: summarized.map((row) => ({ caseId: row.caseId, status: row.status, reason: row.failureReason, ids: row.ids,
    score: row.score, basicDelta: row.baseScoreDelta, goals: row.compatibleCount, greens: row.greenSkills.length,
    lostCore: row.lostCore, elapsedMs: row.elapsedMs, chosen: row.chosen.map((item) => ({ id: item.skillId, present: item.present })) })) }, null, 2));
