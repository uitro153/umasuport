import { GRANDPARENT_SLOT_KEYS, SLOT_KEYS, pedigreeSchema, type GrandparentSlotKey, type Pedigree, type SlotKey } from '../domain/pedigree';
import type { ReferenceSnapshot } from '../domain/reference';
import type { DeepReadonly } from '../data/snapshot';
import { groupAffinity, type ReferenceGroupAffinity } from './reference-affinity';
import { findPedigreeCharacterIssues } from './lineage-validity';

export interface ReferenceEvaluationOptions {
  /** Opt in to the externally compared public formula; current KR gameplay remains pending. */
  allowUnverifiedFormula?: boolean;
}

export interface ReferencePedigreeContribution {
  termId: string;
  label: string;
  slotKeys: readonly SlotKey[];
  baseIds: string[];
  value: number | null;
  groupIds: string[];
  reference: ReferenceGroupAffinity | null;
}

export interface ReferencePedigreeResult {
  status: 'incomplete' | 'preview' | 'invalid' | 'unavailable';
  previewTotal: number | null;
  /** Known contribution sum is for explicitly enabled research comparisons only. */
  previewContribution: number;
  formulaId: 'public-pairs3-triads4-v1';
  formulaStatus: 'public-supported-kr-pending';
  validation: 'pending';
  contributions: ReferencePedigreeContribution[];
  issues: string[];
}

// Public formula matched against a rendered GameTora seven-slot case (159 points).
// Remains opt-in because current KR gameplay/patch equivalence is not established.
const assumedTerms: readonly { termId: string; label: string; slotKeys: readonly SlotKey[] }[] = [
  { termId: 'pair-target-parent-a', label: '대상 ↔ 부모 A', slotKeys: ['target', 'parentA'] },
  { termId: 'pair-target-parent-b', label: '대상 ↔ 부모 B', slotKeys: ['target', 'parentB'] },
  { termId: 'pair-parents', label: '부모 A ↔ 부모 B', slotKeys: ['parentA', 'parentB'] },
  { termId: 'triple-a-1', label: '대상 · 부모 A · 조부 A1', slotKeys: ['target', 'parentA', 'grandA1'] },
  { termId: 'triple-a-2', label: '대상 · 부모 A · 조부 A2', slotKeys: ['target', 'parentA', 'grandA2'] },
  { termId: 'triple-b-1', label: '대상 · 부모 B · 조부 B1', slotKeys: ['target', 'parentB', 'grandB1'] },
  { termId: 'triple-b-2', label: '대상 · 부모 B · 조부 B2', slotKeys: ['target', 'parentB', 'grandB2'] },
];

export function calculateReferencePedigree(
  pedigree: DeepReadonly<Pedigree>,
  snapshot: DeepReadonly<ReferenceSnapshot>,
  { allowUnverifiedFormula = false }: ReferenceEvaluationOptions = {},
): ReferencePedigreeResult {
  const metadata = {
    formulaId: 'public-pairs3-triads4-v1' as const,
    formulaStatus: 'public-supported-kr-pending' as const,
    validation: 'pending' as const,
  };
  const parsed = pedigreeSchema.safeParse(pedigree);
  if (!parsed.success) {
    return { ...metadata, status: 'invalid', previewTotal: null, previewContribution: 0, contributions: [], issues: ['7인 계보 입력의 형식이 유효하지 않습니다.'] };
  }
  const costumes = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume]));
  const baseIds = new Map<SlotKey, string>();
  const issues: string[] = [];
  for (const key of SLOT_KEYS) {
    const id = parsed.data[key].costumeId;
    if (id === null) continue;
    const costume = costumes.get(id);
    if (!costume) issues.push(`${key}: 의상 ${id}의 데이터를 찾을 수 없습니다.`);
    else baseIds.set(key, costume.baseId);
  }
  issues.push(...findPedigreeCharacterIssues(parsed.data, snapshot).map(issue => issue.message));
  const invalid = issues.length > 0;
  let missingData = false;
  const contributions = assumedTerms.map((term): ReferencePedigreeContribution => {
    const ids = term.slotKeys.map((key) => baseIds.get(key));
    if (ids.some((id) => id === undefined)) {
      return { ...term, baseIds: ids.filter((id): id is string => id !== undefined), value: null, groupIds: [], reference: null };
    }
    const reference = groupAffinity(snapshot, ids as string[]);
    if (reference.value === null) {
      missingData = true;
      issues.push(`${term.label}: 상성 그룹 정보가 없습니다.`);
    }
    return { ...term, baseIds: ids as string[], value: reference.value, groupIds: reference.groupIds, reference };
  });
  const previewContribution = contributions.reduce((sum, term) => sum + (term.value ?? 0), 0);
  const complete = SLOT_KEYS.every((key) => parsed.data[key].costumeId !== null);
  if (!allowUnverifiedFormula) issues.push('공개 계산기 비교는 통과했으나 한국 서버 실측 검증 전이므로 기본 합산·순위를 보류합니다.');
  const status = invalid ? 'invalid' : missingData ? 'unavailable' : !complete ? 'incomplete' : allowUnverifiedFormula ? 'preview' : 'unavailable';
  return { ...metadata, status, previewTotal: status === 'preview' ? previewContribution : null, previewContribution, contributions, issues };
}

export interface ReferenceGrandparentArrangement {
  arrangementId: string;
  pedigree: Pedigree;
  result: ReferencePedigreeResult;
  originalSlotKeys: GrandparentSlotKey[];
}

export function compareReferencePedigreeResults(a: ReferencePedigreeResult, b: ReferencePedigreeResult): number {
  const priority: Record<ReferencePedigreeResult['status'], number> = { preview: 0, incomplete: 1, unavailable: 2, invalid: 3 };
  const statusDifference = priority[a.status] - priority[b.status];
  if (statusDifference !== 0) return statusDifference;
  return b.previewContribution - a.previewContribution;
}

/** Six proposals preserve parent/target positions and move factor ownership with each grandparent. */
export function enumerateReferenceGrandparentArrangements(
  pedigree: DeepReadonly<Pedigree>,
  snapshot: DeepReadonly<ReferenceSnapshot>,
  options: ReferenceEvaluationOptions = {},
): ReferenceGrandparentArrangement[] {
  if (!SLOT_KEYS.every((key) => pedigree[key].costumeId !== null)) return [];
  const result: ReferenceGrandparentArrangement[] = [];
  const seen = new Set<string>();
  for (let first = 0; first < GRANDPARENT_SLOT_KEYS.length - 1; first++) {
    for (let second = first + 1; second < GRANDPARENT_SLOT_KEYS.length; second++) {
      const chosen = [GRANDPARENT_SLOT_KEYS[first]!, GRANDPARENT_SLOT_KEYS[second]!];
      const remaining = GRANDPARENT_SLOT_KEYS.filter((_, index) => index !== first && index !== second);
      const originalSlotKeys = [...chosen, ...remaining];
      const proposal = structuredClone(pedigree) as Pedigree;
      GRANDPARENT_SLOT_KEYS.forEach((destination, index) => {
        const source = pedigree[originalSlotKeys[index]!];
        proposal[destination] = { costumeId: source.costumeId, redFactor: source.redFactor ? { ...source.redFactor } : null };
      });
      // Slot identity includes factors: distinct factor owners must never be collapsed.
      const token = (key: GrandparentSlotKey) => JSON.stringify([proposal[key].costumeId, proposal[key].redFactor?.type ?? null, proposal[key].redFactor?.stars ?? null]);
      const signature = JSON.stringify([['grandA1', 'grandA2'], ['grandB1', 'grandB2']].map((keys) => keys.map((key) => token(key as GrandparentSlotKey)).sort()));
      if (seen.has(signature)) continue;
      seen.add(signature);
      if (findPedigreeCharacterIssues(proposal, snapshot).length) continue;
      result.push({ arrangementId: `${chosen.join('+')}|${remaining.join('+')}`, pedigree: proposal, result: calculateReferencePedigree(proposal, snapshot, options), originalSlotKeys });
    }
  }
  return result.sort((a, b) => (options.allowUnverifiedFormula ? compareReferencePedigreeResults(a.result, b.result) : 0)
    || a.arrangementId.localeCompare(b.arrangementId));
}
