import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { analyzeP5LateReleases } from '../../src/engine/p5-late-release';
import type { P4CardRecommendation, P4RecommendationRequest, P4RecommendationResult } from '../../src/engine/support-deck-optimizer';

const snapshot = validateP3Snapshot(JSON.parse(await readFile('data/local/p3-skill-support.json', 'utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(await readFile('data/local/p5-forecast.json', 'utf8')) as unknown, snapshot);
const runs = [];
for (const event of p5.tournaments) {
  const { request, result } = JSON.parse(await readFile(`data/local/p5-recommendations/${event.eventId}.json`, 'utf8')) as {
    request: P4RecommendationRequest; result: P4RecommendationResult;
  };
  assert.equal(request.forecast?.eventId, event.eventId);
  assert.equal(result.status, 'ready');
  assert.equal(result.recommendations[0]?.cards.length, 6);
  const rows = analyzeP5LateReleases(snapshot, p5, request, result);
  for (const row of rows) {
    assert.equal(row.separateRecommendation, false);
    assert.equal(row.reworkBurden, 'unverified');
    assert.notEqual(row.classification, 'separate');
    if (event.expectedMonth) assert.equal(row.displayDays, null, 'Month forecasts must not invent one preparation day count');
    if (row.classification === 'base-included') {
      const selectedCard: P4CardRecommendation | undefined = result.recommendations[0]!.cards.find((candidate) => candidate.supportId === row.entityId);
      assert.ok(selectedCard);
      assert.deepEqual(row.uniqueContributionSkillIds, selectedCard.uniqueSkillIds);
      assert.deepEqual(row.gainedSkillIds, [], 'Marginal contribution is not an actual before/after deck difference');
      assert.deepEqual(row.lostSkillIds, []);
    }
    if (row.classification === 'ordinary-alternative') assert.ok(result.recommendations.some((deck) => deck.cards.some((card) => card.supportId === row.entityId))
      || result.recommendations[0]!.swaps.some((swap) => swap.addSupportId === row.entityId));
  }
  runs.push({ eventId: event.eventId, rows });
}
const all = runs.flatMap((run) => run.rows);
assert.equal(all.length, p5.lateRelease.screeningQueue.length + p5.lateRelease.monthlyScreeningQueue.length);
const pandora = runs.find((run) => run.eventId === 'kr-cm-39')?.rows.find((row) => row.entityId === '30259');
assert.ok(pandora);
assert.equal(pandora.displayDays, 3, 'This is the supplied predicted-date difference, not actual preparation time');
assert.equal(pandora.separateRecommendation, false);
const report = { checkedOn: p5.asOf, p5SnapshotId: p5.snapshotId, baseSnapshotId: snapshot.snapshotId,
  sourceQueueCount: { dated: p5.lateRelease.screeningQueue.length, monthly: p5.lateRelease.monthlyScreeningQueue.length },
  reviewed: all.length, separateRecommendations: 0,
  classifications: Object.fromEntries(['base-included', 'ordinary-alternative', 'review-held', 'not-eligible'].map((key) => [key, all.filter((row) => row.classification === key).length])),
  reworkEvidence: 'No supplied record documents a high parent/grandparent white-factor rework burden.',
  preparationTimeOrAcquisitionProbabilitiesInvented: false, runs };
await writeFile('data/local/p5-late-release.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reviewed: report.reviewed, separateRecommendations: 0, classifications: report.classifications, pandora }, null, 2));
