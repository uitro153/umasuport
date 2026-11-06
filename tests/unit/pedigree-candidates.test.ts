import { describe, expect, it } from 'vitest';
import { rankPedigreeCandidates } from '../../src/engine/pedigree-candidates';
import { createEmptyPedigree } from '../../src/domain/pedigree';
import { makeEngineFixture } from './pedigree-engine-fixture';

describe('availability-aware pedigree candidates', () => {
  it('orders partial parent contributions by known affinity, retaining invalid duplicates last', () => {
    const { snapshot, rules } = makeEngineFixture();
    const pedigree = createEmptyPedigree();
    pedigree.target.costumeId = 'costume_0';
    const rows = rankPedigreeCandidates(pedigree, 'parentA', snapshot, rules, '2026-11-05');
    expect(rows.slice(0, 3).map((row) => [row.costumeId, row.result.partialTotal])).toEqual([
      ['costume_2', 6], ['costume_6', 5], ['costume_1_alt', 4],
    ]);
    expect(rows.at(-1)).toMatchObject({ costumeId: 'costume_0', result: { status: 'invalid' } });
  });

  it.each(['별명1', '架空1', 'ａｌｉａｓ１'])('finds alternative costumes through original names and aliases: %s', (query) => {
    const { snapshot, rules } = makeEngineFixture();
    const rows = rankPedigreeCandidates(createEmptyPedigree(), 'target', snapshot, rules, '2026-11-05', query);
    expect(new Set(rows.map((row) => row.costumeId))).toEqual(new Set(['costume_1', 'costume_1_alt']));
  });

  it('excludes future/unknown KR releases and labels forecasts included by the event cutoff', () => {
    const { snapshot, rules } = makeEngineFixture();
    const future = snapshot.releases.find((release) => release.entityId === 'costume_6')!;
    future.krConfirmedDate = null;
    future.krForecastDate = '2027-01-20';
    const unknown = snapshot.releases.find((release) => release.entityId === 'costume_5')!;
    unknown.krConfirmedDate = null;
    unknown.krForecastDate = null;
    const pedigree = createEmptyPedigree();
    const current = rankPedigreeCandidates(pedigree, 'target', snapshot, rules, '2026-11-05');
    const event = rankPedigreeCandidates(pedigree, 'target', snapshot, rules, '2027-02-10');
    expect(current.some((row) => row.costumeId === 'costume_6')).toBe(false);
    expect(event.find((row) => row.costumeId === 'costume_6')?.availability).toEqual({ available: true, basis: 'forecast', effectiveDate: '2027-01-20' });
    expect(event.some((row) => row.costumeId === 'costume_5')).toBe(false);
  });

  it('obeys a later confirmed date over an earlier forecast in candidate filtering', () => {
    const { snapshot, rules } = makeEngineFixture();
    const future = snapshot.releases.find((release) => release.entityId === 'costume_6')!;
    future.krConfirmedDate = '2027-03-01';
    future.krForecastDate = '2027-01-20';
    expect(rankPedigreeCandidates(createEmptyPedigree(), 'target', snapshot, rules, '2027-02-10').some((row) => row.costumeId === 'costume_6')).toBe(false);
  });

  it('does not mutate selected costumes or attached factors while ranking replacements', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    pedigree.parentA.redFactor = { type: 'medium', stars: 3 };
    const before = structuredClone(pedigree);
    rankPedigreeCandidates(pedigree, 'parentA', snapshot, rules, '2027-02-10');
    expect(pedigree).toEqual(before);
  });

  it('rejects invalid cutoff dates even for a search with no results', () => {
    const { snapshot, rules } = makeEngineFixture();
    expect(() => rankPedigreeCandidates(createEmptyPedigree(), 'target', snapshot, rules, '2026-02-30', 'no matches')).toThrow();
  });
});
