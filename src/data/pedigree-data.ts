import snapshotInput from '../../data/fixtures/p1.snapshot.json';
import rulesInput from '../../data/fixtures/p1.rules.json';
import { validatePedigreeRules, type P1Rules } from '../domain';
import { pinSnapshot, type DeepReadonly } from './snapshot';

function freezeRules<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeRules(child);
    Object.freeze(value);
  }
  return value;
}

/** P1 has one explicit data/rule boundary; the original P0 fixture stays unchanged. */
export const pedigreeSnapshot = pinSnapshot(snapshotInput);
export const pedigreeRules: DeepReadonly<P1Rules> = freezeRules(validatePedigreeRules(rulesInput, pedigreeSnapshot));
