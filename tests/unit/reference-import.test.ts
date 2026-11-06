import { describe, expect, it } from 'vitest';
import { convertStaging } from '../../src/data/import-staging';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { validateSnapshot } from '../../src/domain/snapshot';

const source = {
  id: 'raw', url: 'https://example.invalid/raw', repository_commit: 'revision1',
  repository_updated_at: null, data_updated_at: '2026-09-18', verified_on: '2026-11-04',
  coverage: 'Synthetic contract test', missing: 'Independent game expectations', status: 'reference-only',
};
const aptitudes = { turf: 'A', dirt: 'G', sprint: 'F', mile: 'C', medium: 'A', long: 'A', front: 'G', pace: 'A', late: 'A', end: 'C' };
const application = (entityId: string) => ({
  entityType: 'costume', entityId, jpDate: '2025-01-01',
  kr: { confirmedDate: null as string | null, observedDate: null as string | null, forecastDate: null as string | null, releasedBy: null as string | null, evidence: 'none', sourceUrl: null as string | null, checkedOn: '2026-11-04' as string | null },
  patchOverrides: [] as unknown[],
});
const costume = (costumeId: string, baseId: string) => ({
  costumeId, baseId, nameJa: `日本名${baseId}`, outfitJa: `日本衣装${costumeId}`,
  nameKo: 'staging translation', outfitKo: null, displayName: 'Staging display',
  translationStatus: 'source_translation_not_officially_verified', aliases: [], aptitudes,
  sourceIds: ['raw'], releaseKey: `costume:${costumeId}`,
});

function sample() {
  const applications = [application('a1'), application('a2'), application('b1')];
  applications[1]!.kr.observedDate = '2026-10-30';
  applications[1]!.kr.evidence = 'secondary_page';
  applications[1]!.kr.sourceUrl = 'https://example.invalid/secondary';
  return {
    staging: {
      contract: 'uma-p1-staging', schemaVersion: 1, datasetVersion: 'synthetic.contract.1',
      kind: 'unverified', sourceManifestSha256: 'a'.repeat(64), warnings: ['Synthetic contract test; not game data'],
      sources: [source, { ...source, id: 'translation', url: 'https://example.invalid/translation' }],
      characters: [{ baseId: 'a', nameJa: '日本名a' }, { baseId: 'b', nameJa: '日本名b' }],
      costumes: [costume('a1', 'a'), costume('a2', 'a'), costume('b1', 'b')],
      affinity: {
        sourceIds: ['raw'], sourceDate: '2026-09-18', server: 'JP', status: 'unverified-current-kr',
        members: { a: ['common', 'a-only'], b: ['common', 'b-only'] }, weights: { common: 2 },
        pairs: [
          { aBaseId: 'a', bBaseId: 'a', baseValue: 0, sourceIds: ['raw'] },
          { aBaseId: 'a', bBaseId: 'b', baseValue: 2, sourceIds: ['raw'] },
          { aBaseId: 'b', bBaseId: 'b', baseValue: 0, sourceIds: ['raw'] },
        ],
      },
      applications: structuredClone(applications),
      assets: [{ entityType: 'costume', entityId: 'a1', path: 'images/test/a1.png', sourceUrl: 'https://example.invalid/a1.png', sha256: 'b'.repeat(64), usageStatus: 'pending' }],
    },
    labels: [
      { entityType: 'character', entityId: 'a', name: '가상 인물 가', title: null as string | null, aliases: ['가상가'], status: 'source_translation_not_officially_verified', sourceIds: ['translation'] },
      { entityType: 'costume', entityId: 'a1', name: '가상 인물 가', title: '가상 의상 하나', aliases: [], status: 'source_translation_not_officially_verified', sourceIds: ['translation'] },
      { entityType: 'costume', entityId: 'a2', name: '가상 인물 가', title: null, aliases: [], status: 'source_translation_not_officially_verified', sourceIds: ['translation'] },
    ],
    applications,
  };
}

describe('P1 reference ingestion preserves uncertainty and provenance', () => {
  it('uses a separate contract and keeps all game validation pending', () => {
    const converted = convertStaging(sample());
    expect(converted.contract).toBe('uma-p1-reference');
    expect(converted.kind).toBe('reference');
    expect(converted.validation).toEqual({ krAffinity: 'pending', sevenPersonFormula: 'pending', redFactorRules: 'pending' });
    expect(() => validateSnapshot(converted)).toThrow();
    expect(() => validateReferenceSnapshot({ ...converted, kind: 'verified' })).toThrow();
  });

  it('preserves groups, weights, pair values and historical server/date exactly', () => {
    const input = sample();
    const { affinity } = convertStaging(input);
    expect(affinity.members).toEqual(input.staging.affinity.members);
    expect(affinity.weights).toEqual(input.staging.affinity.weights);
    expect(affinity.pairs).toEqual(input.staging.affinity.pairs);
    expect(affinity).toMatchObject({ defaultWeight: 1, duplicateBasePolicy: 'zero', server: 'JP', sourceDate: '2026-09-18' });
  });

  it('keeps Japanese fallback out of nullable Korean fields, including mixed outfit labels', () => {
    const converted = convertStaging(sample());
    expect(converted.characters[1]).toMatchObject({ nameKo: null, displayName: '日本名b', displayLanguage: 'ja', translationStatus: 'missing' });
    expect(converted.costumes[1]).toMatchObject({ nameKo: '가상 인물 가', outfitKo: null, displayName: '가상 인물 가 [日本衣装a2]', displayLanguage: 'mixed' });
    expect(converted.costumes[2]).toMatchObject({ nameKo: null, outfitKo: null, displayLanguage: 'ja' });
    expect(converted.costumes[0]!.translationStatus).toBe('source_translation_not_officially_verified');
  });

  it('keeps translation and original-data source IDs separate without invented attribution', () => {
    const input = sample();
    const converted = convertStaging(input);
    expect(converted.sources).toEqual(input.staging.sources);
    expect(converted.costumes[0]).toMatchObject({ sourceIds: ['raw'], labelSourceIds: ['translation'] });
    expect(converted.characters[0]).toMatchObject({ sourceIds: [], labelSourceIds: ['translation'] });
    expect(converted.sourceManifestSha256).toBe('a'.repeat(64));
  });

  it('uses separate Korean layers instead of promoting stale staging labels or release dates', () => {
    const input = sample();
    input.applications[0]!.patchOverrides.push({ effectiveAt: '2026-11-01', note: 'Explicit difference record' });
    const converted = convertStaging(input);
    expect(converted.costumes[0]!.nameKo).toBe('가상 인물 가');
    expect(converted.applications[0]!.patchOverrides).toEqual(input.applications[0]!.patchOverrides);
    expect(converted.applications[1]!.kr).toEqual(input.applications[1]!.kr);
    expect(converted.applications[1]!.kr.confirmedDate).toBeNull();
    expect(converted.applications[0]!.kr.observedDate).toBeNull();
  });

  it('does not mutate or retain aliases into caller-owned source packs', () => {
    const input = sample();
    const before = structuredClone(input);
    const converted = convertStaging(input);
    converted.costumes[0]!.aptitudes.dirt = 'S';
    converted.affinity.members.a!.pop();
    expect(input).toEqual(before);
  });

  it('changes snapshot identity for a Korean overlay update but keeps source manifest identity', () => {
    const input = sample();
    const first = convertStaging(input);
    input.labels[0]!.aliases.push('새 별명');
    const second = convertStaging(input);
    expect(first.snapshotId).not.toBe(second.snapshotId);
    expect(first.sourceManifestSha256).toBe(second.sourceManifestSha256);
    expect(second.snapshotId).toBe(convertStaging(input).snapshotId);
  });

  it('excludes support application and image metadata without loading or approving images', () => {
    const input = sample();
    input.applications.push({ ...application('support1'), entityType: 'support' });
    const converted = convertStaging(input);
    expect(converted.applications).toHaveLength(3);
    expect(converted.assets[0]!.usageStatus).toBe('pending');
    expect(() => validateReferenceSnapshot({ ...converted, assets: [{ ...converted.assets[0], usageStatus: 'approved' }] })).toThrow();
  });

  it('does not promote a secondary release date into official confirmation', () => {
    const input = sample();
    input.applications[1]!.kr.confirmedDate = '2026-10-30';
    expect(() => convertStaging(input)).toThrow(/official Korean release date/);
  });

  it('accepts explicit official release evidence while leaving calculation validation pending', () => {
    const input = sample();
    input.applications[1]!.kr.evidence = 'official_notice';
    input.applications[1]!.kr.confirmedDate = '2026-10-30';
    const converted = convertStaging(input);
    expect(converted.applications[1]!.kr.confirmedDate).toBe('2026-10-30');
    expect(converted.validation.krAffinity).toBe('pending');
  });

  it.each(['observedDate', 'forecastDate', 'releasedBy'] as const)('requires provenance for dated %s evidence', (field) => {
    const input = sample();
    input.applications[0]!.kr[field] = '2026-11-05';
    expect(() => convertStaging(input)).toThrow(/requires a source/);
  });

  it('rejects impossible dates rather than normalizing them', () => {
    const input = sample();
    input.applications[1]!.kr.observedDate = '2026-02-30';
    expect(() => convertStaging(input)).toThrow();
  });

  it.each(['sources', 'characters', 'costumes'] as const)('rejects duplicate %s identifiers', (table) => {
    const input = sample();
    const rows: unknown[] = input.staging[table];
    rows.push(structuredClone(rows[0]));
    expect(() => convertStaging(input)).toThrow(/Duplicate/);
  });

  it('rejects duplicate label or application rows', () => {
    const input = sample();
    input.labels.push({ ...input.labels[0]! });
    expect(() => convertStaging(input)).toThrow(/Duplicate Korean label/);
    input.labels.pop();
    input.applications.push(structuredClone(input.applications[0]!));
    expect(() => convertStaging(input)).toThrow(/Duplicate Korean application/);
  });

  it('rejects unknown source references and missing application links', () => {
    const input = sample();
    input.labels[0]!.sourceIds = ['missing_source'];
    expect(() => convertStaging(input)).toThrow(/Unknown Korean label source/);
    input.labels[0]!.sourceIds = ['translation'];
    input.applications.shift();
    expect(() => convertStaging(input)).toThrow(/Missing Korean application/);
  });

  it('rejects broken base IDs, lost memberships and reversed duplicate pairs', () => {
    const input = sample();
    input.staging.costumes[0]!.baseId = 'missing';
    expect(() => convertStaging(input)).toThrow(/Unknown base character/);
    input.staging.costumes[0]!.baseId = 'a';
    const converted = convertStaging(input);
    const membershipMissing = structuredClone(converted);
    delete membershipMissing.affinity.members.a;
    expect(() => validateReferenceSnapshot(membershipMissing)).toThrow(/Missing affinity memberships/);
    converted.affinity.pairs.push({ aBaseId: 'b', bBaseId: 'a', baseValue: 2, sourceIds: ['raw'] });
    expect(() => validateReferenceSnapshot(converted)).toThrow(/Duplicate unordered/);
  });
});
