import type { ReferenceApplication, ReferenceSnapshot } from '../../src/domain/reference';
import { createEmptyPedigree, SLOT_KEYS, type Pedigree } from '../../src/domain/pedigree';

export function makeApplication(entityId = 'costume_a', kr: Partial<ReferenceApplication['kr']> = {}): ReferenceApplication {
  return {
    entityType: 'costume', entityId, jpDate: '2021-02-24',
    kr: { confirmedDate: null, observedDate: null, forecastDate: null, releasedBy: null, evidence: 'none', sourceUrl: null, checkedOn: '2026-11-05', ...kr },
    patchOverrides: [],
  };
}

/** Independent, fictional group memberships; never a real KR expected result. */
export function makeReferenceEngineFixture(): { snapshot: ReferenceSnapshot; pedigree: Pedigree } {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const snapshot: ReferenceSnapshot = {
    contract: 'uma-p1-reference', schemaVersion: 1, snapshotId: 'unit-reference', datasetVersion: 'unit.1', kind: 'reference',
    sourceManifestSha256: 'a'.repeat(64), warnings: ['Synthetic unit-test data'],
    sources: [{ id: 'unit', url: 'https://example.invalid/reference', repository_commit: null, repository_updated_at: null, data_updated_at: null, verified_on: '2026-11-05', coverage: 'Synthetic intersections', missing: 'Independent KR expected cases', status: 'partial' }],
    characters: ids.map((id) => ({ baseId: id, nameJa: `人物${id.toUpperCase()}`, nameKo: null, displayName: `人物${id.toUpperCase()}`, displayLanguage: 'ja', translationStatus: 'missing', aliases: id === 'a' ? ['에이별칭'] : [], labelSourceIds: [], sourceIds: [] })),
    costumes: ids.map((id) => ({ costumeId: `costume_${id}`, baseId: id, nameJa: `人物${id.toUpperCase()}`, outfitJa: `衣装${id.toUpperCase()}`, nameKo: null, outfitKo: null, displayName: `人物${id.toUpperCase()} [衣装${id.toUpperCase()}]`, displayLanguage: 'ja', translationStatus: 'missing', aliases: [], aptitudes: { turf: 'A', dirt: 'G', sprint: 'F', mile: 'C', medium: 'A', long: 'B', front: 'G', pace: 'A', late: 'B', end: 'D' }, sourceIds: ['unit'], labelSourceIds: [], releaseKey: `costume:costume_${id}` })),
    applications: ids.map((id) => makeApplication(`costume_${id}`)),
    affinity: {
      sourceIds: ['unit'], sourceDate: '2026-09-18', server: 'JP', status: 'unverified-current-kr',
      members: { a: ['all', 'x', 'y'], b: ['all', 'x'], c: ['all', 'y'], d: ['all', 'x'], e: ['all', 'x', 'y'], f: ['all', 'y'], g: ['all', 'y', 'x'], h: ['all', 'bonus'] },
      weights: { all: 1, x: 2, y: 4, bonus: 8 }, defaultWeight: 1, duplicateBasePolicy: 'zero', pairs: [],
    },
    assets: [], validation: { krAffinity: 'pending', sevenPersonFormula: 'pending', redFactorRules: 'pending' },
  };
  const pedigree = createEmptyPedigree();
  SLOT_KEYS.forEach((key, index) => { pedigree[key].costumeId = `costume_${ids[index]}`; });
  return { snapshot, pedigree };
}
