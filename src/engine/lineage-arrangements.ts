import type { DeepReadonly } from '../data/snapshot';
import type { ReferenceSnapshot } from '../domain/reference';
import { applyLineageGrandparentArrangement, extractPedigree, type LineagePlan } from '../domain/lineage';
import { GRANDPARENT_SLOT_KEYS, SLOT_KEYS, type GrandparentSlotKey } from '../domain/pedigree';
import { calculateReferencePedigree, compareReferencePedigreeResults, type ReferencePedigreeResult } from './reference-pedigree';
import { findLineageCharacterIssues } from './lineage-validity';

export interface LineageArrangement {
  arrangementId: string;
  plan: LineagePlan;
  pedigree: ReturnType<typeof extractPedigree>;
  result: ReferencePedigreeResult;
  originalSlotKeys: GrandparentSlotKey[];
}

/** Reconnect whole factor-owner subtrees; equal costumes do not erase distinct bloodlines. */
export function enumerateLineageArrangements(plan: DeepReadonly<LineagePlan>, snapshot: DeepReadonly<ReferenceSnapshot>): LineageArrangement[] {
  const pedigree = extractPedigree(plan);
  if (SLOT_KEYS.some((key) => pedigree[key].costumeId === null)) return [];
  const results: LineageArrangement[] = [];
  for (let first = 0; first < 3; first++) {
    for (let second = first + 1; second < 4; second++) {
      const chosen = [GRANDPARENT_SLOT_KEYS[first]!, GRANDPARENT_SLOT_KEYS[second]!];
      const remaining = GRANDPARENT_SLOT_KEYS.filter((_, index) => index !== first && index !== second);
      const originalSlotKeys = [...chosen, ...remaining];
      let next: LineagePlan;
      try { next = applyLineageGrandparentArrangement(plan, originalSlotKeys); }
      catch { continue; } // Fixed parent bloodlines cannot be changed by a planning proposal.
      if (findLineageCharacterIssues(next, snapshot).length) continue;
      const proposed = extractPedigree(next);
      results.push({ arrangementId: `${chosen.join('+')}|${remaining.join('+')}`, plan: next, pedigree: proposed,
        originalSlotKeys, result: calculateReferencePedigree(proposed, snapshot, { allowUnverifiedFormula: true }) });
    }
  }
  return results.sort((a, b) => compareReferencePedigreeResults(a.result, b.result) || a.arrangementId.localeCompare(b.arrangementId));
}
