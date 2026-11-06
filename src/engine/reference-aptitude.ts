import type { DeepReadonly } from '../data/snapshot';
import { ANCESTOR_SLOT_KEYS, APTITUDE_KEYS, pedigreeSchema, type Pedigree } from '../domain/pedigree';
import type { ReferenceSnapshot } from '../domain/reference';
import type { AptitudeGrade } from '../domain/primitives';
import type { AptitudeChange, AptitudeResult } from './aptitude';

/** Public JP observations, not a certificate of current KR patch equivalence. */
export const REFERENCE_RED_RULE = {
  id: 'public-initial-red-stars-v1',
  status: 'public-supported-kr-pending',
  checkedOn: '2026-11-05',
  sources: ['https://gamewith.jp/uma-musume/article/show/270279', 'https://gametora.com/umamusume/legacies'],
} as const;
const grades: readonly AptitudeGrade[] = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];

/** Public initial-training rule, shared by the 7- and 31-person planners. */
export function applyReferenceRedStars(base: AptitudeGrade, totalStars: number): AptitudeGrade {
  if (!Number.isInteger(totalStars) || totalStars < 0 || totalStars > 18) throw new RangeError('인자 별수 합계는 0~18의 정수여야 합니다.');
  const steps = totalStars === 0 ? 0 : Math.min(4, Math.ceil(totalStars / 3));
  const initial = grades.indexOf(base);
  return grades[Math.max(initial, Math.min(6, initial + steps))]!;
}

export function calculateReferenceAptitudes(pedigree: DeepReadonly<Pedigree>, snapshot: DeepReadonly<ReferenceSnapshot>): AptitudeResult {
  const parsed = pedigreeSchema.safeParse(pedigree);
  if (!parsed.success) return { status: 'invalid', changes: [], issues: ['유효하지 않은 계보입니다.'] };
  const costumes = new Map(snapshot.costumes.map((row) => [row.costumeId, row]));
  if (Object.values(parsed.data).some((slot) => slot.costumeId !== null && !costumes.has(slot.costumeId))) {
    return { status: 'invalid', changes: [], issues: ['존재하지 않는 의상이 있습니다.'] };
  }
  const target = costumes.get(parsed.data.target.costumeId ?? '');
  if (!target) return { status: 'empty', changes: [], issues: [] };
  const changes = APTITUDE_KEYS.map((type): AptitudeChange => {
    const contributors = ANCESTOR_SLOT_KEYS.flatMap((slotKey) => {
      const slot = parsed.data[slotKey];
      return slot.costumeId !== null && slot.redFactor?.type === type ? [{ slotKey, stars: slot.redFactor.stars }] : [];
    });
    const totalStars = contributors.reduce((sum, row) => sum + row.stars, 0);
    const base = target.aptitudes[type];
    const initial = grades.indexOf(base);
    const result = applyReferenceRedStars(base, totalStars);
    return { type, base, result, totalStars, gradeSteps: grades.indexOf(result) - initial, contributors };
  });
  return { status: ANCESTOR_SLOT_KEYS.some((key) => parsed.data[key].costumeId === null) ? 'partial' : 'ready', changes, issues: [] };
}
