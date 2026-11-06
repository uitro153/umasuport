import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import { recommendPersonalizedSupportDecks, type P4RecommendationRequest, type P6PersonalizedRecommendationResult } from '../../engine/support-deck-optimizer';

export type RecommendationWorkerMessage = { type: 'init'; snapshot: DeepReadonly<P3Snapshot> }
  | { type: 'recommend'; signature: string; request: P4RecommendationRequest };
export type RecommendationWorkerResponse = { type: 'result'; signature: string; result: P6PersonalizedRecommendationResult }
  | { type: 'error'; signature: string; message: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RecommendationWorkerMessage>) => void) | null;
  postMessage: (message: RecommendationWorkerResponse) => void;
};
let snapshot: DeepReadonly<P3Snapshot> | null = null;
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') { snapshot = message.snapshot; return; }
  try {
    if (!snapshot) throw new Error('추천 데이터를 아직 불러오지 못했습니다.');
    scope.postMessage({ type: 'result', signature: message.signature, result: recommendPersonalizedSupportDecks(snapshot, message.request) });
  } catch (error: unknown) {
    scope.postMessage({ type: 'error', signature: message.signature, message: error instanceof Error ? error.message : '편성 추천을 계산하지 못했습니다.' });
  }
};
