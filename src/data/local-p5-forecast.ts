import type { DeepReadonly } from './snapshot';
import type { P3Snapshot } from '../domain/skill-support';
import { validateP5Snapshot, type P5Snapshot } from '../domain/p5-forecast';

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** P5 is optional and is never merged into the strict, immutable P3 pack. */
export async function loadLocalP5Forecast(base: DeepReadonly<P3Snapshot>): Promise<DeepReadonly<P5Snapshot> | null> {
  if (!import.meta.env.DEV) return null;
  const response = await fetch('/__local/p5-forecast', { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('P5 미래시 자료를 읽지 못했습니다.');
  const input: unknown = await response.json();
  if (typeof input === 'object' && input !== null && 'baseSnapshotId' in input && input.baseSnapshotId !== base.snapshotId) return null;
  try { return freeze(validateP5Snapshot(input, base)); }
  catch { throw new Error('P5 증분 자료의 계약·기존 ID 검증에 실패했습니다.'); }
}
