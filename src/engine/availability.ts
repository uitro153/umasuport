import { dateOnlySchema, offsetDateTimeSchema, type Release } from '../domain';

export type AvailabilityBasis = 'confirmed' | 'forecast' | 'unknown';
export type EvaluationMode = 'tournament' | 'current';

export interface Availability {
  available: boolean;
  basis: AvailabilityBasis;
  effectiveDate: string | null;
}

export interface EvaluationContext {
  mode: EvaluationMode;
  cutoffDate: string;
  timezone: 'Asia/Seoul';
  tournamentDateStatus: 'confirmed' | 'forecast' | null;
}

export interface EvaluationInput {
  mode?: EvaluationMode;
  now: Date;
  tournament?: {
    startAt: string;
    dateStatus: 'confirmed' | 'forecast';
  };
}

export type ReleaseDates = Pick<
  Release,
  'jpDate' | 'krConfirmedDate' | 'krForecastDate'
>;

export interface AvailabilityRow<T extends ReleaseDates> extends Availability {
  release: T;
}

export interface AvailabilityGroups<T extends ReleaseDates> {
  all: AvailabilityRow<T>[];
  included: AvailabilityRow<T>[];
  confirmed: AvailabilityRow<T>[];
  forecast: AvailabilityRow<T>[];
  excluded: AvailabilityRow<T>[];
}

const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function seoulDate(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError('유효한 기준 시각이 필요합니다.');
  }

  const parts = seoulDateFormatter.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)!.value;
  return dateOnlySchema.parse(`${value('year')}-${value('month')}-${value('day')}`);
}

function tournamentInstant(value: string): Date {
  // Reuse the data contract rather than Date.parse's permissive date normalization.
  return new Date(offsetDateTimeSchema.parse(value));
}

/**
 * Calendar-date availability in Korea, with confirmed KR dates taking precedence.
 * Dates have day precision: same-day intraday releases need source timestamps
 * before an exact-time availability decision can be supported.
 */
export function projectAvailability(
  release: ReleaseDates,
  cutoffDate: string,
): Availability {
  const cutoff = dateOnlySchema.parse(cutoffDate);
  for (const date of [release.jpDate, release.krConfirmedDate, release.krForecastDate]) {
    if (date !== null) dateOnlySchema.parse(date);
  }

  if (release.krConfirmedDate !== null) {
    return {
      available: release.krConfirmedDate <= cutoff,
      basis: 'confirmed',
      effectiveDate: release.krConfirmedDate,
    };
  }
  if (release.krForecastDate !== null) {
    return {
      available: release.krForecastDate <= cutoff,
      basis: 'forecast',
      effectiveDate: release.krForecastDate,
    };
  }
  return { available: false, basis: 'unknown', effectiveDate: null };
}

/** The selected tournament's start date is the default cutoff, never its end date. */
export function resolveEvaluationContext(input: EvaluationInput): EvaluationContext {
  const mode = input.mode ?? 'tournament';
  if (mode !== 'current' && mode !== 'tournament') {
    throw new RangeError('지원하지 않는 데이터 기준입니다.');
  }

  if (mode === 'current') {
    return {
      mode,
      cutoffDate: seoulDate(input.now),
      timezone: 'Asia/Seoul',
      tournamentDateStatus: null,
    };
  }

  if (!input.tournament) {
    throw new RangeError('대회 기준으로 계산하려면 대회를 선택해야 합니다.');
  }
  if (!['confirmed', 'forecast'].includes(input.tournament.dateStatus)) {
    throw new RangeError('대회 일정의 확정/예상 상태가 필요합니다.');
  }
  return {
    mode,
    cutoffDate: seoulDate(tournamentInstant(input.tournament.startAt)),
    timezone: 'Asia/Seoul',
    tournamentDateStatus: input.tournament.dateStatus,
  };
}

/** Keep excluded and forecast rows so the UI can explain the same calculation. */
export function filterAvailableReleases<T extends ReleaseDates>(
  releases: readonly T[],
  cutoff: string | Pick<EvaluationContext, 'cutoffDate'>,
): AvailabilityGroups<T> {
  const cutoffDate = dateOnlySchema.parse(typeof cutoff === 'string' ? cutoff : cutoff.cutoffDate);
  const all = releases.map((release) => ({
    release,
    ...projectAvailability(release, cutoffDate),
  }));
  return {
    all,
    included: all.filter((row) => row.available),
    confirmed: all.filter((row) => row.available && row.basis === 'confirmed'),
    forecast: all.filter((row) => row.available && row.basis === 'forecast'),
    excluded: all.filter((row) => !row.available),
  };
}
