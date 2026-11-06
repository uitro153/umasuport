import { GRANDPARENT_SLOT_KEYS, SLOT_KEYS, type GrandparentSlotKey, type P1Rules, type Pedigree } from '../domain/pedigree';
import type { DeepReadonly, PinnedSnapshot } from '../data/snapshot';
import { calculateAffinity, compareAffinityResults, type AffinityResult } from './affinity';

export interface GrandparentArrangement {
  arrangementId: string;
  pedigree: Pedigree;
  result: AffinityResult;
  /** Source grandparent slots in the new A1, A2, B1, B2 order. */
  originalSlotKeys: GrandparentSlotKey[];
}

function clonePedigree(input: DeepReadonly<Pedigree>): Pedigree {
  return Object.fromEntries(SLOT_KEYS.map((key) => [key, {
    costumeId: input[key].costumeId,
    redFactor: input[key].redFactor === null ? null : { ...input[key].redFactor },
  }])) as Pedigree;
}

/**
 * Keep target and parents fixed. Choose two of four source slots for parent A;
 * the remaining two go to parent B. Sibling order is canonical, yielding C(4,2).
 * This returns planning proposals only and never modifies the supplied pedigree.
 */
export function enumerateGrandparentArrangements(
  pedigree: DeepReadonly<Pedigree>,
  snapshot: PinnedSnapshot,
  rules: DeepReadonly<P1Rules>,
): GrandparentArrangement[] {
  if (!SLOT_KEYS.every((key) => pedigree[key].costumeId !== null)) return [];

  const arrangements: GrandparentArrangement[] = [];
  for (let first = 0; first < GRANDPARENT_SLOT_KEYS.length - 1; first++) {
    for (let second = first + 1; second < GRANDPARENT_SLOT_KEYS.length; second++) {
      const chosen = [GRANDPARENT_SLOT_KEYS[first]!, GRANDPARENT_SLOT_KEYS[second]!];
      const remaining = GRANDPARENT_SLOT_KEYS.filter((_, index) => index !== first && index !== second);
      const originalSlotKeys = [...chosen, ...remaining];
      const candidate = clonePedigree(pedigree);
      GRANDPARENT_SLOT_KEYS.forEach((destinationKey, index) => {
        const source = pedigree[originalSlotKeys[index]!];
        candidate[destinationKey] = {
          costumeId: source.costumeId,
          redFactor: source.redFactor === null ? null : { ...source.redFactor },
        };
      });
      arrangements.push({
        arrangementId: `${chosen.join('+')}|${remaining.join('+')}`,
        pedigree: candidate,
        result: calculateAffinity(candidate, snapshot, rules),
        originalSlotKeys,
      });
    }
  }
  return arrangements.sort((a, b) => compareAffinityResults(a.result, b.result)
    || (a.arrangementId < b.arrangementId ? -1 : a.arrangementId > b.arrangementId ? 1 : 0));
}
