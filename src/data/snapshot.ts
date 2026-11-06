import fixture from '../../data/fixtures/p0.snapshot.json';
import { validateSnapshot, type Snapshot } from '../domain';

export type DeepReadonly<T> = T extends object
  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T;

export type PinnedSnapshot = DeepReadonly<Snapshot>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Parse into a fresh object and pin one immutable dataset for the entire calculation. */
export function pinSnapshot(input: unknown): PinnedSnapshot {
  return deepFreeze(validateSnapshot(input));
}

// This is the only application data entry point during P0. Raw downloads are never bundled.
export const activeSnapshot = pinSnapshot(fixture);
