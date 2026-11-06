import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { buildSupportEventModel } from '../../src/engine/event-acquisition';
import { getP3Availability } from '../../src/engine/support-acquisition';
import { getEligibleQuantitativeEvidence, type QuantitativeContext, type QuantitativeRecord, type QuantitativeTargetContext } from '../../src/engine/quantitative-evidence';
import { inspectSupportLineup, recommendSupportDecks, type P4DeckRecommendation, type P4RecommendationRequest, type P4RecommendationResult } from '../../src/engine/support-deck-optimizer';

const path = 'data/local/p3-skill-support.json';
const original = await readFile(path);
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const baseline = JSON.parse(await readFile('data/local/p41-baseline/baseline.json', 'utf8')) as {
  capturedOn: string; snapshotId: string; snapshotSha256: string; protectedFieldsSha256: string;
  request: P4RecommendationRequest; result: P4RecommendationResult;
};
assert.equal(sha256(original), baseline.snapshotSha256, 'P4.1 comparison must use the unchanged baseline snapshot');
const snapshot = validateP3Snapshot(JSON.parse(original.toString('utf8')) as unknown);
assert.equal(snapshot.snapshotId, baseline.snapshotId);
const immutable = sha256(JSON.stringify(snapshot));
const request = baseline.request;
const old = baseline.result.recommendations[0]!;
assert.equal(old.skillIds.length, 54);
assert.equal(old.greenSkillIds.length, 7);
assert.equal(old.score.coverageValue, 372);
const rows = new Map(snapshot.skills.map((skill) => [skill.skillId, skill]));
const skillList = (ids: readonly string[]) => ids.map((skillId) => ({ skillId, name: rows.get(skillId)?.displayName ?? skillId }));
const difference = (left: readonly string[], right: readonly string[]) => left.filter((id) => !right.includes(id)).sort();

function verifyDeck(deck: P4DeckRecommendation) {
  assert.equal(deck.cards.length, 6);
  assert.equal(new Set(deck.cards.map((card) => card.ownerBaseId ?? card.supportId)).size, 6);
  assert.deepEqual(deck.compatibleSkillIds, deck.skillIds);
  assert.deepEqual(deck.skillIds, [...new Set(deck.cards.flatMap((card) => card.skillIds))].sort());
  assert.deepEqual(deck.guaranteedSkillIds, [], 'Hint occurrence and event success are not guaranteed');
  assert.equal(new Set(deck.eventDecisions.map((decision) => decision.groupId)).size, deck.eventDecisions.length);
  for (const card of deck.cards) {
    assert.equal(getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast).state, 'available');
    assert.deepEqual(card.compatibleSkillIds, card.skillIds);
    const model = buildSupportEventModel(snapshot, card.supportId, { scenarioId: request.scenarioId ?? undefined, allowJpReference: true });
    const decisions = new Map(card.eventDecisions.map((decision) => [decision.groupId, decision]));
    for (const decision of card.eventDecisions) {
      const group = model.groups.find((row) => row.groupId === decision.groupId)!;
      assert.ok(group);
      assert.equal(group.status, 'modeled');
      const option = group.options.find((row) => row.optionId === decision.optionId)!;
      assert.ok(option);
      assert.equal(decision.outcome, option.outcome);
      assert.equal(decision.probability, null);
      assert.ok(decision.skillIds.every((id) => card.skillIds.includes(id)));
      if (group.constraintOnly) assert.equal(decision.assurance, 'unknown');
    }
    for (const route of card.routes) {
      // Every route must already exist in the KR pack, or the explicitly dated
      // JP forecast adapter. source_unspecified is never a new supply route.
      const permittedServer = card.acquisitionBasis === 'jp-reference-forecast' ? 'JP' : 'KR';
      assert.ok(snapshot.supportSkills.some((link) => link.supportId === card.supportId && link.skillId === route.sourceSkillId
        && link.acquisition === route.sourceKind && link.server === permittedServer), `Missing original route ${card.supportId}/${route.sourceSkillId}`);
    }
    for (const skillId of card.skillIds) {
      const routes = card.routes.filter((route) => route.skillId === skillId);
      assert.ok(routes.length);
      const hint = routes.some((route) => route.sourceKind === 'hint');
      const compatibleEvent = routes.some((route) => {
        if (route.sourceKind !== 'event') return false;
        const groups = model.groups.filter((group) => group.options.some((option) => option.sourceSkillIds.includes(route.sourceSkillId)));
        return groups.length > 0 && groups.every((group) => {
          if (group.status !== 'modeled') return false;
          const decision = decisions.get(group.groupId);
          return decision !== undefined && group.options.some((option) => option.optionId === decision.optionId
            && option.sourceSkillIds.includes(route.sourceSkillId));
        });
      });
      assert.ok(hint || compatibleEvent, `No jointly compatible route for ${card.supportId}/${skillId}`);
    }
  }
}

const inspected = inspectSupportLineup(snapshot, request, old.cards.map((card) => ({ supportId: card.supportId, limitBreak: card.limitBreak })));
assert.equal(inspected.status, 'ready');
assert.ok(inspected.deck);
verifyDeck(inspected.deck);
const started = performance.now();
const result = recommendSupportDecks(snapshot, request);
const elapsedMs = Math.round(performance.now() - started);
assert.equal(result.status, 'ready');
for (const deck of result.recommendations) verifyDeck(deck);
assert.deepEqual(recommendSupportDecks(snapshot, request), result, 'The same snapshot/request must reproduce the same choices');
assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
const newBest = result.recommendations[0]!;
for (const deck of result.recommendations) for (const swap of deck.swaps) {
  const replacement = deck.cards.filter((card) => card.supportId !== swap.removeSupportId)
    .map((card) => ({ supportId: card.supportId, limitBreak: card.limitBreak }));
  replacement.push({ supportId: swap.addSupportId, limitBreak: 4 });
  const actual = inspectSupportLineup(snapshot, request, replacement).deck!;
  assert.ok(actual);
  verifyDeck(actual);
  assert.deepEqual(swap.gainedSkillIds, difference(actual.skillIds, deck.skillIds));
  assert.deepEqual(swap.lostSkillIds, difference(deck.skillIds, actual.skillIds));
  assert.equal(swap.coverageValueDelta, actual.score.coverageValue - deck.score.coverageValue);
}

const quantitative = JSON.parse(await readFile('data/normalized/quantitative/utools-10906-2026-11-05.json', 'utf8')) as {
  records: QuantitativeRecord[]; contexts: QuantitativeContext[];
};
const quantContexts = new Map(quantitative.contexts.map((context) => [context.contextId, context]));
const target: Omit<QuantitativeTargetContext, 'skillId'> = {
  server: 'KR', courseId: request.course.courseId!, style: request.runningStyle,
  // Empty/unreviewed fields deliberately remain unavailable. No KR patch,
  // runner stats, or experiment are invented merely to pass the evidence gate.
  patchVersion: '', simulatorVersion: '', runMethod: '', sampleCount: 0, denominator: '', expectedMarginDefinition: '',
  conditions: { season: request.course.season!, weather: request.course.weather!, groundCondition: request.course.groundCondition!,
    stats: null, aptitudes: null, motivation: null, runnerCount: 0, opponentDistribution: null }, costBasis: '', hintLevels: null,
};
assert.equal(quantitative.records.length, 1993);
assert.equal(quantitative.records.filter((record) => record.rankEligible === true).length, 0);
assert.equal(quantitative.contexts.filter((context) => context.rankEligible === true).length, 0);
const decisions = quantitative.records.map((record) => getEligibleQuantitativeEvidence(record, quantContexts.get(record.contextId), { ...target, skillId: record.skillId }));
assert.equal(decisions.filter((decision) => decision.eligible).length, 0);
assert.equal(quantitative.records.filter((record) => getEligibleQuantitativeEvidence(record, quantContexts.get(record.contextId),
  { ...target, skillId: record.skillId }, true).eligible).length, 0, 'An approval argument cannot bypass unverified rows/contexts');
const quantReasons = new Map<string, number>();
for (const decision of decisions) if (!decision.eligible) for (const reason of decision.reasons) quantReasons.set(reason, (quantReasons.get(reason) ?? 0) + 1);
const evaluations = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
const describe = (deck: P4DeckRecommendation) => ({
  ids: deck.cards.map((card) => card.supportId), cards: deck.cards.map((card) => ({ supportId: card.supportId, name: card.name,
    rarity: card.rarity, type: card.type, acquisitionBasis: card.acquisitionBasis, availability: card.availability,
    uniqueSkills: skillList(card.uniqueSkillIds), eventConditionNotes: card.eventConditionNotes })),
  score: deck.score, compatibleCount: deck.skillIds.length, potentialCount: deck.potentialSkillIds.length,
  skills: skillList(deck.skillIds), greens: skillList(deck.greenSkillIds), duplicates: skillList(deck.duplicateSkillIds),
  coreSkills: skillList(deck.skillIds.filter((id) => evaluations.get(id)?.valueEvidence.core.status === 'guide-priority')),
  missingPriority: skillList(deck.missingPrioritySkillIds), missingImportant: skillList(deck.missingImportantSkillIds),
  unresolvedEventSkills: skillList(deck.unresolvedEventSkillIds), eventDecisions: deck.eventDecisions,
  conditionClasses: [...new Set(deck.skillIds.map((id) => evaluations.get(id)!.conditionClass))].map((conditionClass) => ({
    conditionClass, skills: skillList(deck.skillIds.filter((id) => evaluations.get(id)?.conditionClass === conditionClass)) })),
  swaps: deck.swaps.map((swap) => ({ ...swap, gained: skillList(swap.gainedSkillIds), lost: skillList(swap.lostSkillIds),
    lostCore: skillList(swap.lostSkillIds.filter((id) => evaluations.get(id)?.valueEvidence.core.status === 'guide-priority')),
    lostGreens: skillList(swap.lostSkillIds.filter((id) => evaluations.get(id)?.isGreen)) })),
});
assert.equal(sha256(JSON.stringify(snapshot)), immutable);
assert.equal(sha256(await readFile(path)), baseline.snapshotSha256);
const report = {
  checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId, snapshotSha256: baseline.snapshotSha256,
  protectedFieldsSha256FromBaseline: baseline.protectedFieldsSha256,
  request, elapsedMs, data: { skills: snapshot.skills.length, supports: snapshot.supports.length, events: snapshot.supportEvents?.length ?? 0 },
  baseline: { capturedOn: baseline.capturedOn, ids: old.cards.map((card) => card.supportId),
    score: old.score, skillCount: old.skillIds.length, greenCount: old.greenSkillIds.length, skills: skillList(old.skillIds), greens: skillList(old.greenSkillIds) },
  baselineDeckUnderCurrentPolicy: describe(inspected.deck), recommended: describe(newBest),
  alternatives: result.recommendations.slice(1).map((deck) => ({ ...describe(deck),
    gainedComparedWithBest: skillList(deck.gainedSkillIds), lostComparedWithBest: skillList(deck.lostSkillIds) })),
  changedFromOldUnion: { gained: skillList(difference(newBest.skillIds, old.skillIds)), lost: skillList(difference(old.skillIds, newBest.skillIds)) },
  samePolicyComparison: { gained: skillList(difference(newBest.skillIds, inspected.deck.skillIds)), lost: skillList(difference(inspected.deck.skillIds, newBest.skillIds)),
    scoreDelta: newBest.score.coverageValue - inspected.deck.score.coverageValue,
    coreCountDelta: newBest.score.coreSkillCount - inspected.deck.score.coreSkillCount,
    greenCountDelta: newBest.greenSkillIds.length - inspected.deck.greenSkillIds.length },
  quantitative: { referenceRows: quantitative.records.length, eligibleRows: 0, appliedRows: 0, rankEligibleFlagRows: 0,
    incompleteContextRejectedEvenWithApprovalArgument: true,
    reasonCounts: Object.fromEntries([...quantReasons].sort(([a], [b]) => a.localeCompare(b))),
    ratePolicy: 'Activation is not effective rate; no rate remultiplication or quantitative values in qualitative objective.' },
  search: result.search, warnings: result.warnings,
  checks: { immutableSnapshot: true, deterministic: true, sixDistinctOwners: true, originalKrOrOptedForecastRoutesOnly: true,
    oneOptionPerEventGroup: true, allRelatedEventConstraintsSatisfied: true, noInventedProbabilities: true,
    noGuaranteedAcquisitionClaim: true, exactSwapDifferences: true },
  independentKrGameplayCases: 0, observedMarginMeasurements: 0,
  limitations: ['The old 372 and new qualitative score use different policies and are not directly comparable gains.',
    'Compatible routes describe a possible branch combination, not event occurrence, success, or hint guarantees.',
    'Unresolved, conflicting, or blocked event accounts are excluded conservatively; original routes remain in the potential list.',
    'Exact-context guide priorities are sourced qualitative priorities, not certified race margins.',
    'Candidate/beam limits remain; no global optimum or KR gameplay validation is certified.'],
};
await writeFile('data/local/p41-comparison.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ baseline: { ids: report.baseline.ids, score: old.score.coverageValue, skills: old.skillIds.length, greens: old.greenSkillIds.length },
  baselineUnderCurrentPolicy: { ids: report.baselineDeckUnderCurrentPolicy.ids, score: inspected.deck.score, skills: inspected.deck.skillIds.length },
  recommended: { ids: report.recommended.ids, score: newBest.score, skills: newBest.skillIds.length }, samePolicy: report.samePolicyComparison,
  alternatives: report.alternatives.length, quantitative: { rows: 1993, eligible: 0 }, checks: report.checks, elapsedMs }, null, 2));
