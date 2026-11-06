import type { DeepReadonly } from '../data/snapshot';
import type { SavedPlan, WorkspaceInputs } from '../domain/saved-plan';
import { validateSavedPlan } from '../domain/saved-plan';
import { extractPedigree, getLineageSlots, type LineageConstraints } from '../domain/lineage';
import type { ReferenceSnapshot } from '../domain/reference';
import type { P3Snapshot } from '../domain/skill-support';
import { mergeP5Tournaments, type P5Snapshot } from '../domain/p5-forecast';
import { calculateReferencePedigree } from './reference-pedigree';
import { calculateReferenceAptitudes } from './reference-aptitude';
import { evaluateLineage } from './lineage-evaluation';
import { factorOnlyConstraints } from './lineage-goals';
import { findLineageCharacterIssues } from './lineage-validity';
import { buildLineageRecommendationRequest } from './lineage-skills';
import { buildP5AvailabilityContext } from './p5-availability';
import { getP3Availability } from './support-acquisition';
import type { SkillAcquisitionRoute } from './support-acquisition';
import { getReferenceAvailability } from './reference-availability';
import { buildSupportEventModel } from './event-acquisition';
import { inspectSupportLineup, type P4DeckRecommendation, type P4RecommendationRequest, type P4RecommendationResult } from './support-deck-optimizer';

const same = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const completeSetDifference = (left: readonly string[], right: readonly string[]) => {
  const excluded = new Set(right); return [...new Set(left)].filter((id) => !excluded.has(id)).sort();
};

export interface PlanNodeDifference {
  nodeId: string; leftLabel: string | null; rightLabel: string | null;
  changed: ('position' | 'costume' | 'instance' | 'bloodline' | 'red-factor' | 'lock' | 'white-factors' | 'node-priorities')[];
}
export interface SavedPlanInputComparison {
  nodes: PlanNodeDifference[];
  changedSettings: string[];
  snapshotChanges: { side: 'left' | 'right'; key: keyof SavedPlan['snapshotIds']; saved: string | null; current: string | null }[];
}

/** Compare canonical IDs/physical instances, never translated names or record hashes. */
export function compareSavedPlanInputs(left: SavedPlan, right: SavedPlan, currentSnapshots: SavedPlan['snapshotIds']): SavedPlanInputComparison {
  const a = validateSavedPlan(left); const b = validateSavedPlan(right);
  const leftSlots = new Map(getLineageSlots(a.inputs.referencePlan).map((slot) => [slot.nodeId, slot]));
  const rightSlots = new Map(getLineageSlots(b.inputs.referencePlan).map((slot) => [slot.nodeId, slot]));
  const nodes = [...new Set([...leftSlots.keys(), ...rightSlots.keys()])].map((nodeId): PlanNodeDifference => {
    const x = a.inputs.referencePlan.nodes[nodeId]; const y = b.inputs.referencePlan.nodes[nodeId];
    const changed: PlanNodeDifference['changed'] = [];
    if (leftSlots.get(nodeId)?.path !== rightSlots.get(nodeId)?.path) changed.push('position');
    if (x?.costumeId !== y?.costumeId) changed.push('costume');
    if (a.inputs.factorInstances[nodeId]?.factorInstanceId !== b.inputs.factorInstances[nodeId]?.factorInstanceId) changed.push('instance');
    if (!same(x?.parentIds, y?.parentIds) || a.inputs.factorInstances[nodeId]?.bloodlineStatus !== b.inputs.factorInstances[nodeId]?.bloodlineStatus) changed.push('bloodline');
    if (!same(x?.redFactor, y?.redFactor)) changed.push('red-factor');
    if (x?.locked !== y?.locked) changed.push('lock');
    if (!same(a.inputs.whiteFactors.nodes[nodeId], b.inputs.whiteFactors.nodes[nodeId])) changed.push('white-factors');
    if (!same(a.inputs.whiteFactors.nodePriorities[nodeId], b.inputs.whiteFactors.nodePriorities[nodeId])) changed.push('node-priorities');
    return { nodeId, leftLabel: leftSlots.get(nodeId)?.label ?? null, rightLabel: rightSlots.get(nodeId)?.label ?? null, changed };
  }).filter((row) => row.changed.length);
  const keys = ['globalPriorities', 'referenceFilters', 'lineageDesign', 'skillSettings', 'supportSettings', 'selectedNodeId'] as const;
  return { nodes, changedSettings: keys.filter((key) => !same(a.inputs[key], b.inputs[key])),
    snapshotChanges: ([['left', a], ['right', b]] as const).flatMap(([side, plan]) => (Object.keys(currentSnapshots) as (keyof SavedPlan['snapshotIds'])[])
      .filter((key) => plan.snapshotIds[key] !== currentSnapshots[key]).map((key) => ({ side, key, saved: plan.snapshotIds[key], current: currentSnapshots[key] }))) };
}

/** Match the active factor-only designer; legacy V1 fields are retained, not evaluated. */
export function savedPlanLineageConstraints(inputs: WorkspaceInputs): LineageConstraints {
  return factorOnlyConstraints(inputs.referencePlan);
}

export function evaluateSavedPlanLineage(saved: SavedPlan, reference: DeepReadonly<ReferenceSnapshot>) {
  const { inputs } = validateSavedPlan(saved);
  const realNodes = getLineageSlots(inputs.referencePlan).filter(slot => slot.depth <= 2).map(slot => inputs.referencePlan.nodes[slot.nodeId]!);
  const issues = realNodes.flatMap((node) => node.costumeId && !reference.costumes.some((row) => row.costumeId === node.costumeId) ? [`${node.nodeId}: 의상 ID ${node.costumeId}를 현재 데이터에서 확인할 수 없습니다.`] : []);
  issues.push(...findLineageCharacterIssues(inputs.referencePlan, reference).map(issue => issue.message));
  for (const node of realNodes) {
    if (!node.costumeId) continue;
    const availability = getReferenceAvailability(reference.applications.find((row) => row.entityId === node.costumeId), inputs.referenceFilters.dateInput, { allowForecast: inputs.referenceFilters.allowForecast });
    if (availability.state === 'unavailable' || availability.state === 'unknown' && !inputs.referenceFilters.includeUnknown) issues.push(`${node.nodeId}: 저장한 출시 필터에서 의상 ${node.costumeId}가 제외됩니다.`);
  }
  const unconfirmed = Object.entries(inputs.factorInstances).filter(([id, item]) => realNodes.some(node => node.nodeId === id) && item.bloodlineStatus === 'unconfirmed').map(([nodeId]) => nodeId);
  if (unconfirmed.length) issues.push(`인자 교체 후 혈통 재확인 필요: ${unconfirmed.join(', ')}. 의존 계보 계산을 보류합니다.`);
  if (issues.length) return { blocked: true, issues, affinity: null, aptitudes: null, lineage: null };
  const pedigree = extractPedigree(inputs.referencePlan);
  return { blocked: false, issues, affinity: calculateReferencePedigree(pedigree, reference, { allowUnverifiedFormula: true }),
    aptitudes: calculateReferenceAptitudes(pedigree, reference), lineage: evaluateLineage(inputs.referencePlan, reference, savedPlanLineageConstraints(inputs)) };
}

/** Rebuild the request from input only. A saved score/skill union is never read. */
export function buildSavedPlanRecommendationRequest(saved: SavedPlan, snapshot: DeepReadonly<P3Snapshot>, p5: DeepReadonly<P5Snapshot> | null, today: string): P4RecommendationRequest {
  const { inputs } = validateSavedPlan(saved); const settings = inputs.skillSettings;
  const tournaments = p5 ? mergeP5Tournaments(snapshot, p5) : snapshot.tournaments.map((event) => ({ ...event, forecast: null }));
  const tournament = tournaments.find((event) => event.eventId === settings.eventId);
  if (!tournament) throw new Error(`대회 ID ${settings.eventId}를 현재 데이터에서 확인할 수 없습니다.`);
  const course = snapshot.courses.find((row) => row.courseId === tournament.courseId);
  if (!course) throw new Error(`코스 ID ${tournament.courseId}가 없습니다.`);
  const eventForecast = p5 && tournament.forecast ? buildP5AvailabilityContext(snapshot, p5, settings.eventId) ?? undefined : undefined;
  const forecast = settings.mode === 'tournament' && tournament.dateStatus !== 'confirmed' ? eventForecast : undefined;
  if (settings.mode === 'tournament' && !tournament.startAt && !forecast?.jpEventDate) throw new Error('대회 시점과 일본 원본 출시 순서를 확인할 수 없어 비교 계산을 보류합니다.');
  const cutoffDate = forecast ? forecast.krExpectedDate ?? forecast.asOf : settings.mode === 'current' ? today
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(tournament.startAt!));
  const ids = [...settings.deck, ...inputs.supportSettings.ownedSupports].flatMap((card) => card.supportId ? [card.supportId] : []);
  for (const id of ids) if (!snapshot.supports.some((row) => row.supportId === id)) throw new Error(`서포트 ID ${id}가 현재 데이터에 없습니다.`);
  if (!snapshot.scenarios.some((row) => row.scenarioId === settings.scenarioId)) throw new Error(`시나리오 ID ${settings.scenarioId}가 없습니다.`);
  // Keep the saved selector input intact, matching SkillAnalysisPage: its
  // displayed/evaluated scenario falls back only in a P5 forecast context.
  const scenarioAvailability = getP3Availability(snapshot, 'scenario', settings.scenarioId, cutoffDate, settings.allowForecast, forecast);
  const selectedScenarioId = !forecast || scenarioAvailability.state === 'available' ? settings.scenarioId
    : snapshot.scenarios.find((scenario) => getP3Availability(snapshot, 'scenario', scenario.scenarioId, cutoffDate, settings.allowForecast, forecast).state === 'available')?.scenarioId ?? '';
  const skillIds = [...inputs.globalPriorities.map((row) => row.skillId), ...Object.values(inputs.whiteFactors.nodes).flatMap((row) => row.records.map((record) => record.skillId)), ...Object.values(inputs.whiteFactors.nodePriorities).flatMap((row) => row.priorities.map((goal) => goal.skillId))];
  for (const id of skillIds) if (!snapshot.skills.some((row) => row.skillId === id)) throw new Error(`보존된 스킬 ID ${id}가 현재 데이터에 없어 비교를 보류합니다.`);
  const request: P4RecommendationRequest = {
    course: { courseId: course.courseId, trackId: course.trackId, distanceM: tournament.conditions.distance,
      surface: tournament.conditions.surface === 1 ? 'turf' : 'dirt', rotation: tournament.conditions.direction,
      season: tournament.conditions.season, weather: tournament.conditions.weather, groundCondition: tournament.conditions.ground },
    runningStyle: settings.runningStyle, cutoffDate, allowForecast: settings.allowForecast, includeUnknown: settings.includeUnknown,
    preference: settings.preference, scenarioId: selectedScenarioId || null, forecast,
    deck: settings.deck.flatMap((card) => card.supportId ? [{ supportId: card.supportId, limitBreak: card.limitBreak }] : []),
    ownedSupports: inputs.supportSettings.ownedSupports, ownedOnly: inputs.supportSettings.ownedOnly, allowBorrow: inputs.supportSettings.allowBorrow,
    skillPriorities: inputs.globalPriorities,
  };
  if (inputs.selectedNodeId) return buildLineageRecommendationRequest(snapshot, { ...request, forecast: eventForecast, cutoffDate: eventForecast?.krExpectedDate ?? today }, {
    plan: inputs.referencePlan, state: inputs.whiteFactors, nodeId: inputs.selectedNodeId,
    mode: settings.nodeModes[inputs.selectedNodeId] ?? 'current', today, includeGlobal: false,
  });
  return request;
}

export function compareRecommendationContexts(left: P4RecommendationRequest, right: P4RecommendationRequest) {
  const keys = ['course', 'runningStyle', 'scenarioId', 'cutoffDate', 'forecast', 'allowForecast', 'includeUnknown', 'preference', 'deck', 'ownedSupports', 'ownedOnly', 'allowBorrow'] as const;
  const value = (request: P4RecommendationRequest, key: typeof keys[number]) => key === 'deck' || key === 'ownedSupports'
    ? [...(request[key] ?? [])].sort((a, b) => a.supportId.localeCompare(b.supportId)) : request[key] ?? null;
  const differentConditions = keys.filter((key) => !same(value(left, key), value(right, key)));
  return { sameConditions: differentConditions.length === 0, differentConditions, sameUserGoals: same([...(left.skillPriorities ?? [])].sort((a,b) => a.skillId.localeCompare(b.skillId)), [...(right.skillPriorities ?? [])].sort((a,b) => a.skillId.localeCompare(b.skillId))) };
}

/** Saved cards are a lineup to audit, not cached score/skill evidence. */
export function evaluateSavedSupportLineup(saved: SavedPlan, snapshot: DeepReadonly<P3Snapshot>, request: P4RecommendationRequest) {
  const cards = saved.resultSnapshot?.cards;
  if (!cards) return { available: false as const, issues: [] as string[], inspection: null };
  const issues: string[] = []; const ownerIds = new Set<string>(); let borrowed = 0;
  const ownership = new Map<string, 'owned' | 'borrowed' | 'unregistered'>();
  for (const card of cards) {
    const record = snapshot.supports.find((row) => row.supportId === card.supportId);
    if (!record) { issues.push(`서포트 ${card.supportId}: 현재 ID 누락`); continue; }
    const availability = getP3Availability(snapshot, 'support', card.supportId, request.cutoffDate, request.allowForecast, request.forecast);
    if (availability.state !== 'available') issues.push(`서포트 ${card.supportId}: 출시 ${availability.state} / ${availability.basis}`);
    if (record.ownerBaseId && ownerIds.has(record.ownerBaseId)) issues.push(`서포트 ${card.supportId}: 동일 캐릭터 편성 중복`);
    if (record.ownerBaseId) ownerIds.add(record.ownerBaseId);
    const owned = request.ownedSupports?.find((row) => row.supportId === card.supportId);
    if (owned && owned.limitBreak >= card.limitBreak) ownership.set(card.supportId, 'owned');
    else if (card.ownership === 'borrowed' || request.ownedOnly) {
      borrowed++; ownership.set(card.supportId, 'borrowed');
      if (request.allowBorrow === false) issues.push(`서포트 ${card.supportId}: 저장 돌파의 보유 카드가 없고 대여가 허용되지 않음`);
    } else ownership.set(card.supportId, 'unregistered');
  }
  if (borrowed > 1) issues.push(`대여가 필요한 카드 ${borrowed}장: 최대 1장 제한 초과`);
  if (issues.length) return { available: true as const, issues, inspection: null };
  const inspection = inspectSupportLineup(snapshot, request, cards.map(({ supportId, limitBreak }) => ({ supportId, limitBreak })));
  for (const card of inspection.deck?.cards ?? []) card.ownership = ownership.get(card.supportId) ?? 'unregistered';
  return { available: true as const, issues, inspection };
}

/** Same AND-of-event-groups check used by the P7 on-screen route comparison. */
export function getCompatiblePlanRoutes(snapshot: DeepReadonly<P3Snapshot>, deck: P4DeckRecommendation, scenarioId?: string | null): SkillAcquisitionRoute[] {
  return deck.cards.flatMap((card) => {
    const model = buildSupportEventModel(snapshot, card.supportId, { scenarioId: scenarioId ?? undefined, allowJpReference: true });
    const decisions = new Map(card.eventDecisions.map((choice) => [choice.groupId, choice.optionId]));
    return card.routes.filter((route) => {
      if (!card.skillIds.includes(route.skillId) || !deck.compatibleSkillIds.includes(route.skillId)) return false;
      if (route.sourceKind === 'hint') return true;
      const groups = model.groups.filter((group) => group.options.some((option) => option.sourceSkillIds.includes(route.sourceSkillId)));
      return groups.length > 0 && groups.every((group) => group.status === 'modeled' && group.options.some((option) => option.optionId === decisions.get(group.groupId) && option.sourceSkillIds.includes(route.sourceSkillId)));
    });
  });
}

export function compareFreshSupportDecks(left: P4DeckRecommendation, right: P4DeckRecommendation, verifiedRoutes?: { left: readonly SkillAcquisitionRoute[]; right: readonly SkillAcquisitionRoute[] }) {
  const routeKey = (route: P4DeckRecommendation['cards'][number]['routes'][number]) => `${route.supportId}/${route.skillId}/${route.kind}/${route.sourceSkillId}/${route.sourceServer ?? '?'}`;
  // Without the selected event-group model, only hint routes are certifiable.
  const routes = (deck: P4DeckRecommendation) => deck.cards.flatMap((card) => card.routes.filter((route) => route.sourceKind === 'hint' && deck.compatibleSkillIds.includes(route.skillId)).map(routeKey));
  return {
    gainedSkillIds: completeSetDifference(right.compatibleSkillIds, left.compatibleSkillIds), lostSkillIds: completeSetDifference(left.compatibleSkillIds, right.compatibleSkillIds),
    gainedGreenSkillIds: completeSetDifference(right.greenSkillIds, left.greenSkillIds), lostGreenSkillIds: completeSetDifference(left.greenSkillIds, right.greenSkillIds),
    gainedRoutes: completeSetDifference(verifiedRoutes ? verifiedRoutes.right.map(routeKey) : routes(right), verifiedRoutes ? verifiedRoutes.left.map(routeKey) : routes(left)), lostRoutes: completeSetDifference(verifiedRoutes ? verifiedRoutes.left.map(routeKey) : routes(left), verifiedRoutes ? verifiedRoutes.right.map(routeKey) : routes(right)),
    eventPlansChanged: !same(left.eventDecisions, right.eventDecisions),
    cardsChanged: !same(left.cards.map((card) => [card.supportId, card.limitBreak, card.ownership]).sort(), right.cards.map((card) => [card.supportId, card.limitBreak, card.ownership]).sort()),
  };
}
export function firstCurrentDeck(result: { base: P4RecommendationResult; customized: P4RecommendationResult | null }) {
  const selected = result.customized ?? result.base;
  return { result: selected, deck: selected.recommendations[0] ?? null };
}
