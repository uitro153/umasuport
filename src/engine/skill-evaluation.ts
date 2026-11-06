import type { DeepReadonly } from '../data/snapshot';
import type { P3Skill, P3Snapshot } from '../domain/skill-support';
import { analyzeSupportDeck, getP3Availability, type DeckAnalysis, type MainSupportSelection, type SkillAcquisitionRoute } from './support-acquisition';
import { combineAnd, combineOr, evaluateSkillCondition, type ConditionMatch, type RunningStyle, type SkillCourseContext } from './skill-conditions';
import type { ReferenceAvailability } from './reference-availability';
import { buildSkillValueEvidence, type SkillConditionClass, type SkillValueEvidence } from './skill-value-evidence';
import type { P5AvailabilityContext } from './p5-availability';

export type SkillGrade = 'priority' | 'useful' | 'conditional' | 'supplementary' | 'excluded' | 'unverified';
export interface SkillEvaluationRequest {
  course: SkillCourseContext; runningStyle: RunningStyle; cutoffDate: string;
  allowForecast?: boolean; includeUnknown?: boolean; deck?: readonly MainSupportSelection[];
  preference?: 'balanced' | 'skills' | 'stability'; scenarioId?: string | null;
  forecast?: P5AvailabilityContext;
}
export interface SkillEvaluation {
  skillId: string; name: string; rarity: number | null; cost: number | null; totalCost: number | null;
  applicability: ConditionMatch; grade: SkillGrade; costEfficiency: 'good' | 'standard' | 'expensive' | 'unknown';
  reasons: string[]; conditionSummary: string; effectSummary: string;
  passiveStats: string[]; isGreen: boolean; core: 'candidate' | 'not-established';
  bashinGain: null; activationRate: null; routes: SkillAcquisitionRoute[]; availability: ReferenceAvailability;
  dataStatus: string; unknownConditions: string[];
  conditionClass: SkillConditionClass; valueEvidence: SkillValueEvidence;
}
export interface SkillEvaluationResult {
  rows: SkillEvaluation[]; deckAnalysis: DeckAnalysis;
  counts: { total: number; available: number; unknownRelease: number; futureRelease: number; applicable: number; conditional: number; unverified: number; excluded: number };
  warnings: string[];
}

const statLabels: Record<number, string> = { 1: '스피드', 2: '스태미나', 3: '파워', 4: '근성', 5: '지능' };
const effectLabels: Record<number, string> = { ...statLabels, 8: '시야', 9: '회복', 22: '현재 속도', 27: '목표 속도', 28: '코스 이동', 29: '흥분', 31: '가속' };
const gradeOrder: Record<SkillGrade, number> = { priority: 0, useful: 1, conditional: 2, supplementary: 3, unverified: 4, excluded: 5 };

/**
 * Qualitative, source-data-based comparison for this course and one strategy.
 * No race simulation, synthetic bashin gains, activation percentages, overlap penalties,
 * factorization probabilities or P4 support-deck optimization are computed here.
 */
export function evaluateSkills(snapshot: DeepReadonly<P3Snapshot>, request: SkillEvaluationRequest): SkillEvaluationResult {
  if (!Number.isFinite(request.course.distanceM) || request.course.distanceM <= 0) throw new RangeError('실제 대회 거리가 필요합니다.');
  const deckAnalysis = analyzeSupportDeck(snapshot, request.deck ?? [], request.cutoffDate, request.allowForecast, request.forecast);
  const skillMap = new Map(snapshot.skills.map((row) => [row.skillId, row]));
  const lowerMap = new Map<string, string[]>();
  for (const relation of snapshot.skillRelations) if (relation.relation === 'lower_skill') {
    const ids = lowerMap.get(relation.skillId) ?? []; ids.push(relation.relatedSkillId); lowerMap.set(relation.skillId, ids);
  }
  const inheritedIds = new Set(snapshot.skillRelations.filter((row) => row.relation === 'inherited_version').map((row) => row.relatedSkillId));
  const revisions = new Map(snapshot.skillRevisions.filter((row) => row.server === 'KR').map((row) => [row.skillId, row]));
  const courseRecord = snapshot.courses.find((course) => course.courseId === request.course.courseId);
  const counts: SkillEvaluationResult['counts'] = { total: snapshot.skills.length, available: 0, unknownRelease: 0, futureRelease: 0, applicable: 0, conditional: 0, unverified: 0, excluded: 0 };
  const rows: SkillEvaluation[] = [];
  for (const skill of snapshot.skills) {
    const availability = getP3Availability(snapshot, 'skill', skill.skillId, request.cutoffDate, request.allowForecast, request.forecast);
    if (availability.state === 'available') counts.available++;
    else if (availability.state === 'unknown') counts.unknownRelease++;
    else counts.futureRelease++;
    const revision = revisions.get(skill.skillId);
    const groups = revision?.conditionGroups.length ? revision.conditionGroups : skill.conditionGroups;
    const results = groups.map((group) => {
      const condition = evaluateSkillCondition(group.condition, request.course, request.runningStyle);
      const precondition = evaluateSkillCondition(group.precondition, request.course, request.runningStyle);
      return { state: combineAnd([condition.state, precondition.state]), unknown: [...condition.unknownVariables, ...precondition.unknownVariables] };
    });
    let applicability: ConditionMatch = groups.length ? combineOr(results.map((row) => row.state)) : 'unverified';
    const effects = groups.flatMap((group, index) => results[index]?.state === 'inapplicable' ? [] : group.effects);
    const isGreen = groups.length > 0 && groups.every((group) => group.baseTime === -1);
    const positiveStats = [...new Set(effects.filter((effect) => effect.value > 0 && statLabels[effect.type]).map((effect) => statLabels[effect.type]!))];
    const speedOrStamina = positiveStats.includes('스피드') || positiveStats.includes('스태미나');
    const guaranteedSpeedOrStamina = groups.some((group, index) => results[index]?.state === 'applicable'
      && group.effects.some((effect) => effect.value > 0 && [1, 2].includes(effect.type)));
    const totalCost = cumulativeCost(skill.skillId, skillMap, lowerMap);
    const costEfficiency = totalCost === null ? 'unknown' : totalCost <= 110 ? 'good' : totalCost >= 160 ? 'expensive' : 'standard';
    const acceleration = effects.some((effect) => effect.type === 31 && effect.value > 0);
    const usefulEffect = effects.some((effect) => effect.value > 0 && [1, 2, 3, 4, 5, 9, 22, 27, 31].includes(effect.type));
    const nativeOnly = skill.rarity !== 1 && skill.rarity !== 2 || inheritedIds.has(skill.skillId);
    const tags = asRecord(skill.raw)?.type;
    const opponentTargeted = Array.isArray(tags) && tags.includes('dbf')
      || effects.some((effect) => { const target = asRecord(effect.raw)?.target; return typeof target === 'number' && target > 1; });
    // Negative values can slow opponents or reduce an undesirable state. Only
    // simple self-stat penalties are known harmful without a target interpreter.
    const harmfulOnly = !opponentTargeted && effects.length > 0
      && effects.every((effect) => effect.value < 0 && [1, 2, 3, 4, 5].includes(effect.type));
    const unknownEffect = effects.some((effect) => effectLabels[effect.type] === undefined);
    let grade: SkillGrade;
    const reasons: string[] = [];
    if (nativeOnly) { grade = 'excluded'; reasons.push('고유·진화·계승 전용 스킬은 공통 백인자 목표에서 제외합니다.'); }
    else if (harmfulOnly) { grade = 'excluded'; reasons.push('감소 효과만 있는 스킬입니다.'); }
    else if (applicability === 'inapplicable') { grade = 'excluded'; reasons.push('선택 대회 또는 각질의 필수 조건이 맞지 않습니다.'); }
    else if (opponentTargeted) { grade = 'unverified'; reasons.push('상대 대상·디버프 효과입니다. 감소 값을 자기 능력 감소로 처리하지 않으며 대상 범위와 대회 효율 검증이 필요합니다.'); }
    else if (applicability === 'unverified' || unknownEffect) { grade = 'unverified'; reasons.push('미지원 조건·효과 또는 미확인 대회 조건이 있어 유효성 검증이 필요합니다.'); }
    else if (isGreen && speedOrStamina && costEfficiency === 'expensive') {
      grade = 'supplementary'; reasons.push('스피드·스태미나 패시브지만 전제 포함 비용이 높아 부가 확보 대상으로 둡니다.');
    } else if (isGreen && guaranteedSpeedOrStamina && applicability === 'applicable' && costEfficiency === 'good') {
      grade = 'priority'; reasons.push(`${positiveStats.join('·')} 패시브 스킬: 대회 조건이 맞고 전제 포함 기본 Pt가 낮아 우대합니다.`);
    } else if (isGreen && guaranteedSpeedOrStamina && applicability === 'applicable') {
      grade = 'useful'; reasons.push('대회 조건에 맞는 스피드·스태미나 패시브 스킬입니다. 전제 비용과 추가 힌트를 비교하세요.');
    } else if (applicability === 'conditional' || acceleration) {
      grade = 'conditional'; reasons.push(acceleration ? '가속 효과가 있으나 이 코스의 유효 가속 구간과 실제 발동 위치는 검증이 필요합니다.' : '각질·마장 조건은 배제되지 않으나 순위·전개·능력치 등 추가 조건이 있습니다.');
    } else if (usefulEffect) { grade = 'useful'; reasons.push('선택 대회·각질에서 조건이 맞는 효과입니다. 정밀 마신 효율은 미검증입니다.'); }
    else { grade = 'supplementary'; reasons.push('효과는 보존했으며 공통 핵심 가치 판단 자료가 부족해 부가 대상으로 표시합니다.'); }
    if (availability.state === 'unavailable') { grade = 'excluded'; reasons.push(availability.timeline === 'JP' ? '대응 일본 대회 이후 출시 스킬입니다. 한국 미래시 추천에서 제외합니다.' : '한국 서버 선택 기준일 이후 출시 스킬입니다.'); applicability = 'inapplicable'; }
    if (availability.state === 'unknown') reasons.push(request.forecast ? '스킬 최초 출시 순서는 미확인입니다. 카드의 예상 수급 경로와 스킬 최초 출시 인증은 구분합니다.' : '한국 출시 미확인입니다. 일본 또는 번역 데이터가 있다는 이유로 출시 처리하지 않습니다.');
    const routes = deckAnalysis.bySkillId[skill.skillId] ?? [];
    if (routes.length) reasons.push('본육성 카드의 수급 경로가 있어도 추가 힌트 가치가 있으므로 후보에서 제거하지 않습니다.');
    if (totalCost === null) reasons.push('비용 또는 필요한 하위 스킬 전제가 미확인입니다. 기재 Pt를 총 획득 비용으로 간주하지 않습니다.');
    const unknownConditions = [...new Set(results.flatMap((row) => row.unknown))];
    const valueEvidence = buildSkillValueEvidence({
      skillId: skill.skillId, groups, course: request.course, courseRecord, runningStyle: request.runningStyle,
      cutoffDate: request.cutoffDate, applicability, grade, unknownEffect,
    });
    if (valueEvidence.core.status === 'guide-priority') reasons.push('동일 대회 조건·각질의 한국 공략에서 주요 목표로 제시했습니다. 실측 마신 수치를 뜻하지 않습니다.');
    if (acceleration) reasons.push(valueEvidence.accelerationWindow.reason);
    const row: SkillEvaluation = {
      skillId: skill.skillId, name: skill.displayName, rarity: skill.rarity, cost: skill.cost, totalCost, applicability, grade, costEfficiency,
      reasons, conditionSummary: groups.map((group) => [group.precondition, group.condition].filter(Boolean).join(' & ')).join(' OR ') || '조건 자료 없음',
      effectSummary: [...new Set(effects.map((effect) => effectLabels[effect.type] ?? `미해석 효과 ${effect.type}`))].join('·') || '효과 자료 없음',
      passiveStats: isGreen ? positiveStats : [], isGreen,
      core: acceleration && applicability !== 'inapplicable' && !nativeOnly ? 'candidate' : 'not-established',
      bashinGain: null, activationRate: null, routes, availability,
      dataStatus: revision?.status ?? 'JP-source-snapshot-kr-patch-unverified', unknownConditions,
      conditionClass: valueEvidence.conditionClass, valueEvidence,
    };
    if (grade === 'excluded') counts.excluded++;
    else if (applicability === 'applicable') counts.applicable++;
    else if (applicability === 'conditional') counts.conditional++;
    else counts.unverified++;
    if (availability.state !== 'unknown' || request.includeUnknown) rows.push(row);
  }
  rows.sort((a, b) => gradeOrder[a.grade] - gradeOrder[b.grade]
    || (request.preference === 'skills' ? Number(b.routes.length > 0) - Number(a.routes.length > 0) : 0)
    || (a.totalCost ?? Infinity) - (b.totalCost ?? Infinity) || a.skillId.localeCompare(b.skillId));
  const warnings = [...deckAnalysis.warnings,
    '평가 등급은 공개 조건·효과·기본 Pt와 사용자 우선순위에 따른 정성 평가입니다. 마신 이득·유효율 수치는 계산하지 않습니다.',
    '범용성은 이 대회·각질의 여러 주자에게 공통으로 적용 가능한 정도입니다. 기존 가속기 중복 추정으로 감점하지 않습니다.',
    '한국어 지역 오버레이와 JP 스냅샷은 한국 적용 패치·과거 대회 효과의 정확도 인증이 아닙니다.',
  ];
  if (request.scenarioId && getP3Availability(snapshot, 'scenario', request.scenarioId, request.cutoffDate, request.allowForecast, request.forecast).state !== 'available') warnings.push('선택 시나리오의 한국 출시 또는 해당 대회의 예상 가용성을 확인하지 못했습니다. 대회 스킬 평가는 유지하며 시나리오 고유 수급·훈련 효과를 추정하지 않습니다.');
  return { rows, deckAnalysis, counts, warnings };
}

function cumulativeCost(
  skillId: string, skills: Map<string, DeepReadonly<P3Skill>>, lower: Map<string, string[]>, visited = new Set<string>(),
): number | null {
  if (visited.has(skillId)) return null;
  const skill = skills.get(skillId); if (!skill || skill.cost === null) return null;
  const nextVisited = new Set(visited); nextVisited.add(skillId);
  const dependencies = lower.get(skillId) ?? [];
  if (dependencies.length > 1) return null;
  // A named circle upgrade or gold without its prerequisite is not a known total cost.
  if (!dependencies.length && (skill.rarity === 2 || /◎/.test(skill.nameJa ?? skill.displayName))) return null;
  let result = skill.cost;
  for (const id of dependencies) {
    const cost = cumulativeCost(id, skills, lower, nextVisited); if (cost === null) return null;
    result += cost;
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
