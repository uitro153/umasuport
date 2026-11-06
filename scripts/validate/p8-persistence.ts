import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import expected from '../../tests/golden/public-expectations.json';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { mergeP5Tournaments, validateP5Snapshot } from '../../src/domain/p5-forecast';
import { SLOT_KEYS, createEmptyPedigree } from '../../src/domain/pedigree';
import { applyLineageGrandparentArrangement, createLineagePlan, extractPedigree, getLineageSlotMap, getLineageSlots, setLineageLock, updateLineageNode, type LineageConstraints } from '../../src/domain/lineage';
import type { SavedResultSnapshot } from '../../src/domain/saved-plan';
import { allocateRedFactors } from '../../src/engine/red-factor-allocator';
import { enumerateLineageArrangements } from '../../src/engine/lineage-arrangements';
import { calculateReferencePedigree } from '../../src/engine/reference-pedigree';
import { analyzeLineageSkills, setNodeSkillPriorities, setWhiteInventoryStatus, upsertWhiteFactor } from '../../src/engine/lineage-skills';
import { inspectSupportLineup } from '../../src/engine/support-deck-optimizer';
import { buildSavedPlanRecommendationRequest } from '../../src/engine/plan-comparison';
import { confirmFactorBloodline, createDefaultWorkspace, createPlanRepository, createSavedPlan, duplicateSavedPlan, exportSavedPlan,
  getUnconfirmedInstanceNodeIds, previewSavedPlanImport, reconcileWorkspaceLineage, replaceFactorInstance,
  synchronizeFactorInstances, workspaceFingerprint, type PlanDataRegistry } from '../../src/engine/plan-persistence';

/** These are synthetic user observations and plans using actual canonical IDs.
 * They are not observed physical factors or new KR game-rule evidence. */
const paths = ['data/local/p3-skill-support.json', 'data/local/p5-forecast.json', 'data/local/p1-reference.json', 'data/local/p3-integrated.sqlite', 'src/engine/support-deck-optimizer.ts'];
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hashes: Record<string, string> = {};
for (const path of paths) hashes[path] = sha(await readFile(path));
const prior = JSON.parse(await readFile('data/local/p7-lineage-skills.validation.json', 'utf8')) as { immutableSources: Record<string, string>; optimizerSha256: string };
for (const [path, hash] of Object.entries(prior.immutableSources)) assert.equal(hashes[path], hash);
assert.equal(hashes[paths[4]!], prior.optimizerSha256);
const p3 = validateP3Snapshot(JSON.parse(await readFile(paths[0]!, 'utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(await readFile(paths[1]!, 'utf8')) as unknown, p3);
const reference = validateReferenceSnapshot(JSON.parse(await readFile(paths[2]!, 'utf8')) as unknown);
const snapshotIds = { reference: reference.snapshotId, p3: p3.snapshotId, p5: p5.snapshotId };
const registry: PlanDataRegistry = { costumeIds: reference.costumes.map(row => row.costumeId),
  skillIds: p3.skills.map(row => row.skillId), supportIds: p3.supports.map(row => row.supportId),
  eventIds: mergeP5Tournaments(p3, p5).map(row => row.eventId), scenarioIds: p3.scenarios.map(row => row.scenarioId), skillData: p3 };
const directory = 'data/local/p8-persistence'; await mkdir(directory, { recursive: true });
const pedigree = createEmptyPedigree();
expected.calculator.costumes.forEach((id, i) => { pedigree[SLOT_KEYS[i]!].costumeId = id; });
const seven = createLineagePlan(pedigree);
let inputs = createDefaultWorkspace(p3, p5.asOf);
inputs.referencePlan = seven; inputs.factorInstances = synchronizeFactorInstances(seven, inputs.whiteFactors, {}, randomUUID);
inputs.skillSettings.eventId = 'kr-cm-39'; inputs.skillSettings.scenarioId = '11'; inputs.skillSettings.runningStyle = 'pace';
inputs.skillSettings.allowForecast = true; inputs.referenceFilters.allowForecast = true;
inputs.skillSettings.deck = ['30024', '30175', '30113', '30108', '10126', '30226'].map((supportId, i) => ({ supportId, limitBreak: i % 5 }));
inputs.supportSettings = { ownedSupports: [{ supportId: '30175', limitBreak: 3 }, { supportId: '30113', limitBreak: 2 }], ownedOnly: false, allowBorrow: true };
inputs.lineageDesign = { profileId: 'turf-middle-long', rotationGrade: 'A', geneEnabled: true, geneType: 'dirt' };
inputs.selectedNodeId = 'parentA'; inputs.skillSettings.nodeModes.parentA = 'current'; inputs.skillSettings.nodeModes.grandA1 = 'forecast';
inputs.globalPriorities = [{ skillId: '201601', priority: 'required' }, { skillId: '201322', priority: 'preferred' }];
const sevenSaved = createSavedPlan(inputs, { name: 'P8 실제 ID · 7인 보관 예시', appVersion: '0.0.0-p8', snapshotIds });
const sevenPreview = previewSavedPlanImport(exportSavedPlan(sevenSaved), registry, snapshotIds);
assert.ok(sevenPreview.canApply); assert.deepEqual(sevenPreview.plan!.inputs, inputs);
await writeFile(`${directory}/seven-node-example.json`, exportSavedPlan(sevenSaved));

let full = structuredClone(seven);
for (const slot of getLineageSlots(full).filter(slot => slot.depth >= 3)) full = updateLineageNode(full, slot.nodeId, { costumeId: slot.depth === 3 ? '100101' : '100201', redFactor: { type: slot.depth === 3 ? 'mile' : 'dirt', stars: 3 } });
inputs = reconcileWorkspaceLineage(inputs, full);
inputs.whiteFactors = upsertWhiteFactor(inputs.whiteFactors, full, p3, 'parentA', { skillId: '201601', stars: 2, status: 'owned' });
inputs.whiteFactors = upsertWhiteFactor(inputs.whiteFactors, full, p3, 'parentA', { skillId: '201322', stars: null, status: 'planned' });
inputs.whiteFactors = upsertWhiteFactor(inputs.whiteFactors, full, p3, 'ancestor_7', { skillId: '200012', stars: 3, status: 'owned' });
inputs.whiteFactors = setWhiteInventoryStatus(inputs.whiteFactors, full, 'parentB', 'reviewed');
inputs.whiteFactors = setNodeSkillPriorities(inputs.whiteFactors, full, p3, 'parentA', [{ skillId: '201601', priority: 'required' }]);
inputs.referencePlan = setLineageLock(inputs.referencePlan, 'grandB2', true);
for (const id of getUnconfirmedInstanceNodeIds(inputs)) inputs = confirmFactorBloodline(inputs, id);
// Seven-person example above preserves a selected parent panel. This full-plan
// example records the global six-card context rather than a node-only run.
inputs.selectedNodeId = null;
const baselineInputs = workspaceFingerprint(inputs);
const request = buildSavedPlanRecommendationRequest(createSavedPlan(inputs, { name: '요청 재구성 검사', appVersion: '0.0.0-p8', snapshotIds }), p3, p5, p5.asOf);
const selectedSupportIds = ['30175', '30113', '30140', '10126', '30226', '30107'];
const selections = selectedSupportIds.map((supportId, index) => ({ supportId, limitBreak: index % 5 }));
const inspected = inspectSupportLineup(p3, request, selections);
assert.equal(inspected.status, 'ready'); assert.ok(inspected.deck);
const deck = inspected.deck;
const resultSnapshot: SavedResultSnapshot = { inputSignature: baselineInputs, calculatedAt: new Date().toISOString(), snapshotIds,
  cards: deck.cards.map(card => ({ supportId: card.supportId, limitBreak: card.limitBreak, ownership: card.ownership })),
  score: { coverageValue: deck.score.coverageValue, preferenceBonus: deck.score.preferenceBonus ?? 0, customizedValue: deck.score.customizedValue ?? deck.score.coverageValue },
  skillIds: deck.skillIds, greenSkillIds: deck.greenSkillIds, eventDecisions: deck.eventDecisions };
const saved = createSavedPlan(inputs, { name: 'P8 실제 ID · 31인 ○◎ ★ 계획', appVersion: '0.0.0-p8', snapshotIds }, { resultSnapshot });
const exported = exportSavedPlan(saved); await writeFile(`${directory}/31-node-example.json`, exported);
const restored = previewSavedPlanImport(exported, registry, snapshotIds);
assert.ok(restored.canApply, JSON.stringify(restored.issues)); assert.deepEqual(restored.plan, saved);
assert.equal(workspaceFingerprint(restored.plan!.inputs), baselineInputs);
assert.equal(Object.keys(restored.plan!.inputs.referencePlan.nodes).length, 31);
assert.equal(new Set(Object.values(inputs.factorInstances).map(row => row.factorInstanceId)).size, 31);
const restoredRequest = buildSavedPlanRecommendationRequest(restored.plan!, p3, p5, p5.asOf);
assert.deepEqual(restoredRequest, request, 'Restored actual inputs reconstruct the same request without a cached calculation');
const after = inspectSupportLineup(p3, restoredRequest, restored.plan!.resultSnapshot!.cards.map(({ supportId, limitBreak }) => ({ supportId, limitBreak })));
assert.deepEqual(after, inspected, 'Current engine recomputation of saved selected six uses the same compatible event plan; cached union is never input');

const affinity = calculateReferencePedigree(extractPedigree(restored.plan!.inputs.referencePlan), reference, { allowUnverifiedFormula: true });
assert.equal(affinity.previewTotal, 159); assert.deepEqual(affinity.contributions.map(row => row.value), [31, 26, 24, 22, 23, 15, 18]);
const p2 = structuredClone(seven); const positions = getLineageSlotMap(p2);
const constraints: LineageConstraints = { grandparentGoals: {}, preserveParentFactorTargets: true };
for (const key of ['grandA1', 'grandA2', 'grandB1', 'grandB2'] as const) {
  const nodeId = positions[key]; p2.nodes[nodeId]!.redFactor = { type: 'mile', stars: 3 };
  constraints.grandparentGoals[nodeId] = { targetFactorType: 'mile', rotationRequirements: { turf: 'A' }, geneType: 'dirt' };
}
const allocation = allocateRedFactors(p2, reference, constraints);
assert.equal(allocation.status, 'feasible'); assert.ok(allocation.plan); assert.ok(allocation.after?.hardSatisfied);
assert.deepEqual(allocation.after.genes.map(gene => gene.level), [12, 12, 12, 6]);
assert.equal(enumerateLineageArrangements(allocation.plan, reference).length, 6);
const parentAnalysis = analyzeLineageSkills(restored.plan!.inputs.referencePlan, restored.plan!.inputs.whiteFactors, 'parentA');
assert.deepEqual(parentAnalysis.parents.map(node => node.nodeId), ['grandA1', 'grandA2']);
assert.deepEqual(parentAnalysis.grandparents.map(node => node.nodeId), ['ancestor_7', 'ancestor_8', 'ancestor_9', 'ancestor_10']);
assert.equal(parentAnalysis.self.owned[0]!.skillId, '201601');
const rearranged = reconcileWorkspaceLineage(inputs, applyLineageGrandparentArrangement(inputs.referencePlan, ['grandA2', 'grandB1', 'grandB2', 'grandA1']));
assert.deepEqual(rearranged.whiteFactors, inputs.whiteFactors); assert.deepEqual(rearranged.factorInstances.grandA1, inputs.factorInstances.grandA1);
const replacement = replaceFactorInstance(inputs, 'parentA');
assert.equal(replacement.whiteFactors.nodes.parentA, undefined); assert.equal(replacement.whiteFactors.nodePriorities.parentA, undefined);
assert.equal(replacement.referencePlan.nodes.parentA!.redFactor, null);
assert.deepEqual(replacement.referencePlan.nodes.parentA!.parentIds, inputs.referencePlan.nodes.parentA!.parentIds);
assert.notEqual(replacement.factorInstances.parentA!.factorInstanceId, inputs.factorInstances.parentA!.factorInstanceId);
assert.ok(getUnconfirmedInstanceNodeIds(replacement).includes('parentA'));
assert.throws(() => replaceFactorInstance(inputs, 'grandB2'), /잠금/);
const duplicate = duplicateSavedPlan(saved); assert.notEqual(duplicate.planId, saved.planId); assert.deepEqual(duplicate.inputs.factorInstances, saved.inputs.factorInstances);
duplicate.inputs.whiteFactors.nodes.parentA!.records[0]!.stars = 1;
assert.equal(saved.inputs.whiteFactors.nodes.parentA!.records[0]!.stars, 2);
const bad = structuredClone(saved); bad.inputs.globalPriorities[0]!.skillId = 'missing-id';
const badPreview = previewSavedPlanImport(JSON.stringify(bad), registry, snapshotIds);
assert.equal(badPreview.canApply, false); assert.equal(badPreview.plan!.inputs.globalPriorities[0]!.skillId, 'missing-id');
assert.equal(workspaceFingerprint(inputs), baselineInputs);
const changedVersion = previewSavedPlanImport(exported, registry, { ...snapshotIds, p3: 'future-p3-version' });
assert.ok(changedVersion.canApply); assert.equal(changedVersion.snapshotChanges.length, 1);
const rawStore = new Map<string, string>();
const repo = createPlanRepository({ getItem: key => rawStore.get(key) ?? null, setItem: (key, value) => { rawStore.set(key, value); } });
repo.save(saved); repo.save(duplicate); assert.equal(repo.read().lastPlanId, duplicate.planId); assert.equal(rawStore.size, 1);
assert.deepEqual(createPlanRepository({ getItem: key => rawStore.get(key) ?? null, setItem: () => {} }).read().plans[0], saved);
for (const path of paths) assert.equal(sha(await readFile(path)), hashes[path]);
const report = { checkedOn: p5.asOf, userInputProvenance: 'Synthetic user records using actual canonical DB IDs; not observed factors',
  snapshotIds, immutableSources: hashes, sourceCounts: { skills: p3.skills.length, supports: p3.supports.length, supportRoutes: p3.supportSkills.length },
  exactInputRoundtrip: true, sevenSelectedOwners: 7, fullSelectedOwners: 31, independentInstances: 31, jsonBytes: Buffer.byteLength(exported),
  affinity: { total: affinity.previewTotal, terms: affinity.contributions.map(row => row.value) },
  p2: { genes: allocation.after.genes.map(gene => gene.level), arrangementCount: 6, hardSatisfied: allocation.after.hardSatisfied },
  inspectedCurrentSix: { supportIds: selectedSupportIds, limitBreaks: selections.map(row => row.limitBreak), score: deck.score,
    compatibleSkillIds: deck.skillIds, greenSkillIds: deck.greenSkillIds, eventDecisions: deck.eventDecisions, recomputedEqualAfterRestore: true,
    scope: 'Fresh evaluation of specified actual six, not unrestricted search or global optimum certification' },
  bloodlineReplacement: { oldInstance: inputs.factorInstances.parentA!.factorInstanceId, newInstance: replacement.factorInstances.parentA!.factorInstanceId,
    retainedParentIds: replacement.referencePlan.nodes.parentA!.parentIds, unconfirmed: getUnconfirmedInstanceNodeIds(replacement), noStaleWhiteRecords: true },
  rearrangementPreservesOwners: true, duplicateRetainsPhysicalIdsAndIsolatesInputs: true, lockedReplacementRejected: true,
  oldSnapshotInputsRetained: true, missingIdPreservedAndBlocked: badPreview.issues,
  localRepositoryPlans: repo.read().plans.length, oneAtomicStorageKey: true, quantitativeAppliedRows: 0,
  artifacts: [`${directory}/seven-node-example.json`, `${directory}/31-node-example.json`] };
await writeFile('data/local/p8-persistence.validation.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checkedOn: report.checkedOn, exactInputRoundtrip: true, owners: 31, affinity: report.affinity,
  genes: report.p2.genes, six: report.inspectedCurrentSix.supportIds, score: deck.score, compatible: deck.skillIds.length,
  green: deck.greenSkillIds.length, currentSixRecomputedEqual: true, bytes: report.jsonBytes, originalSourcesUnchanged: true }, null, 2));
