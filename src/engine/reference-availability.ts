import { dateOnlySchema } from '../domain/primitives';
import type { ReferenceApplication } from '../domain/reference';
import type { DeepReadonly } from '../data/snapshot';

export interface ReferenceAvailabilityOptions {
  /** Forecast evidence is excluded unless the caller explicitly opts in. */
  allowForecast?: boolean;
}

export type ReferenceAvailabilityBasis =
  | 'official-date'
  | 'secondary-date'
  | 'released-by-observation'
  | 'forecast'
  | 'jp-release-order'
  | 'jp-route-order'
  | 'insufficient-evidence';

export interface ReferenceAvailability {
  state: 'available' | 'unavailable' | 'unknown';
  basis: ReferenceAvailabilityBasis;
  effectiveDate: string | null;
  sourceUrl: string | null;
  checkedOn: string | null;
  evidence: string;
  /** P5 comparison timeline; an effective JP date is not a Korean release date. */
  timeline?: 'KR' | 'JP';
  jpEventDate?: string | null;
  krDisplayDate?: string | null;
}

const officialEvidence = new Set(['official', 'official_notice', 'official_confirmation']);

/**
 * Availability and confidence are separate: secondary dates stay secondary.
 * A released-by observation cannot establish availability before its observation date.
 * An unknown KR schedule is not inferred from JP/Global dates or called unreleased.
 */
export function getReferenceAvailability(
  application: DeepReadonly<ReferenceApplication> | undefined,
  cutoffDate: string,
  { allowForecast = false }: ReferenceAvailabilityOptions = {},
): ReferenceAvailability {
  const cutoff = dateOnlySchema.parse(cutoffDate);
  const kr = application?.kr;
  const provenance = {
    sourceUrl: kr?.sourceUrl ?? null,
    checkedOn: kr?.checkedOn ?? null,
    evidence: kr?.evidence ?? 'none',
  };
  if (!kr) return { ...provenance, state: 'unknown', basis: 'insufficient-evidence', effectiveDate: null };
  for (const date of [application.jpDate, kr.confirmedDate, kr.observedDate, kr.releasedBy, kr.forecastDate, kr.checkedOn]) {
    if (date !== null) dateOnlySchema.parse(date);
  }
  if (kr.confirmedDate !== null) {
    // The ingestion contract enforces this too; retain the guard for direct callers.
    if (!officialEvidence.has(kr.evidence) || !kr.sourceUrl || !kr.checkedOn) {
      return { ...provenance, state: 'unknown', basis: 'insufficient-evidence', effectiveDate: null };
    }
    return { ...provenance, state: kr.confirmedDate <= cutoff ? 'available' : 'unavailable', basis: 'official-date', effectiveDate: kr.confirmedDate };
  }
  if (kr.observedDate !== null) {
    return { ...provenance, state: kr.observedDate <= cutoff ? 'available' : 'unavailable', basis: 'secondary-date', effectiveDate: kr.observedDate };
  }
  if (kr.releasedBy !== null && kr.releasedBy <= cutoff) {
    return { ...provenance, state: 'available', basis: 'released-by-observation', effectiveDate: kr.releasedBy };
  }
  if (allowForecast && kr.forecastDate !== null) {
    return { ...provenance, state: kr.forecastDate <= cutoff ? 'available' : 'unavailable', basis: 'forecast', effectiveDate: kr.forecastDate };
  }
  return { ...provenance, state: 'unknown', basis: 'insufficient-evidence', effectiveDate: null };
}
