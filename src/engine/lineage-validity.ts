import type { DeepReadonly } from '../data/snapshot';
import { createLineagePlan, getLineageSlots, type LineagePlan } from '../domain/lineage';
import type { Pedigree } from '../domain/pedigree';
import type { ReferenceSnapshot } from '../domain/reference';

type Characters = Pick<DeepReadonly<ReferenceSnapshot>, 'costumes'>;
export interface LineageCharacterIssue { key: string; nodeIds: string[]; message: string }

/** Only the seven actual characters participate. Legacy deep owners are retained
 * in saves but represent mob slots, never duplicate characters. */
export function findLineageCharacterIssues(plan: DeepReadonly<LineagePlan>, snapshot: Characters): LineageCharacterIssue[] {
  const costumes = new Map(snapshot.costumes.map(row => [row.costumeId, row]));
  const slots = getLineageSlots(plan);
  const labels = new Map(slots.map(slot => [slot.nodeId, slot.label]));
  const realOwners = new Set(slots.filter(slot => slot.depth <= 2).map(slot => slot.nodeId));
  const base = (id: string) => realOwners.has(id) ? costumes.get(plan.nodes[id]?.costumeId ?? '')?.baseId : undefined;
  const issues: LineageCharacterIssue[] = [];
  for (const node of Object.values(plan.nodes)) {
    if (!node.parentIds) continue;
    const [a, b] = node.parentIds;
    if (base(a) && base(a) === base(b)) issues.push({ key: `parents:${node.nodeId}:${base(a)}`, nodeIds: [a, b],
      message: `${labels.get(node.nodeId)}의 부모 두 자리에 같은 캐릭터를 사용할 수 없습니다. 의상이 달라도 동일하게 적용합니다.` });
    for (const parent of node.parentIds) if (base(node.nodeId) && base(node.nodeId) === base(parent)) {
      issues.push({ key: `child:${node.nodeId}:${parent}:${base(parent)}`, nodeIds: [node.nodeId, parent],
        message: `${labels.get(node.nodeId)}와 직접 부모 ${labels.get(parent)}는 서로 다른 캐릭터여야 합니다.` });
    }
  }
  return issues;
}

export function findPedigreeCharacterIssues(pedigree: DeepReadonly<Pedigree>, snapshot: Characters): LineageCharacterIssue[] {
  return findLineageCharacterIssues(createLineagePlan(pedigree), snapshot);
}

/** Old invalid saves remain editable: reject newly introduced conflicts, never erase records. */
export function lineageEditIssue(before: DeepReadonly<LineagePlan>, after: DeepReadonly<LineagePlan>, snapshot: Characters): string | undefined {
  const existing = new Set(findLineageCharacterIssues(before, snapshot).map(issue => issue.key));
  return findLineageCharacterIssues(after, snapshot).find(issue => !existing.has(issue.key))?.message;
}
