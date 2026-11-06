import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { buildP5AvailabilityContext } from '../../src/engine/p5-availability';
import { getP3Availability } from '../../src/engine/support-acquisition';
import { inspectSupportLineup, recommendSupportDecks, type P4RecommendationRequest, type P4RecommendationResult } from '../../src/engine/support-deck-optimizer';

const bytes = await readFile('data/local/p3-skill-support.json');
const sha256 = (input: Uint8Array | string) => createHash('sha256').update(input).digest('hex');
const snapshot = validateP3Snapshot(JSON.parse(bytes.toString('utf8')) as unknown);
const p5Bytes = await readFile('data/local/p5-forecast.json');
const p5 = validateP5Snapshot(JSON.parse(p5Bytes.toString('utf8')) as unknown, snapshot);
const metadata = JSON.parse(await readFile('data/local/p5-baseline/metadata.json', 'utf8')) as { snapshotSha256: string };
assert.equal(sha256(bytes), metadata.snapshotSha256);
assert.equal(p5.tournaments.length, 14);
const before = sha256(JSON.stringify(snapshot));
const outDir = 'data/local/p5-recommendations';
await mkdir(outDir, { recursive: true });
const rows: unknown[] = [];
const difference = (left: string[], right: string[]) => left.filter((id) => !right.includes(id)).sort();

function verify(result: P4RecommendationResult, request: P4RecommendationRequest) {
  assert.equal(result.status, 'ready');
  assert.ok(result.recommendations.length >= 1 && result.recommendations.length <= 2);
  assert.equal(result.search.objective, 'compatible-qualitative-coverage-then-priority-green-then-guide-reference');
  assert.equal(result.search.globalOptimal, false, 'The actual full pool uses bounded candidate search');
  assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
  for (const deck of result.recommendations) {
    assert.equal(deck.cards.length, 6);
    assert.equal(new Set(deck.cards.map((card) => card.ownerBaseId ?? card.supportId)).size, 6);
    assert.deepEqual(deck.compatibleSkillIds, deck.skillIds);
    assert.deepEqual(deck.skillIds, [...new Set(deck.cards.flatMap((card) => card.skillIds))].sort());
    assert.deepEqual(deck.guaranteedSkillIds, []);
    assert.ok(deck.eventDecisions.every((decision) => decision.probability === null));
    assert.equal(new Set(deck.eventDecisions.map((decision) => decision.groupId)).size, deck.eventDecisions.length);
    for (const card of deck.cards) {
      const availability = getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast, request.forecast);
      assert.equal(availability.state, 'available');
      for (const route of card.routes) {
        assert.ok(route.sourceServer === 'JP' || route.sourceServer === 'KR', 'P5 must preserve the original route server');
        assert.equal(route.acquisitionBasis, route.sourceServer === 'JP' ? 'jp-reference-forecast' : 'kr-source');
        assert.ok(snapshot.supportSkills.some((link) => link.supportId === route.supportId && link.skillId === route.sourceSkillId
          && link.server === route.sourceServer && link.acquisition === route.sourceKind));
        assert.notEqual(getP3Availability(snapshot, 'skill', route.sourceSkillId, request.cutoffDate, request.allowForecast, request.forecast).state, 'unavailable');
        assert.notEqual(getP3Availability(snapshot, 'skill', route.skillId, request.cutoffDate, request.allowForecast, request.forecast).state, 'unavailable');
      }
    }
    for (const swap of deck.swaps) {
      const replacement = deck.cards.filter((card) => card.supportId !== swap.removeSupportId)
        .map((card) => ({ supportId: card.supportId, limitBreak: card.limitBreak }));
      replacement.push({ supportId: swap.addSupportId, limitBreak: 4 });
      const inspected = inspectSupportLineup(snapshot, request, replacement);
      assert.ok(inspected.deck);
      assert.deepEqual(swap.gainedSkillIds, difference(inspected.deck.skillIds, deck.skillIds));
      assert.deepEqual(swap.lostSkillIds, difference(deck.skillIds, inspected.deck.skillIds));
    }
  }
}

for (const event of p5.tournaments) {
  const forecast = buildP5AvailabilityContext(snapshot, p5, event.eventId)!;
  assert.ok(forecast);
  const availableScenarios = snapshot.scenarios.filter((scenario) => getP3Availability(snapshot, 'scenario', scenario.scenarioId,
    p5.asOf, true, forecast).state === 'available');
  const scenarioId = availableScenarios.some((scenario) => scenario.scenarioId === '11') ? '11' : availableScenarios[0]?.scenarioId ?? null;
  const course = snapshot.courses.find((row) => row.courseId === event.courseId)!;
  const request: P4RecommendationRequest = {
    course: { courseId: event.courseId, trackId: course.trackId, distanceM: event.conditions.distance,
      surface: event.conditions.surface === 1 ? 'turf' : 'dirt', rotation: event.conditions.direction,
      season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
    runningStyle: 'pace', cutoffDate: p5.asOf, allowForecast: true, includeUnknown: true,
    preference: 'balanced', scenarioId, forecast,
  };
  const started = performance.now();
  const result = recommendSupportDecks(snapshot, request);
  verify(result, request);
  assert.deepEqual(recommendSupportDecks(snapshot, request), result);
  const currentScenarios = snapshot.scenarios.filter((scenario) => getP3Availability(snapshot, 'scenario', scenario.scenarioId,
    p5.asOf, false, forecast).state === 'available');
  const currentScenarioId = currentScenarios.some((scenario) => scenario.scenarioId === scenarioId) ? scenarioId : currentScenarios[0]?.scenarioId ?? null;
  const currentOnlyRequest = { ...request, allowForecast: false, scenarioId: currentScenarioId };
  const currentOnly = recommendSupportDecks(snapshot, currentOnlyRequest);
  verify(currentOnly, currentOnlyRequest);
  const withoutUnknownResearchRequest = { ...request, includeUnknown: false };
  const withoutUnknownResearch = recommendSupportDecks(snapshot, withoutUnknownResearchRequest);
  verify(withoutUnknownResearch, withoutUnknownResearchRequest);
  assert.ok(withoutUnknownResearch.skillEvaluations.every((row) => row.availability.state !== 'unknown'));
  assert.ok(result.search.eligibleCardCount >= currentOnly.search.eligibleCardCount);
  if (event.format === 'league-of-heroes') {
    assert.equal(request.course.weather, null);
    assert.equal(request.course.groundCondition, null);
  }
  const artifact = `${outDir}/${event.eventId}.json`;
  await writeFile(artifact, `${JSON.stringify({ eventId: event.eventId, jpEventId: event.jpEventId, request, result,
    currentOnly: { request: currentOnlyRequest, result: currentOnly } }, null, 2)}\n`, 'utf8');
  const best = result.recommendations[0]!;
  rows.push({ eventId: event.eventId, format: event.format, expectedDate: event.expectedDate, expectedMonth: event.expectedMonth,
    expectedWindow: event.expectedWindow, analysisWindow: event.analysisWindow, rangeMembership: event.rangeMembership,
    jpEventId: event.jpEventId, jpEventDate: forecast.jpEventDate, randomWeatherPreserved: event.format === 'league-of-heroes',
    scenarioId, currentScenarioId, eligibleForecast: result.search.eligibleCardCount, eligibleCurrentOnly: currentOnly.search.eligibleCardCount,
    ids: best.cards.map((card) => card.supportId), cards: best.cards.map((card) => ({ supportId: card.supportId,
      name: card.name, acquisitionBasis: card.acquisitionBasis, availability: card.availability,
      sourceServers: [...new Set(card.routes.map((route) => route.sourceServer))] })),
    score: best.score, compatibleCount: best.skillIds.length, potentialCount: best.potentialSkillIds.length,
    unknownReleaseTargetCount: best.skillIds.filter((id) => result.skillEvaluations.find((row) => row.skillId === id)?.availability.state === 'unknown').length,
    withoutUnknownResearch: { status: withoutUnknownResearch.status,
      compatibleCount: withoutUnknownResearch.recommendations[0]!.skillIds.length,
      score: withoutUnknownResearch.recommendations[0]!.score,
      ids: withoutUnknownResearch.recommendations[0]!.cards.map((card) => card.supportId) },
    alternatives: result.recommendations.length - 1, artifact, elapsedMs: Math.round(performance.now() - started), search: result.search,
  });
}
assert.equal(sha256(JSON.stringify(snapshot)), before);
assert.equal(sha256(await readFile('data/local/p3-skill-support.json')), metadata.snapshotSha256);
assert.equal(sha256(await readFile('data/local/p5-forecast.json')), sha256(p5Bytes));
const report = { checkedOn: p5.asOf, scope: 'All 14 P5 events, fixed pace/balanced qualitative profile, forecast on/off',
  snapshotId: snapshot.snapshotId, snapshotSha256: metadata.snapshotSha256, p5SnapshotId: p5.snapshotId,
  p5Sha256: sha256(p5Bytes), range: p5.range, events: rows,
  policy: 'Same qualitative objective for every horizon; no score discount for distance in months; no invented margin or probability.',
  scenarioProfile: 'Use existing scenario 11 when common event availability permits it, otherwise the first available source scenario; forecast-off uses a scenario available under forecast-off. This is a validation profile, not an automatic scenario recommendation.',
  quantitativeAppliedRows: 0, separateLateReleaseRecommendations: 0,
  lateReleaseReason: 'The handoff has no verified parent/grandparent reconstruction cost. Screening dates alone do not certify a separate plan.',
  checks: { fourteenEvents: true, sixDistinctOwners: true, originalJpOrKrRoutes: true, noKnownAfterEventSourceSkill: true,
    noInventedProbability: true, deterministic: true, exactSwapDifferences: true, forecastOnOffCompared: true,
    unknownResearchOffCompared: true,
    lohRandomConditionsPreserved: true, immutableP3AndP5: true },
  limitations: ['Unknown skill first-release dates remain null; supply-witness availability is only a forecast, not a KR patch certificate.', 'JP reference paths and event constraints are not KR patch certificates.',
    'Bounded search and unresolved event chains remain; no global optimum or training completion guarantee.'],
};
await writeFile('data/local/p5-recommendation.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ p5SnapshotId: p5.snapshotId, events: rows, checks: report.checks }, null, 2));
