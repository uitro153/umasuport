import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { inspectSupportLineup, recommendSupportDecks, type P4RecommendationRequest, type P4DeckRecommendation } from '../../src/engine/support-deck-optimizer';

const bytes = await readFile('data/local/p3-skill-support.json');
const sha256 = (input: Uint8Array | string) => createHash('sha256').update(input).digest('hex');
const snapshot = validateP3Snapshot(JSON.parse(bytes.toString('utf8')) as unknown);
const baseline = JSON.parse(await readFile('data/local/p5-baseline/p41-comparison.validation.json', 'utf8')) as {
  snapshotId: string; snapshotSha256: string; request: P4RecommendationRequest;
  recommended: { ids: string[]; score: P4DeckRecommendation['score']; compatibleCount: number; potentialCount: number;
    skills: { skillId: string; name: string }[]; greens: { skillId: string; name: string }[]; coreSkills: { skillId: string; name: string }[] };
};
const preservedMetadata = JSON.parse(await readFile('data/local/p5-baseline/metadata.json', 'utf8')) as { snapshotSha256: string };
assert.equal(sha256(bytes), baseline.snapshotSha256);
assert.equal(sha256(bytes), preservedMetadata.snapshotSha256);
assert.equal(snapshot.snapshotId, baseline.snapshotId);
assert.equal(baseline.recommended.score.coverageValue, 374);
assert.equal(baseline.recommended.compatibleCount, 48);
assert.equal(baseline.recommended.greens.length, 9);
assert.equal(baseline.recommended.coreSkills.length, 10);
const request = baseline.request;
assert.equal(request.forecast, undefined, 'Policy-only comparison must not mix in P5 availability changes');
const before = sha256(JSON.stringify(snapshot));
const names = new Map(snapshot.skills.map((row) => [row.skillId, row.displayName]));
const describeSkills = (ids: readonly string[]) => ids.map((skillId) => ({ skillId, name: names.get(skillId) ?? skillId }));
const difference = (left: readonly string[], right: readonly string[]) => left.filter((id) => !right.includes(id)).sort();
const oldUnderCurrent = inspectSupportLineup(snapshot, request, baseline.recommended.ids.map((supportId) => ({ supportId, limitBreak: 4 })));
assert.equal(oldUnderCurrent.status, 'ready');
assert.ok(oldUnderCurrent.deck);
const result = recommendSupportDecks(snapshot, request);
assert.equal(result.status, 'ready');
assert.deepEqual(recommendSupportDecks(snapshot, request), result);
assert.equal(result.search.objective, 'compatible-qualitative-coverage-then-priority-green-then-guide-reference');
const evaluations = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
function describe(deck: P4DeckRecommendation) {
  assert.equal(deck.cards.length, 6);
  assert.equal(new Set(deck.cards.map((card) => card.ownerBaseId ?? card.supportId)).size, 6);
  assert.deepEqual(deck.skillIds, [...new Set(deck.cards.flatMap((card) => card.skillIds))].sort());
  assert.deepEqual(deck.guaranteedSkillIds, []);
  assert.ok(deck.eventDecisions.every((row) => row.probability === null));
  return { ids: deck.cards.map((card) => card.supportId),
    cards: deck.cards.map((card) => ({ supportId: card.supportId, name: card.name, rarity: card.rarity,
      acquisitionBasis: card.acquisitionBasis, uniqueSkills: describeSkills(card.uniqueSkillIds) })),
    score: deck.score, compatibleCount: deck.compatibleSkillIds.length, potentialCount: deck.potentialSkillIds.length,
    skills: describeSkills(deck.skillIds), greens: describeSkills(deck.greenSkillIds),
    coreSkills: describeSkills(deck.skillIds.filter((id) => evaluations.get(id)?.valueEvidence.core.status === 'guide-priority')),
    missingImportant: describeSkills(deck.missingImportantSkillIds),
    unresolvedEventSkills: describeSkills(deck.unresolvedEventSkillIds),
    eventDecisions: deck.eventDecisions,
    swaps: deck.swaps.map((swap) => ({ ...swap, gained: describeSkills(swap.gainedSkillIds), lost: describeSkills(swap.lostSkillIds) })),
  };
}
const oldDeck = oldUnderCurrent.deck;
const best = result.recommendations[0]!;
for (const deck of result.recommendations) for (const swap of deck.swaps) {
  const replaced = deck.cards.filter((card) => card.supportId !== swap.removeSupportId)
    .map((card) => ({ supportId: card.supportId, limitBreak: card.limitBreak }));
  replaced.push({ supportId: swap.addSupportId, limitBreak: 4 });
  const actual = inspectSupportLineup(snapshot, request, replaced).deck!;
  assert.ok(actual);
  assert.deepEqual(swap.gainedSkillIds, difference(actual.skillIds, deck.skillIds));
  assert.deepEqual(swap.lostSkillIds, difference(deck.skillIds, actual.skillIds));
}
assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
assert.equal(sha256(JSON.stringify(snapshot)), before);
assert.equal(sha256(await readFile('data/local/p3-skill-support.json')), baseline.snapshotSha256);
const report = { checkedOn: '2026-11-05', scope: 'P5 objective-only comparison on unchanged P4.1 request and P3 pack',
  snapshotId: snapshot.snapshotId, snapshotSha256: baseline.snapshotSha256, request,
  policy: { objective: result.search.objective, primary: 'sum of distinct compatible qualitative target values',
    ties: ['priority low-cost green count', 'exact-context dated guide reference count', 'existing preference composition and duplicate ties'],
    weightsUnchanged: { priority: 16, useful: 10, conditionalCourseValid: 10, conditionalWindow: 8,
      conditionalRaceState: 6, conditionalIneffectiveOrLow: 2, supplementary: 2, unverified: 0 },
    newFittedConstants: 0, horizonDiscount: false, guideIsHardConstraint: false },
  p41AsRecorded: baseline.recommended, p41DeckUnderCurrentPolicy: describe(oldDeck), recommended: describe(best),
  comparisonUnderCurrentPolicy: { coverageValueDelta: best.score.coverageValue - oldDeck.score.coverageValue,
    compatibleCountDelta: best.skillIds.length - oldDeck.skillIds.length,
    greenCountDelta: best.greenSkillIds.length - oldDeck.greenSkillIds.length,
    guideReferenceCountDelta: best.score.coreSkillCount - oldDeck.score.coreSkillCount,
    gained: describeSkills(difference(best.skillIds, oldDeck.skillIds)), lost: describeSkills(difference(oldDeck.skillIds, best.skillIds)) },
  alternatives: result.recommendations.slice(1).map((deck) => ({ ...describe(deck),
    gainedComparedWithBest: describeSkills(deck.gainedSkillIds), lostComparedWithBest: describeSkills(deck.lostSkillIds) })),
  search: result.search, checks: { immutableSource: true, deterministic: true, exactSwapDifferences: true,
    sameRequestAndAvailabilityPolicy: true, inventedMarginOrRate: false },
  limitation: 'A policy change is not measured gameplay improvement; bounded search and unresolved event data still apply.' };
await writeFile('data/local/p5-recommendation-policy.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ p41AsRecorded: { ids: baseline.recommended.ids, score: baseline.recommended.score, goals: baseline.recommended.compatibleCount },
  p41UnderCurrent: { ids: report.p41DeckUnderCurrentPolicy.ids, score: report.p41DeckUnderCurrentPolicy.score, goals: report.p41DeckUnderCurrentPolicy.compatibleCount },
  recommended: { ids: report.recommended.ids, score: report.recommended.score, goals: report.recommended.compatibleCount, potential: report.recommended.potentialCount },
  difference: report.comparisonUnderCurrentPolicy, alternatives: report.alternatives.length, checks: report.checks }, null, 2));
