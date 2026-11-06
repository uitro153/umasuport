import { describe, expect, it } from 'vitest';
import source from '../golden/p5-real-contract-subset.json';
import scenarioSource from '../golden/p3-engine-real-subset.json';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { mergeP5Tournaments, validateP5Snapshot } from '../../src/domain/p5-forecast';
import { buildTournamentOptions, isPastTournament, representativeScenario, tournamentChoiceLabel, tournamentPeriodEnd } from '../../src/ui/skills/tournament-options';

// Join existing real-source excerpts: the compact P5 contract fixture retains
// only scenario12/13/14, while display needs the earlier actual scenarios too.
const base = validateP3Snapshot({ ...source.base, scenarios: scenarioSource.scenarios,
  applications: [...source.base.applications, ...scenarioSource.applications.filter((row) => row.entityType === 'scenario' && !source.base.applications.some((existing) => existing.entityType === 'scenario' && existing.entityId === row.entityId))] });
const p5 = validateP5Snapshot(source.p5, base, new Set());
const choices = mergeP5Tournaments(base, p5);
const cm38 = choices.find((event) => event.eventId === 'kr-cm-38')!;
const cm39 = choices.find((event) => event.eventId === 'kr-cm-39')!;
const cm44 = choices.find((event) => event.eventId === 'kr-cm-44')!;

describe('P8.5 real-source tournament display independent of saved inputs and evaluation', () => {
  it('filters historical events by an evidenced end date, preserving the final day', () => {
    expect(tournamentPeriodEnd(cm38)).toBe('2026-10-16');
    expect(isPastTournament(cm38, '2026-10-16')).toBe(false);
    expect(isPastTournament(cm38, '2026-10-17')).toBe(true);
    expect(isPastTournament(cm38, '2026-11-05')).toBe(true);
  });
  it('does not remove any of the 14 forecasts based on expected dates or monthly uncertainty', () => {
    const forecasts = choices.filter((event) => event.forecast);
    expect(forecasts).toHaveLength(14);
    for (const event of forecasts) {
      expect(tournamentPeriodEnd(event)).toBeNull();
      expect(isPastTournament(event, '2028-01-01')).toBe(false);
    }
    expect(forecasts.filter((event) => event.forecast?.expectedMonth).map((event) => event.forecast!.expectedMonth)).toEqual(['2027-07', '2027-08', '2027-09', '2027-10', '2027-11']);
  });
  it('uses available source scenarios for CM39/44 and preserves the Japanese release-order relation', () => {
    expect(representativeScenario(base, p5, cm39)).toMatchObject({ scenarioId: '11', label: '무인도' });
    expect(representativeScenario(base, p5, cm44)).toMatchObject({ scenarioId: '13', label: 'Beyond Dreams', basis: 'jp-release-order' });
    expect(tournamentChoiceLabel(base, p5, cm39)).toBe('[무인도] [챔미] [중거리 2200m] 한신');
    expect(tournamentChoiceLabel(base, p5, cm44)).toContain('[Beyond Dreams] [챔미]');
    const scenario = p5.releases.find((release) => release.entityType === 'scenario' && release.entityId === '13')!;
    expect(scenario.jpDate).toBe('2026-02-24'); expect(cm44.forecast?.jpStartAt?.slice(0, 10)).toBe('2026-03-22');
    expect(scenario.krForecastDate).toBe('2027-06-15'); expect(cm44.forecast?.expectedDate).toBe('2027-06-14');
  });
  it('keeps all canonical IDs, dates and random LoH conditions while removing dates/round numbers from titles', () => {
    const before = JSON.stringify([base, p5, choices]);
    const options = buildTournamentOptions(base, p5, choices, '2026-11-05');
    expect(options.map((option) => option.event.eventId)).toEqual(choices.map((event) => event.eventId));
    for (const option of options) {
      expect(option.label).toMatch(/^\[.+\] \[(챔미|LoH)\] \[(단거리|마일|중거리|장거리) \d+m\] .+/);
      expect(option.label).not.toMatch(/20\d\d-\d\d|JP-|일본|회차|월 단위 예상/);
    }
    for (const option of options.filter((row) => row.event.format === 'league-of-heroes')) {
      expect(option.event.conditions.weather).toBeNull(); expect(option.event.conditions.ground).toBeNull();
    }
    expect(JSON.stringify([base, p5, choices])).toBe(before);
  });
  it('adds only minimal sequence labels when the display context repeats, without rewriting IDs', () => {
    // Display-only duplicate protocol; no additional game tournament is written.
    const duplicate = { ...cm38, eventId: 'display-protocol-duplicate' };
    const options = buildTournamentOptions(base, p5, [cm38, duplicate], '2026-11-05');
    expect(options[0]!.label).toBe(`${tournamentChoiceLabel(base, p5, cm38)} · 1`);
    expect(options[1]!.label).toBe(`${tournamentChoiceLabel(base, p5, cm38)} · 2`);
    expect(options.map((option) => option.event.eventId)).toEqual(['kr-cm-38', 'display-protocol-duplicate']);
  });
  it('does not infer a historical end or invent a scenario name when evidence is absent', () => {
    // Synthetic display boundary cases; original records remain unchanged.
    const noPeriod = { ...cm38, eventId: 'display-no-period', startAt: '2020-01-01T12:00:00+09:00' };
    const uncertain = { ...cm38, dateStatus: 'unknown' as const, startAt: null };
    expect(isPastTournament(noPeriod, '2026-11-05')).toBe(false);
    expect(isPastTournament(uncertain, '2026-11-05')).toBe(false);
    // A changed official start invalidates the old range's historical evidence.
    expect(isPastTournament({ ...cm38, startAt: '2026-12-01T12:00:00+09:00' }, '2026-11-05')).toBe(false);
    expect(representativeScenario(base, null, uncertain)).toEqual({ scenarioId: null, label: '시나리오 확인 필요', basis: 'unknown' });
  });
});
