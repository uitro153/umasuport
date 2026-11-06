import { z } from 'zod';
import { lineagePlanSchema } from './lineage';
import { lineageSkillStateSchema } from './lineage-skills';
import { aptitudeKeySchema } from './pedigree';
import { dateOnlySchema, idSchema, offsetDateTimeSchema } from './primitives';

/** P8 is an adapter over the unchanged P2/P7 and game-data contracts. */
export const SAVED_PLAN_SCHEMA_VERSION = 1;
export const SAVED_PLAN_FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const label = z.string().trim().min(1).max(120);
const uuid = z.uuid().refine(value => value === value.toLowerCase(), 'UUID는 소문자 canonical 표기로 기록해야 합니다.');
const priority = z.strictObject({ skillId: idSchema, priority: z.enum(['preferred', 'strong', 'required']) });
const priorities = z.array(priority).max(10).refine(rows => new Set(rows.map(row => row.skillId)).size === rows.length, '스킬 우선순위 ID는 중복될 수 없습니다.');
const limitBreak = z.number().int().min(0).max(4);
const support = z.strictObject({ supportId: idSchema, limitBreak });
const mainSupport = z.strictObject({ supportId: idSchema.nullable(), limitBreak });
export const dataSnapshotIdsSchema = z.strictObject({ reference: idSchema.nullable(), p3: idSchema.nullable(), p5: idSchema.nullable() });
export type DataSnapshotIds = z.infer<typeof dataSnapshotIdsSchema>;
export const factorInstanceSchema = z.strictObject({
  // A deselected owner retains a null-bound, unconfirmed tombstone. Selecting
  // again creates a new UUID; removing/re-adding cannot certify old ancestors.
  factorInstanceId: uuid, ownerCostumeId: idSchema.nullable(),
  /** User confirmation of the retained links, never game-factor certification. */
  bloodlineStatus: z.enum(['confirmed', 'unconfirmed']),
}).refine(instance => instance.ownerCostumeId !== null || instance.bloodlineStatus === 'unconfirmed', '선택 해제한 인자 개체의 기존 혈통은 재확인이 필요합니다.');
export const factorInstanceStateSchema = z.record(idSchema, factorInstanceSchema);
export type FactorInstanceState = z.infer<typeof factorInstanceStateSchema>;

export const workspaceInputsSchema = z.strictObject({
  referencePlan: lineagePlanSchema,
  whiteFactors: lineageSkillStateSchema,
  factorInstances: factorInstanceStateSchema,
  selectedNodeId: idSchema.nullable(),
  globalPriorities: priorities,
  referenceFilters: z.strictObject({ dateInput: dateOnlySchema, includeUnknown: z.boolean(), allowForecast: z.boolean() }),
  lineageDesign: z.strictObject({
    profileId: z.enum(['none', 'turf-middle-long', 'turf-mile-long', 'mixed-mile-middle']),
    rotationGrade: z.enum(['D', 'C', 'B', 'A']), geneEnabled: z.boolean(), geneType: aptitudeKeySchema,
  }),
  skillSettings: z.strictObject({
    // Empty IDs represent the existing not-yet-loaded P3 UI. Restore validation
    // requires registered IDs before a saved plan can be applied.
    eventId: z.union([idSchema, z.literal('')]), scenarioId: z.union([idSchema, z.literal('')]),
    runningStyle: z.enum(['front', 'pace', 'late', 'end']),
    preference: z.enum(['balanced', 'skills', 'stability']), mode: z.enum(['current', 'tournament']),
    allowForecast: z.boolean(), includeUnknown: z.boolean(),
    deck: z.array(mainSupport).length(6),
    nodeModes: z.record(idSchema, z.enum(['current', 'forecast'])),
  }),
  supportSettings: z.strictObject({
    ownedSupports: z.array(support).max(2000), ownedOnly: z.boolean(), allowBorrow: z.boolean(),
  }),
}).superRefine((inputs, context) => {
  const nodes = inputs.referencePlan.nodes;
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message });
  const nodeExists = (id: string, path: (string | number)[]) => {
    if (!Object.hasOwn(nodes, id)) { issue(path, '계보에 존재하지 않는 소유 노드입니다.'); return false; }
    return true;
  };
  if (inputs.selectedNodeId !== null) nodeExists(inputs.selectedNodeId, ['selectedNodeId']);
  for (const id of Object.keys(inputs.skillSettings.nodeModes)) nodeExists(id, ['skillSettings', 'nodeModes', id]);
  const seen = new Set<string>();
  for (const [id, instance] of Object.entries(inputs.factorInstances)) {
    if (nodeExists(id, ['factorInstances', id]) && nodes[id]!.costumeId !== instance.ownerCostumeId) issue(['factorInstances', id, 'ownerCostumeId'], '인자 개체의 의상과 계보 소유자가 일치해야 합니다.');
    if (seen.has(instance.factorInstanceId)) issue(['factorInstances', id, 'factorInstanceId'], '서로 다른 소유 노드가 하나의 인자 개체 ID를 공유할 수 없습니다.');
    seen.add(instance.factorInstanceId);
  }
  for (const [id, node] of Object.entries(nodes)) if (node.costumeId !== null && !Object.hasOwn(inputs.factorInstances, id)) issue(['factorInstances', id], '선택된 인자 소유자에는 독립적인 인자 개체 ID가 필요합니다.');
  for (const [id, records] of Object.entries(inputs.whiteFactors.nodes)) {
    if (nodeExists(id, ['whiteFactors', 'nodes', id]) && nodes[id]!.costumeId !== records.ownerCostumeId) issue(['whiteFactors', 'nodes', id, 'ownerCostumeId'], '백인자 소유 의상이 계보와 일치하지 않습니다.');
  }
  for (const [id, value] of Object.entries(inputs.whiteFactors.nodePriorities)) {
    if (nodeExists(id, ['whiteFactors', 'nodePriorities', id]) && nodes[id]!.costumeId !== value.ownerCostumeId) issue(['whiteFactors', 'nodePriorities', id, 'ownerCostumeId'], '노드별 목표의 소유 의상이 계보와 일치하지 않습니다.');
  }
  const supportIds = inputs.supportSettings.ownedSupports.map(row => row.supportId);
  if (new Set(supportIds).size !== supportIds.length) issue(['supportSettings', 'ownedSupports'], '보유 서포트 ID는 중복될 수 없습니다.');
  const deckIds = inputs.skillSettings.deck.flatMap(row => row.supportId === null ? [] : [row.supportId]);
  if (new Set(deckIds).size !== deckIds.length) issue(['skillSettings', 'deck'], '본육성 서포트 ID는 중복될 수 없습니다.');
});
export type WorkspaceInputs = z.infer<typeof workspaceInputsSchema>;

const eventDecision = z.strictObject({
  supportId: idSchema, groupId: idSchema, eventIds: z.array(idSchema), label: z.string().max(2000),
  optionId: idSchema, skillIds: z.array(idSchema).max(10000), assurance: z.enum(['possible', 'guaranteed', 'unknown']),
  outcome: z.enum(['success', 'failure', 'unspecified']), evidence: z.string().max(10000),
  condition: z.string().max(10000).nullable(), probability: z.null(),
});
export const savedResultSnapshotSchema = z.strictObject({
  inputSignature: z.string().min(1).max(200000), calculatedAt: offsetDateTimeSchema,
  snapshotIds: dataSnapshotIdsSchema,
  cards: z.array(support.extend({ ownership: z.enum(['owned', 'borrowed', 'unregistered']) })).length(6),
  score: z.strictObject({ coverageValue: z.number().finite(), preferenceBonus: z.number().finite(), customizedValue: z.number().finite() }),
  skillIds: z.array(idSchema).max(10000), greenSkillIds: z.array(idSchema).max(10000),
  eventDecisions: z.array(eventDecision).max(2000).optional(),
}).superRefine((result, context) => {
  if (new Set(result.cards.map(card => card.supportId)).size !== result.cards.length) context.addIssue({ code: 'custom', path: ['cards'], message: '저장 당시 추천 6장의 ID가 중복됩니다.' });
});
export type SavedResultSnapshot = z.infer<typeof savedResultSnapshotSchema>;
export const savedPlanSchema = z.strictObject({
  contract: z.literal('uma-saved-plan'), schemaVersion: z.literal(SAVED_PLAN_SCHEMA_VERSION), formatVersion: z.literal(SAVED_PLAN_FORMAT_VERSION),
  planId: uuid, name: label, createdAt: offsetDateTimeSchema, updatedAt: offsetDateTimeSchema,
  appVersion: z.string().trim().min(1).max(80), snapshotIds: dataSnapshotIdsSchema,
  inputs: workspaceInputsSchema, resultSnapshot: savedResultSnapshotSchema.optional(),
}).superRefine((plan, context) => {
  if (Date.parse(plan.updatedAt) < Date.parse(plan.createdAt)) context.addIssue({ code: 'custom', path: ['updatedAt'], message: '수정일은 생성일보다 빠를 수 없습니다.' });
});
export type SavedPlan = z.infer<typeof savedPlanSchema>;

export function validateWorkspaceInputs(input: unknown): WorkspaceInputs { return workspaceInputsSchema.parse(input); }
export function validateSavedPlan(input: unknown): SavedPlan { return savedPlanSchema.parse(input); }
