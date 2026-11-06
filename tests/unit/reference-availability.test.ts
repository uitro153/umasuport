import { describe, expect, it } from 'vitest';
import { getReferenceAvailability } from '../../src/engine/reference-availability';
import { makeApplication } from './reference-engine-fixture';

describe('KR reference availability and evidence levels', () => {
  it('does not call an unknown old JP release unavailable', () => {
    expect(getReferenceAvailability(makeApplication(), '2026-11-05')).toMatchObject({ state: 'unknown', basis: 'insufficient-evidence', effectiveDate: null });
    expect(getReferenceAvailability(undefined, '2026-11-05').state).toBe('unknown');
  });

  it('keeps secondary dates secondary on both sides of their date boundary', () => {
    const application = makeApplication('costume_a', { observedDate: '2026-10-30', evidence: 'secondary_page', sourceUrl: 'https://example.invalid/secondary' });
    expect(getReferenceAvailability(application, '2026-10-29')).toMatchObject({ state: 'unavailable', basis: 'secondary-date' });
    expect(getReferenceAvailability(application, '2026-10-30')).toMatchObject({ state: 'available', basis: 'secondary-date', sourceUrl: 'https://example.invalid/secondary', checkedOn: '2026-11-05', evidence: 'secondary_page' });
    expect(application.kr.confirmedDate).toBeNull();
  });

  it('uses a supported official date before secondary and forecast alternatives', () => {
    const application = makeApplication('costume_a', { confirmedDate: '2026-11-06', observedDate: '2026-10-30', forecastDate: '2026-11-01', evidence: 'official_notice', sourceUrl: 'https://example.invalid/official' });
    expect(getReferenceAvailability(application, '2026-11-05', { allowForecast: true })).toMatchObject({ state: 'unavailable', basis: 'official-date', effectiveDate: '2026-11-06' });
  });

  it('does not promote a claimed confirmed date with secondary evidence', () => {
    const application = makeApplication('costume_a', { confirmedDate: '2026-10-30', evidence: 'secondary_page', sourceUrl: 'https://example.invalid/secondary' });
    expect(getReferenceAvailability(application, '2026-11-05')).toMatchObject({ state: 'unknown', basis: 'insufficient-evidence' });
  });

  it('does not backdate a released-by observation to earlier tournaments', () => {
    const application = makeApplication('costume_a', { releasedBy: '2026-11-04', evidence: 'observation', sourceUrl: 'https://example.invalid/observation' });
    expect(getReferenceAvailability(application, '2026-11-03')).toMatchObject({ state: 'unknown', basis: 'insufficient-evidence' });
    expect(getReferenceAvailability(application, '2026-11-04')).toMatchObject({ state: 'available', basis: 'released-by-observation', effectiveDate: '2026-11-04' });
  });

  it('requires a separate explicit opt-in for dated forecasts', () => {
    const application = makeApplication('costume_a', { forecastDate: '2026-11-05', evidence: 'forecast', sourceUrl: 'https://example.invalid/forecast' });
    expect(getReferenceAvailability(application, '2026-11-05').state).toBe('unknown');
    expect(getReferenceAvailability(application, '2026-11-05', { allowForecast: true })).toMatchObject({ state: 'available', basis: 'forecast' });
    expect(getReferenceAvailability(application, '2026-11-04', { allowForecast: true })).toMatchObject({ state: 'unavailable', basis: 'forecast' });
    application.kr.forecastDate = null;
    expect(getReferenceAvailability(application, '2027-01-01', { allowForecast: true }).state).toBe('unknown');
  });

  it.each(['2026-02-29', '2026-1-01', '2026-11-05\n'])('rejects invalid cutoff %j', (date) => {
    expect(() => getReferenceAvailability(makeApplication(), date)).toThrow();
  });

  it('rejects invalid original dates and preserves patch uncertainty without mutation', () => {
    const application = makeApplication();
    const before = structuredClone(application);
    getReferenceAvailability(application, '2026-11-05');
    expect(application).toEqual(before);
    expect(application.patchOverrides).toEqual([]);
    application.kr.observedDate = '2026-02-30';
    expect(() => getReferenceAvailability(application, '2026-11-05')).toThrow();
  });
});
