import { SLOT_KEYS, type P1Rules, type Pedigree, type SlotKey } from '../domain/pedigree';
import type { DeepReadonly, PinnedSnapshot } from '../data/snapshot';

export type AffinityStatus = 'complete' | 'partial' | 'unavailable' | 'invalid';

export interface AffinityContribution {
  termId: string;
  label: string;
  slotA: SlotKey;
  slotB: SlotKey;
  /** Null means an unselected or unverified relationship, never an assumed zero. */
  value: number | null;
  sourceIds: readonly string[];
}

export interface AffinityResult {
  status: AffinityStatus;
  /** A total is published only for a complete pedigree with all required pairs. */
  total: number | null;
  partialTotal: number;
  contributions: AffinityContribution[];
  issues: string[];
}

const slotLabels: Record<SlotKey, string> = {
  target: '본육성 대상', parentA: '부모 A', parentB: '부모 B',
  grandA1: '조부 A1', grandA2: '조부 A2', grandB1: '조부 B1', grandB2: '조부 B2',
};

const unorderedPair = (a: string, b: string): string => [a, b].sort().join('|');

/**
 * Apply the explicitly versioned relationship recipe to base-character pairs.
 * P1's recipe and numbers are synthetic fixtures, not a verified game formula.
 * This function has no race-win input or G1 bonus path.
 */
export function calculateAffinity(
  pedigree: DeepReadonly<Pedigree>,
  snapshot: PinnedSnapshot,
  rules: DeepReadonly<P1Rules>,
): AffinityResult {
  const issues: string[] = [];
  let invalid = false;
  let missingData = false;
  if (rules.snapshotId !== snapshot.snapshotId) {
    issues.push('상성 규칙과 데이터 스냅샷 버전이 일치하지 않습니다.');
    invalid = true;
  }

  const costumes = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume]));
  const baseIds = new Map<SlotKey, string>();
  for (const slotKey of SLOT_KEYS) {
    const costumeId = pedigree[slotKey].costumeId;
    if (costumeId === null) continue;
    const costume = costumes.get(costumeId);
    if (!costume) {
      issues.push(`${slotLabels[slotKey]}의 의상 데이터를 찾을 수 없습니다.`);
      invalid = true;
    } else baseIds.set(slotKey, costume.baseId);
  }

  for (const [slotA, slotB] of rules.affinity.forbiddenSameBasePairs) {
    const baseA = baseIds.get(slotA);
    const baseB = baseIds.get(slotB);
    if (baseA !== undefined && baseA === baseB) {
      issues.push(`${slotLabels[slotA]}와 ${slotLabels[slotB]}에 같은 인물을 배치할 수 없는 규칙입니다.`);
      invalid = true;
    }
  }

  const pairs = new Map(snapshot.affinities.map((pair) => [unorderedPair(pair.aBaseId, pair.bBaseId), pair]));
  let partialTotal = 0;
  const contributions = rules.affinity.terms.map((term): AffinityContribution => {
    const baseA = baseIds.get(term.slotA);
    const baseB = baseIds.get(term.slotB);
    if (baseA === undefined || baseB === undefined) {
      return { ...term, value: null, sourceIds: [] };
    }
    const pair = pairs.get(unorderedPair(baseA, baseB));
    if (!pair) {
      issues.push(`${slotLabels[term.slotA]}와 ${slotLabels[term.slotB]}의 상성 데이터가 없습니다.`);
      missingData = true;
      return { ...term, value: null, sourceIds: [] };
    }
    const value = pair.baseValue * term.weight;
    partialTotal += value;
    return { ...term, value, sourceIds: [...new Set([...pair.sourceIds, ...rules.sourceIds])] };
  });

  const complete = SLOT_KEYS.every((slotKey) => pedigree[slotKey].costumeId !== null);
  const status: AffinityStatus = invalid ? 'invalid' : missingData ? 'unavailable' : complete ? 'complete' : 'partial';
  return { status, total: status === 'complete' ? partialTotal : null, partialTotal, contributions, issues };
}

/** Stable ranking places unknown/invalid results after comparable results. */
export function compareAffinityResults(a: AffinityResult, b: AffinityResult): number {
  const priority: Record<AffinityStatus, number> = { complete: 0, partial: 1, unavailable: 2, invalid: 3 };
  const statusDifference = priority[a.status] - priority[b.status];
  if (statusDifference !== 0) return statusDifference;
  if (a.status === 'complete' || a.status === 'partial') return b.partialTotal - a.partialTotal;
  return 0;
}
