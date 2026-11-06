import type { DeepReadonly } from '../data/snapshot';
import type { P3Snapshot, P3Support } from '../domain/skill-support';
import { evaluateSkills, type SkillEvaluation, type SkillEvaluationRequest } from './skill-evaluation';
import { analyzeSupportDeck, getP3Availability, type MainSupportSelection, type SkillAcquisitionRoute } from './support-acquisition';
import type { ReferenceAvailability } from './reference-availability';
import { buildSupportEventModel, type SupportEventModel } from './event-acquisition';
import { normalizeSkillPriorities, SKILL_PRIORITY_BONUSES, skillPriorityWarnings, type UserSkillPriority } from './skill-priorities';

export interface P4RecommendationRequest extends SkillEvaluationRequest {
  ownedSupports?: readonly MainSupportSelection[];
  ownedOnly?: boolean;
  allowBorrow?: boolean;
  skillPriorities?: readonly UserSkillPriority[];
  /** Validation/sensitivity experiments only; the production UI uses the named policy. */
  skillPriorityBonuses?: { preferred: number; strong: number };
  search?: { candidateLimit?: number; beamWidth?: number; maxStates?: number; eventPlanLimit?: number };
}
export interface P4EventDecision {
  supportId: string; groupId: string; eventIds: string[]; label: string;
  optionId: string; skillIds: string[]; assurance: 'possible' | 'guaranteed' | 'unknown';
  outcome: 'success' | 'failure' | 'unspecified'; evidence: string;
  condition: string | null; probability: null;
}
export interface P4CardRecommendation extends MainSupportSelection {
  name: string; rarity: P3Support['rarity']; type: string; ownerBaseId: string | null;
  ownership: 'owned' | 'borrowed' | 'unregistered';
  availability: ReferenceAvailability;
  acquisitionBasis: 'kr-source' | 'jp-reference-forecast';
  skillIds: string[]; uniqueSkillIds: string[]; duplicateSkillIds: string[];
  routes: SkillAcquisitionRoute[]; reasons: string[];
  eventConditionNotes: string[];
  potentialSkillIds: string[]; compatibleSkillIds: string[]; unresolvedEventSkillIds: string[];
  eventDecisions: P4EventDecision[];
}
export interface P4DeckScore {
  /** Transparent qualitative coverage objective, never a race gain or probability. */
  coverageValue: number;
  preferenceBonus?: number;
  customizedValue?: number;
  prioritySkillCount: number; usefulSkillCount: number; conditionalSkillCount: number;
  greenSkillCount: number; duplicateSkillCount: number;
  /** Exact-context, sourced guide priorities. Not simulated race gains. */
  coreSkillCount: number;
  srCount: number; extremeSrPenalty: number;
}
export interface P4SwapAnalysis {
  removeSupportId: string; addSupportId: string; addSupportName: string;
  gainedSkillIds: string[]; lostSkillIds: string[];
  coverageValueDelta: number; reasons: string[];
  preferenceBonusDelta?: number; customizedValueDelta?: number;
}
export interface P4DeckRecommendation {
  deckId: string; cards: P4CardRecommendation[]; score: P4DeckScore;
  skillIds: string[]; greenSkillIds: string[]; duplicateSkillIds: string[];
  missingPrioritySkillIds: string[]; swaps: P4SwapAnalysis[];
  missingImportantSkillIds: string[];
  potentialSkillIds: string[]; compatibleSkillIds: string[]; unresolvedEventSkillIds: string[];
  /** No acquisition is guaranteed merely because it is in a compatible plan. */
  guaranteedSkillIds: string[]; eventDecisions: P4EventDecision[];
  /** Compared with the first recommendation. Empty on the first row. */
  gainedSkillIds: string[]; lostSkillIds: string[]; reasons: string[];
}
export interface P4SearchMetadata {
  algorithm: 'exhaustive' | 'bounded-beam-and-swap';
  eligibleCardCount: number; effectiveCardCount: number; candidateCount: number;
  candidateLimit: number; beamWidth: number; maxStates: number;
  examinedStates: number; completeDecksExamined: number;
  candidatePoolLimited: boolean; beamPruned: boolean; searchLimitReached: boolean;
  optimalWithinCandidatePool: boolean; globalOptimal: boolean;
  eventPlanLimit: number; eventPlansPruned: boolean;
  objective: 'compatible-qualitative-coverage-then-priority-green-then-guide-reference' | 'personalized-compatible-value-with-required-opportunities';
  priorityCandidateExpansion?: { baseCandidateCount: number; addedCount: number;
    providerSupportIds: string[]; addedProviderSupportIds: string[];
    requiredFeasibilityStates: number; requiredFeasibilityLimited: boolean };
  snapshotId: string; tieBreak: 'support-id-lexicographic';
}
export interface P4RecommendationResult {
  status: 'ready' | 'insufficient-candidates' | 'insufficient-skills' | 'search-limited' | 'required-unfulfilled';
  recommendations: P4DeckRecommendation[];
  search: P4SearchMetadata; warnings: string[];
  skillEvaluations: SkillEvaluation[];
  skillPriorities?: P6PriorityDiagnostics;
}
export type P6RequiredFailureReason = 'no-released-source' | 'ownership-borrow-limit' | 'mutually-exclusive-events' | 'search-limit' | 'unverified-source';
export interface P6PriorityTargetStatus extends UserSkillPriority {
  attained: boolean; grade: SkillEvaluation['grade']; applicability: SkillEvaluation['applicability'];
  availability: ReferenceAvailability; warnings: string[];
  availableSourceSupportIds: string[]; eligibleSourceSupportIds: string[];
  candidateSourceSupportIds: string[]; potentialSourceSupportIds: string[];
}
export interface P6PriorityDiagnostics {
  selections: UserSkillPriority[]; policy: { preferred: number; strong: number };
  targets: P6PriorityTargetStatus[];
  failure?: { reason: P6RequiredFailureReason; message: string; skillIds: string[] };
}
export interface P6PersonalizedRecommendationResult {
  base: P4RecommendationResult; customized: P4RecommendationResult | null;
  comparison: null | { sameLineup: boolean; gainedSkillIds: string[]; lostSkillIds: string[];
    lostCoreSkillIds: string[]; baseCoverageDelta: number; preferenceBonus: number; customizedValue: number;
    greenCountDelta: number; targetCountDelta: number };
}

/** The default run remains independent of user preferences and retains P5 policy. */
export function recommendPersonalizedSupportDecks(snapshot: DeepReadonly<P3Snapshot>, request: P4RecommendationRequest): P6PersonalizedRecommendationResult {
  const base = recommendSupportDecks(snapshot, { ...request, skillPriorities: undefined, skillPriorityBonuses: undefined });
  const selections = normalizeSkillPriorities(snapshot, request.skillPriorities ?? []);
  if (!selections.length) return { base, customized: null, comparison: null };
  const customized = recommendSupportDecks(snapshot, { ...request, skillPriorities: selections });
  const before = base.recommendations[0]; const after = customized.recommendations[0];
  if (!before || !after) return { base, customized, comparison: null };
  const evaluations = new Map(base.skillEvaluations.map((row) => [row.skillId, row]));
  const lostSkillIds = before.skillIds.filter((id) => !after.skillIds.includes(id));
  return { base, customized, comparison: {
    sameLineup: before.deckId === after.deckId,
    gainedSkillIds: after.skillIds.filter((id) => !before.skillIds.includes(id)), lostSkillIds,
    lostCoreSkillIds: lostSkillIds.filter((id) => evaluations.get(id)?.valueEvidence.core.status === 'guide-priority'),
    baseCoverageDelta: after.score.coverageValue - before.score.coverageValue,
    preferenceBonus: after.score.preferenceBonus ?? 0, customizedValue: after.score.customizedValue ?? after.score.coverageValue,
    greenCountDelta: after.greenSkillIds.length - before.greenSkillIds.length,
    targetCountDelta: after.skillIds.length - before.skillIds.length,
  } };
}
export interface P4LineupInspection {
  status: P4RecommendationResult['status']; deck: P4DeckRecommendation | null;
  skillEvaluations: SkillEvaluation[]; warnings: string[];
  skillPriorities?: P6PriorityDiagnostics;
}

/** Evaluate a guide/user lineup with the same compatible-path objective as search. */
export function inspectSupportLineup(
  snapshot: DeepReadonly<P3Snapshot>, request: P4RecommendationRequest, selections: readonly MainSupportSelection[],
): P4LineupInspection {
  if (selections.length !== 6) throw new RangeError('비교 편성은 서로 다른 서포트 6장입니다.');
  const result = recommendSupportDecks(snapshot, { ...request, ownedSupports: selections,
    ownedOnly: true, allowBorrow: false, search: { candidateLimit: 6, beamWidth: 1, maxStates: 1 } });
  const deck = result.recommendations[0] ?? null;
  if (deck) for (const card of deck.cards) card.ownership = 'unregistered';
  return { status: result.status, deck, skillEvaluations: result.skillEvaluations, warnings: result.warnings,
    ...(result.skillPriorities ? { skillPriorities: result.skillPriorities } : {}) };
}

interface Candidate {
  support: DeepReadonly<P3Support>; selection: MainSupportSelection;
  availability: ReferenceAvailability; ownership: P4CardRecommendation['ownership'];
  acquisitionBasis: P4CardRecommendation['acquisitionBasis']; routes: SkillAcquisitionRoute[];
  skills: number[]; ownValue: number; key: string; eventConditionNotes: string[];
  potentialSkills: number[]; unresolvedEventSkills: number[]; plans: CardPlan[];
}
interface CardPlan { skills: number[]; decisions: P4EventDecision[] }
interface CoveragePlan {
  covered: Set<number>; coverage: number; core: number; priority: number; requiredCount: number;
  selected: { candidateIndex: number; planIndex: number }[];
}
interface State { indices: number[]; covered: Set<number>; coverage: number; key: string; plans: CoveragePlan[] }

/**
 * Six-card weighted set coverage with deterministic bounded combination search.
 * Small pools are enumerated exactly. Larger pools use a documented shortlist,
 * beam search, and one-card exchange improvement; no global optimum is claimed.
 */
export function recommendSupportDecks(snapshot: DeepReadonly<P3Snapshot>, request: P4RecommendationRequest): P4RecommendationResult {
  const candidateLimit = positiveInteger(request.search?.candidateLimit ?? 96, 6, 200, 'candidateLimit');
  const beamWidth = positiveInteger(request.search?.beamWidth ?? 80, 1, 500, 'beamWidth');
  const maxStates = positiveInteger(request.search?.maxStates ?? 100_000, 1, 2_000_000, 'maxStates');
  const eventPlanLimit = positiveInteger(request.search?.eventPlanLimit ?? 32, 1, 256, 'eventPlanLimit');
  const selections = normalizeSkillPriorities(snapshot, request.skillPriorities);
  const selectedIds = new Set(selections.map((row) => row.skillId));
  const bonusPolicy = priorityBonusPolicy(request.skillPriorityBonuses);
  const branchBounds = { pruned: false };
  const evaluated = evaluateSkills(snapshot, request);
  if (selections.some((row) => !evaluated.rows.some((skill) => skill.skillId === row.skillId))) {
    // A direct user choice remains inspectable when the general research list
    // is hidden. This never changes its release status or objective grade.
    const extra = evaluateSkills(snapshot, { ...request, includeUnknown: true }).rows
      .filter((row) => selectedIds.has(row.skillId) && !evaluated.rows.some((previous) => previous.skillId === row.skillId));
    evaluated.rows.push(...extra);
  }
  // White skills are factor targets. Gold paths contribute their explicit white
  // prerequisites; gold/unique/evolution skills are not counted as white targets.
  const rowsById = new Map(evaluated.rows.map((row) => [row.skillId, row]));
  const sourceSkillsById = selections.length ? new Map(snapshot.skills.map((row) => [row.skillId, row])) : rowsById;
  const whiteLower = new Map(snapshot.skillRelations.filter((row) => row.relation === 'lower_skill')
    .filter((row) => sourceSkillsById.get(row.relatedSkillId)?.rarity === 1).map((row) => [row.skillId, row.relatedSkillId]));
  const canonical = (skillId: string) => {
    let next = skillId; const seen = new Set<string>();
    while (whiteLower.has(next) && !seen.has(next)) { seen.add(next); next = whiteLower.get(next)!; }
    return next;
  };
  const targets = evaluated.rows.filter((row) => row.rarity === 1 && canonical(row.skillId) === row.skillId
    && (!['excluded', 'unverified'].includes(row.grade) || selectedIds.has(row.skillId)));
  const baseWeights = targets.map(skillWeight);
  const bonuses = targets.map((row) => {
    const priority = selections.find((selection) => selection.skillId === row.skillId)?.priority;
    return priority === 'preferred' ? bonusPolicy.preferred : priority === 'strong' ? bonusPolicy.strong : 0;
  });
  const weights = baseWeights.map((value, index) => value + bonuses[index]!);
  const canonicalIndex = new Map(targets.map((row, index) => [row.skillId, index]));
  const required = new Set(selections.filter((row) => row.priority === 'required').flatMap((row) => {
    const index = canonicalIndex.get(row.skillId); return index === undefined ? [] : [index];
  }));
  const targetIndex = new Map((selections.length ? snapshot.skills : evaluated.rows).filter((row) => row.rarity === 1)
    .flatMap((row) => { const index = canonicalIndex.get(canonical(row.skillId)); return index === undefined ? [] : [[row.skillId, index] as const]; }));
  const owned = validateOwned(request.ownedSupports ?? [], snapshot);
  const allAvailable: Candidate[] = [];
  for (const support of snapshot.supports) {
    const availability = getP3Availability(snapshot, 'support', support.supportId, request.cutoffDate, request.allowForecast, request.forecast);
    if (availability.state !== 'available') continue;
    const registered = owned.get(support.supportId);
    if (!selections.length && request.ownedOnly && !registered && !request.allowBorrow) continue;
    const selection = { supportId: support.supportId, limitBreak: registered?.limitBreak ?? 4 };
    const hasKr = snapshot.supportSkills.some((link) => link.supportId === support.supportId && link.server === 'KR');
    // P5 uses the common route adapter, which retains JP as the source server.
    // Preserve the legacy P4 date-based path only for requests without P5 data.
    const useJp = !request.forecast && availability.basis === 'forecast' && !hasKr;
    const sourceSnapshot = useJp ? { ...snapshot, supportSkills: snapshot.supportSkills
      .filter((link) => link.supportId === support.supportId && link.server === 'JP')
      .map((link) => ({ ...link, server: 'KR' })) } : snapshot;
    const routes = analyzeSupportDeck(sourceSnapshot, [selection], request.cutoffDate, request.allowForecast, request.forecast).routes
      .filter((route) => targetIndex.has(route.skillId) && rowsById.get(route.skillId)?.availability.state !== 'unavailable')
      .map((route) => ({ ...route, skillId: targets[targetIndex.get(route.skillId)!]!.skillId,
        relationEvidence: canonical(route.skillId) !== route.skillId
          ? `${route.relationEvidence ? `${route.relationEvidence}; ` : ''}explicit-lower-white-family:${route.skillId}` : route.relationEvidence }));
    const potentialSkills = [...new Set(routes.map((route) => targetIndex.get(route.skillId)!))].sort((a, b) => a - b);
    const eventModel = buildSupportEventModel(snapshot, support.supportId, { scenarioId: request.scenarioId ?? undefined,
      allowJpReference: true });
    const planResult = buildCardPlans(support.supportId, routes, eventModel, targetIndex, targets, weights, eventPlanLimit, branchBounds, required);
    const skills = [...new Set(planResult.plans.flatMap((plan) => plan.skills))].sort((a, b) => a - b);
    allAvailable.push({ support, selection, availability,
      ownership: registered ? 'owned' : request.ownedOnly ? 'borrowed' : 'unregistered',
      acquisitionBasis: useJp || routes.some((route) => route.acquisitionBasis === 'jp-reference-forecast') ? 'jp-reference-forecast' : 'kr-source', routes, skills,
      ownValue: Math.max(0, ...planResult.plans.map((plan) => plan.skills.reduce((sum, id) => sum + weights[id]!, 0))), key: support.supportId,
      potentialSkills, unresolvedEventSkills: planResult.unresolved, plans: planResult.plans,
      eventConditionNotes: [...eventModel.notes,
        ...((snapshot.supportEvents ?? []).some((event) => event.supportId === support.supportId && event.choices.length > 1)
          ? ['서로 다른 이벤트 분기 보상은 동시 획득을 보장하지 않습니다. 선택한 양립 가능 경로만 점수에 반영합니다.'] : []),
        ...(planResult.unresolved.length ? [`이벤트 조건을 연결하지 못한 유효 목표 ${planResult.unresolved.length}개는 참고 목록에 보존하고 점수에서 제외합니다.`] : [])] });
  }
  const eligible = allAvailable.filter((card) => !request.ownedOnly || card.ownership === 'owned' || request.allowBorrow);
  const effective = eligible.filter((card) => card.skills.length > 0);
  const basePool = selections.length ? eligible.map((card) => ({ ...card,
    ownValue: Math.max(0, ...card.plans.map((plan) => plan.skills.reduce((sum, id) => sum + baseWeights[id]!, 0))) })) : eligible;
  const initialCandidates = request.ownedOnly && request.allowBorrow
    ? ownedBorrowShortlist(basePool, targets, selections.length ? baseWeights : weights, candidateLimit)
    : shortlist(basePool, targets, selections.length ? baseWeights : weights, candidateLimit);
  const preferredIndices = new Set(selections.flatMap((row) => {
    const index = canonicalIndex.get(row.skillId); return index === undefined ? [] : [index];
  }));
  const preferredProviders = selections.length ? eligible.filter((card) => card.skills.some((id) => preferredIndices.has(id))) : [];
  const candidateKeys = new Set(initialCandidates.map((card) => card.key));
  const addedProviders = preferredProviders.filter((card) => !candidateKeys.has(card.key));
  const candidates = selections.length ? [...new Set([...initialCandidates.map((card) => card.key), ...preferredProviders.map((card) => card.key)])]
    .map((key) => eligible.find((card) => card.key === key)!)
    .sort((a, b) => b.ownValue - a.ownValue || a.key.localeCompare(b.key)) : initialCandidates;
  const meta: P4SearchMetadata = {
    algorithm: 'bounded-beam-and-swap', eligibleCardCount: eligible.length, effectiveCardCount: effective.length,
    candidateCount: candidates.length, candidateLimit, beamWidth, maxStates,
    examinedStates: 0, completeDecksExamined: 0, candidatePoolLimited: candidates.length < eligible.length,
    beamPruned: false, searchLimitReached: false, optimalWithinCandidatePool: false, globalOptimal: false,
    eventPlanLimit, eventPlansPruned: branchBounds.pruned, objective: selections.length ? 'personalized-compatible-value-with-required-opportunities' : 'compatible-qualitative-coverage-then-priority-green-then-guide-reference',
    snapshotId: snapshot.snapshotId, tieBreak: 'support-id-lexicographic',
    ...(selections.length ? { priorityCandidateExpansion: { baseCandidateCount: initialCandidates.length, addedCount: addedProviders.length,
      providerSupportIds: preferredProviders.map((card) => card.key).sort(), addedProviderSupportIds: addedProviders.map((card) => card.key).sort(),
      requiredFeasibilityStates: 0, requiredFeasibilityLimited: false } } : {}),
  };
  const warnings: string[] = [];
  if (request.scenarioId) warnings.push('시나리오 링크·훈련 효과는 검증된 카드별 보너스가 없어 편성 점수에 만들지 않았습니다.');
  if (!request.ownedOnly) warnings.push('미등록 카드는 4돌파 가상 설계로 비교합니다. 보유 카드만 사용하려면 보유 제한을 적용하세요.');
  warnings.push('명시적 하위 관계로 연결된 ○·◎는 같은 백인자 목표 계열로 묶어 신규 가치를 중복 합산하지 않습니다.');
  if (targets.some((row) => row.availability.state === 'unknown')) warnings.push('일부 목표 스킬은 한국 출시·과거 패치 미확인 연구 평가입니다. 카드 가용성과 구별합니다.');
  if (selections.length) warnings.push('사용자 선호 보너스는 별도 정책값입니다. 필수 확보는 같은 양립 계획의 수급 기회를 요구하며 실제 백인자 생성·계승을 보장하지 않습니다.');
  const feasibility = required.size ? findRequiredLineup(candidates, required, request.ownedOnly === true, maxStates)
    : { witness: null, examined: 0, limited: false };
  if (meta.priorityCandidateExpansion) {
    meta.priorityCandidateExpansion.requiredFeasibilityStates = feasibility.examined;
    meta.priorityCandidateExpansion.requiredFeasibilityLimited = feasibility.limited;
  }
  let priorityFailure: P6PriorityDiagnostics['failure'];
  const finalize = (status: P4RecommendationResult['status'], recommendations: P4DeckRecommendation[] = []): P4RecommendationResult => {
    if (!selections.length) return { status, recommendations, search: meta, warnings, skillEvaluations: evaluated.rows };
    if (required.size && !recommendations.length) {
      priorityFailure ??= diagnoseRequiredFailure(allAvailable, eligible, candidates, required, selections,
        targets, snapshot, request, maxStates, meta, branchBounds.pruned, feasibility);
      status = 'required-unfulfilled';
    }
    const covered = new Set(recommendations[0]?.skillIds ?? []);
    const priorityTargets = selections.map((selection): P6PriorityTargetStatus => {
      const row = rowsById.get(selection.skillId)!; const index = canonicalIndex.get(selection.skillId);
      const supplies = (pool: Candidate[], potential = false) => pool.filter((card) => index !== undefined
        && (potential ? card.potentialSkills : card.skills).includes(index)).map((card) => card.key).sort();
      const targetWarnings = skillPriorityWarnings(row);
      if (index === undefined || !supplies(allAvailable).length) targetWarnings.push('현재 출시 환경에서 양립 가능한 수급 경로를 확인하지 못했습니다.');
      return { ...selection, attained: covered.has(selection.skillId), grade: row.grade, applicability: row.applicability,
        availability: row.availability, warnings: targetWarnings, availableSourceSupportIds: supplies(allAvailable),
        eligibleSourceSupportIds: supplies(eligible), candidateSourceSupportIds: supplies(candidates),
        potentialSourceSupportIds: supplies(allAvailable, true) };
    });
    return { status, recommendations, search: meta, warnings, skillEvaluations: evaluated.rows,
      skillPriorities: { selections, policy: bonusPolicy, targets: priorityTargets, ...(priorityFailure ? { failure: priorityFailure } : {}) } };
  };
  if (targets.length > 0 && (eligible.length < 6 || distinctOwners(eligible) < 6)) {
    warnings.push('출시·보유·동일 인물 제약을 만족하는 서로 다른 서포트 6장이 부족합니다.');
    return finalize('insufficient-candidates');
  }
  if (targets.length === 0 || effective.length === 0) {
    warnings.push(targets.length === 0
      ? '선택한 대회·각질·한국 출시 검토 범위에서 평가 가능한 백인자 목표가 없습니다. 미확인 스킬 연구 포함 여부와 자료 범위를 확인하세요.'
      : '평가 가능한 목표 스킬을 제공하는 가용 서포트 경로가 없습니다. 카드 출시·보유 범위 또는 수급 자료를 확인하세요.');
    return finalize('insufficient-skills');
  }
  if (request.ownedOnly && request.allowBorrow && distinctOwners(eligible.filter((card) => card.ownership === 'owned')) < 5) {
    warnings.push('대여 1장을 사용해도 서로 다른 인물의 보유 카드가 최소 5장 필요합니다.');
    return finalize('insufficient-candidates');
  }
  if (candidates.length < 6 || distinctOwners(candidates) < 6) {
    warnings.push('출시·보유·동일 인물 제약을 만족하는 서로 다른 서포트 6장이 부족합니다.');
    const limited = meta.candidatePoolLimited && eligible.length >= 6 && distinctOwners(eligible) >= 6;
    return finalize(limited ? 'search-limited' : 'insufficient-candidates');
  }
  const compare = createStateComparator(candidates, request.preference ?? 'balanced', targets);
  const stateCache = new Map<string, State>();
  const makeState = (indices: number[]) => {
    const key = indices.map((id) => candidates[id]!.key).sort().join('|');
    const cached = stateCache.get(key); if (cached) return cached;
    const state = stateFrom(indices, candidates, weights, targets, eventPlanLimit, branchBounds, required);
    // A bounded memo avoids repeatedly solving branch plans during swaps.
    if (stateCache.size < 10_000) stateCache.set(key, state);
    return state;
  };
  const full = new Map<string, State>();
  const keep = (state: State) => {
    if (state.indices.length !== 6) return;
    meta.completeDecksExamined++;
    if (![...required].every((id) => state.covered.has(id))) return;
    if (!full.has(state.key)) full.set(state.key, state);
    if (full.size > 64) {
      const sorted = [...full.values()].sort(compare);
      full.clear(); for (const row of sorted.slice(0, 32)) full.set(row.key, row);
    }
  };
  const expand = (state: State, index: number): State | null => {
    if (!canAdd(state.indices, index, candidates, request.ownedOnly === true)) return null;
    const indices = [...state.indices, index].sort((a, b) => a - b);
    const key = indices.map((id) => candidates[id]!.key).sort().join('|');
    const cached = stateCache.get(key); if (cached) return cached;
    const plans = addCardPlans(state.plans, candidates[index]!.plans, index, weights, targets, eventPlanLimit, branchBounds, required);
    const first = plans[0]!;
    const result = { indices, covered: first.covered, coverage: first.coverage, key, plans };
    if (stateCache.size < 10_000) stateCache.set(key, result);
    return result;
  };
  const empty = (): State => ({ indices: [], covered: new Set(), coverage: 0, key: '',
    plans: [{ covered: new Set(), coverage: 0, core: 0, priority: 0, requiredCount: 0, selected: [] }] });
  if (feasibility.witness) {
    // The feasibility pass is a constraint witness, not a score shortcut. Seed
    // its actual joint event plan so a bounded beam cannot silently lose it.
    const plan = coveredPlan(new Set(feasibility.witness.flatMap((choice) => candidates[choice.candidateIndex]!.plans[choice.planIndex]!.skills)),
      feasibility.witness, weights, targets, required);
    const indices = feasibility.witness.map((choice) => choice.candidateIndex).sort((a, b) => a - b);
    const seed = makeState(indices);
    seed.plans = prunePlans([plan, ...seed.plans], eventPlanLimit, branchBounds, required);
    seed.covered = seed.plans[0]!.covered; seed.coverage = seed.plans[0]!.coverage;
    keep(seed);
  }
  if (candidates.length <= 18 && choose(candidates.length, 6) <= maxStates) {
    meta.algorithm = 'exhaustive';
    const visit = (state: State, start: number) => {
      if (state.indices.length === 6) { meta.examinedStates++; keep(state); return; }
      const remaining = 6 - state.indices.length;
      for (let index = start; index <= candidates.length - remaining; index++) {
        const next = expand(state, index); if (next) visit(next, index + 1);
      }
    };
    visit(empty(), 0);
    meta.optimalWithinCandidatePool = true;
    meta.globalOptimal = !meta.candidatePoolLimited;
  } else {
    // A few complete deterministic seeds make the search robust to ownership
    // constraints. Their evaluated states consume the same resource budget.
    for (let offset = 0; offset < Math.min(candidates.length, 12) && meta.examinedStates < maxStates; offset++) {
      let state = empty();
      const order = [...candidates.keys()].sort((a, b) => (a < offset ? 1 : 0) - (b < offset ? 1 : 0) || a - b);
      for (const index of order) {
        if (meta.examinedStates >= maxStates) { meta.searchLimitReached = true; break; }
        const next = expand(state, index); if (next) { state = next; meta.examinedStates++; }
        if (state.indices.length === 6) { keep(state); break; }
      }
    }
    let frontier = [empty()];
    for (let depth = 0; depth < 6; depth++) {
      const next = new Map<string, State>();
      for (const state of frontier) {
        const start = state.indices.length ? state.indices[state.indices.length - 1]! + 1 : 0;
        for (let index = start; index <= candidates.length - (6 - depth); index++) {
          if (meta.examinedStates >= maxStates) { meta.searchLimitReached = true; break; }
          const value = expand(state, index); if (!value) continue;
          meta.examinedStates++;
          if (depth === 5) keep(value); else next.set(value.key, value);
        }
        if (meta.searchLimitReached) break;
      }
      if (depth === 5 || meta.searchLimitReached) break;
      const sorted = [...next.values()].sort(compare);
      if (sorted.length > beamWidth) meta.beamPruned = true;
      frontier = sorted.slice(0, beamWidth);
      if (!frontier.length) break;
    }
    // Improve complete combinations by evaluating whole-deck one-card swaps.
    let best = [...full.values()].sort(compare)[0];
    for (let round = 0; best && round < 4 && meta.examinedStates < maxStates; round++) {
      let improved = best;
      for (const removed of best.indices) {
        const remainder = makeState(best.indices.filter((index) => index !== removed));
        for (let add = 0; add < candidates.length; add++) {
          if (meta.examinedStates >= maxStates) { meta.searchLimitReached = true; break; }
          const next = expand(remainder, add); if (!next) continue;
          meta.examinedStates++; keep(next); if (compare(next, improved) < 0) improved = next;
        }
      }
      if (improved.key === best.key) break;
      best = improved;
    }
  }
  const sorted = [...full.values()].sort(compare);
  meta.eventPlansPruned = branchBounds.pruned;
  if (meta.eventPlansPruned) { meta.optimalWithinCandidatePool = false; meta.globalOptimal = false; }
  if (!sorted.length) {
    warnings.push('현재 보유·대여·동일 인물 제약으로 6장 편성을 찾지 못했습니다.');
    const limited = meta.searchLimitReached || meta.candidatePoolLimited || meta.beamPruned;
    return finalize(limited ? 'search-limited' : 'insufficient-candidates');
  }
  const selected = [sorted[0]!];
  const best = sorted[0]!;
  // Show one alternative only when the effective skill union changes in a
  // meaningful way. Cosmetic card/limit-break differences are not alternatives.
  const alternative = sorted.slice(1).find((state) => symmetricDifference(state.covered, best.covered) >= 2
    && state.indices.filter((id) => !best.indices.includes(id)).length >= 2);
  if (alternative) selected.push(alternative);
  // Missing card-acquisition goals must have a real path somewhere in the whole
  // eligible pool. Race-only hero buffs and training-goal bonuses have no such
  // paths and must not appear as missing white factors. Use eligible, not the
  // shortlist, so a provider omitted by candidate pruning remains visible.
  const obtainable = new Set(eligible.flatMap((card) => card.potentialSkills));
  const priority = targets.flatMap((row, index) => row.grade === 'priority' && obtainable.has(index) ? [index] : []);
  const recommendations = selected.map((state, index) => describeDeck(state, index, best, candidates, targets, baseWeights, bonuses,
    required, priority, obtainable, request, compare, makeState, selections.length > 0));
  // Swap explanations also solve complete branch plans and may reach the cap.
  meta.eventPlansPruned = branchBounds.pruned;
  if (meta.eventPlansPruned) { meta.optimalWithinCandidatePool = false; meta.globalOptimal = false; }
  if (meta.candidatePoolLimited || meta.beamPruned || meta.searchLimitReached) warnings.push('후보 선별·탐색 범위를 제한한 최선 발견 편성입니다. 전체 566장에 대한 전역 최적 편성 인증은 아닙니다.');
  if (recommendations.some((deck) => deck.cards.some((card) => card.acquisitionBasis === 'jp-reference-forecast'))) warnings.push('미래시 카드 중 한국 수급 경로가 없는 카드는 일본 원자료를 참고했습니다. 한국 적용은 확인 전입니다.');
  if (meta.eventPlansPruned) warnings.push(`이벤트 분기 조합은 상태별 최대 ${eventPlanLimit}개로 제한했습니다. 양립 가능한 최선 발견 경로이며 모든 분기의 전역 최적 인증은 아닙니다.`);
  return finalize('ready', recommendations);
}

function positiveInteger(value: number, min: number, max: number, name: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name}: ${min}～${max}`);
  return value;
}
function priorityBonusPolicy(input: P4RecommendationRequest['skillPriorityBonuses']) {
  const result = input ?? { preferred: SKILL_PRIORITY_BONUSES.preferred, strong: SKILL_PRIORITY_BONUSES.strong };
  if (!Number.isFinite(result.preferred) || !Number.isFinite(result.strong) || result.preferred < 0 || result.strong <= result.preferred) {
    throw new RangeError('사용자 선호 정책은 0 이상 우선값과 그보다 큰 강력 우대값이어야 합니다.');
  }
  return { ...result };
}
interface RequiredFeasibility { witness: CoveragePlan['selected'] | null; examined: number; limited: boolean }
/** Owner-group dynamic programming proves opportunity feasibility independently
 * of the coverage beam. State merging is exact for required masks/card count/
 * borrow count because each owner is processed once. Its work is separately
 * bounded and recorded; no objective optimum is claimed by this witness. */
function findRequiredLineup(pool: Candidate[], required: Set<number>, constrainBorrow: boolean, budget: number, relaxedEvents = false, includeUnverifiedPotential = false): RequiredFeasibility {
  const positions = new Map([...required].map((id, index) => [id, index]));
  const maskFor = (skills: number[]) => skills.reduce((mask, id) => mask | (positions.has(id) ? 1 << positions.get(id)! : 0), 0);
  const fullMask = (1 << required.size) - 1;
  const groups = new Map<string, number[]>();
  pool.forEach((card, index) => { const key = owner(card); const list = groups.get(key) ?? []; list.push(index); groups.set(key, list); });
  interface Witness { mask: number; borrowed: number; selected: CoveragePlan['selected'] }
  let frontier = new Map<string, Witness>([['0:0:0', { mask: 0, borrowed: 0, selected: [] }]]);
  let examined = 0;
  for (const indices of groups.values()) {
    const options = indices.flatMap((candidateIndex) => {
      const card = pool[candidateIndex]!;
      if (relaxedEvents) return [{ candidateIndex, planIndex: 0, mask: maskFor(includeUnverifiedPotential ? card.potentialSkills : card.skills) }];
      const unique = new Map<number, number>();
      card.plans.forEach((plan, planIndex) => { const mask = maskFor(plan.skills); if (!unique.has(mask)) unique.set(mask, planIndex); });
      return [...unique].map(([mask, planIndex]) => ({ candidateIndex, planIndex, mask }));
    });
    const next = new Map(frontier);
    for (const previous of frontier.values()) {
      if (previous.selected.length >= 6) continue;
      for (const option of options) {
        if (examined >= budget) return { witness: null, examined, limited: true };
        examined++;
        const borrowed = previous.borrowed + (pool[option.candidateIndex]!.ownership === 'borrowed' ? 1 : 0);
        if (constrainBorrow && borrowed > 1) continue;
        const state = { mask: previous.mask | option.mask, borrowed,
          selected: [...previous.selected, { candidateIndex: option.candidateIndex, planIndex: option.planIndex }] };
        if (state.mask === fullMask && state.selected.length === 6) return { witness: state.selected, examined, limited: false };
        const key = `${state.mask}:${state.selected.length}:${constrainBorrow ? state.borrowed : 0}`;
        if (!next.has(key)) next.set(key, state);
      }
    }
    frontier = next;
  }
  return { witness: null, examined, limited: false };
}
function diagnoseRequiredFailure(
  allAvailable: Candidate[], eligible: Candidate[], candidates: Candidate[], required: Set<number>, selections: UserSkillPriority[],
  targets: SkillEvaluation[], snapshot: DeepReadonly<P3Snapshot>, request: P4RecommendationRequest, budget: number,
  meta: P4SearchMetadata, branchPruned: boolean, feasibility: RequiredFeasibility,
): NonNullable<P6PriorityDiagnostics['failure']> {
  const skillIds = selections.filter((row) => row.priority === 'required').map((row) => row.skillId);
  const failure = (reason: P6RequiredFailureReason, message: string) => ({ reason, message, skillIds });
  const sourceCanReach = (sourceSkillId: string, targetSkillId: string) => {
    const visited = new Set<string>(); const queue = [sourceSkillId];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === targetSkillId) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(...snapshot.skillRelations.filter((relation) => relation.relation === 'lower_skill' && relation.skillId === id).map((relation) => relation.relatedSkillId));
    }
    return false;
  };
  for (const index of required) {
    if (allAvailable.some((card) => card.skills.includes(index))) continue;
    if (allAvailable.some((card) => card.potentialSkills.includes(index))) return branchPruned
      ? failure('search-limit', '이벤트 계획 한도로 필수 목표의 대안이 줄어 가능 여부를 확정하지 못했습니다.')
      : failure('unverified-source', '필수 목표의 원본 이벤트 경로가 있으나 분기·조건·출처를 검증하지 못해 확정할 수 없습니다.');
    const id = targets[index]!.skillId;
    const availableIds = new Set(allAvailable.map((card) => card.key));
    const rawUnverified = snapshot.supportSkills.some((route) => availableIds.has(route.supportId) && sourceCanReach(route.skillId, id));
    if (rawUnverified && targets[index]!.availability.state !== 'unavailable') return failure('unverified-source', '현재 카드의 참고 원문에는 경로가 있으나 이 서버·출시 환경의 검증된 수급으로 연결할 수 없습니다.');
    return failure('no-released-source', '현재 대회·출시 환경에서 필수 스킬을 제공하는 가용 수급 경로가 없습니다.');
  }
  if ([...required].some((index) => !eligible.some((card) => card.potentialSkills.includes(index)))) {
    return failure('ownership-borrow-limit', '필수 목표의 가용 공급 카드가 보유·대여 제한 밖에 있습니다.');
  }
  if (branchPruned || feasibility.limited || meta.searchLimitReached) return failure('search-limit', '탐색 또는 이벤트 계획 한도 안에서 모든 필수 목표의 양립 편성을 발견하지 못했습니다. 전체 조합의 불가능을 뜻하지 않습니다.');
  const legal = candidates === eligible ? feasibility : findRequiredLineup(eligible, required, request.ownedOnly === true, budget);
  if (legal.witness) return failure('search-limit', '가용 수급 기회는 있으나 현재 후보·탐색 범위에서 필수 편성을 발견하지 못했습니다.');
  if (legal.limited) return failure('search-limit', '필수 조건 확인 한도에 도달했습니다. 전체 조합에서 불가능하다고 판정하지 않습니다.');
  const unrestricted = findRequiredLineup(allAvailable, required, false, budget);
  if (unrestricted.witness) return failure('ownership-borrow-limit', '공급 카드가 있으나 보유 카드·대여 한도·동일 인물 중복 제약에서 필수 목표를 함께 충족하지 못합니다.');
  if (unrestricted.limited) return failure('search-limit', '수급 제약 확인 한도에 도달해 전체 조합의 가능 여부를 확정하지 못했습니다.');
  if (allAvailable.some((card) => card.unresolvedEventSkills.some((id) => required.has(id)))) {
    const uncertain = findRequiredLineup(allAvailable, required, false, budget, true, true);
    if (uncertain.witness) return failure('unverified-source', '함께 필요한 원본 이벤트 경로 중 미검증 분기·조건이 있어 동일 편성의 가능 여부를 확정하지 못했습니다.');
    if (uncertain.limited) return failure('search-limit', '미검증 수급 경로의 조합 확인 한도에 도달했습니다.');
  }
  const relaxed = findRequiredLineup(allAvailable, required, false, budget, true);
  if (relaxed.witness) return failure('mutually-exclusive-events', '각 필수 목표의 경로는 있지만 동일 편성에서 이벤트 선택지·성공/실패 분기가 양립하지 않습니다.');
  if (relaxed.limited || meta.candidatePoolLimited || meta.beamPruned) return failure('search-limit', '현재 제한된 탐색에서 필수 조건 편성을 발견하지 못했습니다.');
  return failure('ownership-borrow-limit', '동일 인물 중복 금지와 6장 구성 제약에서 모든 필수 목표를 함께 제공하는 편성을 구성할 수 없습니다.');
}
function validateOwned(rows: readonly MainSupportSelection[], snapshot: DeepReadonly<P3Snapshot>) {
  const result = new Map<string, MainSupportSelection>();
  const ids = new Set(snapshot.supports.map((card) => card.supportId));
  for (const row of rows) {
    if (!ids.has(row.supportId) || result.has(row.supportId)) throw new RangeError('보유 서포트 ID 또는 중복을 확인하세요.');
    if (!Number.isInteger(row.limitBreak) || row.limitBreak < 0 || row.limitBreak > 4) throw new RangeError('보유 돌파는 0～4입니다.');
    result.set(row.supportId, { ...row });
  }
  return result;
}
function skillWeight(row: SkillEvaluation): number {
  if (row.grade !== 'conditional') return { priority: 16, useful: 10, supplementary: 2, unverified: 0, excluded: 0 }[row.grade];
  // Ordinal policy values, not a measured gain, rate, or expected-value model.
  return { 'course-valid': 10, 'window-dependent': 8, 'race-order-dependent': 6,
    'course-ineffective-or-low': 2, unverified: 0 }[row.conditionClass];
}
function isGuideCore(row: SkillEvaluation) { return row.valueEvidence.core.status === 'guide-priority'; }
function isEffectiveTarget(row: SkillEvaluation) { return !['excluded', 'unverified'].includes(row.grade) && row.applicability !== 'inapplicable'; }
function coveredPlan(covered: Set<number>, selected: CoveragePlan['selected'], weights: number[], targets: SkillEvaluation[], required = new Set<number>()): CoveragePlan {
  let coverage = 0; let core = 0; let priority = 0; let requiredCount = 0;
  for (const id of covered) { coverage += weights[id]!; if (isGuideCore(targets[id]!)) core++; if (targets[id]!.grade === 'priority') priority++; if (required.has(id)) requiredCount++; }
  return { covered, coverage, core, priority, requiredCount, selected };
}
function compareCoverage(a: CoveragePlan, b: CoveragePlan) {
  // A guide is dated, contextual reference evidence. It cannot displace an
  // arbitrarily large amount of useful compatible coverage merely by naming one
  // target. Existing qualitative weights already favour low-cost greens; no
  // fitted guide bonus or horizon-dependent discount is introduced.
  return b.requiredCount - a.requiredCount || b.coverage - a.coverage || b.priority - a.priority || b.core - a.core
    || [...a.covered].sort((x, y) => x - y).join(',').localeCompare([...b.covered].sort((x, y) => x - y).join(','));
}
function subset(a: Set<number>, b: Set<number>) { return a.size <= b.size && [...a].every((id) => b.has(id)); }
function prunePlans(plans: CoveragePlan[], limit: number, bounds: { pruned: boolean }, required = new Set<number>()) {
  const unique = new Map<string, CoveragePlan>();
  for (const plan of plans) {
    const key = [...plan.covered].sort((a, b) => a - b).join(',');
    if (!unique.has(key)) unique.set(key, plan);
  }
  const sorted = [...unique.values()].sort(compareCoverage);
  const nonDominated: CoveragePlan[] = [];
  for (const plan of sorted) {
    if (nonDominated.some((other) => subset(plan.covered, other.covered))) continue;
    nonDominated.push(plan);
  }
  if (nonDominated.length > limit) bounds.pruned = true;
  return preserveRequiredMasks(nonDominated, limit, required, (plan) => plan.covered);
}
function preserveRequiredMasks<T>(sorted: T[], limit: number, required: Set<number>, covered: (item: T) => Set<number>): T[] {
  if (!required.size || sorted.length <= limit) return sorted.slice(0, limit);
  const representatives = new Map<string, T>();
  for (const item of sorted) {
    const values = covered(item);
    const key = [...required].filter((id) => values.has(id)).join(',');
    if (!representatives.has(key)) representatives.set(key, item);
  }
  const picked = [...representatives.values()].slice(0, limit);
  for (const item of sorted) if (picked.length < limit && !picked.includes(item)) picked.push(item);
  return picked.sort((a, b) => sorted.indexOf(a) - sorted.indexOf(b));
}
function addCardPlans(previous: CoveragePlan[], options: CardPlan[], candidateIndex: number,
  weights: number[], targets: SkillEvaluation[], limit: number, bounds: { pruned: boolean }, required = new Set<number>()) {
  const next: CoveragePlan[] = [];
  for (const plan of previous) for (let planIndex = 0; planIndex < options.length; planIndex++) {
    next.push(coveredPlan(new Set([...plan.covered, ...options[planIndex]!.skills]),
      [...plan.selected, { candidateIndex, planIndex }], weights, targets, required));
  }
  return prunePlans(next, limit, bounds, required);
}
function buildCardPlans(supportId: string, routes: SkillAcquisitionRoute[], model: SupportEventModel,
  targetIndex: Map<string, number>, targets: SkillEvaluation[], weights: number[], limit: number, bounds: { pruned: boolean }, required = new Set<number>()) {
  const baseline = [...new Set(routes.filter((route) => route.sourceKind === 'hint').map((route) => targetIndex.get(route.skillId)!))];
  const events = routes.filter((route) => route.sourceKind === 'event');
  const groupSources = model.groups.map((group) => new Set(group.options.flatMap((option) => option.sourceSkillIds)));
  // A legacy route has no exact event ID. Every account that claims its raw
  // source must agree with the selected branch. Another account cannot restore
  // a reward forbidden by an earlier branch or bypass an unresolved conflict.
  const allowed = new Set(events.flatMap((route, index) => {
    const groups = model.groups.filter((_, groupIndex) => groupSources[groupIndex]!.has(route.sourceSkillId));
    return groups.length > 0 && groups.every((group) => group.status === 'modeled') ? [index] : [];
  }));
  interface PartialEventPlan { allowed: Set<number>; decisions: P4EventDecision[] }
  let partial: PartialEventPlan[] = [{ allowed, decisions: [] }];
  const skillsFor = (indices: Set<number>) => [...new Set([...baseline,
    ...[...indices].map((index) => targetIndex.get(events[index]!.skillId)!)])].sort((a, b) => a - b);
  for (let groupIndex = 0; groupIndex < model.groups.length; groupIndex++) {
    const group = model.groups[groupIndex]!;
    if (group.status !== 'modeled' || ![...allowed].some((index) => groupSources[groupIndex]!.has(events[index]!.sourceSkillId))) continue;
    const next: PartialEventPlan[] = [];
    for (const plan of partial) for (const option of group.options) {
      const sourceIds = new Set(option.sourceSkillIds);
      const permitted = new Set([...plan.allowed].filter((index) => !groupSources[groupIndex]!.has(events[index]!.sourceSkillId)
        || sourceIds.has(events[index]!.sourceSkillId)));
      next.push({ allowed: permitted, decisions: [...plan.decisions, {
        supportId, groupId: group.groupId, eventIds: [...group.eventIds], label: group.label,
        optionId: option.optionId, skillIds: [],
        // A constraint-only reference is never a KR acquisition guarantee.
        assurance: group.constraintOnly ? 'unknown' : option.assurance, outcome: option.outcome, evidence: group.evidence,
        condition: option.condition, probability: null,
      }] });
    }
    const unique = new Map<string, PartialEventPlan>();
    for (const plan of next) {
      const key = [...plan.allowed].sort((a, b) => a - b).join(',');
      if (!unique.has(key)) unique.set(key, plan);
    }
    const scored = [...unique.values()].map((plan) => ({ plan,
      score: coveredPlan(new Set(skillsFor(plan.allowed)), [], weights, targets, required) }))
      .sort((a, b) => compareCoverage(a.score, b.score));
    const nonDominated: typeof scored = [];
    for (const row of scored) if (!nonDominated.some((other) => subset(row.plan.allowed, other.plan.allowed))) nonDominated.push(row);
    if (nonDominated.length > limit) bounds.pruned = true;
    partial = preserveRequiredMasks(nonDominated, limit, required, (row) => row.score.covered).map((row) => row.plan);
  }
  const plans = partial.map((plan): CardPlan => ({ skills: skillsFor(plan.allowed), decisions: plan.decisions.map((decision) => {
    const groupIndex = model.groups.findIndex((group) => group.groupId === decision.groupId);
    return { ...decision, skillIds: [...new Set([...plan.allowed]
      .filter((index) => groupSources[groupIndex]!.has(events[index]!.sourceSkillId))
      .map((index) => events[index]!.skillId))].sort() };
  }) }));
  const unresolved = [...new Set(events.filter((_, index) => !allowed.has(index)).map((route) => targetIndex.get(route.skillId)!))]
    .filter((id) => !baseline.includes(id)).sort((a, b) => a - b);
  return { plans, unresolved };
}
function owner(card: Candidate) { return card.support.ownerBaseId ? `owner:${card.support.ownerBaseId}` : `card:${card.key}`; }
function distinctOwners(cards: Candidate[]) { return new Set(cards.map(owner)).size; }
function canAdd(indices: readonly number[], index: number, candidates: Candidate[], constrainBorrow: boolean) {
  if (indices.includes(index)) return false;
  const candidate = candidates[index]!;
  if (indices.some((id) => owner(candidates[id]!) === owner(candidate))) return false;
  return !constrainBorrow || candidate.ownership !== 'borrowed' || indices.every((id) => candidates[id]!.ownership !== 'borrowed');
}
function shortlist(eligible: Candidate[], targets: SkillEvaluation[], weights: number[], limit: number): Candidate[] {
  const sorted = [...eligible].sort((a, b) => b.ownValue - a.ownValue || a.key.localeCompare(b.key));
  if (sorted.length <= limit) return sorted;
  const selected = new Map<string, Candidate>();
  const add = (card: Candidate) => { if (selected.size < limit) selected.set(card.key, card); };
  // Preserve a feasible set of distinct owners before standalone-score/skill
  // pruning; six high-scoring versions of one owner cannot form a real deck.
  const owners = new Set<string>();
  for (const card of sorted) if (!owners.has(owner(card))) {
    owners.add(owner(card)); add(card); if (owners.size >= Math.min(6, limit)) break;
  }
  const counts = new Map<number, number>();
  for (const card of sorted) for (const id of card.skills) counts.set(id, (counts.get(id) ?? 0) + 1);
  const targetOrder = [...targets.keys()].sort((a, b) => weights[b]! - weights[a]!
    || (counts.get(a) ?? 0) - (counts.get(b) ?? 0)
    || Number(isGuideCore(targets[b]!)) - Number(isGuideCore(targets[a]!))
    || targets[a]!.skillId.localeCompare(targets[b]!.skillId));
  // Protect priority greens before standalone breadth fills the shortlist.
  // Guide-listed skills use the same weight/scarcity selection as other targets;
  // the source list does not force their providers into the recommendation.
  for (const id of targetOrder.filter((id) => targets[id]!.grade === 'priority')) {
    if ([...selected.values()].some((card) => card.skills.includes(id))) continue;
    const candidate = sorted.find((card) => card.skills.includes(id)); if (candidate) add(candidate);
  }
  sorted.slice(0, Math.floor(limit * 0.6)).forEach(add);
  for (const id of targetOrder) {
    if ([...selected.values()].some((card) => card.skills.includes(id))) continue;
    const candidate = sorted.find((card) => card.skills.includes(id)); if (candidate) add(candidate);
  }
  sorted.forEach(add);
  return [...selected.values()].sort((a, b) => b.ownValue - a.ownValue || a.key.localeCompare(b.key));
}
function ownedBorrowShortlist(eligible: Candidate[], targets: SkillEvaluation[], weights: number[], limit: number): Candidate[] {
  const owned = eligible.filter((card) => card.ownership === 'owned');
  const borrowed = eligible.filter((card) => card.ownership === 'borrowed');
  if (borrowed.length === 0) return shortlist(owned, targets, weights, limit);
  // At most one unowned card can enter a legal deck, so it cannot crowd all
  // five/six necessary owned cards out of the candidate pool.
  const ownedQuota = Math.min(owned.length, Math.max(6, Math.floor(limit * 0.7)));
  const ownPool = shortlist(owned, targets, weights, ownedQuota);
  const borrowQuota = limit - ownPool.length;
  const borrowPool = shortlist(borrowed, targets, weights, borrowQuota);
  if (distinctOwners(ownPool) === 5 && borrowQuota > 0) {
    const ownKeys = new Set(ownPool.map(owner));
    const completingCard = [...borrowed].sort((a, b) => b.ownValue - a.ownValue || a.key.localeCompare(b.key))
      .find((card) => !ownKeys.has(owner(card)));
    if (completingCard && !borrowPool.some((card) => card.key === completingCard.key)) {
      if (borrowPool.length >= borrowQuota) borrowPool.pop();
      borrowPool.push(completingCard);
    }
  }
  return [...ownPool, ...borrowPool].sort((a, b) => b.ownValue - a.ownValue || a.key.localeCompare(b.key));
}
function stateFrom(indices: number[], candidates: Candidate[], weights: number[], targets: SkillEvaluation[], limit: number, bounds: { pruned: boolean }, required = new Set<number>()): State {
  let plans: CoveragePlan[] = [coveredPlan(new Set(), [], weights, targets, required)];
  const ordered = [...indices].sort((a, b) => a - b);
  for (const index of ordered) plans = addCardPlans(plans, candidates[index]!.plans, index, weights, targets, limit, bounds, required);
  const first = plans[0]!;
  return { indices: ordered, covered: first.covered, coverage: first.coverage, plans,
    key: indices.map((index) => candidates[index]!.key).sort().join('|') };
}
function createStateComparator(candidates: Candidate[], preference: NonNullable<SkillEvaluationRequest['preference']>, targets: SkillEvaluation[]) {
  const cache = new WeakMap<State, { penalty: number; types: number; hints: number; duplicate: number; priority: number }>();
  const structural = (state: State) => {
    const previous = cache.get(state); if (previous) return previous;
    const cards = state.indices.map((index) => candidates[index]!);
    const sr = cards.filter((card) => card.support.rarity === 'SR').length;
    const types = new Set(cards.map((card) => card.support.type)).size;
    const hints = cards.reduce((sum, card) => sum + new Set(card.routes.filter((route) => route.kind === 'hint').map((route) => route.skillId)).size, 0);
    const duplicate = state.plans[0]!.selected.reduce((sum, selected) => sum
      + candidates[selected.candidateIndex]!.plans[selected.planIndex]!.skills.length, 0) - state.covered.size;
    const penalty = preference === 'skills' ? Math.max(0, sr - 4) : Math.max(0, sr - 3);
    const priority = [...state.covered].filter((id) => targets[id]!.grade === 'priority').length;
    const result = { penalty, types, hints, duplicate, priority }; cache.set(state, result); return result;
  };
  return (a: State, b: State) => {
    const left = structural(a); const right = structural(b);
    // A partial state may acquire its required source from a later card. Giving
    // already-covered requirements absolute beam priority would discard useful
    // prefixes even when a high-quality legal completion exists.
    const value = (state: State) => state.indices.length < 6 ? Math.max(...state.plans.map((plan) => plan.coverage)) : state.coverage;
    return value(b) - value(a)
    || right.priority - left.priority
    || b.plans[0]!.core - a.plans[0]!.core
    || left.penalty - right.penalty
    || (preference === 'stability' ? right.types - left.types : 0)
    || (preference === 'skills' ? right.hints - left.hints : left.duplicate - right.duplicate)
      || a.key.localeCompare(b.key);
  };
}
function choose(n: number, k: number) { let result = 1; for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i; return result; }
function symmetricDifference(a: Set<number>, b: Set<number>) { return [...a].filter((id) => !b.has(id)).length + [...b].filter((id) => !a.has(id)).length; }

function describeDeck(
  state: State, position: number, best: State, candidates: Candidate[], targets: SkillEvaluation[], weights: number[], bonuses: number[],
  required: Set<number>, priority: number[], obtainable: Set<number>,
  request: P4RecommendationRequest, compare: (a: State, b: State) => number,
  makeState: (indices: number[]) => State, personalized: boolean,
): P4DeckRecommendation {
  const chosen = new Map(state.plans[0]!.selected.map((row) => [row.candidateIndex, candidates[row.candidateIndex]!.plans[row.planIndex]!]));
  const providerCounts = new Map<number, number>();
  for (const index of state.indices) for (const id of chosen.get(index)!.skills) providerCounts.set(id, (providerCounts.get(id) ?? 0) + 1);
  const skillIds = [...state.covered].map((id) => targets[id]!.skillId).sort();
  const duplicateSkillIds = [...providerCounts].filter(([, count]) => count > 1).map(([id]) => targets[id]!.skillId).sort();
  const cards: P4CardRecommendation[] = state.indices.map((index) => {
    const candidate = candidates[index]!;
    const plan = chosen.get(index)!;
    const unique = plan.skills.filter((id) => providerCounts.get(id) === 1);
    const green = plan.skills.filter((id) => targets[id]!.isGreen && isEffectiveTarget(targets[id]!));
    const reasons = [`선택한 양립 경로의 ${personalized ? '목표' : '유효 스킬'} ${plan.skills.length}개 · 이 카드만의 신규 기여 ${unique.length}개`];
    if (green.length) reasons.push(`유효 패시브 스킬 ${green.length}개: ${green.slice(0, 3).map((id) => targets[id]!.name).join(', ')}`);
    if (!unique.length) reasons.push('다른 카드와 목표 스킬이 겹칩니다. 신규 스킬 가산은 0이며 교체안을 비교하세요.');
    if (candidate.routes.some((route) => route.kind === 'event' || route.kind === 'gold-lower')) reasons.push('이벤트·금색 하위 경로는 선택지·완주 조건에 따라 달라지며 확정 획득이 아닙니다.');
    if (candidate.acquisitionBasis === 'jp-reference-forecast') reasons.push('미래시 가용 카드 · 한국 경로 미확보로 일본 수급 원자료 참고');
    if (candidate.ownership === 'borrowed') reasons.push('미보유 카드 1장 대여 슬롯');
    return { ...candidate.selection, name: candidate.support.displayName, rarity: candidate.support.rarity,
      type: candidate.support.type, ownerBaseId: candidate.support.ownerBaseId ?? null,
      ownership: candidate.ownership, availability: candidate.availability, acquisitionBasis: candidate.acquisitionBasis,
      skillIds: plan.skills.map((id) => targets[id]!.skillId).sort(), uniqueSkillIds: unique.map((id) => targets[id]!.skillId).sort(),
      duplicateSkillIds: plan.skills.filter((id) => (providerCounts.get(id) ?? 0) > 1).map((id) => targets[id]!.skillId).sort(),
      compatibleSkillIds: plan.skills.map((id) => targets[id]!.skillId).sort(),
      potentialSkillIds: candidate.potentialSkills.map((id) => targets[id]!.skillId).sort(),
      unresolvedEventSkillIds: candidate.unresolvedEventSkills.map((id) => targets[id]!.skillId).sort(), eventDecisions: plan.decisions,
      routes: candidate.routes, reasons, eventConditionNotes: candidate.eventConditionNotes };
  });
  const swaps: P4SwapAnalysis[] = [];
  for (const removed of state.indices) {
    const remaining = state.indices.filter((index) => index !== removed);
    const options: State[] = [];
    for (let add = 0; add < candidates.length; add++) {
      if (add === removed || !canAdd(remaining, add, candidates, request.ownedOnly === true)) continue;
      const next = makeState([...remaining, add]);
      if (![...required].every((id) => next.covered.has(id))) continue;
      if (symmetricDifference(next.covered, state.covered) > 0) options.push(next);
    }
    const top = options.sort(compare)[0]; if (!top) continue;
    const added = top.indices.find((index) => !remaining.includes(index))!;
    swaps.push({ removeSupportId: candidates[removed]!.key, addSupportId: candidates[added]!.key,
      addSupportName: candidates[added]!.support.displayName,
      gainedSkillIds: [...top.covered].filter((id) => !state.covered.has(id)).map((id) => targets[id]!.skillId).sort(),
      lostSkillIds: [...state.covered].filter((id) => !top.covered.has(id)).map((id) => targets[id]!.skillId).sort(),
      coverageValueDelta: [...top.covered].reduce((sum, id) => sum + weights[id]!, 0) - [...state.covered].reduce((sum, id) => sum + weights[id]!, 0),
      ...(personalized ? { preferenceBonusDelta: [...top.covered].reduce((sum, id) => sum + bonuses[id]!, 0) - [...state.covered].reduce((sum, id) => sum + bonuses[id]!, 0),
        customizedValueDelta: top.coverage - state.coverage } : {}),
      reasons: ['다른 5장을 유지하고 이벤트 분기를 다시 비교한 양립 가능 목표의 차이입니다. 마신 차이가 아닙니다.'] });
  }
  const srCount = cards.filter((card) => card.rarity === 'SR').length;
  const coverageValue = [...state.covered].reduce((sum, id) => sum + weights[id]!, 0);
  const preferenceBonus = [...state.covered].reduce((sum, id) => sum + bonuses[id]!, 0);
  return { deckId: state.key, cards,
    score: { coverageValue,
      ...(personalized ? { preferenceBonus, customizedValue: coverageValue + preferenceBonus } : {}),
      prioritySkillCount: [...state.covered].filter((id) => targets[id]!.grade === 'priority').length,
      usefulSkillCount: [...state.covered].filter((id) => targets[id]!.grade === 'useful').length,
      conditionalSkillCount: [...state.covered].filter((id) => targets[id]!.grade === 'conditional').length,
      greenSkillCount: [...state.covered].filter((id) => targets[id]!.isGreen && isEffectiveTarget(targets[id]!)).length,
      coreSkillCount: state.plans[0]!.core,
      duplicateSkillCount: duplicateSkillIds.length, srCount,
      extremeSrPenalty: Math.max(0, srCount - (request.preference === 'skills' ? 4 : 3)) },
    skillIds, compatibleSkillIds: skillIds,
    potentialSkillIds: [...new Set(cards.flatMap((card) => card.potentialSkillIds))].sort(),
    unresolvedEventSkillIds: [...new Set(cards.flatMap((card) => card.unresolvedEventSkillIds))].filter((id) => !skillIds.includes(id)).sort(),
    guaranteedSkillIds: [], eventDecisions: cards.flatMap((card) => card.eventDecisions),
    greenSkillIds: [...state.covered].filter((id) => targets[id]!.isGreen && isEffectiveTarget(targets[id]!)).map((id) => targets[id]!.skillId).sort(), duplicateSkillIds,
    missingPrioritySkillIds: priority.filter((id) => !state.covered.has(id)).map((id) => targets[id]!.skillId).sort(), swaps,
    missingImportantSkillIds: targets.flatMap((row, id) => obtainable.has(id) && !state.covered.has(id)
      && (row.grade === 'priority' || row.grade === 'useful' || row.core === 'candidate') ? [id] : [])
      .sort((a, b) => weights[b]! - weights[a]! || targets[a]!.skillId.localeCompare(targets[b]!.skillId))
      .map((id) => targets[id]!.skillId),
    gainedSkillIds: position === 0 ? [] : [...state.covered].filter((id) => !best.covered.has(id)).map((id) => targets[id]!.skillId).sort(),
    lostSkillIds: position === 0 ? [] : [...best.covered].filter((id) => !state.covered.has(id)).map((id) => targets[id]!.skillId).sort(),
    reasons: [`6장 전체의 서로 다른 ${personalized ? '일반 백인자 목표' : '유효 백인자 목표'} ${skillIds.length}개를 양립 가능한 경로로 노리는 조합입니다. 획득 보장은 아닙니다.`,
      personalized ? `기본 정성 ${coverageValue}점과 별도 사용자 선호 ${preferenceBonus}점을 구분합니다. 필수 목표는 점수 대신 같은 양립 계획의 수급 조건으로 적용합니다.`
        : `중복 없는 양립 목표의 정성 가치를 먼저 비교하고 동률에서 우선 패시브 스킬 ${state.plans[0]!.priority}개와 동일 조건 공략 참고 목표 ${state.plans[0]!.core}개를 비교합니다.`,
      `유효 패시브 스킬npm.cmd run check ${cards.length ? [...state.covered].filter((id) => targets[id]!.isGreen && isEffectiveTarget(targets[id]!)).length : 0}개 · 중복 스킬 ${duplicateSkillIds.length}개는 추가 커버리지로 합산하지 않습니다.`,
      ...(srCount >= 4 ? ['SR 중심 편성이므로 구성 다양성에서 완만한 후순위를 적용했습니다. 육성 완주율 계산은 아닙니다.'] : []),
      ...(position > 0 ? ['추천 1과 실제 스킬 합집합이 다른 대체 편성입니다.'] : [])] };
}
