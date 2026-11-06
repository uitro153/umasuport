import { applyReferenceReleaseEvidence } from './reference-evidence';
import { validateReferenceSnapshot, type ReferenceSnapshot } from '../domain/reference';
import type { DeepReadonly } from './snapshot';

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The development endpoint never exists in a static production build. */
export async function loadLocalReference(): Promise<DeepReadonly<ReferenceSnapshot>> {
  if (!import.meta.env.DEV) throw new Error('로컬 자료 연결은 개발 서버에서 사용할 수 있습니다.');
  const response = await fetch('/__local/p1-reference', { cache: 'no-store' });
  if (!response.ok) throw new Error('변환된 로컬 자료가 없습니다. 먼저 data:import 명령을 실행하세요.');
  const input: unknown = await response.json();
  try { return freeze(applyReferenceReleaseEvidence(validateReferenceSnapshot(input))); }
  catch { throw new Error('로컬 P1 스냅샷 계약 검증에 실패했습니다. data:import 결과를 확인하세요.'); }
}
