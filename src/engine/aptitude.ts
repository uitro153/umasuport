import {
  ANCESTOR_SLOT_KEYS,
  pedigreeSchema,
  validatePedigreeRules,
  type AptitudeGrade,
  type AptitudeKey,
  type P1Rules,
  type Pedigree,
  type SlotKey,
} from '../domain';
import type { DeepReadonly, PinnedSnapshot } from '../data/snapshot';

export const APTITUDE_LABELS: Readonly<Record<AptitudeKey, string>> = {
  turf: '잔디',
  dirt: '더트',
  sprint: '단거리',
  mile: '마일',
  medium: '중거리',
  long: '장거리',
  front: '도주',
  pace: '선행',
  late: '선입',
  end: '추입',
};

const APTITUDE_KEYS = Object.keys(APTITUDE_LABELS) as AptitudeKey[];
const GRADES: readonly AptitudeGrade[] = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];

export interface AptitudeContributor {
  slotKey: SlotKey;
  stars: 1 | 2 | 3;
}

export interface AptitudeChange {
  type: AptitudeKey;
  base: AptitudeGrade;
  result: AptitudeGrade;
  totalStars: number;
  /** Actual grade movement after applying the initial-aptitude cap. */
  gradeSteps: number;
  contributors: AptitudeContributor[];
}

export interface AptitudeResult {
  status: 'ready' | 'partial' | 'invalid' | 'empty';
  changes: AptitudeChange[];
  issues: string[];
}

/**
 * Apply an explicit rule pack to the selected target's initial aptitudes.
 * The P1 pack is fictional until independently checked against real game cases.
 * Only the six selected parents/grandparents contribute; this is not a 31-slot allocator.
 */
export function calculateAptitudes(
  pedigree: DeepReadonly<Pedigree>,
  snapshot: PinnedSnapshot,
  rules: DeepReadonly<P1Rules>,
): AptitudeResult {
  const parsedPedigree = pedigreeSchema.safeParse(pedigree);
  if (!parsedPedigree.success) {
    return {
      status: 'invalid',
      changes: [],
      issues: parsedPedigree.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  let checkedRules: P1Rules;
  try {
    checkedRules = validatePedigreeRules(rules, snapshot);
  } catch (error: unknown) {
    return { status: 'invalid', changes: [], issues: [error instanceof Error ? error.message : '적성 규칙을 검증할 수 없습니다.'] };
  }

  const selected = parsedPedigree.data;
  const costumes = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume]));
  const issues: string[] = [];
  for (const [slotKey, slot] of Object.entries(selected)) {
    if (slot.costumeId !== null && !costumes.has(slot.costumeId)) {
      issues.push(`${slotKey}: 존재하지 않는 의상 ${slot.costumeId}`);
    }
  }
  if (issues.length > 0) return { status: 'invalid', changes: [], issues };

  const targetId = selected.target.costumeId;
  if (targetId === null) return { status: 'empty', changes: [], issues: [] };
  const target = costumes.get(targetId)!;
  const incomplete = ANCESTOR_SLOT_KEYS.some((slotKey) => selected[slotKey].costumeId === null);

  const changes = APTITUDE_KEYS.map((type): AptitudeChange => {
    const contributors: AptitudeContributor[] = [];
    for (const slotKey of ANCESTOR_SLOT_KEYS) {
      const slot = selected[slotKey];
      if (slot.costumeId !== null && slot.redFactor?.type === type) {
        contributors.push({ slotKey, stars: slot.redFactor.stars });
      }
    }
    const totalStars = contributors.reduce((total, contributor) => total + contributor.stars, 0);
    let requestedSteps = 0;
    for (const step of checkedRules.aptitude.starSteps) {
      if (totalStars >= step.minStars) requestedSteps = step.gradeSteps;
    }
    const base = target.aptitudes[type];
    const baseIndex = GRADES.indexOf(base);
    const capIndex = GRADES.indexOf(checkedRules.aptitude.initialCap);
    // A cap controls improvement; an existing S is preserved rather than reduced to A.
    const resultIndex = Math.max(baseIndex, Math.min(capIndex, baseIndex + requestedSteps));
    return {
      type,
      base,
      result: GRADES[resultIndex]!,
      totalStars,
      gradeSteps: resultIndex - baseIndex,
      contributors,
    };
  });

  return { status: incomplete ? 'partial' : 'ready', changes, issues: [] };
}
