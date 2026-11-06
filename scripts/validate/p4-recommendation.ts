import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { recommendSupportDecks, inspectSupportLineup, type P4RecommendationRequest, type P4RecommendationResult } from '../../src/engine/support-deck-optimizer';
import { getP3Availability } from '../../src/engine/support-acquisition';
import { resolveEvaluationContext } from '../../src/engine/availability';

const text = await readFile('data/local/p3-skill-support.json', 'utf8');
const snapshot = validateP3Snapshot(JSON.parse(text) as unknown);
const before = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const guideInput = JSON.parse(await readFile('data/curated/p4-guide-cases.json', 'utf8')) as { cases: {
  caseId: string; server: string; source: { url: string; publishedOn?: string; updatedOn?: string };
  tournamentRef: string; runningStyle: P4RecommendationRequest['runningStyle']; scenarioId: string;
  conditions: { courseId: string; distance: number; surface: number; direction: 1 | 2; season: number; weather: number; ground: number };
  publishedSupportIds: string[]; publishedDeckIsPartial?: boolean; targetSkillIds: string[];
}[] };
const names = new Map(snapshot.skills.map((row) => [row.skillId, row.displayName]));
const cutoffFor = (startAt: string) => resolveEvaluationContext({ mode: 'tournament', tournament: { startAt, dateStatus: 'confirmed' }, now: new Date('2026-11-05T00:00:00Z') }).cutoffDate;
function forEvent(eventId: string, runningStyle: P4RecommendationRequest['runningStyle'], current = false): P4RecommendationRequest {
  const event = snapshot.tournaments.find((row) => row.eventId === eventId)!;
  assert.ok(event?.startAt, eventId);
  return { course: { courseId: event.courseId, trackId: snapshot.courses.find((row) => row.courseId === event.courseId)!.trackId,
    distanceM: event.conditions.distance, surface: event.conditions.surface === 1 ? 'turf' : 'dirt',
    rotation: event.conditions.direction, season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
    runningStyle, cutoffDate: current ? '2026-11-05' : cutoffFor(event.startAt), allowForecast: true,
    includeUnknown: true, scenarioId: '11', preference: 'balanced' };
}
const summary = (result: P4RecommendationResult) => ({ status: result.status, search: result.search,
  decks: result.recommendations.map((deck) => ({ ids: deck.cards.map((row) => row.supportId),
    cards: deck.cards.map((row) => ({ id: row.supportId, name: row.name, rarity: row.rarity,
      uniqueCount: row.uniqueSkillIds.length, ownership: row.ownership, release: row.availability.basis, acquisitionBasis: row.acquisitionBasis })),
    score: deck.score, skills: deck.skillIds, greens: deck.greenSkillIds.map((id) => ({ id, name: names.get(id) })),
    duplicates: deck.duplicateSkillIds, missingPriority: deck.missingPrioritySkillIds,
    missingImportant: deck.missingImportantSkillIds, swaps: deck.swaps,
    gained: deck.gainedSkillIds, lost: deck.lostSkillIds })) });
function verify(result: P4RecommendationResult, request: P4RecommendationRequest) {
  assert.equal(result.status, 'ready');
  assert.ok(result.recommendations.length >= 1 && result.recommendations.length <= 2);
  for (const deck of result.recommendations) {
    assert.equal(deck.cards.length, 6);
    assert.equal(new Set(deck.cards.map((row) => row.supportId)).size, 6);
    assert.equal(new Set(deck.cards.map((row) => row.ownerBaseId ?? row.supportId)).size, 6);
    assert.ok(deck.cards.every((row) => getP3Availability(snapshot, 'support', row.supportId, request.cutoffDate, request.allowForecast).state === 'available'));
    const union = [...new Set(deck.cards.flatMap((row) => row.skillIds))].sort();
    assert.deepEqual(deck.skillIds, union);
    const duplicate = union.filter((id) => deck.cards.filter((row) => row.skillIds.includes(id)).length > 1);
    assert.deepEqual(deck.duplicateSkillIds, duplicate);
    for (const swap of deck.swaps) {
      const replacement = deck.cards.filter((row) => row.supportId !== swap.removeSupportId)
        .map((row) => ({ supportId: row.supportId, limitBreak: row.limitBreak }));
      replacement.push({ supportId: swap.addSupportId, limitBreak: 4 });
      const inspection = inspectSupportLineup(snapshot, { ...request, ownedOnly: false }, replacement);
      assert.ok(inspection.deck);
      assert.deepEqual(swap.gainedSkillIds, inspection.deck.skillIds.filter((id) => !deck.skillIds.includes(id)));
      assert.deepEqual(swap.lostSkillIds, deck.skillIds.filter((id) => !inspection.deck!.skillIds.includes(id)));
    }
  }
  assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
  if (result.search.candidatePoolLimited || result.search.beamPruned) assert.equal(result.search.globalOptimal, false);
}

const runs = [];
for (const [eventId, style, current] of [
  ['kr-cm-39', 'pace', false], ['kr-cm-39', 'front', true], ['kr-cm-39', 'end', true],
  ['kr-cm-40', 'pace', false], ['kr-loh-2026-09', 'pace', false],
] as const) {
  const request = forEvent(eventId, style, current);
  const start = performance.now(); const result = recommendSupportDecks(snapshot, request);
  verify(result, request);
  runs.push({ eventId, style, cutoffDate: request.cutoffDate, allowForecast: request.allowForecast,
    elapsedMs: Math.round(performance.now() - start), ...summary(result) });
}
const request = forEvent('kr-cm-39', 'pace');
const repeated = recommendSupportDecks(snapshot, request);
assert.deepEqual(summary(repeated), { status: runs[0]!.status, search: runs[0]!.search, decks: runs[0]!.decks });
const ownedSupports = ['10001', '10002', '10003', '10004', '10005', '10006'].map((supportId) => ({ supportId, limitBreak: 0 }));
const owned = recommendSupportDecks(snapshot, { ...request, ownedSupports, ownedOnly: true, allowBorrow: true, search: { candidateLimit: 20 } });
verify(owned, { ...request, ownedSupports, ownedOnly: true, allowBorrow: true });
assert.ok(owned.recommendations.every((deck) => deck.cards.filter((card) => card.ownership === 'borrowed').length <= 1));
assert.ok(owned.recommendations.every((deck) => deck.cards.filter((card) => card.ownership === 'owned').every((card) => card.limitBreak === 0)));

const comparisons = [];
for (const guide of guideInput.cases) {
  const conditions = guide.conditions;
  const actualEvent = snapshot.tournaments.find((row) => row.eventId === guide.tournamentRef);
  const applications = guide.publishedSupportIds.map((id) => snapshot.applications.find((row) => row.entityType === 'support' && row.entityId === id)!);
  // JP guides remain JP references. This comparison window is derived from actual
  // KR forecast records, not invented as a Korean event date or current release.
  const referenceCutoff = guide.server === 'JP'
    ? ['2026-11-05', ...applications.map((row) => row.kr.confirmedDate ?? row.kr.observedDate ?? row.kr.forecastDate ?? '2026-11-05')].sort().at(-1)!
    : actualEvent?.startAt ? cutoffFor(actualEvent.startAt) : '2026-11-05';
  const comparisonRequest: P4RecommendationRequest = { course: { courseId: conditions.courseId,
    trackId: snapshot.courses.find((row) => row.courseId === conditions.courseId)!.trackId,
    distanceM: conditions.distance, surface: conditions.surface === 1 ? 'turf' : 'dirt',
    rotation: conditions.direction, season: conditions.season, weather: conditions.weather, groundCondition: conditions.ground },
    runningStyle: guide.runningStyle, cutoffDate: referenceCutoff, allowForecast: true, includeUnknown: true,
    scenarioId: guide.scenarioId, preference: 'balanced' };
  const recommended = recommendSupportDecks(snapshot, comparisonRequest);
  verify(recommended, comparisonRequest);
  const published = guide.publishedSupportIds.length === 6
    ? inspectSupportLineup(snapshot, comparisonRequest, guide.publishedSupportIds.map((supportId) => ({ supportId, limitBreak: 4 }))) : null;
  if (published) assert.ok(published.deck, `Published deck cannot be analyzed: ${guide.caseId}`);
  const best = recommended.recommendations[0]!;
  comparisons.push({ caseId: guide.caseId, source: guide.source, sourceServer: guide.server,
    comparisonCutoff: referenceCutoff,
    availabilityContext: guide.server === 'JP' ? 'KR forecast reference window for the JP guide course; not an invented KR event schedule or JP/KR patch certificate' : 'Historical KR tournament date with current-source effects; historical patch accuracy unverified',
    publishedSupportIds: guide.publishedSupportIds, publishedDeckIsPartial: guide.publishedDeckIsPartial ?? false,
    publishedScore: published?.deck?.score ?? null, publishedSkills: published?.deck?.skillIds ?? null,
    recommended: summary(recommended),
    gainedComparedWithPublished: published?.deck ? best.skillIds.filter((id) => !published.deck!.skillIds.includes(id)) : null,
    lostComparedWithPublished: published?.deck ? published.deck.skillIds.filter((id) => !best.skillIds.includes(id)) : null,
    guideTargetChecks: guide.targetSkillIds.map((skillId) => ({ skillId, name: names.get(skillId),
      presentInRecommended: best.skillIds.includes(skillId), evaluation: recommended.skillEvaluations.find((row) => row.skillId === skillId)?.grade ?? 'not-returned',
      sourceProviders: guide.publishedSupportIds.filter((id) => snapshot.supportSkills.some((route) => route.supportId === id && route.skillId === skillId)) })),
  });
}
assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), before);
const report = { checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId,
  scope: 'real-DB-six-support-coverage-and-guide-comparison',
  skills: snapshot.skills.length, supports: snapshot.supports.length, sourceManifestSha256: snapshot.sourceManifestSha256,
  deterministic: true, immutableSource: true, observedSkillGainMeasurements: 0, independentKrGameplayCases: 0,
  runs, ownershipRegression: summary(owned), guideComparisons: comparisons,
  limitations: ['Qualitative objective units are not measured race gains or activation percentages.',
    'Hint/event/choice route union is not a guarantee of acquiring every skill in one training run.',
    'Bounded candidate/beam search does not certify a global optimum.',
    'JP guide reference windows preserve KR forecast evidence and do not create a Korean event schedule.'] };
await writeFile('data/local/p4-recommendation.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ snapshotId: report.snapshotId, runs: runs.map((row) => ({ eventId: row.eventId, style: row.style,
  ids: row.decks[0]!.ids, skills: row.decks[0]!.skills.length, greens: row.decks[0]!.greens.length,
  missingPriority: row.decks[0]!.missingPriority, alternatives: row.decks.length - 1, elapsedMs: row.elapsedMs,
  examinedStates: row.search.examinedStates })), ownershipRegression: owned.status,
  guideComparisons: comparisons.map((row) => ({ caseId: row.caseId, publishedScore: row.publishedScore,
    recommendedScore: row.recommended.decks[0]!.score, gained: row.gainedComparedWithPublished?.length,
    lost: row.lostComparedWithPublished?.length, cutoff: row.comparisonCutoff })) }, null, 2));
