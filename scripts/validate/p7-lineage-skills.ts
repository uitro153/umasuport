import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { createLineagePlan, extractPedigree, getLineageSlots, updateLineageNode, applyLineageGrandparentArrangement, setLineageLock } from '../../src/domain/lineage';
import { createEmptyPedigree } from '../../src/domain/pedigree';
import { buildP5AvailabilityContext } from '../../src/engine/p5-availability';
import { getP3Availability, analyzeSupportDeck } from '../../src/engine/support-acquisition';
import { recommendPersonalizedSupportDecks, recommendSupportDecks, type P4RecommendationRequest, type P4RecommendationResult } from '../../src/engine/support-deck-optimizer';
import { calculateReferencePedigree } from '../../src/engine/reference-pedigree';
import { buildSupportEventModel } from '../../src/engine/event-acquisition';
import { createEmptyLineageSkills, type LineageSkillState } from '../../src/domain/lineage-skills';
import { analyzeLineageSkills, buildLineageRecommendationRequest, classifyWhiteFactor, getLineageSkillPresence,
  getNodeSkillPriorities, mergeLineagePriorities, reconcileLineageSkills, setNodeSkillPriorities,
  setWhiteInventoryStatus, upsertWhiteFactor } from '../../src/engine/lineage-skills';

/** Actual DB and actual character IDs; inventories below are explicit user-input
 * test scenarios, never KR-observed completed factors or success evidence. */
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const protectedPaths = ['data/local/p3-skill-support.json', 'data/local/p5-forecast.json', 'data/local/p1-reference.json', 'data/local/p3-integrated.sqlite'];
const baseline = JSON.parse(await readFile('data/local/p6-user-skill-priority.validation.json', 'utf8')) as { immutableSources: Record<string, string> };
const protectedHashes: Record<string, string> = {};
for (const path of protectedPaths) {
  protectedHashes[path] = sha256(await readFile(path));
  assert.equal(protectedHashes[path], baseline.immutableSources[path], `Original source changed: ${path}`);
}
const optimizerPath = 'src/engine/support-deck-optimizer.ts';
const optimizerSha256 = sha256(await readFile(optimizerPath));
assert.equal(optimizerSha256, 'c659d0608aa863e3ee788592fe0371a74e70a9ba49315ecc2518474b85ad2382', 'P6.1 recommendation policy/engine must remain unchanged');
const snapshot = validateP3Snapshot(JSON.parse(await readFile(protectedPaths[0]!, 'utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(await readFile(protectedPaths[1]!, 'utf8')) as unknown, snapshot);
const reference = validateReferenceSnapshot(JSON.parse(await readFile(protectedPaths[2]!, 'utf8')) as unknown);
const directory = 'data/local/p7-lineage-skills';
await mkdir(directory, { recursive: true });

function requestFor(eventId: string): P4RecommendationRequest {
  const event = p5.tournaments.find((row) => row.eventId === eventId)!;
  assert.ok(event);
  const course = snapshot.courses.find((row) => row.courseId === event.courseId)!;
  return { course: { courseId: event.courseId, trackId: course.trackId, distanceM: event.conditions.distance,
    surface: event.conditions.surface === 1 ? 'turf' : 'dirt', rotation: event.conditions.direction,
    season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
  runningStyle: 'pace', cutoffDate: p5.asOf, allowForecast: true, includeUnknown: true, preference: 'balanced', scenarioId: '11',
  forecast: buildP5AvailabilityContext(snapshot, p5, eventId)! };
}
function verifyDeck(result: P4RecommendationResult, request: P4RecommendationRequest) {
  assert.equal(result.status, 'ready');
  const deck = result.recommendations[0]!;
  assert.equal(deck.cards.length, 6);
  assert.equal(new Set(deck.cards.map((card) => card.ownerBaseId ?? card.supportId)).size, 6);
  assert.deepEqual(deck.guaranteedSkillIds, []);
  assert.ok(deck.eventDecisions.every((choice) => choice.probability === null));
  assert.ok(result.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null));
  for (const card of deck.cards) {
    assert.equal(getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast, request.forecast).state, 'available');
    const model = buildSupportEventModel(snapshot, card.supportId, { scenarioId: request.scenarioId ?? undefined, allowJpReference: true });
    const decisions = new Map(card.eventDecisions.map((choice) => [choice.groupId, choice]));
    assert.equal(decisions.size, card.eventDecisions.length);
    for (const route of card.routes) {
      const server = route.sourceServer ?? (card.acquisitionBasis === 'jp-reference-forecast' ? 'JP' : 'KR');
      assert.ok(snapshot.supportSkills.some((raw) => raw.supportId === card.supportId && raw.skillId === route.sourceSkillId && raw.server === server && raw.acquisition === route.sourceKind));
    }
    for (const id of card.skillIds) assert.ok(card.routes.some((route) => route.skillId === id && (route.sourceKind === 'hint' || (() => {
      const groups = model.groups.filter((group) => group.options.some((choice) => choice.sourceSkillIds.includes(route.sourceSkillId)));
      return groups.length > 0 && groups.every((group) => group.status === 'modeled' && group.options.some((choice) =>
        choice.optionId === decisions.get(group.groupId)?.optionId && choice.sourceSkillIds.includes(route.sourceSkillId)));
    })())), `No jointly compatible original event route for ${card.supportId}/${id}`);
  }
}

const pedigree = createEmptyPedigree();
for (const [slot, costumeId] of Object.entries({ target: '100901', parentA: '101401', parentB: '100601', grandA1: '102601', grandA2: '101001', grandB1: '100401', grandB2: '100301' })) {
  pedigree[slot as keyof typeof pedigree].costumeId = costumeId;
}
let plan = createLineagePlan(pedigree);
for (const slot of getLineageSlots(plan).filter((slot) => slot.depth >= 3)) plan = updateLineageNode(plan, slot.nodeId, { costumeId: slot.depth === 3 ? '100101' : '100201' });
const unchangedPlan = JSON.stringify(plan);
const affinity = calculateReferencePedigree(extractPedigree(plan), reference, { allowUnverifiedFormula: true });
assert.equal(affinity.previewTotal, 159);
assert.deepEqual(affinity.contributions.map((term) => term.value), [31, 26, 24, 22, 23, 15, 18]);

const mainDeck = ['30024', '30175', '30113', '30108', '10126', '30226'].map((supportId) => ({ supportId, limitBreak: 4 }));
const base = { ...requestFor('kr-cm-39'), deck: mainDeck };
const mainCurrent = analyzeSupportDeck(snapshot, mainDeck, p5.asOf, false);
assert.ok(mainCurrent.bySkillId['201601']?.some((route) => route.supportId === '30024' && route.sourceKind === 'hint'));
let state = createEmptyLineageSkills();
const add = (nodeId: string, skillId: string, status: 'owned' | 'planned', stars: 1 | 2 | 3 | null = null) => {
  state = upsertWhiteFactor(state, plan, snapshot, nodeId, { skillId, stars, status });
};
// Deliberate user-input test records, with no assertion of KR-observed factors.
add('parentA', '201601', 'owned', 2);
add('grandA1', '201601', 'owned', 1);
add('grandA2', '201322', 'owned', 3);
add('ancestor_7', '201601', 'owned', 3);
add('ancestor_9', '201322', 'owned', null);
add('ancestor_15', '200012', 'owned', 2);
add('parentA', '201322', 'planned', null);
add('grandA1', '201322', 'planned', 2);
state = setWhiteInventoryStatus(state, plan, 'parentB', 'reviewed');
assert.equal(state.nodes['ancestor_7']!.ownerCostumeId, state.nodes['ancestor_9']!.ownerCostumeId);
assert.notDeepEqual(state.nodes['ancestor_7']!.records, state.nodes['ancestor_9']!.records, 'Same character has separate factor-owner inventories');
assert.ok(Object.values(state.nodes).flatMap((node) => node.records).every((record) => record.userEntered && record.classification.status === 'review-required'));
assert.equal(classifyWhiteFactor(snapshot, '201601').status, 'review-required', 'Ordinary rarity does not prove factor eligibility');
assert.equal(classifyWhiteFactor(snapshot, '900011').status, 'unsupported', 'Inherited unique must not become an ordinary white record');

const parentAnalysis = analyzeLineageSkills(plan, state, 'parentA');
assert.deepEqual(parentAnalysis.parents.map((node) => node.nodeId), ['grandA1', 'grandA2']);
assert.deepEqual(parentAnalysis.grandparents.map((node) => node.nodeId), ['ancestor_7', 'ancestor_8', 'ancestor_9', 'ancestor_10']);
const grandAnalysis = analyzeLineageSkills(plan, state, 'grandA1');
assert.deepEqual(grandAnalysis.parents.map((node) => node.nodeId), ['ancestor_7', 'ancestor_8']);
assert.deepEqual(grandAnalysis.grandparents.map((node) => node.nodeId), ['ancestor_15', 'ancestor_16', 'ancestor_17', 'ancestor_18']);
const rootAnalysis = analyzeLineageSkills(plan, state, plan.rootId);
assert.deepEqual(rootAnalysis.parents.map((node) => node.nodeId), ['parentA', 'parentB']);
assert.deepEqual(rootAnalysis.grandparents.map((node) => node.nodeId), ['grandA1', 'grandA2', 'grandB1', 'grandB2']);
assert.equal(analyzeLineageSkills(plan, state, 'ancestor_7').missingAncestorSlots, 4);
assert.equal(analyzeLineageSkills(plan, state, 'ancestor_15').missingAncestorSlots, 6);
const deepWhite = getLineageSkillPresence(rootAnalysis, '200012');
assert.deepEqual(deepWhite.deeperOwned.map((node) => node.nodeId), ['ancestor_15']);
assert.equal(deepWhite.selfOwned.length + deepWhite.parentOwned.length + deepWhite.grandparentOwned.length, 0, 'Depth-four factor may not leap into final two-generation evidence');
const groundPresence = getLineageSkillPresence(rootAnalysis, '201601');
assert.ok(groundPresence.confirmedAbsentNodeIds.includes('parentB'));
assert.ok(groundPresence.unknownNodeIds.includes('grandB1'));
assert.ok(groundPresence.parentOwned.some((node) => node.nodeId === 'parentA'));

const rearranged = applyLineageGrandparentArrangement(plan, ['grandA2', 'grandB1', 'grandB2', 'grandA1']);
const movedState = reconcileLineageSkills(plan, rearranged, state);
assert.deepEqual(movedState.nodes['grandA1'], state.nodes['grandA1']);
assert.ok(rearranged.nodes['parentB']!.parentIds!.includes('grandA1'));
const replaced = updateLineageNode(plan, 'grandA1', { costumeId: '100301' });
const replacedState = reconcileLineageSkills(plan, replaced, state);
assert.equal(replacedState.nodes['grandA1'], undefined, 'Replacement clears previous owner records');
const locked = setLineageLock(plan, 'grandA1', true);
const lockedCopy = JSON.stringify(locked);
const editedLocked = upsertWhiteFactor(state, locked, snapshot, 'grandA1', { skillId: '200012', stars: 1, status: 'planned' });
assert.ok(editedLocked.nodes['grandA1']!.records.some((record) => record.skillId === '200012'));
assert.equal(JSON.stringify(locked), lockedCopy, 'Explicit record edit cannot mutate locked P2 owner, red factor, lock or bloodline');

const wanted = [{ skillId: '201601', priority: 'required' }, { skillId: '201322', priority: 'preferred' }] as const;
state = setNodeSkillPriorities(state, plan, snapshot, 'parentA', wanted);
state = setNodeSkillPriorities(state, plan, snapshot, 'grandA1', [{ skillId: '201601', priority: 'required' }]);
state = setNodeSkillPriorities(state, plan, snapshot, plan.rootId, wanted);
assert.deepEqual(getNodeSkillPriorities(state, plan, 'parentB'), [], 'Other owner must not inherit hidden requirements');
const isolatedParent = buildLineageRecommendationRequest(snapshot, base, { plan, state, nodeId: 'parentB', mode: 'current', today: p5.asOf,
  globalPriorities: [{ skillId: '200432', priority: 'required' }] });
assert.equal(isolatedParent.skillPriorities, undefined, 'Global goals require explicit includeGlobal and do not silently apply to another owner');
assert.deepEqual(getNodeSkillPriorities(reconcileLineageSkills(plan, replaced, state), replaced, 'grandA1'), []);
assert.throws(() => mergeLineagePriorities(snapshot,
  ['201601', '201322', '200452', '201262', '201332'].map((skillId) => ({ skillId, priority: 'required' })),
  [{ skillId: '200432', priority: 'preferred' }]), /최대 5개/, 'No silent goal deletion at the five-goal cap');

// Merely entering any records must not change the existing P6 computation.
const empty = createEmptyLineageSkills();
const emptyRequest = buildLineageRecommendationRequest(snapshot, base, { plan, state: empty, nodeId: 'parentA', mode: 'current', today: p5.asOf });
const expectedPlain = { ...base, forecast: undefined, allowForecast: false, cutoffDate: p5.asOf, deck: [] };
const plainResult = recommendSupportDecks(snapshot, expectedPlain);
const emptyResult = recommendPersonalizedSupportDecks(snapshot, emptyRequest);
verifyDeck(plainResult, expectedPlain);
assert.deepEqual(emptyResult.base, plainResult);
assert.equal(emptyResult.customized, null);
const contextOnlyState = { ...state, nodePriorities: {} } as LineageSkillState;
const enteredOnly = buildLineageRecommendationRequest(snapshot, base, { plan, state: contextOnlyState, nodeId: 'parentA', mode: 'current', today: p5.asOf });
assert.deepEqual(enteredOnly, emptyRequest, 'Owned/planned records are context, not an implicit score or preference change');

const cases: unknown[] = [];
for (const nodeId of ['parentA', 'grandA1', plan.rootId]) {
  const request = buildLineageRecommendationRequest(snapshot, base, { plan, state, nodeId, mode: 'current', today: p5.asOf });
  assert.equal(request.cutoffDate, p5.asOf);
  assert.equal(request.allowForecast, false);
  assert.equal(request.forecast, undefined);
  assert.deepEqual(request.deck, nodeId === plan.rootId ? mainDeck : [], 'Final training deck is never an ancestor factor deck');
  assert.ok(request.skillPriorities?.some((target) => target.skillId === '201601' && target.priority === 'required'), 'Existing factor/main-training supply does not delete a required goal');
  const result = recommendPersonalizedSupportDecks(snapshot, request);
  verifyDeck(result.base, { ...request, skillPriorities: undefined });
  assert.ok(result.customized);
  verifyDeck(result.customized, request);
  assert.ok(result.customized.recommendations[0]!.skillIds.includes('201601'));
  assert.deepEqual(result.comparison!.gainedSkillIds, result.customized.recommendations[0]!.skillIds.filter((id) => !result.base.recommendations[0]!.skillIds.includes(id)).sort());
  assert.deepEqual(result.comparison!.lostSkillIds, result.base.recommendations[0]!.skillIds.filter((id) => !result.customized!.recommendations[0]!.skillIds.includes(id)).sort());
  const analysis = analyzeLineageSkills(plan, state, nodeId);
  const selected = reference.costumes.find((costume) => costume.costumeId === plan.nodes[nodeId]!.costumeId)!;
  const summary = { nodeId, stage: analysis.stage, costumeId: selected.costumeId, characterBaseId: selected.baseId,
    parentNodeIds: analysis.parents.map((node) => node.nodeId), grandparentNodeIds: analysis.grandparents.map((node) => node.nodeId),
    selectedOwned: analysis.self.owned, selectedPlanned: analysis.self.planned,
    groundPresence: getLineageSkillPresence(analysis, '201601'), mainGroundRoutes: mainCurrent.bySkillId['201601'],
    requestedPriorities: request.skillPriorities, base: result.base.recommendations[0]!.score,
    customized: result.customized.recommendations[0]!.score,
    ids: result.customized.recommendations[0]!.cards.map((card) => card.supportId),
    compatibleCount: result.customized.recommendations[0]!.skillIds.length,
    greenCount: result.customized.recommendations[0]!.greenSkillIds.length, comparison: result.comparison };
  cases.push(summary);
  await writeFile(`${directory}/${nodeId}.json`, JSON.stringify({ request, analysis, mainCurrent, result, testRecordProvenance: 'Explicit user-input test records, not observed KR factors' }, null, 2));
  console.log(JSON.stringify({ nodeId, stage: analysis.stage, costumeId: selected.costumeId, ids: summary.ids,
    base: summary.base.coverageValue, customized: summary.customized, compatibleCount: summary.compatibleCount,
    greenCount: summary.greenCount, parentNodeIds: summary.parentNodeIds, grandparentNodeIds: summary.grandparentNodeIds }));
}

const futureBase = { ...requestFor('kr-cm-40'), deck: [{ supportId: '10133', limitBreak: 4 }, ...mainDeck.slice(1)] };
const finalFutureMain = analyzeSupportDeck(snapshot, futureBase.deck, futureBase.cutoffDate, true, futureBase.forecast);
assert.ok(finalFutureMain.bySkillId['203842']?.some((route) => route.sourceServer === 'JP'), 'Final-training forecast routes retain their own JP timeline');
const futureState = setNodeSkillPriorities(state, plan, snapshot, 'parentB', [{ skillId: '203842', priority: 'required' }]);
const currentFutureGoal = buildLineageRecommendationRequest(snapshot, futureBase, { plan, state: futureState, nodeId: 'parentB', mode: 'current', today: p5.asOf });
assert.deepEqual(currentFutureGoal.deck, [], 'Future final-training supports do not become a current parent factor deck');
const currentResult = recommendSupportDecks(snapshot, currentFutureGoal);
assert.equal(currentResult.status, 'required-unfulfilled');
assert.equal(currentResult.skillPriorities?.failure?.reason, 'unverified-source');
assert.deepEqual(currentResult.recommendations, []);
const forecastGoal = buildLineageRecommendationRequest(snapshot, futureBase, { plan, state: futureState, nodeId: 'parentB', mode: 'forecast', today: p5.asOf });
const forecastResult = recommendSupportDecks(snapshot, forecastGoal);
verifyDeck(forecastResult, forecastGoal);
assert.ok(forecastResult.recommendations[0]!.skillIds.includes('203842'));
assert.ok(forecastResult.recommendations[0]!.cards.some((card) => card.acquisitionBasis === 'jp-reference-forecast'));
assert.notEqual(getP3Availability(snapshot, 'support', '10133', p5.asOf, false).state, 'available');
assert.equal(getP3Availability(snapshot, 'support', '10133', forecastGoal.cutoffDate, true, forecastGoal.forecast).state, 'available');
const futureSummary = { nodeId: 'parentB', skillId: '203842', currentStatus: currentResult.status,
  currentFailure: currentResult.skillPriorities?.failure, forecastStatus: forecastResult.status,
  forecastIds: forecastResult.recommendations[0]!.cards.map((card) => card.supportId), forecastScore: forecastResult.recommendations[0]!.score,
  expectedOnly: true, sourceServerPreserved: true, separateFinalFutureMainRoutes: finalFutureMain.bySkillId['203842'], finalMainTimelineNotRebasedToParent: true };
await writeFile(`${directory}/current-and-forecast.json`, JSON.stringify({ finalFutureMain, currentRequest: currentFutureGoal, currentResult, forecastRequest: forecastGoal, forecastResult }, null, 2));

// Existing ownership, LB and single-borrow restrictions still govern a node request.
const owned = plainResult.recommendations[0]!.cards.map((card) => ({ supportId: card.supportId, limitBreak: 2 }));
const parentRequest = buildLineageRecommendationRequest(snapshot, base, { plan, state, nodeId: 'parentA', mode: 'current', today: p5.asOf });
const onlyGround = { ...parentRequest, skillPriorities: [{ skillId: '201601', priority: 'required' as const }] };
const unavailableOwned = recommendSupportDecks(snapshot, { ...onlyGround, ownedSupports: owned, ownedOnly: true, allowBorrow: false });
assert.equal(unavailableOwned.status, 'required-unfulfilled');
assert.equal(unavailableOwned.skillPriorities?.failure?.reason, 'ownership-borrow-limit');
const withBorrow = recommendSupportDecks(snapshot, { ...onlyGround, ownedSupports: owned, ownedOnly: true, allowBorrow: true });
verifyDeck(withBorrow, onlyGround);
assert.equal(withBorrow.recommendations[0]!.cards.filter((card) => card.ownership === 'borrowed').length, 1);
for (const card of withBorrow.recommendations[0]!.cards.filter((card) => card.ownership === 'owned')) assert.equal(card.limitBreak, 2);
assert.equal(JSON.stringify(plan), unchangedPlan, 'Analysis and recommendation never mutate P2 lineage');
for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(sha256(await readFile(path)), expected);
assert.equal(sha256(await readFile(optimizerPath)), optimizerSha256);
const report = { checkedOn: p5.asOf, testRecordProvenance: 'Explicit manually entered test cases using real DB IDs; not KR-observed physical factors',
  immutableSources: protectedHashes, optimizerSha256, p2LineageUnchanged: true, affinityRegression: { total: affinity.previewTotal, contributions: affinity.contributions.map((term) => term.value) },
  cases, future: futureSummary, emptyInventoryUnchanged: true, duplicateOwnerInventoriesSeparated: true,
  rearrangementOwnerPreserved: true, replacedOwnerCleared: true, lockedLineageUnmodifiedByExplicitWhiteEdit: true,
  unknownAndReviewedAbsentDistinguished: true, deeperFactorNotPromoted: true, globalAndLocalNotImplicitlyMerged: true,
  ownership: { deniedStatus: unavailableOwned.status, deniedReason: unavailableOwned.skillPriorities?.failure?.reason,
    borrowedIds: withBorrow.recommendations[0]!.cards.filter((card) => card.ownership === 'borrowed').map((card) => card.supportId), registeredLB: 2 },
  whiteEligibility: { verifiedRows: 0, ordinaryOnlyIsNotProof: true, rawGeneVersionIsInheritedUniqueNotWhite: true },
  quantitativeAppliedRows: 0 };
await writeFile('data/local/p7-lineage-skills.validation.json', JSON.stringify(report, null, 2));

