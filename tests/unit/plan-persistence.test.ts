import { describe, expect, it } from 'vitest';
import actualSource from '../golden/p3-real-ui-subset.json';
import actualIdentity from '../golden/p6-priority-identities.json';
import { applyLineageGrandparentArrangement, getLineageSlotMap, setLineageLock, updateLineageNode } from '../../src/domain/lineage';
import { p3SkillRelationSchema, p3SkillSchema, validateP3Snapshot } from '../../src/domain/skill-support';
import { validateSavedPlan, validateWorkspaceInputs, type WorkspaceInputs } from '../../src/domain/saved-plan';
import { setNodeSkillPriorities, upsertWhiteFactor } from '../../src/engine/lineage-skills';
import { confirmFactorBloodline, createDefaultWorkspace, createPlanRepository, createSavedPlan, duplicateSavedPlan, exportSavedPlan,
  getUnconfirmedInstanceNodeIds, MAX_IMPORT_BYTES, PLAN_STORAGE_KEY, PlanStorageError, previewSavedPlanImport,
  reconcileWorkspaceLineage, replaceFactorInstance, synchronizeFactorInstances, updateSavedPlan, workspaceFingerprint,
  type PlanDataRegistry, type PlanStorageAdapter } from '../../src/engine/plan-persistence';

// Canonical IDs/relationships are actual source extracts. The 31 owners and
// factor observations here are explicitly synthetic user inputs, not game data.
const actual = validateP3Snapshot(actualSource);
const snapshot = { ...actual,
  skills: actual.skills.concat(actualIdentity.skills.map(row => p3SkillSchema.parse(row)).filter(row => !actual.skills.some(old => old.skillId === row.skillId))),
  skillRelations: actual.skillRelations.concat(actualIdentity.skillRelations.map(row => p3SkillRelationSchema.parse(row))),
};
const snapshots = { reference: 'p1-test-source', p3: snapshot.snapshotId, p5: 'p5-test-source' };
const registry: PlanDataRegistry = {
  costumeIds: ['100901', '100301'], skillIds: snapshot.skills.map(row => row.skillId),
  supportIds: snapshot.supports.map(row => row.supportId), eventIds: snapshot.tournaments.map(row => row.eventId),
  scenarioIds: snapshot.scenarios.map(row => row.scenarioId), skillData: snapshot,
};
function ids(start = 1) { let next = start; return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`; }
const now = '2026-11-05T12:00:00+09:00';
function inputs31(): WorkspaceInputs {
  const inputs = createDefaultWorkspace(snapshot, '2026-11-05');
  for (const node of Object.values(inputs.referencePlan.nodes)) {
    node.costumeId = '100901'; node.redFactor = { type: 'medium', stars: 3 };
  }
  inputs.factorInstances = synchronizeFactorInstances(inputs.referencePlan, inputs.whiteFactors, {}, ids());
  inputs.whiteFactors = upsertWhiteFactor(inputs.whiteFactors, inputs.referencePlan, snapshot, 'grandA1', { skillId: '201601', stars: null, status: 'owned' });
  inputs.whiteFactors = upsertWhiteFactor(inputs.whiteFactors, inputs.referencePlan, snapshot, 'grandA1', { skillId: '200452', stars: 3, status: 'planned' });
  inputs.whiteFactors = setNodeSkillPriorities(inputs.whiteFactors, inputs.referencePlan, snapshot, 'grandA1', [{ skillId: '201601', priority: 'required' }]);
  inputs.globalPriorities = [{ skillId: '200452', priority: 'strong' }];
  inputs.referencePlan = setLineageLock(inputs.referencePlan, 'grandB2', true);
  inputs.selectedNodeId = 'grandA1'; inputs.skillSettings.nodeModes.grandA1 = 'forecast';
  inputs.lineageDesign = { profileId: 'turf-middle-long', rotationGrade: 'A', geneEnabled: true, geneType: 'dirt' };
  const supportId = snapshot.supports[0]!.supportId;
  inputs.skillSettings.deck[2] = { supportId, limitBreak: 2 };
  inputs.supportSettings = { ownedSupports: [{ supportId, limitBreak: 1 }], ownedOnly: true, allowBorrow: false };
  return validateWorkspaceInputs(inputs);
}
function plan(inputs = inputs31()) { return createSavedPlan(inputs, { name: '한신 ○◎ ★ 계획', appVersion: '0.0.0-p8', snapshotIds: snapshots }, { now, uuid: ids(100) }); }
function memoryStorage(): PlanStorageAdapter & { raw: Map<string, string> } {
  const raw = new Map<string, string>(); return { raw, getItem: key => raw.get(key) ?? null, setItem: (key, value) => { raw.set(key, value); } };
}

describe('P8 complete input storage and owner identity', () => {
  it('round-trips all 31 actual-input slots, links, locks, stars, goals and support settings without a game DB', () => {
    const saved = plan(); const raw = exportSavedPlan(saved);
    const preview = previewSavedPlanImport(raw, registry, snapshots);
    expect(preview.canApply).toBe(true); expect(preview.plan).toEqual(saved);
    expect(Object.keys(preview.plan!.inputs.referencePlan.nodes)).toHaveLength(31);
    expect(preview.plan!.inputs.whiteFactors.nodes.grandA1!.records.map(row => row.stars)).toEqual([null, 3]);
    expect(raw).not.toContain('conditionGroups'); expect(raw).not.toContain('supportSkills');
  });
  it('round-trips an ordinary seven-person plan with the additional 24 empty ancestors', () => {
    let inputs = createDefaultWorkspace(snapshot, '2026-11-05');
    for (const nodeId of ['target', 'parentA', 'parentB', 'grandA1', 'grandA2', 'grandB1', 'grandB2']) {
      inputs = reconcileWorkspaceLineage(inputs, updateLineageNode(inputs.referencePlan, nodeId, { costumeId: '100901' }), ids(1000 + Object.keys(inputs.factorInstances).length));
      expect(getUnconfirmedInstanceNodeIds(inputs), `first owner entry ${nodeId}`).toEqual([]);
    }
    const preview = previewSavedPlanImport(exportSavedPlan(plan(inputs)), registry, snapshots);
    expect(preview.canApply).toBe(true);
    expect(Object.values(preview.plan!.inputs.referencePlan.nodes).filter(row => row.costumeId === null)).toHaveLength(24);
    expect(getUnconfirmedInstanceNodeIds(inputs)).toEqual([]);
  });
  it('gives identical costume and identical records different physical UUIDs', () => {
    const input = inputs31(); const instanceIds = Object.values(input.factorInstances).map(row => row.factorInstanceId);
    expect(new Set(instanceIds).size).toBe(31);
    expect(input.factorInstances.parentA!.factorInstanceId).not.toBe(input.factorInstances.parentB!.factorInstanceId);
  });
  it('distinguishes a raw instance map from workspace keys even when a stable node uses that name', () => {
    expect(getUnconfirmedInstanceNodeIds({ factorInstances: { factorInstanceId: ids()(), ownerCostumeId: '100901', bloodlineStatus: 'unconfirmed' } })).toEqual(['factorInstances']);
  });
  it('keeps the physical UUID on explicit record edits', () => {
    const original = inputs31(); const edited = structuredClone(original);
    edited.whiteFactors = upsertWhiteFactor(edited.whiteFactors, edited.referencePlan, snapshot, 'grandA1', { skillId: '201601', stars: 2, status: 'owned' });
    edited.factorInstances = synchronizeFactorInstances(edited.referencePlan, edited.whiteFactors, original.factorInstances, ids(500));
    expect(edited.factorInstances).toEqual(original.factorInstances);
    expect(edited.whiteFactors.nodes.grandA1!.records[1]!.stars).toBe(2);
  });
  it('replaces the same costume with a new physical UUID and clears only its records, local goals and red factor', () => {
    const original = inputs31(); const before = structuredClone(original);
    const next = replaceFactorInstance(original, 'grandA1', ids(500));
    expect(original).toEqual(before);
    expect(next.factorInstances.grandA1!.factorInstanceId).not.toBe(original.factorInstances.grandA1!.factorInstanceId);
    expect(next.whiteFactors.nodes.grandA1).toBeUndefined(); expect(next.whiteFactors.nodePriorities.grandA1).toBeUndefined();
    expect(next.referencePlan.nodes.grandA1!.redFactor).toBeNull();
    expect(next.referencePlan.nodes.grandA1!.parentIds).toEqual(original.referencePlan.nodes.grandA1!.parentIds);
    expect(next.referencePlan.nodes.ancestor_7).toEqual(original.referencePlan.nodes.ancestor_7);
    expect(next.globalPriorities).toEqual(original.globalPriorities);
    expect(getUnconfirmedInstanceNodeIds(next)).toEqual(['grandA1', 'parentA']);
    const confirmed = confirmFactorBloodline(next, 'grandA1');
    expect(confirmed.factorInstances.grandA1!.bloodlineStatus).toBe('confirmed');
    expect(next.factorInstances.grandA1!.bloodlineStatus).toBe('unconfirmed');
  });
  it('blocks protected owner replacement including an older node protected by a younger lock', () => {
    const input = inputs31();
    expect(() => replaceFactorInstance(input, 'grandB2', ids(500))).toThrow(/잠금/);
    expect(() => replaceFactorInstance(input, 'ancestor_13', ids(500))).toThrow(/잠금/);
    const tampered = structuredClone(input.referencePlan); tampered.nodes.ancestor_13!.costumeId = '100301';
    expect(() => reconcileWorkspaceLineage(input, tampered, ids(500))).toThrow(/잠금/);
  });
  it('preserves physical owners and their records on grandparent rearrangement and marks changed parent relations', () => {
    const original = inputs31(); const nextPlan = applyLineageGrandparentArrangement(original.referencePlan, ['grandB1', 'grandB2', 'grandA1', 'grandA2']);
    const next = reconcileWorkspaceLineage(original, nextPlan, ids(500));
    expect(getLineageSlotMap(next.referencePlan).grandB1).toBe('grandA1');
    expect(next.factorInstances.grandA1).toEqual(original.factorInstances.grandA1);
    expect(next.whiteFactors).toEqual(original.whiteFactors);
    expect(getUnconfirmedInstanceNodeIds(next)).toEqual(['parentA', 'parentB']);
  });
  it('changes physical identity on costume replacement without silently inheriting old white records', () => {
    const original = inputs31(); const changedPlan = updateLineageNode(original.referencePlan, 'grandA1', { costumeId: '100301' });
    const next = reconcileWorkspaceLineage(original, changedPlan, ids(500));
    expect(next.whiteFactors.nodes.grandA1).toBeUndefined();
    expect(next.factorInstances.grandA1).toMatchObject({ ownerCostumeId: '100301', bloodlineStatus: 'unconfirmed' });
    expect(next.referencePlan.nodes.ancestor_7).toEqual(original.referencePlan.nodes.ancestor_7);
    expect(next.factorInstances.parentA!.bloodlineStatus).toBe('unconfirmed');
  });
  it('preserves an inactive identity history when clearing an owner and never certifies its old bloodline on reselect', () => {
    const original = inputs31();
    const cleared = reconcileWorkspaceLineage(original, updateLineageNode(original.referencePlan, 'grandA1', { costumeId: null }), ids(500));
    expect(cleared.factorInstances.grandA1).toEqual({ ...original.factorInstances.grandA1!, ownerCostumeId: null, bloodlineStatus: 'unconfirmed' });
    expect(cleared.factorInstances.parentA!.bloodlineStatus).toBe('unconfirmed');
    expect(cleared.whiteFactors.nodes.grandA1).toBeUndefined();
    expect(previewSavedPlanImport(exportSavedPlan(plan(cleared)), registry, snapshots).canApply).toBe(true);
    const reselected = reconcileWorkspaceLineage(cleared, updateLineageNode(cleared.referencePlan, 'grandA1', { costumeId: '100901' }), ids(500));
    expect(reselected.factorInstances.grandA1!.factorInstanceId).not.toBe(original.factorInstances.grandA1!.factorInstanceId);
    expect(reselected.factorInstances.grandA1!.bloodlineStatus).toBe('unconfirmed');
    expect(reselected.referencePlan.nodes.ancestor_7).toEqual(original.referencePlan.nodes.ancestor_7);
  });
  it('duplicates plan identity independently while retaining the same physical IDs and deep-isolating records', () => {
    const original = plan(); const copy = duplicateSavedPlan(original, '별도 계획', { now, uuid: ids(200) });
    expect(copy.planId).not.toBe(original.planId); expect(copy.inputs.factorInstances).toEqual(original.inputs.factorInstances);
    copy.inputs.whiteFactors.nodes.grandA1!.records[0]!.stars = 1;
    expect(original.inputs.whiteFactors.nodes.grandA1!.records[0]!.stars).toBeNull();
  });
  it('keeps key-order-only differences out of the input dirty marker while observing real input edits', () => {
    const input = inputs31(); const reversed = Object.fromEntries(Object.entries(input).reverse()) as WorkspaceInputs;
    expect(workspaceFingerprint(input)).toBe(workspaceFingerprint(reversed));
    const edited = structuredClone(input); edited.skillSettings.allowForecast = true;
    expect(workspaceFingerprint(input)).not.toBe(workspaceFingerprint(edited));
  });
  it('tracks an incomplete edit without crashing and rejects saving it while preserving current input', () => {
    const input = inputs31(); input.referenceFilters.dateInput = '';
    const before = structuredClone(input);
    expect(() => workspaceFingerprint(input)).not.toThrow();
    expect(workspaceFingerprint(input)).toContain('"dateInput":""');
    expect(() => plan(input)).toThrow();
    expect(input).toEqual(before);
    const changed = reconcileWorkspaceLineage(input, updateLineageNode(input.referencePlan, 'parentA', { redFactor: { type: 'mile', stars: 2 } }));
    expect(changed.referenceFilters.dateInput).toBe('');
    expect(changed.referencePlan.nodes.parentA!.redFactor).toEqual({ type: 'mile', stars: 2 });
    expect(() => plan(changed)).toThrow();
    const replaced = replaceFactorInstance(input, 'grandA1', ids(900));
    expect(replaced.referenceFilters.dateInput).toBe('');
    expect(confirmFactorBloodline(replaced, 'grandA1').referenceFilters.dateInput).toBe('');
    const wrongGrade = { ...inputs31(), lineageDesign: { ...inputs31().lineageDesign, rotationGrade: 'S' } };
    expect(() => validateWorkspaceInputs(wrongGrade)).toThrow();
  });
  it('separates saved result references from inputs and invalidates the old snapshot on input update', () => {
    const input = inputs31(); const cards = snapshot.supports.slice(0, 6).map(row => ({ supportId: row.supportId, limitBreak: 4, ownership: 'unregistered' as const }));
    const saved = createSavedPlan(input, { name: '참고 결과', appVersion: 'p8', snapshotIds: snapshots }, { now, uuid: ids(100), resultSnapshot: {
      inputSignature: workspaceFingerprint(input), calculatedAt: now, snapshotIds: snapshots, cards,
      score: { coverageValue: 374, preferenceBonus: 8, customizedValue: 382 }, skillIds: ['201601'], greenSkillIds: [],
    } });
    expect(previewSavedPlanImport(exportSavedPlan(saved), registry, snapshots).canApply).toBe(true);
    const updated = updateSavedPlan(saved, input, { now: '2026-11-06T12:00:00+09:00' });
    expect(updated.resultSnapshot).toBeUndefined(); expect(saved.resultSnapshot?.score.coverageValue).toBe(374);
    expect(updated.createdAt).toBe(saved.createdAt);
  });
});

describe('P8 hostile files, canonical IDs and version preservation', () => {
  it.each(['costume', 'skill', 'support', 'event', 'scenario'] as const)('preserves missing %s ID as a blocking review issue without altering current inputs', kind => {
    const saved = plan(); const current = inputs31(); const unchanged = structuredClone(current);
    if (kind === 'costume') { saved.inputs.referencePlan.nodes.parentA!.costumeId = 'missing'; saved.inputs.factorInstances.parentA!.ownerCostumeId = 'missing'; }
    if (kind === 'skill') saved.inputs.globalPriorities[0]!.skillId = 'missing';
    if (kind === 'support') saved.inputs.skillSettings.deck[0]!.supportId = 'missing';
    if (kind === 'event') saved.inputs.skillSettings.eventId = 'missing';
    if (kind === 'scenario') saved.inputs.skillSettings.scenarioId = 'missing';
    const preview = previewSavedPlanImport(JSON.stringify(saved), registry, snapshots);
    expect(preview.plan).not.toBeNull(); expect(preview.canApply).toBe(false);
    expect(preview.issues.some(issue => issue.code === `missing-${kind}`)).toBe(true);
    expect(preview.rawBackup).toBe(JSON.stringify(saved)); expect(current).toEqual(unchanged);
  });
  it('blocks gold or noncanonical IDs instead of converting imported ownership/goals', () => {
    const saved = plan(); saved.inputs.globalPriorities[0]!.skillId = '201602';
    const preview = previewSavedPlanImport(JSON.stringify(saved), registry, snapshots);
    expect(preview.canApply).toBe(false);
    expect(preview.plan!.inputs.globalPriorities[0]!.skillId).toBe('201602');
    expect(preview.issues.some(row => row.code === 'noncanonical-skill')).toBe(true);
  });
  it('does not accept a file claiming data-certified factors when the source has no proof', () => {
    const saved = plan(); saved.inputs.whiteFactors.nodes.grandA1!.records[0]!.classification.status = 'verified';
    expect(previewSavedPlanImport(JSON.stringify(saved), registry, snapshots).issues.some(row => row.code === 'unverified-factor-claim')).toBe(true);
  });
  it('allows a snapshot change with all canonical IDs present and requires fresh calculation', () => {
    const saved = plan(); saved.snapshotIds.p3 = 'older-snapshot';
    const preview = previewSavedPlanImport(exportSavedPlan(saved), registry, snapshots);
    expect(preview.canApply).toBe(true); expect(preview.snapshotChanges).toEqual([{ kind: 'p3', saved: 'older-snapshot', current: snapshots.p3 }]);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: 'snapshot-changed', blocking: false }));
    expect(preview.plan!.inputs).toEqual(saved.inputs);
  });
  it.each(['schemaVersion', 'formatVersion'] as const)('rejects unsupported future %s and retains original bytes', key => {
    const raw = JSON.stringify({ ...plan(), [key]: 999 }); const preview = previewSavedPlanImport(raw, registry, snapshots);
    expect(preview.canApply).toBe(false); expect(preview.plan).toBeNull(); expect(preview.rawBackup).toBe(raw);
    expect(preview.issues[0]!.message).toContain('지원하지 않는');
  });
  it.each(['cycle', 'missing-parent', 'shared-node', 'missing-node'] as const)('rejects invalid lineage graph: %s', kind => {
    const saved = plan();
    if (kind === 'cycle') saved.inputs.referencePlan.nodes.parentA!.parentIds = ['target', 'grandA2'];
    if (kind === 'missing-parent') saved.inputs.referencePlan.nodes.parentA!.parentIds = ['missing', 'grandA2'];
    if (kind === 'shared-node') saved.inputs.referencePlan.nodes.parentB!.parentIds = ['grandA1', 'grandB2'];
    if (kind === 'missing-node') delete saved.inputs.referencePlan.nodes.ancestor_30;
    const preview = previewSavedPlanImport(JSON.stringify(saved), registry, snapshots);
    expect(preview.plan).toBeNull(); expect(preview.canApply).toBe(false);
  });
  it('rejects physical UUID collisions, mismatched owners and invalid node references', () => {
    const collision = plan(); collision.inputs.factorInstances.parentB!.factorInstanceId = collision.inputs.factorInstances.parentA!.factorInstanceId;
    expect(previewSavedPlanImport(JSON.stringify(collision), registry, snapshots).canApply).toBe(false);
    const mismatched = plan(); mismatched.inputs.whiteFactors.nodes.grandA1!.ownerCostumeId = '100301';
    expect(() => validateSavedPlan(mismatched)).toThrow();
    const badNode = plan(); badNode.inputs.skillSettings.nodeModes.unknown = 'current';
    expect(() => validateSavedPlan(badNode)).toThrow();
    const caseCollision = plan();
    caseCollision.inputs.factorInstances.parentA!.factorInstanceId = 'abcdefab-cdef-4abc-8abc-abcdefabcdef';
    caseCollision.inputs.factorInstances.parentB!.factorInstanceId = 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF';
    expect(previewSavedPlanImport(JSON.stringify(caseCollision), registry, snapshots).canApply).toBe(false);
  });
  it.each(['stars', 'priority', 'date', 'extra-key'] as const)('rejects malformed %s rather than coercing user inputs', kind => {
    const raw = JSON.parse(exportSavedPlan(plan())) as Record<string, unknown>;
    const inputs = raw.inputs as WorkspaceInputs;
    if (kind === 'stars') (inputs.whiteFactors.nodes.grandA1!.records[0] as unknown as { stars: number }).stars = 4;
    if (kind === 'priority') (inputs.globalPriorities[0] as unknown as { priority: string }).priority = 'highest';
    if (kind === 'date') raw.createdAt = '2026-02-30T12:00:00+09:00';
    if (kind === 'extra-key') raw.execute = 'alert(1)';
    expect(previewSavedPlanImport(JSON.stringify(raw), registry, snapshots).plan).toBeNull();
  });
  it('rejects damaged JSON, duplicate keys, prototype keys, extreme nesting and oversize files without evaluating text', () => {
    const valid = exportSavedPlan(plan());
    const values = [valid.slice(0, -4), valid.replace('"name":', '"name":"duplicate", "name":'),
      valid.replace('"name":', '"__proto__":{}, "name":'), '['.repeat(100) + '0' + ']'.repeat(100), ' '.repeat(MAX_IMPORT_BYTES + 1)];
    for (const raw of values) expect(previewSavedPlanImport(raw, registry, snapshots).canApply).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('P8 local repository transactions and failure handling', () => {
  it('stores multiple isolated plans and a last-plan pointer atomically in one key', () => {
    const storage = memoryStorage(); const repository = createPlanRepository(storage);
    const a = plan(); const b = duplicateSavedPlan(a, '두 번째', { now, uuid: ids(200) });
    repository.save(a); repository.save(b);
    expect(storage.raw.size).toBe(1); expect(storage.raw.has(PLAN_STORAGE_KEY)).toBe(true);
    expect(repository.read().lastPlanId).toBe(b.planId);
    const reloaded = createPlanRepository(storage).read(); expect(reloaded.plans).toEqual([a, b]);
    reloaded.plans[0]!.inputs.globalPriorities = [];
    expect(repository.read().plans[0]!.inputs.globalPriorities).toEqual(a.inputs.globalPriorities);
  });
  it('requires explicit overwrite and never silently merges duplicate plan IDs', () => {
    const storage = memoryStorage(); const repository = createPlanRepository(storage); const a = plan(); repository.save(a);
    expect(() => repository.save(a)).toThrow(PlanStorageError);
    const before = storage.raw.get(PLAN_STORAGE_KEY);
    expect(() => repository.save({ ...a, name: '다른 이름' })).toThrow(/명시적/);
    expect(storage.raw.get(PLAN_STORAGE_KEY)).toBe(before);
    repository.save({ ...a, name: '덮어쓰기' }, { overwrite: true });
    expect(repository.read().plans[0]!.name).toBe('덮어쓰기');
  });
  it('renames, duplicates, selects and removes plans without editing other plan inputs', () => {
    const repository = createPlanRepository(memoryStorage()); const a = plan(); repository.save(a);
    repository.rename(a.planId, '수정한 이름'); const duplicated = repository.duplicate(a.planId, '복제 이름');
    const b = duplicated.plans.find(row => row.planId !== a.planId)!;
    expect(b.inputs).toEqual(a.inputs); expect(b.inputs.factorInstances).toEqual(a.inputs.factorInstances);
    repository.setLastPlan(a.planId); expect(repository.read().lastPlanId).toBe(a.planId);
    repository.remove(a.planId); expect(repository.read().plans.map(row => row.planId)).toEqual([b.planId]);
    expect(repository.read().lastPlanId).toBe(b.planId);
    expect(() => repository.setLastPlan(a.planId)).toThrow(/없습니다/);
  });
  it('reports quota failure with the previous persisted data intact and leaves JSON backup available', () => {
    const storage = memoryStorage(); const repository = createPlanRepository(storage); const a = plan(); repository.save(a);
    const before = storage.raw.get(PLAN_STORAGE_KEY);
    storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    try { repository.save({ ...a, name: '변경 실패' }, { overwrite: true }); throw new Error('expected quota'); }
    catch (error) { expect(error).toBeInstanceOf(PlanStorageError); expect((error as PlanStorageError).code).toBe('quota'); }
    expect(storage.raw.get(PLAN_STORAGE_KEY)).toBe(before);
    expect(previewSavedPlanImport(exportSavedPlan(a), registry, snapshots).canApply).toBe(true);
  });
  it('reports inaccessible storage and protects corrupt existing repository bytes', () => {
    const denied = createPlanRepository({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(() => denied.read()).toThrow(/접근/); expect(() => denied.save(plan())).toThrow(/접근/);
    const storage = memoryStorage(); storage.raw.set(PLAN_STORAGE_KEY, '{corrupt');
    const repository = createPlanRepository(storage);
    expect(() => repository.read()).toThrow(/검증/); expect(() => repository.save(plan())).toThrow(/검증/);
    expect(storage.raw.get(PLAN_STORAGE_KEY)).toBe('{corrupt');
  });
});
