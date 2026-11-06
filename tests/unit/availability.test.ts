import { describe, expect, it } from 'vitest';
import {
  filterAvailableReleases,
  projectAvailability,
  resolveEvaluationContext,
  type ReleaseDates,
} from '../../src/engine/availability';

function release(dates: Partial<ReleaseDates> = {}): ReleaseDates {
  return {
    jpDate: '2025-01-01',
    krConfirmedDate: null,
    krForecastDate: null,
    ...dates,
  };
}

describe('한국 서버 출시일 판정 (가상 일정)', () => {
  it.each([
    ['기준일 이전 확정 출시', { krConfirmedDate: '2027-01-15' }, true, 'confirmed'],
    ['기준일 이전 예상 출시', { krForecastDate: '2027-01-20' }, true, 'forecast'],
    ['기준일 이후 확정 출시', { krConfirmedDate: '2027-03-01' }, false, 'confirmed'],
    ['기준일 이후 예상 출시', { krForecastDate: '2027-03-01' }, false, 'forecast'],
  ] as const)('%s', (_title, dates, available, basis) => {
    expect(projectAvailability(release(dates), '2027-02-10')).toMatchObject({
      available,
      basis,
      effectiveDate: Object.values(dates)[0],
    });
  });

  it('기준일과 같은 날의 출시를 포함한다', () => {
    expect(projectAvailability(release({ krConfirmedDate: '2027-02-10' }), '2027-02-10'))
      .toEqual({ available: true, basis: 'confirmed', effectiveDate: '2027-02-10' });
  });

  it('확정일이 예상일보다 늦어도 확정일로 판정한다', () => {
    expect(projectAvailability(release({
      krConfirmedDate: '2027-03-01',
      krForecastDate: '2027-01-01',
    }), '2027-02-10')).toEqual({
      available: false,
      basis: 'confirmed',
      effectiveDate: '2027-03-01',
    });
  });

  it('확정일이 예상일보다 빠르면 확정일로 포함한다', () => {
    expect(projectAvailability(release({
      krConfirmedDate: '2027-01-01',
      krForecastDate: '2027-03-01',
    }), '2027-02-10')).toMatchObject({ available: true, basis: 'confirmed' });
  });

  it('한국 출시일 미상은 일본 출시일로 대체하지 않는다', () => {
    expect(projectAvailability(release(), '2027-02-10')).toEqual({
      available: false,
      basis: 'unknown',
      effectiveDate: null,
    });
  });

  it('현재 기준과 미래 대회 기준은 같은 카드에 다른 결과를 낸다', () => {
    const card = release({ krConfirmedDate: '2027-01-15' });
    const now = new Date('2026-11-04T03:00:00Z');
    const current = resolveEvaluationContext({ mode: 'current', now });
    const tournament = resolveEvaluationContext({
      now,
      tournament: { startAt: '2027-02-10T12:00:00+09:00', dateStatus: 'forecast' },
    });
    expect(projectAvailability(card, current.cutoffDate).available).toBe(false);
    expect(projectAvailability(card, tournament.cutoffDate).available).toBe(true);
  });

  it.each(['2027-02-29', '2026-13-01', '2026-00-01', '2026-11-31', '2026-1-01', 'bad'])('유효하지 않은 기준일 %s를 거부한다', (date) => {
    expect(() => projectAvailability(release(), date)).toThrow();
  });

  it('윤년의 2월 29일은 허용한다', () => {
    expect(projectAvailability(release({ krConfirmedDate: '2028-02-29' }), '2028-02-29').available)
      .toBe(true);
  });

  it.each(['jpDate', 'krConfirmedDate', 'krForecastDate'] as const)('유효하지 않은 원본 %s를 조용히 정규화하지 않는다', (key) => {
    expect(() => projectAvailability(release({ [key]: '2026-02-30' }), '2027-02-10')).toThrow();
  });
});

describe('Asia/Seoul 평가 기준', () => {
  it.each([
    ['2026-11-03T14:59:59Z', '2026-11-03'],
    ['2026-11-03T15:00:00Z', '2026-11-04'],
    ['2026-12-31T15:00:00Z', '2027-01-01'],
  ])('UTC %s를 서울 날짜 %s로 판정한다', (instant, date) => {
    expect(resolveEvaluationContext({ mode: 'current', now: new Date(instant) }))
      .toEqual({
        mode: 'current',
        cutoffDate: date,
        timezone: 'Asia/Seoul',
        tournamentDateStatus: null,
      });
  });

  it('기본은 선택 대회 시작일이며 예상 대회 상태를 보존한다', () => {
    expect(resolveEvaluationContext({
      now: new Date('2026-11-04T00:00:00Z'),
      tournament: { startAt: '2027-02-09T15:00:00Z', dateStatus: 'forecast' },
    })).toEqual({
      mode: 'tournament',
      cutoffDate: '2027-02-10',
      timezone: 'Asia/Seoul',
      tournamentDateStatus: 'forecast',
    });
  });

  it('대회 진행 중 출시를 시작일부터 포함하지 않는다', () => {
    const context = resolveEvaluationContext({
      now: new Date('2027-02-12T00:00:00Z'),
      tournament: { startAt: '2027-02-10T12:00:00+09:00', dateStatus: 'confirmed' },
    });
    expect(projectAvailability(release({ krConfirmedDate: '2027-02-11' }), context.cutoffDate).available)
      .toBe(false);
  });

  it('대회가 선택되지 않은 대회 기준은 거부한다', () => {
    expect(() => resolveEvaluationContext({ now: new Date() })).toThrow(/대회를 선택/);
  });

  it('현재 기준의 유효하지 않은 시각을 거부한다', () => {
    expect(() => resolveEvaluationContext({ mode: 'current', now: new Date('bad') })).toThrow();
  });

  it.each([
    '2027-02-10T12:00:00',
    '2027-02-30T12:00:00+09:00',
    '2027-02-10T24:00:00+09:00',
    '2027-02-10T12:60:00+09:00',
    '2027-02-10T12:00:60+09:00',
    '2027-02-10T12:00:00+24:00',
    '2027-02-10T12:00:00+09:60',
    'bad',
  ])('유효하지 않거나 시간대가 없는 대회 시작 %s를 거부한다', (startAt) => {
    expect(() => resolveEvaluationContext({
      now: new Date(),
      tournament: { startAt, dateStatus: 'confirmed' },
    })).toThrow();
  });
});

describe('출시 결과 분류', () => {
  it('확정/미래시/제외와 모든 행을 함께 보존하며 입력을 변경하지 않는다', () => {
    const releases = [
      { id: 'confirmed', ...release({ krConfirmedDate: '2027-01-01' }) },
      { id: 'forecast', ...release({ krForecastDate: '2027-01-20' }) },
      { id: 'late', ...release({ krConfirmedDate: '2027-03-01' }) },
      { id: 'unknown', ...release() },
    ];
    const before = structuredClone(releases);
    const result = filterAvailableReleases(releases, { cutoffDate: '2027-02-10' });
    expect(result.all).toHaveLength(4);
    expect(result.included.map((row) => row.release.id)).toEqual(['confirmed', 'forecast']);
    expect(result.confirmed.map((row) => row.release.id)).toEqual(['confirmed']);
    expect(result.forecast.map((row) => row.release.id)).toEqual(['forecast']);
    expect(result.excluded.map((row) => row.release.id)).toEqual(['late', 'unknown']);
    expect(releases).toEqual(before);
    expect(filterAvailableReleases(releases, '2027-02-10')).toEqual(result);
  });

  it('빈 목록이어도 잘못된 기준일을 거부한다', () => {
    expect(() => filterAvailableReleases([], '2027-02-30')).toThrow();
  });
});
