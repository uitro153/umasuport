import baseFixture from '../../data/fixtures/p0.snapshot.json';
import { validateSnapshot, type Snapshot } from '../../src/domain';
import { SLOT_KEYS, createEmptyPedigree, type P1Rules, type Pedigree } from '../../src/domain/pedigree';

/** Deliberately small artificial matrix with independently hand-summed results. */
export function makeEngineFixture(): { snapshot: Snapshot; rules: P1Rules; pedigree: Pedigree } {
  const snapshot = validateSnapshot(baseFixture);
  snapshot.snapshotId = 'independent-p1-engine-fixture';
  snapshot.characters = Array.from({ length: 7 }, (_, index) => ({
    baseId: `base_${index}`, nameKo: `[가상] 인물 ${index}`, nameJa: `架空${index}`,
    aliases: [`별명${index}`, `ALIAS${index}`], sourceIds: ['source_fixture'],
  }));
  snapshot.costumes = snapshot.characters.map((character, index) => ({
    costumeId: `costume_${index}`, baseId: character.baseId, nameKo: `[가상] 의상 ${index}`,
    aptitudes: { turf: 'A', dirt: 'G', sprint: 'E', mile: 'B', medium: 'A', long: 'C', front: 'D', pace: 'A', late: 'B', end: 'G' },
    releaseRef: `release_${index}`, sourceIds: ['source_fixture'],
  }));
  snapshot.costumes.push({ ...snapshot.costumes[1]!, costumeId: 'costume_1_alt', nameKo: '[가상] 다른 의상 1', releaseRef: 'release_1_alt' });
  snapshot.supports = [];
  snapshot.skills = [];
  snapshot.scenarios = [];
  snapshot.tournaments = [];
  snapshot.assets = [];
  snapshot.releases = snapshot.costumes.map((costume) => ({
    releaseId: costume.releaseRef, entityType: 'costume', entityId: costume.costumeId,
    jpDate: '2025-01-01', krConfirmedDate: '2026-01-01', krForecastDate: null, sourceIds: ['source_fixture'],
  }));
  const selectedPairs = [
    [0, 1, 4], [0, 2, 6], [1, 2, 7],
    [0, 3, 2], [0, 4, 3], [0, 5, 4], [0, 6, 5],
    [1, 3, 30], [1, 4, 20], [1, 5, 5], [1, 6, 2],
    [2, 3, 1], [2, 4, 3], [2, 5, 18], [2, 6, 25],
  ];
  snapshot.affinities = selectedPairs.map(([a, b, value]) => ({
    aBaseId: `base_${a}`, bBaseId: `base_${b}`, baseValue: value!, sourceIds: ['source_fixture'],
  }));
  const rules: P1Rules = {
    schemaVersion: 1, ruleId: 'independent-synthetic-rules', snapshotId: snapshot.snapshotId,
    kind: 'fixture', sourceIds: ['source_fixture'],
    affinity: {
      terms: [
        ['target', 'parentA'], ['target', 'parentB'], ['parentA', 'parentB'],
        ['target', 'grandA1'], ['target', 'grandA2'], ['target', 'grandB1'], ['target', 'grandB2'],
        ['parentA', 'grandA1'], ['parentA', 'grandA2'], ['parentB', 'grandB1'], ['parentB', 'grandB2'],
      ].map(([slotA, slotB], index) => ({ termId: `term_${index}`, label: `가상 관계 ${index}`, slotA: slotA as typeof SLOT_KEYS[number], slotB: slotB as typeof SLOT_KEYS[number], weight: 1 })),
      forbiddenSameBasePairs: [['target', 'parentA'], ['target', 'parentB'], ['parentA', 'parentB']],
    },
    aptitude: { starSteps: [{ minStars: 0, gradeSteps: 0 }, { minStars: 1, gradeSteps: 1 }], initialCap: 'A' },
  };
  const pedigree = createEmptyPedigree();
  SLOT_KEYS.forEach((key, index) => { pedigree[key].costumeId = `costume_${index}`; });
  return { snapshot: validateSnapshot(snapshot), rules, pedigree };
}
