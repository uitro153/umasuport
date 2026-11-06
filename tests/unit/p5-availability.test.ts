import { describe, expect, it } from 'vitest';
import real from '../golden/p5-release-order-real-subset.json';
import engineSubset from '../golden/p3-engine-real-subset.json';
import { p5ReleaseSchema, p5TournamentSchema } from '../../src/domain/p5-forecast';
import { validateP3Snapshot, type P3Application } from '../../src/domain/skill-support';
import { buildP5AvailabilityContext, resolveP5ReleaseAvailability, type P5AvailabilityContext } from '../../src/engine/p5-availability';
import { analyzeSupportDeck, getP3Availability } from '../../src/engine/support-acquisition';
import { evaluateSkills } from '../../src/engine/skill-evaluation';

const event = p5TournamentSchema.parse(real.event);
const releases = real.releaseRecords.map((row) => p5ReleaseSchema.parse(row));
const pack = { baseSnapshotId: real.baseSnapshotId, asOf: real.asOf, tournaments: [event], releases };
const forecast = buildP5AvailabilityContext({ snapshotId: real.baseSnapshotId }, pack, event.eventId)!;
const application = (id: string, jpDate: string | null, kr: Partial<P3Application['kr']> = {}): P3Application => ({
  entityType: 'skill', entityId: id, jpDate, patchOverrides: [],
  kr: { confirmedDate: null, observedDate: null, forecastDate: null, releasedBy: null,
    evidence: 'none', sourceUrl: null, checkedOn: null, ...kr },
});
const protocolSource = { evidence: 'secondary_page', sourceUrl: 'https://example.invalid/protocol-only', checkedOn: '2026-11-05' };

describe('P5 real CM44 release-order conflicts, source dates unchanged', () => {
  it('contains exactly the supplied 16 conflicts, including costumes and scenario 13', () => {
    expect(releases).toHaveLength(16);
    expect(releases.filter((row) => row.entityType === 'costume')).toHaveLength(3);
    expect(releases.some((row) => row.entityType === 'scenario' && row.entityId === '13')).toBe(true);
  });
  it.each(releases)('preserves JP-before for $entityType $entityId despite later KR display date', (release) => {
    const app = real.applications.find((row) => row.entityType === release.entityType && row.entityId === release.entityId) as P3Application | undefined;
    const override = forecast.releaseOverrides.find((row) => row.entityType === release.entityType && row.entityId === release.entityId)!;
    const before = JSON.stringify([app, override]);
    expect(release.jpDate! <= forecast.jpEventDate!).toBe(true);
    expect(release.krForecastDate! > forecast.krExpectedDate!).toBe(true);
    expect(resolveP5ReleaseAvailability(app, override, forecast, true)).toMatchObject({
      state: 'available', basis: 'jp-release-order', timeline: 'JP',
      effectiveDate: release.jpDate, krDisplayDate: release.krForecastDate, jpEventDate: '2026-03-22',
    });
    expect(resolveP5ReleaseAvailability(app, override, forecast, false).state).toBe('unknown');
    expect(JSON.stringify([app, override])).toBe(before);
  });
  it('changing only Korean forecast dates never reverses the Japanese ordering', () => {
    const override = forecast.releaseOverrides.find((row) => row.entityType === 'scenario')!;
    const app = real.applications.find((row) => row.entityType === 'scenario') as P3Application;
    for (const display of ['2027-01-01', '2027-06-15', '2028-01-01']) {
      expect(resolveP5ReleaseAvailability(app, { ...override, krForecastDate: display }, { ...forecast, krExpectedDate: '2027-07-20' }, true))
        .toMatchObject({ state: 'available', basis: 'jp-release-order', effectiveDate: '2026-02-24' });
    }
  });
});

describe('P5 timeline protocol boundaries (explicitly synthetic protocol examples)', () => {
  it('rejects known JP-after even with forecasts disabled and leaves missing order unknown', () => {
    expect(resolveP5ReleaseAvailability(application('protocol-after', '2026-03-23'), undefined, forecast, false))
      .toMatchObject({ state: 'unavailable', basis: 'jp-release-order' });
    expect(resolveP5ReleaseAvailability(application('protocol-unknown', null), undefined, forecast, true).state).toBe('unknown');
    expect(resolveP5ReleaseAvailability(application('protocol-before', '2026-03-22'), undefined, { ...forecast, jpEventDate: null }, true).state).toBe('unknown');
  });
  it('keeps existing official KR information ahead of JP forecasts', () => {
    const official = application('protocol-official', '2027-01-01', {
      ...protocolSource, confirmedDate: '2027-06-01', evidence: 'official_notice',
    });
    expect(resolveP5ReleaseAvailability(official, undefined, forecast, false))
      .toMatchObject({ state: 'available', basis: 'official-date', timeline: 'KR', effectiveDate: '2027-06-01' });
    official.kr.confirmedDate = '2027-06-15';
    expect(resolveP5ReleaseAvailability(official, undefined, forecast, true).state).toBe('unavailable');
    official.kr.evidence = 'secondary_page';
    expect(resolveP5ReleaseAvailability(official, undefined, forecast, true).state).toBe('unknown');
  });
  it('does not claim future secondary observations have already happened', () => {
    const future = application('protocol-future-observation', '2026-02-24', { ...protocolSource, observedDate: '2027-06-15' });
    expect(resolveP5ReleaseAvailability(future, undefined, forecast, true)).toMatchObject({ state: 'available', timeline: 'JP', basis: 'jp-release-order' });
    expect(resolveP5ReleaseAvailability(future, undefined, forecast, false).state).toBe('unknown');
  });
  it('retains already observed KR content even when JP correspondence would be later', () => {
    const known = application('protocol-kr-earlier', '2026-12-31', { ...protocolSource, observedDate: '2026-10-30' });
    expect(resolveP5ReleaseAvailability(known, undefined, forecast, false)).toMatchObject({ state: 'available', timeline: 'KR', basis: 'secondary-date' });
  });
  it('uses the JP event for month-only forecasts without fabricating a Korean day', () => {
    const monthly: P5AvailabilityContext = { ...forecast, krExpectedDate: null, krExpectedWindow: { from: '2027-07-01', through: '2027-07-31' } };
    expect(resolveP5ReleaseAvailability(application('protocol-before', '2026-03-22'), undefined, monthly, true))
      .toMatchObject({ state: 'available', timeline: 'JP', jpEventDate: '2026-03-22' });
    expect(resolveP5ReleaseAvailability(application('protocol-after', '2026-03-23'), undefined, monthly, true).state).toBe('unavailable');
    const official = application('protocol-official-month', '2026-02-01', { ...protocolSource, confirmedDate: '2027-07-15', evidence: 'official' });
    expect(resolveP5ReleaseAvailability(official, undefined, monthly, true)).toMatchObject({ state: 'unknown', timeline: 'KR', basis: 'official-date' });
    expect(monthly.krExpectedDate).toBeNull();
  });
  it('rejects a mismatched base pack and computes event dates in the Japanese calendar', () => {
    expect(() => buildP5AvailabilityContext({ snapshotId: 'different' }, pack, event.eventId)).toThrow('일치하지');
    const edge = { ...event, jpStartAt: '2026-03-21T23:00:00Z' };
    expect(buildP5AvailabilityContext({ snapshotId: real.baseSnapshotId }, { ...pack, tournaments: [edge] }, edge.eventId)?.jpEventDate).toBe('2026-03-22');
  });
});

describe('P5 support routes preserve the recorded source server', () => {
  function protocolSnapshot() {
    // Existing real skill/card values. Only release boundaries are modified for a
    // clearly synthetic protocol test, never written to production game data.
    const snapshot = validateP3Snapshot(structuredClone(engineSubset));
    const support = snapshot.applications.find((row) => row.entityType === 'support' && row.entityId === '30028')!;
    support.jpDate = '2026-02-24';
    support.kr.observedDate = null; support.kr.releasedBy = null; support.kr.confirmedDate = null;
    support.kr.forecastDate = '2027-06-15'; support.kr.evidence = 'forecast';
    return snapshot;
  }
  it('uses JP hint/event sources for a future card even when some KR routes exist', () => {
    const snapshot = protocolSnapshot();
    const before = JSON.stringify(snapshot);
    const analysis = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2027-06-14', true, forecast);
    expect(analysis.cards[0]?.accepted).toBe(true);
    expect(analysis.routes.length).toBeGreaterThan(0);
    expect(analysis.routes.every((row) => row.sourceServer === 'JP' && row.acquisitionBasis === 'jp-reference-forecast')).toBe(true);
    expect(analysis.routes.every((row) => snapshot.supportSkills.some((link) => link.supportId === row.supportId && link.skillId === row.sourceSkillId && link.server === 'JP'))).toBe(true);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2027-06-14', false, forecast).routes).toEqual([]);
  });
  it('does not graft current JP paths onto an already observed KR card', () => {
    const snapshot = protocolSnapshot();
    const support = snapshot.applications.find((row) => row.entityType === 'support' && row.entityId === '30028')!;
    support.kr.observedDate = '2026-10-30';
    const analysis = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2027-06-14', true, forecast);
    expect(analysis.routes.length).toBeGreaterThan(0);
    expect(analysis.routes.every((row) => row.sourceServer === 'KR' && row.acquisitionBasis === 'kr-source')).toBe(true);
  });
  it('keeps a known forecast supply witness when unknown-release research is off without inventing a first release date', () => {
    const snapshot = protocolSnapshot();
    const availability = getP3Availability(snapshot, 'skill', '200332', '2027-06-14', true, forecast);
    expect(availability).toMatchObject({ state: 'available', basis: 'jp-route-order', timeline: 'JP', effectiveDate: null });
    expect(availability.evidence).toContain('최초 출시일');
    const result = evaluateSkills(snapshot, { forecast, cutoffDate: '2027-06-14', allowForecast: true, includeUnknown: false, runningStyle: 'pace',
      course: { courseId: '10502', trackId: '10005', distanceM: 2000, surface: 'turf', rotation: 1, season: 1, weather: 1, groundCondition: 1 } });
    expect(result.rows.find((row) => row.skillId === '200332')?.availability.basis).toBe('jp-route-order');
    expect(getP3Availability(snapshot, 'skill', '200332', '2027-06-14', false, forecast).state).toBe('unknown');
  });
  it('blocks an after-event gold source and an after-event lower target independently', () => {
    const snapshot = protocolSnapshot();
    const gold = snapshot.applications.find((row) => row.entityType === 'skill' && row.entityId === '200331')!;
    gold.jpDate = '2026-03-23'; gold.kr.releasedBy = null; gold.kr.observedDate = null;
    let routes = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2027-06-14', true, forecast).routes;
    expect(routes.some((row) => row.sourceSkillId === '200331')).toBe(false);
    gold.jpDate = '2026-03-01';
    const lower = snapshot.applications.find((row) => row.entityType === 'skill' && row.entityId === '200332')!;
    lower.jpDate = '2026-03-23'; lower.kr.releasedBy = null; lower.kr.observedDate = null;
    routes = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2027-06-14', true, forecast).routes;
    expect(routes.some((row) => row.skillId === '200332')).toBe(false);
  });
  it('never revives a known JP-after skill through the unknown-release research switch', () => {
    const snapshot = protocolSnapshot();
    const skill = snapshot.applications.find((row) => row.entityType === 'skill' && row.entityId === '200012')!;
    skill.jpDate = '2026-03-23'; skill.kr.releasedBy = null; skill.kr.observedDate = null;
    const row = evaluateSkills(snapshot, { forecast, cutoffDate: '2027-06-14', allowForecast: true, includeUnknown: true, runningStyle: 'pace',
      course: { courseId: '10502', trackId: '10005', distanceM: 2000, surface: 'turf', rotation: 1, season: 1, weather: 1, groundCondition: 1 } }).rows.find((row) => row.skillId === '200012');
    expect(row).toMatchObject({ grade: 'excluded', availability: { state: 'unavailable', timeline: 'JP' } });
    expect(getP3Availability(snapshot, 'support', '30028', '2027-06-14', true).basis).toBe('forecast');
    expect(getP3Availability(snapshot, 'support', '30028', '2027-06-14', true, forecast).basis).toBe('jp-release-order');
  });
});
