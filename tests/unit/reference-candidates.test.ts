import { describe, expect, it } from 'vitest';
import { rankReferenceCandidates } from '../../src/engine/reference-candidates';
import { makeReferenceEngineFixture, makeApplication } from './reference-engine-fixture';

describe('reference candidate search, release policy and opt-in comparison', () => {
  it('excludes unknown schedules by default and distinguishes them when included', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    snapshot.applications[1] = makeApplication('costume_b', { observedDate: '2026-10-30', evidence: 'secondary_page', sourceUrl: 'https://example.invalid/secondary' });
    const filtered = rankReferenceCandidates(pedigree, 'grandA1', snapshot, '2026-11-05');
    expect(filtered.map((row) => row.costumeId)).toEqual(['costume_b']);
    expect(filtered[0]!.availability).toMatchObject({ state: 'available', basis: 'secondary-date' });
    const all = rankReferenceCandidates(pedigree, 'grandA1', snapshot, '2026-11-05', { includeUnknown: true });
    expect(all).toHaveLength(8);
    expect(all.find((row) => row.costumeId === 'costume_a')!.availability.state).toBe('unknown');
  });

  it('never includes dated future content as an unknown item after opting into its forecast', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    snapshot.applications[7] = makeApplication('costume_h', { forecastDate: '2027-01-01', evidence: 'forecast', sourceUrl: 'https://example.invalid/forecast' });
    expect(rankReferenceCandidates(pedigree, 'parentA', snapshot, '2026-11-05', { includeUnknown: true }).some((row) => row.costumeId === 'costume_h')).toBe(true);
    expect(rankReferenceCandidates(pedigree, 'parentA', snapshot, '2026-11-05', { includeUnknown: true, allowForecast: true }).some((row) => row.costumeId === 'costume_h')).toBe(false);
    expect(rankReferenceCandidates(pedigree, 'parentA', snapshot, '2027-01-01', { allowForecast: true }).find((row) => row.costumeId === 'costume_h')!.availability.basis).toBe('forecast');
  });

  it.each(['에이별칭', '人物A', '衣装A', 'ＣＯＳＴＵＭＥ＿Ａ'])('searches source names, aliases and stable IDs for %s', (query) => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    expect(rankReferenceCandidates(pedigree, 'parentA', snapshot, '2026-11-05', { includeUnknown: true, query }).map((row) => row.costumeId)).toEqual(['costume_a']);
  });

  it('ranks usable pedigrees before invalid ones, then scores and deterministic name/ID ties after opt-in', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    const before = structuredClone(pedigree);
    const defaultOrder = rankReferenceCandidates(pedigree, 'parentA', snapshot, '2026-11-05', { includeUnknown: true });
    expect(defaultOrder.map((row) => row.costumeId)).toEqual(['costume_a', 'costume_b', 'costume_c', 'costume_d', 'costume_e', 'costume_f', 'costume_g', 'costume_h']);
    expect(defaultOrder.every((row) => row.result.previewTotal === null)).toBe(true);
    const ranked = rankReferenceCandidates(pedigree, 'parentA', snapshot, '2026-11-05', { includeUnknown: true, allowUnverifiedFormula: true });
    const valid = ranked.filter(row => row.result.status === 'preview');
    const invalid = ranked.filter(row => row.result.status === 'invalid');
    expect(valid.map(row => row.costumeId).sort()).toEqual(['costume_b', 'costume_f', 'costume_g', 'costume_h']);
    expect(invalid.map(row => row.costumeId).sort()).toEqual(['costume_a', 'costume_c', 'costume_d', 'costume_e']);
    expect(ranked).toEqual([...valid, ...invalid]);
    // Scores descend within each validity group. A larger sum from a forbidden
    // child/parent or parent-pair duplication must never promote that candidate.
    for (const group of [valid, invalid]) {
      const scores = group.map(row => row.result.previewContribution);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
    expect(invalid.some(row => row.result.previewContribution > valid.at(-1)!.result.previewContribution)).toBe(true);
    expect(invalid.every(row => row.result.previewTotal === null && row.result.issues.length > 0)).toBe(true);
    expect(ranked.map((row) => row.costumeId)).not.toEqual(defaultOrder.map((row) => row.costumeId));
    expect(pedigree).toEqual(before);

    // Release filtering precedes ranking, but an observed release is not a score
    // bonus: higher-scoring unknown schedules remain ahead when explicitly allowed.
    const released = structuredClone(snapshot);
    released.applications[1] = makeApplication('costume_b', { observedDate: '2026-10-30', evidence: 'secondary_page', sourceUrl: 'https://example.invalid/secondary' });
    const withUnknown = rankReferenceCandidates(pedigree, 'parentA', released, '2026-11-05', { includeUnknown: true, allowUnverifiedFormula: true });
    expect(withUnknown.map(row => row.costumeId)).toEqual(ranked.map(row => row.costumeId));
    expect(rankReferenceCandidates(pedigree, 'parentA', released, '2026-11-05', { allowUnverifiedFormula: true }).map(row => row.costumeId)).toEqual(['costume_b']);

    // Equal base characters give equal scores; names precede canonical-ID ties.
    const ties = structuredClone(snapshot);
    const original = ties.costumes.find(row => row.costumeId === 'costume_b')!;
    original.displayName = '동률 후보';
    ties.costumes.push({ ...original, costumeId: 'costume_b_2' }, { ...original, costumeId: 'costume_z', displayName: '가 동률 후보' });
    const tiedOrder = () => rankReferenceCandidates(pedigree, 'parentA', ties, '2026-11-05', { includeUnknown: true, allowUnverifiedFormula: true })
      .filter(row => ['costume_b', 'costume_b_2', 'costume_z'].includes(row.costumeId)).map(row => row.costumeId);
    expect(tiedOrder()).toEqual(['costume_z', 'costume_b', 'costume_b_2']);
    ties.costumes.reverse();
    expect(tiedOrder()).toEqual(['costume_z', 'costume_b', 'costume_b_2']);
  });
});
