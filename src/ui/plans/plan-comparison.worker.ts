import type { DeepReadonly } from '../../data/snapshot';
import type { SavedPlan } from '../../domain/saved-plan';
import type { P3Snapshot } from '../../domain/skill-support';
import { evaluateSavedSupportLineup } from '../../engine/plan-comparison';
import { recommendPersonalizedSupportDecks, type P4RecommendationRequest, type P6PersonalizedRecommendationResult } from '../../engine/support-deck-optimizer';

export type PlanComparisonWorkerMessage = { type: 'init'; snapshot: DeepReadonly<P3Snapshot> }
  | { type: 'compare'; signature: string; saved: SavedPlan; request: P4RecommendationRequest };
export type PlanComparisonWorkerResponse = { type: 'result'; signature: string; result: P6PersonalizedRecommendationResult; savedLineup: ReturnType<typeof evaluateSavedSupportLineup> }
  | { type: 'error'; signature: string; message: string };
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<PlanComparisonWorkerMessage>) => void) | null; postMessage: (value: PlanComparisonWorkerResponse) => void };
let snapshot: DeepReadonly<P3Snapshot> | null = null;
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') { snapshot = message.snapshot; return; }
  try {
    if (!snapshot) throw new Error('현재 추천 데이터를 먼저 불러와야 합니다.');
    scope.postMessage({ type: 'result', signature: message.signature,
      result: recommendPersonalizedSupportDecks(snapshot, message.request), savedLineup: evaluateSavedSupportLineup(message.saved, snapshot, message.request) });
  } catch (error: unknown) { scope.postMessage({ type: 'error', signature: message.signature, message: error instanceof Error ? error.message : '현재 데이터 비교 계산 실패' }); }
};
