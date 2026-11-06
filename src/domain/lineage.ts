import { z } from 'zod';
import type { DeepReadonly } from '../data/snapshot';
import { aptitudeGradeSchema, idSchema } from './primitives';
import { aptitudeKeySchema, createEmptyPedigree, pedigreeSchema, redFactorSchema, SLOT_KEYS, type AptitudeKey, type GrandparentSlotKey, type Pedigree, type SlotKey } from './pedigree';

export const lineageNodeSchema = z.strictObject({
  nodeId: idSchema,
  costumeId: idSchema.nullable(),
  redFactor: redFactorSchema.nullable(),
  parentIds: z.tuple([idSchema, idSchema]).nullable(),
  locked: z.boolean(),
});

export const lineagePlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rootId: idSchema,
  nodes: z.record(idSchema, lineageNodeSchema),
}).superRefine((plan, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message });
  const keys = Object.keys(plan.nodes);
  if (keys.length !== 31) issue(['nodes'], '31인 계보에는 정확히 31개의 인자 소유 노드가 필요합니다.');
  if (!Object.hasOwn(plan.nodes, plan.rootId)) { issue(['rootId'], '본육성 대상 노드가 없습니다.'); return; }
  for (const [key, node] of Object.entries(plan.nodes)) {
    if (node.nodeId !== key) issue(['nodes', key, 'nodeId'], '인자 소유 ID와 노드 키가 일치해야 합니다.');
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const counts = [0, 0, 0, 0, 0];
  const depths = new Map<string, number>();
  function visit(id: string, depth: number): void {
    const node = plan.nodes[id];
    if (!node) { issue(['nodes', id], '존재하지 않는 혈통 연결입니다.'); return; }
    if (active.has(id)) { issue(['nodes', id, 'parentIds'], '혈통에 순환 연결이 있습니다.'); return; }
    if (visited.has(id)) { issue(['nodes', id], '두 슬롯이 하나의 인자 소유 노드를 공유할 수 없습니다. 별도 슬롯으로 기록하세요.'); return; }
    visited.add(id); active.add(id);
    depths.set(id, depth);
    if (depth > 4) { issue(['nodes', id, 'parentIds'], '고조부모보다 깊은 연결은 이 계보 범위 밖입니다.'); active.delete(id); return; }
    counts[depth] = counts[depth]! + 1;
    if (depth === 4) {
      if (node.parentIds !== null) issue(['nodes', id, 'parentIds'], '고조부모의 상위 연결은 31인 범위 밖입니다.');
    } else if (node.parentIds === null) {
      issue(['nodes', id, 'parentIds'], '이 세대에는 부모 두 명의 연결이 필요합니다.');
    } else {
      node.parentIds.forEach((parent) => visit(parent, depth + 1));
    }
    active.delete(id);
  }
  visit(plan.rootId, 0);
  // Protection is inherited by the entire older bloodline, including records
  // parsed directly from JSON rather than created through setLineageLock.
  for (const owner of Object.values(plan.nodes).filter((node) => node.locked)) {
    const pending = [owner.nodeId];
    const checked = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (checked.has(id)) continue;
      checked.add(id);
      const node = plan.nodes[id];
      if (!node) continue;
      // Deep slots are manual mob plans, including plans protected by a younger
      // bloodline. They do not need a fabricated character to retain a lock.
      if ((depths.get(id) ?? 0) <= 2 && node.redFactor !== null && node.costumeId === null) {
        issue(['nodes', id, 'costumeId'], '고정 혈통의 인자 소유 캐릭터가 미정입니다.');
      }
      pending.push(...(node.parentIds ?? []));
    }
  }
  if (visited.size !== keys.length) issue(['nodes'], '본육성 대상과 연결되지 않은 노드가 있습니다.');
  if (counts.some((count, depth) => count !== 2 ** depth)) issue(['nodes'], '세대별 슬롯 수는 1·2·4·8·16이어야 합니다.');
});

export type LineageNode = z.infer<typeof lineageNodeSchema>;
export type LineagePlan = z.infer<typeof lineagePlanSchema>;

const optionalGrades = z.strictObject({
  turf: aptitudeGradeSchema.optional(), dirt: aptitudeGradeSchema.optional(), sprint: aptitudeGradeSchema.optional(),
  mile: aptitudeGradeSchema.optional(), medium: aptitudeGradeSchema.optional(), long: aptitudeGradeSchema.optional(),
  front: aptitudeGradeSchema.optional(), pace: aptitudeGradeSchema.optional(), late: aptitudeGradeSchema.optional(), end: aptitudeGradeSchema.optional(),
});
export const grandparentGoalSchema = z.strictObject({
  targetFactorType: aptitudeKeySchema.nullable(),
  rotationRequirements: optionalGrades,
  geneType: aptitudeKeySchema.nullable(),
});
export const lineageConstraintsSchema = z.strictObject({
  grandparentGoals: z.record(idSchema, grandparentGoalSchema),
  preserveParentFactorTargets: z.boolean().optional(),
});
export type GrandparentGoal = z.infer<typeof grandparentGoalSchema>;
export type LineageConstraints = z.infer<typeof lineageConstraintsSchema>;

export function validateLineagePlan(input: unknown): LineagePlan { return lineagePlanSchema.parse(input); }

export function createLineagePlan(pedigree: DeepReadonly<Pedigree> = createEmptyPedigree()): LineagePlan {
  const selected = pedigreeSchema.parse(pedigree);
  const ids = Array.from({ length: 31 }, (_, index) => SLOT_KEYS[index] ?? `ancestor_${index}`);
  const nodes: Record<string, LineageNode> = {};
  ids.forEach((id, index) => {
    const slot = index < 7 ? selected[SLOT_KEYS[index]!] : { costumeId: null, redFactor: null };
    nodes[id] = { nodeId: id, costumeId: slot.costumeId, redFactor: slot.redFactor ? { ...slot.redFactor } : null,
      parentIds: index < 15 ? [ids[index * 2 + 1]!, ids[index * 2 + 2]!] : null, locked: false };
  });
  return validateLineagePlan({ schemaVersion: 1, rootId: ids[0], nodes });
}

export interface LineageSlot {
  nodeId: string;
  depth: number;
  /** Position in the current tree, independent of stable factor-owner identity. */
  path: string;
  label: string;
  slotKey?: SlotKey;
  parentNodeId?: string;
}

const topLabels: Record<SlotKey, string> = { target: '본육성 대상', parentA: '부모 A', parentB: '부모 B', grandA1: '조부 A1', grandA2: '조부 A2', grandB1: '조부 B1', grandB2: '조부 B2' };
export function getLineageSlots(plan: DeepReadonly<LineagePlan>): LineageSlot[] {
  const checked = validateLineagePlan(plan);
  const queue: LineageSlot[] = [{ nodeId: checked.rootId, depth: 0, path: '', label: topLabels.target, slotKey: 'target' }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    checked.nodes[current.nodeId]!.parentIds?.forEach((id, side) => {
      const depth = current.depth + 1;
      const position = queue.length;
      const slotKey = SLOT_KEYS[position];
      queue.push({ nodeId: id, depth, path: `${current.path}${side === 0 ? 'L' : 'R'}`,
        label: slotKey ? topLabels[slotKey] : `${depth === 3 ? '증조' : '고조'} ${position - (2 ** depth - 1) + 1}`,
        ...(slotKey ? { slotKey } : {}), parentNodeId: current.nodeId });
    });
  }
  return queue;
}

export function getLineageSlotMap(plan: DeepReadonly<LineagePlan>): Record<SlotKey, string> {
  return Object.fromEntries(getLineageSlots(plan).filter((slot) => slot.slotKey).map((slot) => [slot.slotKey, slot.nodeId])) as Record<SlotKey, string>;
}

export function extractPedigree(plan: DeepReadonly<LineagePlan>): Pedigree {
  const map = getLineageSlotMap(plan);
  return Object.fromEntries(SLOT_KEYS.map((key) => {
    const node = plan.nodes[map[key]]!;
    return [key, { costumeId: node.costumeId, redFactor: node.redFactor ? { ...node.redFactor } : null }];
  })) as Pedigree;
}

export function getInheritedNodeIds(plan: DeepReadonly<LineagePlan>, nodeId: string): string[] {
  const node = plan.nodes[nodeId];
  if (!node) throw new Error('존재하지 않는 계보 노드입니다.');
  const direct = node.parentIds ?? [];
  return [...direct, ...direct.flatMap((id) => [...(plan.nodes[id]?.parentIds ?? [])])];
}

function olderSubtree(plan: DeepReadonly<LineagePlan>, nodeId: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => { if (ids.includes(id)) return; ids.push(id); plan.nodes[id]?.parentIds?.forEach(visit); };
  visit(nodeId);
  return ids;
}

export function getProtectedNodeIds(plan: DeepReadonly<LineagePlan>): Set<string> {
  const result = new Set<string>();
  for (const node of Object.values(plan.nodes)) if (node.locked) olderSubtree(plan, node.nodeId).forEach((id) => result.add(id));
  return result;
}

export function updateLineageNode(plan: DeepReadonly<LineagePlan>, nodeId: string, patch: Partial<Pick<LineageNode, 'costumeId' | 'redFactor'>>): LineagePlan {
  const next = validateLineagePlan(plan);
  const node = next.nodes[nodeId];
  if (!node) throw new Error('존재하지 않는 계보 노드입니다.');
  if (getProtectedNodeIds(plan).has(nodeId)) throw new Error('보유·고정 혈통의 캐릭터와 인자는 변경할 수 없습니다.');
  if (patch.costumeId !== undefined) node.costumeId = patch.costumeId;
  if (patch.redFactor !== undefined) node.redFactor = patch.redFactor ? { ...patch.redFactor } : null;
  return validateLineagePlan(next);
}

export function setLineageLock(plan: DeepReadonly<LineagePlan>, nodeId: string, locked: boolean): LineagePlan {
  const next = validateLineagePlan(plan);
  const node = next.nodes[nodeId];
  if (!node) throw new Error('존재하지 않는 계보 노드입니다.');
  const protectedByOther = Object.values(plan.nodes).some((owner) => owner.locked && owner.nodeId !== nodeId && olderSubtree(plan, owner.nodeId).includes(nodeId));
  if (protectedByOther && node.locked !== locked) throw new Error('아래 세대의 고정 혈통에 속합니다. 먼저 해당 혈통의 고정을 해제하세요.');
  const realOwners = new Set(getLineageSlots(plan).filter(slot => slot.depth <= 2).map(slot => slot.nodeId));
  if (locked && olderSubtree(plan, nodeId).some((id) => realOwners.has(id) && plan.nodes[id]!.redFactor && !plan.nodes[id]!.costumeId)) {
    throw new Error('혈통을 고정하려면 인자가 있는 각 슬롯의 캐릭터를 선택하세요.');
  }
  node.locked = locked;
  return validateLineagePlan(next);
}

export function updateLineageFromPedigree(plan: DeepReadonly<LineagePlan>, pedigree: DeepReadonly<Pedigree>): LineagePlan {
  const next = validateLineagePlan(plan);
  const selected = pedigreeSchema.parse(pedigree);
  const positions = getLineageSlotMap(plan);
  const protectedIds = getProtectedNodeIds(plan);
  for (const key of SLOT_KEYS) {
    const node = next.nodes[positions[key]]!;
    if (node.costumeId === selected[key].costumeId && JSON.stringify(node.redFactor) === JSON.stringify(selected[key].redFactor)) continue;
    if (protectedIds.has(node.nodeId)) throw new Error(`${topLabels[key]}는 보유·고정 혈통입니다.`);
    node.costumeId = selected[key].costumeId;
    node.redFactor = selected[key].redFactor ? { ...selected[key].redFactor } : null;
  }
  return validateLineagePlan(next);
}

export function applyLineageGrandparentArrangement(plan: DeepReadonly<LineagePlan>, sourceSlotKeys: readonly GrandparentSlotKey[]): LineagePlan {
  if (sourceSlotKeys.length !== 4 || new Set(sourceSlotKeys).size !== 4 || sourceSlotKeys.some((key) => !['grandA1', 'grandA2', 'grandB1', 'grandB2'].includes(key))) throw new Error('조부모 네 인자 소유자를 중복 없이 지정하세요.');
  const next = validateLineagePlan(plan);
  const positions = getLineageSlotMap(plan);
  const protectedIds = getProtectedNodeIds(plan);
  const parentA = next.nodes[positions.parentA]!;
  const parentB = next.nodes[positions.parentB]!;
  const selected = sourceSlotKeys.map((key) => positions[key]);
  const assignments: [LineageNode, [string, string]][] = [[parentA, [selected[0]!, selected[1]!]], [parentB, [selected[2]!, selected[3]!]]];
  for (const [node, parents] of assignments) {
    if (protectedIds.has(node.nodeId)) {
      if (!parents.every((id) => node.parentIds?.includes(id))) throw new Error('고정된 부모의 실제 조부모 혈통을 재배치할 수 없습니다.');
      continue;
    }
    node.parentIds = parents;
  }
  return validateLineagePlan(next);
}

export type LineageGoalType = AptitudeKey;
