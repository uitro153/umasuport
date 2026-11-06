import { validateP3Snapshot, type P3Snapshot } from '../domain/skill-support';
import type { DeepReadonly } from './snapshot';

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Pin one validated local pack. Raw data is never imported into the static bundle. */
export async function loadLocalSkillSupport(): Promise<DeepReadonly<P3Snapshot>> {
  if (!import.meta.env.DEV) throw new Error('P3 로컬 자료는 개발 서버에서 연결합니다.');
  const response = await fetch('/__local/p3-skill-support', { cache: 'no-store' });
  if (!response.ok) throw new Error('P3 자료가 없습니다. data:import:p3 명령을 먼저 실행하세요.');
  const input: unknown = await response.json();
  try { return freeze(validateP3Snapshot(input)); }
  catch { throw new Error('P3 스냅샷 계약 검증에 실패했습니다. 변환 결과를 확인하세요.'); }
}
