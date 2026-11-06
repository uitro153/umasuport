import type { AptitudeKey, RedFactor } from '../../domain/pedigree';
/** A newly planned factor defaults to three stars; existing observations are never inflated. */
export function chooseInlineFactor(previous: Readonly<RedFactor> | null, type: AptitudeKey | '', hasSelectedOwner = true): RedFactor | null {
  return type ? { type, stars: hasSelectedOwner ? previous?.stars ?? 3 : 3 } : null;
}
