import type { DeepReadonly } from '../data/snapshot';
import type { P5Snapshot } from '../domain/p5-forecast';
import type { P3Snapshot } from '../domain/skill-support';
import { getP5Availability } from './p5-availability';
import type { P4RecommendationRequest, P4RecommendationResult } from './support-deck-optimizer';

export type LateRecommendationClass = 'base-included' | 'ordinary-alternative' | 'separate' | 'review-held' | 'not-eligible';
export interface LateReleaseAnalysis {
  entityType: 'support' | 'scenario' | 'costume'; entityId: string; name: string;
  timing: 'dated-forecast' | 'monthly-forecast'; displayReleaseDate: string;
  displayDays: number | null; displayDayRange: { minimum: number; maximum: number } | null;
  state: 'available' | 'unavailable' | 'unknown'; classification: LateRecommendationClass;
  gainedSkillIds: string[]; lostSkillIds: string[]; qualitativeValueDelta: number | null;
  uniqueContributionSkillIds: string[];
  reworkBurden: 'unverified'; separateRecommendation: false; reason: string;
}

/** Two independent requirements; proximity alone never creates a separate deck. */
export function classifyLateRecommendation(input: {
  available: boolean; selectedInBase: boolean; hasAlternative: boolean; meaningfulIncrement: boolean;
  rework: { status: 'unverified' | 'documented-high'; evidence: string | null };
}): LateRecommendationClass {
  if (!input.available) return 'not-eligible';
  if (input.selectedInBase) return 'base-included';
  if (input.meaningfulIncrement && input.rework.status === 'documented-high' && input.rework.evidence?.trim()) return 'separate';
  return input.hasAlternative ? 'ordinary-alternative' : 'review-held';
}

/** Re-evaluate the supplied screening queue with the common JP-order comparator. */
export function analyzeP5LateReleases(
  snapshot: DeepReadonly<P3Snapshot>, pack: DeepReadonly<P5Snapshot>, request: P4RecommendationRequest,
  result: P4RecommendationResult,
): LateReleaseAnalysis[] {
  if (!request.forecast) return [];
  const eventId = request.forecast.eventId;
  const primary = result.recommendations[0];
  const rows = new Map(result.skillEvaluations.map((row) => [row.skillId, row]));
  const dated = pack.lateRelease.screeningQueue.filter((row) => row.eventId === eventId);
  const monthly = pack.lateRelease.monthlyScreeningQueue.filter((row) => row.eventId === eventId);
  return [...dated, ...monthly].map((item) => {
    const release = pack.releases.find((row) => row.entityType === item.entityType && row.entityId === item.entityId)!;
    const availability = getP5Availability(snapshot, item.entityType, item.entityId, request.forecast!, request.allowForecast);
    const card = primary?.cards.find((row) => row.supportId === item.entityId && item.entityType === 'support');
    const swaps = primary?.swaps.filter((row) => row.addSupportId === item.entityId && item.entityType === 'support') ?? [];
    const swap = [...swaps].sort((a, b) => b.coverageValueDelta - a.coverageValueDelta || a.removeSupportId.localeCompare(b.removeSupportId))[0];
    const inAlternative = result.recommendations.slice(1).some((deck) => deck.cards.some((row) => row.supportId === item.entityId && item.entityType === 'support'));
    const gained = swap?.gainedSkillIds ?? [];
    const lost = swap?.lostSkillIds ?? [];
    const coreDelta = gained.filter((id) => rows.get(id)?.valueEvidence.core.status === 'guide-priority').length
      - lost.filter((id) => rows.get(id)?.valueEvidence.core.status === 'guide-priority').length;
    const greenDelta = gained.filter((id) => rows.get(id)?.grade === 'priority').length
      - lost.filter((id) => rows.get(id)?.grade === 'priority').length;
    const delta = swap?.coverageValueDelta ?? null;
    const meaningfulIncrement = delta !== null && (delta > 0 || delta === 0 && (coreDelta > 0 || greenDelta > 0));
    // Handoff explicitly leaves parent/grandparent rework dependent on owned
    // factors. No current record documents a high burden, so none is fabricated.
    const classification = classifyLateRecommendation({ available: availability.state === 'available', selectedInBase: !!card,
      hasAlternative: !!swap || inAlternative, meaningfulIncrement, rework: { status: 'unverified', evidence: null } });
    const monthlyItem = 'daysUntilEventRange' in item;
    return {
      entityType: item.entityType, entityId: item.entityId, name: release.displayName,
      timing: monthlyItem ? 'monthly-forecast' as const : 'dated-forecast' as const,
      displayReleaseDate: item.forecastReleaseDate,
      displayDays: monthlyItem ? null : 'daysUntilEvent' in item && typeof item.daysUntilEvent === 'number' ? item.daysUntilEvent : null,
      displayDayRange: monthlyItem && typeof item.daysUntilEventRange === 'object' && item.daysUntilEventRange !== null
        ? item.daysUntilEventRange as { minimum: number; maximum: number } : null,
      state: availability.state, classification, gainedSkillIds: [...gained], lostSkillIds: [...lost], qualitativeValueDelta: delta,
      uniqueContributionSkillIds: [...(card?.uniqueSkillIds ?? [])],
      reworkBurden: 'unverified' as const, separateRecommendation: false as const,
      reason: classification === 'base-included' ? '기본 추천에 반영했습니다. 같은 콘텐츠 때문에 별도 편성을 추가하지 않습니다.'
        : classification === 'ordinary-alternative' ? '일반 교체·대체 편성으로 비교합니다. 부모·조부 인자 재제작 부담의 확인 근거가 없어 별도 추천으로 승격하지 않습니다.'
          : classification === 'not-eligible' ? availability.evidence
            : item.entityType !== 'support' ? '의상·시나리오를 서포트 카드나 일반 백인자 수급처로 새로 만들지 않습니다. 별도 추천 가치와 재제작 부담은 미확인입니다.'
              : '출시 시점만으로 별도 추천하지 않습니다. 전체 편성의 추가 이득과 인자 재제작 부담을 확인하지 못했습니다.',
    };
  });
}
