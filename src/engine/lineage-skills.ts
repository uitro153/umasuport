import type { DeepReadonly } from '../data/snapshot';
import type { P3Snapshot } from '../domain/skill-support';
import { dateOnlySchema } from '../domain/primitives';
import { getLineageSlots, validateLineagePlan, type LineagePlan } from '../domain/lineage';
import { createEmptyLineageSkills, validateLineageSkillState, type LineageSkillState, type NodeWhiteFactors, type WhiteFactorRecord, type WhiteInventoryStatus } from '../domain/lineage-skills';
import type { P4RecommendationRequest } from './support-deck-optimizer';
import { normalizeSkillPriorities, resolvePriorityTarget, type PrioritySkillData, type UserSkillPriority } from './skill-priorities';
import { getP3Availability } from './support-acquisition';

export interface WhiteFactorClassification {
  skillId: string | null; status: 'verified' | 'review-required' | 'unsupported'; evidence: string[];
}
/** Current source packs have no white-factor eligibility table. Acquisition,
 * rarity and a lower-skill relation do not prove factor-generation eligibility. */
export function classifyWhiteFactor(snapshot: PrioritySkillData, id: string): WhiteFactorClassification {
  const result = resolvePriorityTarget(snapshot, id);
  if (result.status !== 'resolved' || result.skillId === null) return { skillId: null, status: 'unsupported', evidence: [result.message] };
  return { skillId: result.skillId, status: 'review-required', evidence: [
    result.message,
    '기존 ID·명시적 하위 관계만 확인했습니다. 백인자 대상 여부를 확인하는 원본 표가 없어 분류 검토가 필요합니다.',
  ] };
}
function owner(plan: DeepReadonly<LineagePlan>, nodeId: string) {
  const node = plan.nodes[nodeId];
  if (!node) throw new RangeError('존재하지 않는 인자 소유 노드입니다.');
  return node.costumeId;
}
function boundNode(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, nodeId: string): DeepReadonly<NodeWhiteFactors> | undefined {
  const record = state.nodes[nodeId];
  return record?.ownerCostumeId === owner(plan, nodeId) ? record : undefined;
}
function editableNode(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, nodeId: string) {
  const next = validateLineageSkillState(state);
  const ownerCostumeId = owner(plan, nodeId);
  if (!next.nodes[nodeId] || next.nodes[nodeId]!.ownerCostumeId !== ownerCostumeId) next.nodes[nodeId] = { nodeId, ownerCostumeId, inventoryStatus: 'unentered', records: [] };
  return { next, node: next.nodes[nodeId]! };
}
/** Only an explicit user edit invokes these functions, including locked nodes.
 * They never modify any P2 character, red factor, lock or parent link. */
export function upsertWhiteFactor(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, snapshot: PrioritySkillData,
  nodeId: string, input: { skillId: string; stars: 1 | 2 | 3 | null; status: 'owned' | 'planned' }): LineageSkillState {
  const classification = classifyWhiteFactor(snapshot, input.skillId);
  if (!classification.skillId || classification.status === 'unsupported') throw new RangeError(classification.evidence.join(' '));
  const skill = snapshot.skills.find((row) => row.skillId === classification.skillId)!;
  const { next, node } = editableNode(state, plan, nodeId);
  if (input.status === 'owned' && node.ownerCostumeId === null) throw new RangeError('실제 보유를 기록하려면 해당 인자 소유 캐릭터를 먼저 선택하세요.');
  const record: WhiteFactorRecord = { skillId: classification.skillId, nameKo: skill.nameKo, nameJa: skill.nameJa,
    stars: input.stars, status: input.status, userEntered: true,
    classification: { status: classification.status, evidence: classification.evidence } };
  node.records = node.records.filter((row) => row.skillId !== record.skillId || row.status !== record.status).concat(record);
  if (input.status === 'owned' && node.inventoryStatus === 'unentered') node.inventoryStatus = 'partial';
  return validateLineageSkillState(next);
}
export function removeWhiteFactor(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, nodeId: string,
  skillId: string, status: WhiteFactorRecord['status']): LineageSkillState {
  const { next, node } = editableNode(state, plan, nodeId);
  node.records = node.records.filter((row) => row.skillId !== skillId || row.status !== status);
  return validateLineageSkillState(next);
}
export function setWhiteInventoryStatus(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, nodeId: string,
  status: WhiteInventoryStatus): LineageSkillState {
  const { next, node } = editableNode(state, plan, nodeId);
  node.inventoryStatus = status;
  return validateLineageSkillState(next);
}
export function getNodeSkillPriorities(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, nodeId: string): UserSkillPriority[] {
  const value = state.nodePriorities[nodeId];
  return value?.ownerCostumeId === owner(plan, nodeId) ? value.priorities.map((row) => ({ ...row })) : [];
}
export function setNodeSkillPriorities(state: DeepReadonly<LineageSkillState>, plan: DeepReadonly<LineagePlan>, snapshot: PrioritySkillData,
  nodeId: string, priorities: readonly UserSkillPriority[]): LineageSkillState {
  const next = validateLineageSkillState(state);
  next.nodePriorities[nodeId] = { ownerCostumeId: owner(plan, nodeId), priorities: normalizeSkillPriorities(snapshot, priorities) };
  return validateLineageSkillState(next);
}
export function mergeLineagePriorities(snapshot: PrioritySkillData, global: readonly UserSkillPriority[], local: readonly UserSkillPriority[]): UserSkillPriority[] {
  return normalizeSkillPriorities(snapshot, [...global, ...local]);
}
/** Stable owner nodes move with rearrangements. A replacement (including same
 * node ID with another costume) invalidates both records and local goals. A
 * complete user-requested reset must also reset this separate session layer. */
export function reconcileLineageSkills(previous: DeepReadonly<LineagePlan>, next: DeepReadonly<LineagePlan>, state: DeepReadonly<LineageSkillState>): LineageSkillState {
  validateLineagePlan(previous); validateLineagePlan(next);
  const result = createEmptyLineageSkills();
  const valid = (id: string, costumeId: string | null) => previous.nodes[id] !== undefined && next.nodes[id] !== undefined
    && previous.nodes[id]!.costumeId === next.nodes[id]!.costumeId && next.nodes[id]!.costumeId === costumeId;
  const checked = validateLineageSkillState(state);
  for (const [id, node] of Object.entries(checked.nodes)) if (valid(id, node.ownerCostumeId)) result.nodes[id] = node;
  for (const [id, value] of Object.entries(checked.nodePriorities)) if (valid(id, value.ownerCostumeId)) result.nodePriorities[id] = value;
  return result;
}

export type LineageSkillRelation = 'self' | 'parent' | 'grandparent' | 'deeper' | 'other';
export interface LineageFactorNodeView {
  nodeId: string; costumeId: string | null; depth: number; label: string; relation: LineageSkillRelation;
  inventoryStatus: WhiteInventoryStatus; owned: WhiteFactorRecord[]; planned: WhiteFactorRecord[];
}
export interface LineageSkillAnalysis {
  selectedNodeId: string; depth: number; stage: 'final' | 'parent' | 'grandparent' | 'deep';
  self: LineageFactorNodeView; parents: LineageFactorNodeView[]; grandparents: LineageFactorNodeView[];
  deeper: LineageFactorNodeView[]; allNodes: LineageFactorNodeView[]; missingAncestorSlots: number; unknownNodeIds: string[];
}
export function analyzeLineageSkills(plan: DeepReadonly<LineagePlan>, state: DeepReadonly<LineageSkillState>, nodeId: string): LineageSkillAnalysis {
  const slots = getLineageSlots(plan);
  const selected = slots.find((slot) => slot.nodeId === nodeId);
  if (!selected) throw new RangeError('존재하지 않는 육성 대상입니다.');
  const parents = new Set(plan.nodes[nodeId]!.parentIds ?? []);
  const grandparents = new Set([...parents].flatMap((id) => [...(plan.nodes[id]!.parentIds ?? [])]));
  const older = new Set<string>();
  const visit = (id: string) => { for (const ancestor of plan.nodes[id]!.parentIds ?? []) { older.add(ancestor); visit(ancestor); } };
  visit(nodeId);
  const allNodes = slots.map((slot): LineageFactorNodeView => {
    const record = boundNode(state, plan, slot.nodeId);
    const rows = record?.records.map((row) => ({ ...row, classification: { ...row.classification, evidence: [...row.classification.evidence] } })) ?? [];
    return { nodeId: slot.nodeId, costumeId: plan.nodes[slot.nodeId]!.costumeId, depth: slot.depth, label: slot.label,
      relation: slot.nodeId === nodeId ? 'self' : parents.has(slot.nodeId) ? 'parent' : grandparents.has(slot.nodeId) ? 'grandparent' : older.has(slot.nodeId) ? 'deeper' : 'other',
      inventoryStatus: record?.inventoryStatus ?? 'unentered', owned: rows.filter((row) => row.status === 'owned'), planned: rows.filter((row) => row.status === 'planned') };
  });
  const relevant = allNodes.filter((row) => ['self', 'parent', 'grandparent'].includes(row.relation));
  return { selectedNodeId: nodeId, depth: selected.depth, stage: selected.depth === 0 ? 'final' : selected.depth === 1 ? 'parent' : selected.depth === 2 ? 'grandparent' : 'deep',
    self: allNodes.find((row) => row.nodeId === nodeId)!, parents: allNodes.filter((row) => row.relation === 'parent'),
    grandparents: allNodes.filter((row) => row.relation === 'grandparent'), deeper: allNodes.filter((row) => row.relation === 'deeper'), allNodes,
    missingAncestorSlots: 6 - parents.size - grandparents.size, unknownNodeIds: relevant.filter((row) => row.inventoryStatus !== 'reviewed').map((row) => row.nodeId) };
}
export function getLineageSkillPresence(analysis: LineageSkillAnalysis, skillId: string) {
  const has = (row: LineageFactorNodeView) => row.owned.some((record) => record.skillId === skillId);
  const ownedLocations = analysis.allNodes.filter(has);
  return { skillId, ownedLocations, plannedLocations: analysis.allNodes.filter((row) => row.planned.some((record) => record.skillId === skillId)),
    selfOwned: ownedLocations.filter((row) => row.relation === 'self'), parentOwned: ownedLocations.filter((row) => row.relation === 'parent'),
    grandparentOwned: ownedLocations.filter((row) => row.relation === 'grandparent'), deeperOwned: ownedLocations.filter((row) => row.relation === 'deeper'),
    otherOwned: ownedLocations.filter((row) => row.relation === 'other'), duplicateOwnedCount: ownedLocations.length,
    unknownNodeIds: analysis.allNodes.filter((row) => ['self', 'parent', 'grandparent'].includes(row.relation) && row.inventoryStatus !== 'reviewed' && !has(row)).map((row) => row.nodeId),
    confirmedAbsentNodeIds: analysis.allNodes.filter((row) => ['self', 'parent', 'grandparent'].includes(row.relation) && row.inventoryStatus === 'reviewed' && !has(row)).map((row) => row.nodeId) };
}
export interface LineageRecommendationOptions {
  plan: DeepReadonly<LineagePlan>; state: DeepReadonly<LineageSkillState>; nodeId: string;
  globalPriorities?: readonly UserSkillPriority[]; includeGlobal?: boolean; mode: 'current' | 'forecast'; today: string;
}
/** Records remain context only. No owned/planned factor changes game scores or
 * removes a target; only the user's explicitly selected P6 priorities enter. */
export function buildLineageRecommendationRequest(snapshot: DeepReadonly<P3Snapshot>, base: P4RecommendationRequest,
  options: LineageRecommendationOptions): P4RecommendationRequest {
  const analysis = analyzeLineageSkills(options.plan, options.state, options.nodeId);
  const priorities = mergeLineagePriorities(snapshot, options.includeGlobal ? options.globalPriorities ?? [] : [],
    getNodeSkillPriorities(options.state, options.plan, options.nodeId));
  if (options.mode === 'forecast' && !base.forecast) throw new RangeError('미래시 설계에는 선택 대회의 일본 출시 순서 근거가 필요합니다.');
  dateOnlySchema.parse(options.today);
  const result: P4RecommendationRequest = { ...base, deck: analysis.depth === 0 ? base.deck : [],
    cutoffDate: options.mode === 'current' ? options.today : base.cutoffDate,
    allowForecast: options.mode === 'forecast', forecast: options.mode === 'current' ? undefined : base.forecast };
  delete result.skillPriorityBonuses;
  if (result.scenarioId && getP3Availability(snapshot, 'scenario', result.scenarioId, result.cutoffDate, result.allowForecast, result.forecast).state !== 'available') {
    throw new RangeError('선택한 시나리오는 이 인자작 시점에서 가용성을 확인하지 못했습니다. 현재 가용 시나리오를 선택하세요.');
  }
  if (priorities.length) result.skillPriorities = priorities; else delete result.skillPriorities;
  return result;
}
