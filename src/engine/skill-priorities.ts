import type { DeepReadonly } from '../data/snapshot';
import type { P3Skill, P3Snapshot } from '../domain/skill-support';
import type { SkillEvaluation } from './skill-evaluation';

export type SkillPriorityLevel = 'preferred' | 'strong' | 'required';
export interface UserSkillPriority { skillId: string; priority: SkillPriorityLevel }
export type PrioritySkillData = Pick<DeepReadonly<P3Snapshot>, 'skills' | 'skillRelations'>;
export const MAX_SKILL_PRIORITIES = 10;
/** User preference policy points, never measured game performance. */
export const SKILL_PRIORITY_BONUSES: Readonly<Record<SkillPriorityLevel, number>> = Object.freeze({ preferred: 8, strong: 24, required: 0 });
export const SKILL_PRIORITY_LABELS: Readonly<Record<SkillPriorityLevel, string>> = Object.freeze({ preferred: '우선 확보', strong: '강력 우대', required: '필수 확보' });

export interface PriorityTargetResolution {
  status: 'resolved' | 'ambiguous' | 'unsupported' | 'unknown';
  requestedSkillId: string; skillId: string | null; path: string[]; message: string;
}

/** Resolve only explicit lower_skill edges. Similar names and generic variants are not identities. */
export function resolvePriorityTarget(snapshot: PrioritySkillData, requestedSkillId: string): PriorityTargetResolution {
  const skills = new Map(snapshot.skills.map((row) => [row.skillId, row]));
  const original = skills.get(requestedSkillId);
  const inheritedTargets = new Set(snapshot.skillRelations.filter((row) => row.relation === 'inherited_version').map((row) => row.relatedSkillId));
  const result = (status: PriorityTargetResolution['status'], skillId: string | null, path: string[], message: string): PriorityTargetResolution => ({ status, requestedSkillId, skillId, path, message });
  if (!original) return result('unknown', null, [], '기존 스킬 ID에 대응하는 자료가 없습니다.');
  if (original.rarity !== 1 && original.rarity !== 2 || inheritedTargets.has(original.skillId)) return result('unsupported', null, [requestedSkillId], '고유·진화·계승 전용 스킬은 일반 백인자 목표로 변환하지 않습니다.');
  const lower = new Map<string, Set<string>>();
  for (const relation of snapshot.skillRelations) {
    if (relation.relation !== 'lower_skill') continue;
    const targets = lower.get(relation.skillId) ?? new Set<string>();
    targets.add(relation.relatedSkillId); lower.set(relation.skillId, targets);
  }
  const path = [requestedSkillId];
  let current = original;
  for (;;) {
    const next = [...(lower.get(current.skillId) ?? [])].filter((id) => {
      const target = skills.get(id);
      return target !== undefined && !inheritedTargets.has(id) && (target.rarity === 1 || current.rarity === 2 && target.rarity === 2);
    });
    if (next.length > 1) return result('ambiguous', null, path, '일반 하위 스킬 대응이 여러 개여서 자동 연결하지 않습니다.');
    if (!next.length) {
      if (current.rarity !== 1) return result('unsupported', null, path, '검증된 일반 하위 스킬 관계가 없어 자동 변환하지 않습니다.');
      return result('resolved', current.skillId, path, original.rarity === 2
        ? '명시적 하위 관계의 일반 백인자 목표를 선택합니다. 금색 자체를 백인자로 등록하지 않습니다.'
        : path.length > 1 ? '명시적 하위 관계로 연결된 같은 일반 백인자 목표 계열입니다.' : '기존 일반 스킬 ID를 그대로 사용합니다.');
    }
    const id = next[0]!;
    if (path.includes(id)) return result('ambiguous', null, path, '하위 스킬 관계가 순환하여 자동 연결하지 않습니다.');
    path.push(id); current = skills.get(id)!;
  }
}

export function resolveCanonicalWhiteSkillId(snapshot: PrioritySkillData, skillId: string): string | null {
  const resolution = resolvePriorityTarget(snapshot, skillId);
  return resolution.status === 'resolved' ? resolution.skillId : null;
}

/** Canonical duplicates are one preference and one bonus; the strongest explicit choice wins. */
export function normalizeSkillPriorities(
  snapshot: PrioritySkillData, input: readonly UserSkillPriority[] | undefined,
): UserSkillPriority[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new RangeError('스킬 우선순위는 목록이어야 합니다.');
  const ranks: Record<SkillPriorityLevel, number> = { preferred: 0, strong: 1, required: 2 };
  const unique = new Map<string, UserSkillPriority>();
  for (const candidate of input as readonly unknown[]) {
    if (!candidate || typeof candidate !== 'object') throw new RangeError('스킬 ID와 우선순위 등급을 확인하세요.');
    const row = candidate as Partial<UserSkillPriority>;
    if (typeof row.skillId !== 'string' || row.priority === undefined || !Object.hasOwn(ranks, row.priority)) throw new RangeError('스킬 ID와 우선순위 등급을 확인하세요.');
    const resolved = resolvePriorityTarget(snapshot, row.skillId);
    if (resolved.status !== 'resolved' || resolved.skillId === null) throw new RangeError(`${row.skillId}: ${resolved.message}`);
    const previous = unique.get(resolved.skillId);
    if (!previous || ranks[row.priority] > ranks[previous.priority]) unique.set(resolved.skillId, { skillId: resolved.skillId, priority: row.priority });
  }
  if (unique.size > MAX_SKILL_PRIORITIES) throw new RangeError(`스킬 우선순위는 최대 ${MAX_SKILL_PRIORITIES}개입니다.`);
  return [...unique.values()];
}

/** Korean source labels first, Japanese fallback next; display aliases never merge IDs. */
export function prioritySkillName(skill: DeepReadonly<P3Skill>): string {
  return skill.nameKo ?? skill.nameJa ?? skill.displayName;
}

export const QUICK_SKILL_PRIORITY_IDS = Object.freeze([
  { skillId: '201601', nameJa: '地固め', label: '터다지기' },
  { skillId: '200452', nameJa: 'ポジションセンス', label: '포지션 센스' },
  { skillId: '201262', nameJa: '危険回避', label: '위험 회피' },
  { skillId: '201332', nameJa: '巧みなステップ', label: '교묘한 스텝' },
  { skillId: '200432', nameJa: '集中力', label: '집중력' },
]);

export function getQuickSkillPriorities(snapshot: PrioritySkillData) {
  return QUICK_SKILL_PRIORITY_IDS.filter((item) => {
    const skill = snapshot.skills.find((row) => row.skillId === item.skillId);
    return skill?.rarity === 1 && skill.nameJa === item.nameJa && resolveCanonicalWhiteSkillId(snapshot, item.skillId) === item.skillId;
  });
}

export function skillPriorityWarnings(row: SkillEvaluation | undefined): string[] {
  if (!row) return ['현재 대회 조건의 평가 자료를 확인하지 못했습니다. 실제 수급 경로는 추천 계산에서 확인합니다.'];
  const warnings: string[] = [];
  if (row.availability.state === 'unavailable') warnings.push('선택한 출시 환경에서 제외됩니다. 선호도만으로 확보 처리하지 않습니다.');
  else if (row.availability.state === 'unknown') warnings.push('선택한 출시 환경의 수급 가능성은 확인 필요입니다.');
  if (row.applicability === 'inapplicable') warnings.push('현재 대회·각질에 비해당입니다. 지정해도 기본 유효 평가를 올리지 않습니다.');
  else if (row.applicability === 'unverified' || row.grade === 'unverified') warnings.push('효과·발동 조건이 미검증입니다. 사용자 선호는 게임 유효성 인증이 아닙니다.');
  else if (row.grade === 'excluded') warnings.push('기본 추천의 객관적 평가에서는 제외된 목표입니다.');
  return warnings;
}
