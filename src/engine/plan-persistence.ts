import { z } from 'zod';
import type { DeepReadonly } from '../data/snapshot';
import { createLineagePlan, getProtectedNodeIds, updateLineageNode, validateLineagePlan, type LineagePlan } from '../domain/lineage';
import { createEmptyLineageSkills, validateLineageSkillState, type LineageSkillState } from '../domain/lineage-skills';
import type { P3Snapshot } from '../domain/skill-support';
import { dateOnlySchema } from '../domain/primitives';
import { MAX_IMPORT_BYTES, savedPlanSchema, validateSavedPlan, validateWorkspaceInputs, type DataSnapshotIds, type FactorInstanceState, type SavedPlan, type SavedResultSnapshot, type WorkspaceInputs } from '../domain/saved-plan';
import { classifyWhiteFactor, reconcileLineageSkills } from './lineage-skills';
import { resolvePriorityTarget, type PrioritySkillData } from './skill-priorities';

export { MAX_IMPORT_BYTES } from '../domain/saved-plan';
export type { DataSnapshotIds, FactorInstanceState, SavedPlan, SavedResultSnapshot, WorkspaceInputs } from '../domain/saved-plan';
export const PLAN_STORAGE_KEY = 'uma.p8.saved-plans.v1';
const MAX_REPOSITORY_BYTES = 25 * 1024 * 1024;
export type UuidFactory = () => string;
const uuid: UuidFactory = () => {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (!crypto?.getRandomValues) throw new Error('이 브라우저에서 안전한 인자 개체 ID를 생성할 수 없습니다.');
  // getRandomValues also works in browser contexts without randomUUID. The ID
  // remains random and independent of names, records, slots and timestamps.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const isoNow = () => new Date().toISOString();

export function createDefaultWorkspace(p3?: DeepReadonly<P3Snapshot>, today = isoNow().slice(0, 10)): WorkspaceInputs {
  dateOnlySchema.parse(today);
  const event = p3 ? [...p3.tournaments].filter(row => row.startAt && row.startAt.slice(0, 10) >= today)
    .sort((a, b) => a.startAt!.localeCompare(b.startAt!))[0] ?? p3.tournaments[0] : undefined;
  return validateWorkspaceInputs({
    referencePlan: createLineagePlan(), whiteFactors: createEmptyLineageSkills(), factorInstances: {}, selectedNodeId: null, globalPriorities: [],
    referenceFilters: { dateInput: today, includeUnknown: false, allowForecast: false },
    lineageDesign: { profileId: 'none', rotationGrade: 'B', geneEnabled: false, geneType: 'dirt' },
    skillSettings: { eventId: event?.eventId ?? '', scenarioId: p3?.scenarios[0]?.scenarioId ?? '', runningStyle: 'front',
      preference: 'balanced', mode: 'tournament', allowForecast: false, includeUnknown: true,
      deck: Array.from({ length: 6 }, () => ({ supportId: null, limitBreak: 4 })), nodeModes: {} },
    supportSettings: { ownedSupports: [], ownedOnly: false, allowBorrow: true },
  });
}

/** A native date field becomes empty during editing. Lineage/instance edits
 * still validate every ownership constraint, while leaving that unfinished
 * filter untouched. Save, import and restore continue to use the strict schema. */
function validateEditableWorkspace(inputs: DeepReadonly<WorkspaceInputs>): WorkspaceInputs {
  const checked = validateWorkspaceInputs({ ...inputs, referenceFilters: { ...inputs.referenceFilters, dateInput: '2000-01-01' } });
  checked.referenceFilters.dateInput = inputs.referenceFilters.dateInput;
  return checked;
}

/** Owner-node identity is stable when a whole branch moves. Ordinary record
 * edits retain the UUID; changing its owner gets a fresh physical identity. */
export function synchronizeFactorInstances(plan: DeepReadonly<LineagePlan>, whiteFactors: DeepReadonly<LineageSkillState>, previous: DeepReadonly<FactorInstanceState>, uuidFactory: UuidFactory = uuid): FactorInstanceState {
  validateLineagePlan(plan); validateLineageSkillState(whiteFactors);
  const next: FactorInstanceState = {};
  const reserved = new Set(Object.values(previous).map(row => row.factorInstanceId));
  for (const [nodeId, node] of Object.entries(plan.nodes)) {
    const old = previous[nodeId];
    if (node.costumeId === null) {
      if (old) next[nodeId] = { ...old, ownerCostumeId: null, bloodlineStatus: 'unconfirmed' };
      continue;
    }
    if (old?.ownerCostumeId === node.costumeId) next[nodeId] = { ...old };
    else {
      const factorInstanceId = uuidFactory();
      if (reserved.has(factorInstanceId)) throw new Error('새 인자 개체 ID가 기존 실물 ID와 충돌합니다.');
      reserved.add(factorInstanceId);
      next[nodeId] = { factorInstanceId, ownerCostumeId: node.costumeId, bloodlineStatus: old ? 'unconfirmed' : 'confirmed' };
    }
  }
  // Reuse the strict cross-layer checks, rather than silently deduplicating a
  // hostile/inconsistent UUID factory or a pre-existing collision.
  const ids = Object.values(next).map(row => row.factorInstanceId);
  if (new Set(ids).size !== ids.length || ids.some(id => id !== id.toLowerCase() || !z.uuid().safeParse(id).success)) throw new Error('인자 개체 ID가 중복되거나 소문자 canonical UUID 형식이 아닙니다.');
  return next;
}

export function reconcileWorkspaceLineage(inputs: DeepReadonly<WorkspaceInputs>, nextPlan: DeepReadonly<LineagePlan>, uuidFactory: UuidFactory = uuid): WorkspaceInputs {
  const current = validateEditableWorkspace(inputs);
  const referencePlan = validateLineagePlan(nextPlan);
  for (const id of getProtectedNodeIds(current.referencePlan)) {
    const before = current.referencePlan.nodes[id]!;
    const after = referencePlan.nodes[id];
    const previousParents: readonly string[] = before.parentIds ?? [];
    const nextParents: readonly string[] = after?.parentIds ?? [];
    if (!after || before.costumeId !== after.costumeId || JSON.stringify(before.redFactor) !== JSON.stringify(after.redFactor)
      || previousParents.length !== nextParents.length || previousParents.some(parent => !nextParents.includes(parent))) {
      throw new Error('잠금된 혈통의 소유자·인자·부모 연결을 변경할 수 없습니다. 해당 혈통의 잠금을 먼저 해제하세요.');
    }
  }
  const whiteFactors = reconcileLineageSkills(current.referencePlan, referencePlan, current.whiteFactors);
  const factorInstances = synchronizeFactorInstances(referencePlan, whiteFactors, current.factorInstances, uuidFactory);
  for (const [id, instance] of Object.entries(factorInstances)) {
    if (!current.factorInstances[id]) continue;
    const previousParents: readonly string[] = current.referencePlan.nodes[id]!.parentIds ?? [];
    const nextParents: readonly string[] = referencePlan.nodes[id]!.parentIds ?? [];
    const relationChanged = previousParents.length !== nextParents.length || previousParents.some(parent => !nextParents.includes(parent));
    const physicalParentChanged = nextParents.some(parent => {
      const before = current.factorInstances[parent];
      const after = factorInstances[parent];
      return before !== undefined && (before.factorInstanceId !== after?.factorInstanceId || before.ownerCostumeId !== after?.ownerCostumeId);
    });
    if (relationChanged || physicalParentChanged) instance.bloodlineStatus = 'unconfirmed';
  }
  return validateEditableWorkspace({ ...current, referencePlan, whiteFactors, factorInstances });
}

/** Explicit replacement is distinct from editing the current factor record.
 * Ancestors stay intact, but their association must be reconfirmed by the user. */
export function replaceFactorInstance(inputs: DeepReadonly<WorkspaceInputs>, nodeId: string, uuidFactory: UuidFactory = uuid): WorkspaceInputs {
  const current = validateEditableWorkspace(inputs);
  const node = current.referencePlan.nodes[nodeId];
  if (!node || node.costumeId === null) throw new Error('인자 소유 캐릭터를 먼저 선택하세요.');
  if (getProtectedNodeIds(current.referencePlan).has(nodeId)) throw new Error('잠금된 혈통입니다. 해당 노드를 보호하는 혈통의 잠금을 먼저 해제하세요.');
  const referencePlan = updateLineageNode(current.referencePlan, nodeId, { redFactor: null });
  const whiteFactors = validateLineageSkillState(current.whiteFactors);
  delete whiteFactors.nodes[nodeId]; delete whiteFactors.nodePriorities[nodeId];
  const factorInstanceId = uuidFactory();
  if (Object.values(current.factorInstances).some(instance => instance.factorInstanceId === factorInstanceId)) throw new Error('새 인자 개체 ID가 기존 실물 ID와 충돌합니다.');
  const factorInstances = { ...current.factorInstances, [nodeId]: {
    factorInstanceId, ownerCostumeId: node.costumeId, bloodlineStatus: 'unconfirmed' as const,
  } };
  for (const younger of Object.values(referencePlan.nodes)) if (younger.parentIds?.includes(nodeId) && factorInstances[younger.nodeId]) {
    factorInstances[younger.nodeId] = { ...factorInstances[younger.nodeId]!, bloodlineStatus: 'unconfirmed' };
  }
  return validateEditableWorkspace({ ...current, referencePlan, whiteFactors, factorInstances });
}

export function confirmFactorBloodline(inputs: DeepReadonly<WorkspaceInputs>, nodeId: string): WorkspaceInputs {
  const current = validateEditableWorkspace(inputs);
  const instance = current.factorInstances[nodeId];
  if (!instance) throw new Error('확인할 인자 개체가 없습니다.');
  instance.bloodlineStatus = 'confirmed';
  return current;
}
export function getUnconfirmedInstanceNodeIds(value: DeepReadonly<WorkspaceInputs> | DeepReadonly<FactorInstanceState>): string[] {
  const candidate = value as Partial<DeepReadonly<WorkspaceInputs>>;
  const isWorkspace = candidate.referencePlan?.schemaVersion === 1 && candidate.factorInstances !== undefined;
  const instances = isWorkspace ? candidate.factorInstances! : value as DeepReadonly<FactorInstanceState>;
  return Object.entries(instances).filter(([, instance]) => instance.bloodlineStatus === 'unconfirmed').map(([id]) => id).sort();
}

/** Stable, input-only dirty marker. It does not include calculated results or
 * viewing/transient worker state and is never used as an instance identity. */
export function workspaceFingerprint(inputs: DeepReadonly<WorkspaceInputs>): string {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)]));
    return value;
  }
  // Editing a date/select can temporarily produce an invalid value. Dirty
  // tracking must remain available; strict validation belongs to save/restore
  // boundaries and must not crash a render while the user is still editing.
  return JSON.stringify(ordered(inputs));
}

export interface PlanMetadata { name: string; appVersion: string; snapshotIds: DataSnapshotIds }
export interface CreatePlanOptions { now?: string; uuid?: UuidFactory; resultSnapshot?: SavedResultSnapshot }
export function createSavedPlan(inputs: DeepReadonly<WorkspaceInputs>, metadata: PlanMetadata, options: CreatePlanOptions = {}): SavedPlan {
  const now = options.now ?? isoNow();
  return validateSavedPlan({ contract: 'uma-saved-plan', schemaVersion: 1, formatVersion: 1,
    planId: (options.uuid ?? uuid)(), name: metadata.name, createdAt: now, updatedAt: now,
    appVersion: metadata.appVersion, snapshotIds: metadata.snapshotIds, inputs,
    ...(options.resultSnapshot ? { resultSnapshot: options.resultSnapshot } : {}) });
}
export interface UpdatePlanOptions { now?: string; name?: string; appVersion?: string; snapshotIds?: DataSnapshotIds; resultSnapshot?: SavedResultSnapshot | null }
export function updateSavedPlan(plan: DeepReadonly<SavedPlan>, inputs: DeepReadonly<WorkspaceInputs>, options: UpdatePlanOptions = {}): SavedPlan {
  const next = validateSavedPlan(plan);
  next.inputs = validateWorkspaceInputs(inputs); next.updatedAt = options.now ?? isoNow();
  if (options.name !== undefined) next.name = options.name;
  if (options.appVersion !== undefined) next.appVersion = options.appVersion;
  if (options.snapshotIds !== undefined) next.snapshotIds = options.snapshotIds;
  // Old calculation is reference-only, and must not be relabelled as the new
  // input's result. A caller may explicitly provide a current verified snapshot.
  if (options.resultSnapshot) next.resultSnapshot = options.resultSnapshot;
  else delete next.resultSnapshot;
  return validateSavedPlan(next);
}
export function duplicateSavedPlan(plan: DeepReadonly<SavedPlan>, name?: string, options: Pick<CreatePlanOptions, 'now' | 'uuid'> = {}): SavedPlan {
  const original = validateSavedPlan(plan);
  const next = createSavedPlan(original.inputs, { name: name ?? `${original.name.slice(0, 117)} 사본`, appVersion: original.appVersion, snapshotIds: original.snapshotIds }, { ...options, resultSnapshot: original.resultSnapshot });
  if (next.planId === original.planId) throw new Error('복제 계획은 원본과 다른 계획 ID가 필요합니다.');
  return next;
}
export function exportSavedPlan(plan: DeepReadonly<SavedPlan>): string {
  const raw = JSON.stringify(validateSavedPlan(plan), null, 2);
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES) throw new Error('계획 JSON이 허용 파일 크기를 초과했습니다.');
  return raw;
}

export interface PlanDataRegistry {
  costumeIds: readonly string[] | ReadonlySet<string>; skillIds: readonly string[] | ReadonlySet<string>;
  supportIds: readonly string[] | ReadonlySet<string>; eventIds: readonly string[] | ReadonlySet<string>;
  scenarioIds: readonly string[] | ReadonlySet<string>; skillData?: PrioritySkillData;
}
export interface RestoreIssue { code: string; path: string; message: string; blocking: boolean }
export interface SnapshotChange { kind: keyof DataSnapshotIds; saved: string | null; current: string | null }
export interface RestorePreview {
  plan: SavedPlan | null; canApply: boolean; issues: RestoreIssue[]; snapshotChanges: SnapshotChange[];
  rawBackup: string; migrated: boolean;
}

/** Scan before JSON.parse: duplicate object keys, dangerous prototype keys and
 * pathological depth are rejected instead of being silently overwritten. */
function parseSafeJson(raw: string, maxBytes: number): unknown {
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('파일 크기가 허용 한도를 초과했습니다.');
  let cursor = 0;
  const whitespace = () => { while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor++; };
  const string = () => {
    const start = cursor++;
    while (cursor < raw.length) {
      const char = raw[cursor++];
      if (char === '\\') cursor++;
      else if (char === '"') return JSON.parse(raw.slice(start, cursor)) as string;
    }
    throw new Error('닫히지 않은 JSON 문자열입니다.');
  };
  const value = (depth: number): void => {
    if (depth > 80) throw new Error('JSON 연결 깊이가 허용 한도를 초과했습니다.');
    whitespace(); const char = raw[cursor];
    if (char === '{') {
      cursor++; whitespace(); const keys = new Set<string>();
      if (raw[cursor] === '}') { cursor++; return; }
      for (;;) {
        whitespace(); if (raw[cursor] !== '"') throw new Error('JSON 객체 키를 확인하세요.');
        const key = string();
        if (keys.has(key)) throw new Error(`중복 JSON 키: ${key}`);
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`허용하지 않는 JSON 키: ${key}`);
        keys.add(key); whitespace(); if (raw[cursor++] !== ':') throw new Error('JSON 객체 구분자를 확인하세요.');
        value(depth + 1); whitespace(); const next = raw[cursor++];
        if (next === '}') break; if (next !== ',') throw new Error('JSON 객체가 손상되었습니다.');
      }
    } else if (char === '[') {
      cursor++; whitespace(); if (raw[cursor] === ']') { cursor++; return; }
      for (;;) { value(depth + 1); whitespace(); const next = raw[cursor++]; if (next === ']') break; if (next !== ',') throw new Error('JSON 목록이 손상되었습니다.'); }
    } else if (char === '"') string();
    else {
      const start = cursor;
      while (cursor < raw.length && !/[\s,}\]]/.test(raw[cursor]!)) cursor++;
      if (start === cursor) throw new Error('JSON 값을 확인하세요.');
      JSON.parse(raw.slice(start, cursor));
    }
  };
  value(0); whitespace(); if (cursor !== raw.length) throw new Error('JSON 뒤에 알 수 없는 내용이 있습니다.');
  return JSON.parse(raw);
}

/** Dispatch point for future explicit migrations. V1 has no older P8 format;
 * unsupported versions are never guessed. The caller retains rawBackup. */
export function migrateSavedPlan(input: unknown): { plan: SavedPlan; migrated: boolean } {
  const header = z.object({ schemaVersion: z.number().int(), formatVersion: z.number().int() }).parse(input);
  if (header.schemaVersion !== 1 || header.formatVersion !== 1) throw new Error(`지원하지 않는 저장 버전(schema ${header.schemaVersion}, format ${header.formatVersion})입니다. 원본 파일을 보존하세요.`);
  return { plan: validateSavedPlan(input), migrated: false };
}

export function previewSavedPlanImport(raw: string, registry: PlanDataRegistry, currentSnapshots: DataSnapshotIds): RestorePreview {
  const preview: RestorePreview = { plan: null, canApply: false, issues: [], snapshotChanges: [], rawBackup: raw, migrated: false };
  const issue = (code: string, path: string, message: string, blocking = true) => preview.issues.push({ code, path, message, blocking });
  try {
    const migration = migrateSavedPlan(parseSafeJson(raw, MAX_IMPORT_BYTES));
    const plan = migration.plan; preview.plan = plan; preview.migrated = migration.migrated;
    const sets = { costume: new Set(registry.costumeIds), skill: new Set(registry.skillIds), support: new Set(registry.supportIds), event: new Set(registry.eventIds), scenario: new Set(registry.scenarioIds) };
    const check = (kind: keyof typeof sets, id: string, path: string) => { if (!sets[kind].has(id)) issue(`missing-${kind}`, path, `현재 데이터에 ${kind} ID ${id || '(미선택)'}가 없습니다. 기록은 원본 그대로 보존합니다.`); };
    const canonical = (id: string, path: string, white = false) => {
      check('skill', id, path);
      if (!registry.skillData || !sets.skill.has(id)) return;
      const resolved = resolvePriorityTarget(registry.skillData, id);
      if (resolved.status !== 'resolved' || resolved.skillId !== id) issue('noncanonical-skill', path, `${id}: 일반 백인자 canonical ID를 확인할 수 없습니다. 자동 변환하지 않습니다.`);
      if (white) {
        // Imported user assertions cannot raise the actual dataset's proof.
        const records = Object.values(plan.inputs.whiteFactors.nodes).flatMap(row => row.records).filter(row => row.skillId === id);
        if (records.some(row => row.classification.status === 'verified') && classifyWhiteFactor(registry.skillData, id).status !== 'verified') issue('unverified-factor-claim', path, '현재 원본 자료가 검증하지 않은 백인자 인증 표시는 복원할 수 없습니다.');
      }
    };
    for (const [id, node] of Object.entries(plan.inputs.referencePlan.nodes)) if (node.costumeId !== null) check('costume', node.costumeId, `inputs.referencePlan.nodes.${id}.costumeId`);
    for (const [id, node] of Object.entries(plan.inputs.whiteFactors.nodes)) node.records.forEach((record, i) => canonical(record.skillId, `inputs.whiteFactors.nodes.${id}.records.${i}.skillId`, true));
    for (const [id, row] of Object.entries(plan.inputs.whiteFactors.nodePriorities)) row.priorities.forEach((entry, i) => canonical(entry.skillId, `inputs.whiteFactors.nodePriorities.${id}.priorities.${i}.skillId`));
    plan.inputs.globalPriorities.forEach((row, i) => canonical(row.skillId, `inputs.globalPriorities.${i}.skillId`));
    plan.inputs.skillSettings.deck.forEach((row, i) => { if (row.supportId !== null) check('support', row.supportId, `inputs.skillSettings.deck.${i}.supportId`); });
    plan.inputs.supportSettings.ownedSupports.forEach((row, i) => check('support', row.supportId, `inputs.supportSettings.ownedSupports.${i}.supportId`));
    check('event', plan.inputs.skillSettings.eventId, 'inputs.skillSettings.eventId');
    check('scenario', plan.inputs.skillSettings.scenarioId, 'inputs.skillSettings.scenarioId');
    for (const kind of ['reference', 'p3', 'p5'] as const) if (plan.snapshotIds[kind] !== currentSnapshots[kind]) preview.snapshotChanges.push({ kind, saved: plan.snapshotIds[kind], current: currentSnapshots[kind] });
    if (preview.snapshotChanges.length) issue('snapshot-changed', 'snapshotIds', '게임 데이터 버전이 다릅니다. 사용자 입력을 유지하고 현재 데이터로 다시 계산합니다.', false);
    const unconfirmed = getUnconfirmedInstanceNodeIds(plan.inputs);
    if (unconfirmed.length) issue('bloodline-unconfirmed', 'inputs.factorInstances', `${unconfirmed.length}개 인자 개체의 기존 혈통을 재확인해야 합니다. 의존 계산은 확정 결과가 아닙니다.`, false);
    preview.canApply = !preview.issues.some(row => row.blocking);
  } catch (error) {
    if (error instanceof z.ZodError) error.issues.forEach(row => issue('invalid-structure', row.path.join('.'), row.message));
    else issue('invalid-file', '', error instanceof Error ? error.message : '저장 파일을 읽지 못했습니다.');
  }
  return preview;
}

export interface PlanStorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface PlanRepositoryState { plans: SavedPlan[]; lastPlanId: string | null }
export class PlanStorageError extends Error {
  readonly code: 'access' | 'quota' | 'invalid' | 'conflict' | 'not-found';
  constructor(code: PlanStorageError['code'], message: string) { super(message); this.name = 'PlanStorageError'; this.code = code; }
}
const repositorySchema = z.strictObject({ schemaVersion: z.literal(1), plans: z.array(savedPlanSchema).max(100), lastPlanId: z.uuid().nullable() }).superRefine((state, context) => {
  const ids = state.plans.map(plan => plan.planId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['plans'], message: '저장 계획 ID가 중복됩니다.' });
  if (state.lastPlanId !== null && !ids.includes(state.lastPlanId)) context.addIssue({ code: 'custom', path: ['lastPlanId'], message: '마지막 계획 ID가 목록에 없습니다.' });
});
export function createPlanRepository(storage: PlanStorageAdapter, key = PLAN_STORAGE_KEY) {
  const read = (): PlanRepositoryState => {
    let raw: string | null;
    try { raw = storage.getItem(key); } catch { throw new PlanStorageError('access', '브라우저 저장소에 접근할 수 없습니다. JSON 파일로 백업하세요.'); }
    if (raw === null) return { plans: [], lastPlanId: null };
    try {
      const state = repositorySchema.parse(parseSafeJson(raw, MAX_REPOSITORY_BYTES));
      for (const plan of state.plans) exportSavedPlan(plan);
      return { plans: state.plans, lastPlanId: state.lastPlanId };
    }
    catch { throw new PlanStorageError('invalid', '저장소 데이터 검증에 실패했습니다. 기존 데이터를 덮어쓰지 않았습니다.'); }
  };
  const write = (state: PlanRepositoryState) => {
    const checked = repositorySchema.parse({ schemaVersion: 1, ...state });
    const raw = JSON.stringify(checked);
    if (new TextEncoder().encode(raw).byteLength > MAX_REPOSITORY_BYTES) throw new PlanStorageError('quota', '저장 계획 총 크기가 로컬 저장 한도를 초과했습니다. JSON 파일로 백업하세요.');
    try { storage.setItem(key, raw); }
    catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      throw new PlanStorageError(name.includes('Quota') || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'quota' : 'access', '브라우저에 저장하지 못했습니다. 기존 저장 계획은 유지됩니다. JSON 파일로 백업하세요.');
    }
    return { plans: checked.plans, lastPlanId: checked.lastPlanId };
  };
  const save = (plan: DeepReadonly<SavedPlan>, options: { overwrite?: boolean } = {}) => {
    const checked = validateSavedPlan(plan); exportSavedPlan(checked);
    const state = read(); const index = state.plans.findIndex(row => row.planId === checked.planId);
    if (index >= 0 && !options.overwrite) throw new PlanStorageError('conflict', '같은 계획 ID가 있습니다. 덮어쓰기 또는 새 계획 복제를 명시적으로 선택하세요.');
    if (index >= 0) state.plans[index] = checked; else state.plans.push(checked);
    state.lastPlanId = checked.planId;
    return write(state);
  };
  const find = (state: PlanRepositoryState, id: string) => {
    const plan = state.plans.find(row => row.planId === id);
    if (!plan) throw new PlanStorageError('not-found', '저장된 계획이 없습니다.');
    return plan;
  };
  return {
    read, save,
    remove(planId: string) { const state = read(); find(state, planId); state.plans = state.plans.filter(row => row.planId !== planId); if (state.lastPlanId === planId) state.lastPlanId = state.plans.at(-1)?.planId ?? null; return write(state); },
    rename(planId: string, name: string) { const state = read(); const plan = find(state, planId); const renamed = validateSavedPlan({ ...plan, name, updatedAt: isoNow() }); return save(renamed, { overwrite: true }); },
    duplicate(planId: string, name?: string) { return save(duplicateSavedPlan(find(read(), planId), name)); },
    setLastPlan(planId: string) { const state = read(); find(state, planId); state.lastPlanId = planId; return write(state); },
  };
}
export type PlanRepository = ReturnType<typeof createPlanRepository>;
