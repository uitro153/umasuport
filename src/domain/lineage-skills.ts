import { z } from 'zod';
import { idSchema } from './primitives';
import type { UserSkillPriority } from '../engine/skill-priorities';

/** Session-only user observations/plans. This is not a P2 or game DB schema. */
export const whiteFactorRecordSchema = z.strictObject({
  skillId: idSchema,
  nameKo: z.string().nullable(), nameJa: z.string().nullable(),
  stars: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  status: z.enum(['owned', 'planned']),
  userEntered: z.literal(true),
  classification: z.strictObject({
    status: z.enum(['verified', 'review-required']), evidence: z.array(z.string()).min(1),
  }),
});
export type WhiteFactorRecord = z.infer<typeof whiteFactorRecordSchema>;
export type WhiteInventoryStatus = 'unentered' | 'partial' | 'reviewed';
export const nodeWhiteFactorsSchema = z.strictObject({
  nodeId: idSchema, ownerCostumeId: idSchema.nullable(),
  inventoryStatus: z.enum(['unentered', 'partial', 'reviewed']),
  records: z.array(whiteFactorRecordSchema),
}).superRefine((node, context) => {
  const seen = new Set<string>();
  node.records.forEach((record, index) => {
    const key = `${record.skillId}:${record.status}`;
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['records', index], message: '같은 스킬·상태는 한 인자 소유자에게 한 번만 기록합니다.' });
    seen.add(key);
    if (record.status === 'owned' && node.ownerCostumeId === null) context.addIssue({ code: 'custom', path: ['records', index], message: '실제 보유 기록에는 선택된 인자 소유 캐릭터가 필요합니다.' });
  });
  if (node.inventoryStatus !== 'unentered' && node.ownerCostumeId === null) context.addIssue({ code: 'custom', path: ['inventoryStatus'], message: '실제 목록 확인은 인자 소유 캐릭터를 선택한 뒤 기록합니다.' });
  if (node.inventoryStatus === 'unentered' && node.records.some((row) => row.status === 'owned')) context.addIssue({ code: 'custom', path: ['inventoryStatus'], message: '실제 보유 기록이 있으면 부분 입력 또는 목록 확인 상태로 표시하세요.' });
});
export type NodeWhiteFactors = z.infer<typeof nodeWhiteFactorsSchema>;
const prioritySchema = z.strictObject({ skillId: idSchema, priority: z.enum(['preferred', 'strong', 'required']) });
export const lineageSkillStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodes: z.record(idSchema, nodeWhiteFactorsSchema),
  nodePriorities: z.record(idSchema, z.strictObject({
    ownerCostumeId: idSchema.nullable(), priorities: z.array(prioritySchema).max(10),
  })),
}).superRefine((state, context) => {
  for (const [id, node] of Object.entries(state.nodes)) if (id !== node.nodeId) {
    context.addIssue({ code: 'custom', path: ['nodes', id, 'nodeId'], message: '백인자 소유 노드 ID가 키와 일치해야 합니다.' });
  }
  for (const [id, value] of Object.entries(state.nodePriorities)) {
    if (new Set(value.priorities.map((row) => row.skillId)).size !== value.priorities.length) context.addIssue({ code: 'custom', path: ['nodePriorities', id], message: '노드별 우선순위의 스킬 ID는 중복될 수 없습니다.' });
  }
});
export type LineageSkillState = z.infer<typeof lineageSkillStateSchema>;
export type NodeSkillPriorities = { ownerCostumeId: string | null; priorities: UserSkillPriority[] };
export function createEmptyLineageSkills(): LineageSkillState { return { schemaVersion: 1, nodes: {}, nodePriorities: {} }; }
export function validateLineageSkillState(input: unknown): LineageSkillState { return lineageSkillStateSchema.parse(input); }
