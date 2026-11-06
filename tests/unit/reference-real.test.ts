import { describe, expect, it } from 'vitest';
import expected from '../golden/public-expectations.json';
import real from '../golden/real-reference-subset.json';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { createEmptyPedigree, ANCESTOR_SLOT_KEYS, SLOT_KEYS, GRANDPARENT_SLOT_KEYS } from '../../src/domain/pedigree';
import { groupAffinity } from '../../src/engine/reference-affinity';
import { calculateReferencePedigree, enumerateReferenceGrandparentArrangements } from '../../src/engine/reference-pedigree';
import { calculateReferenceAptitudes } from '../../src/engine/reference-aptitude';
import { applyReferenceReleaseEvidence, RELEASE_OBSERVATIONS } from '../../src/data/reference-evidence';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

const snapshot = validateReferenceSnapshot(real);
const tree = () => {
  const pedigree = createEmptyPedigree();
  ['100901', '101401', '100601', '102601', '101001', '100401', '100301'].forEach((id, index) => { pedigree[SLOT_KEYS[index]!].costumeId = id; });
  return pedigree;
};

describe('real-data integration with independently recorded expectations', () => {
  it('matches manually observed GameTora full pedigree and every contribution', () => {
    const result = calculateReferencePedigree(tree(), snapshot, { allowUnverifiedFormula: true });
    expect(result.contributions.map((term) => term.value)).toEqual(expected.calculator.termsInEngineOrder);
    expect(result.previewTotal).toBe(expected.calculator.total);
    expect(snapshot.validation.krAffinity).toBe('pending');
  });

  it('preserves historical discrepancies rather than rewriting expectations as current truth', () => {
    expect(groupAffinity(snapshot, ['1009','1006']).value).not.toBe(24);
    expect(groupAffinity(snapshot, ['1009','1006','1010']).value).not.toBe(14);
  });

  it.each([[0,'E'],[1,'D'],[3,'D'],[4,'C'],[6,'C'],[7,'B'],[9,'B'],[10,'A'],[12,'A'],[18,'A']] as const)('Teio mile E with %i stars -> %s from public threshold table', (stars, expected) => {
    const pedigree = tree(); pedigree.target.costumeId = '100301';
    let remaining = stars;
    for (const key of ANCESTOR_SLOT_KEYS) {
      const amount = Math.min(3, remaining); remaining -= amount;
      pedigree[key].redFactor = amount ? { type: 'mile', stars: amount as 1|2|3 } : null;
    }
    // Target factor never contributes.
    pedigree.target.redFactor = { type: 'mile', stars: 3 };
    expect(calculateReferenceAptitudes(pedigree, snapshot).changes.find((row) => row.type === 'mile')).toMatchObject({ base: 'E', result: expected, totalStars: stars });
  });

  it('limits 18 stars to four steps even from G and keeps factor types separate', () => {
    const pedigree = tree(); pedigree.target.costumeId = '100301';
    for (const key of ANCESTOR_SLOT_KEYS) pedigree[key].redFactor = { type: 'dirt', stars: 3 };
    expect(calculateReferenceAptitudes(pedigree,snapshot).changes.find((row) => row.type === 'dirt')).toMatchObject({ base:'G', result:'C', gradeSteps:4, totalStars:18 });
    pedigree.parentA.redFactor = { type:'mile', stars:1 };
    const changes = calculateReferenceAptitudes(pedigree,snapshot).changes;
    expect(changes.find((row) => row.type === 'mile')).toMatchObject({ base:'E',result:'D',totalStars:1 });
    expect(changes.find((row) => row.type === 'dirt')?.totalStars).toBe(15);
    const { snapshot: synthetic, pedigree: sample } = makeReferenceEngineFixture();
    synthetic.costumes[0]!.aptitudes.turf = 'S';
    expect(calculateReferenceAptitudes(sample,synthetic).changes.find((row) => row.type === 'turf')?.result).toBe('S');
  });

  it('caps initial A and excludes absent ancestors; rejects unknown IDs', () => {
    const pedigree = tree(); pedigree.parentA.redFactor = { type: 'turf', stars: 3 };
    expect(calculateReferenceAptitudes(pedigree, snapshot).changes.find((row) => row.type === 'turf')?.result).toBe('A');
    pedigree.parentA.costumeId = null;
    expect(calculateReferenceAptitudes(pedigree, snapshot).changes.find((row) => row.type === 'turf')?.totalStars).toBe(0);
    pedigree.parentA.costumeId = 'missing';
    expect(calculateReferenceAptitudes(pedigree, snapshot).status).toBe('invalid');
  });

  it('agrees with exhaustive 24-permutation oracle, keeping factors and parents fixed', () => {
    const pedigree = tree(); pedigree.grandA1.redFactor = { type: 'dirt', stars: 2 };
    // Deliberately separate algorithm: brute force permutations + direct group counting.
    const score = (ids: string[]) => {
      if (new Set(ids).size !== ids.length) return 0;
      return Array.from(Object.entries(snapshot.affinity.members).filter(([id]) => ids.includes(id))
        .map(([, groups]) => new Set(groups)).reduce<Set<string> | null>((common, groups) => common === null ? groups : new Set([...common].filter((id) => groups.has(id))), null)!
        .values()).reduce((sum, id) => sum + (snapshot.affinity.weights[id] ?? 1), 0);
    };
    const base = (key: typeof SLOT_KEYS[number]) => snapshot.costumes.find((row) => row.costumeId === pedigree[key].costumeId)!.baseId;
    const [t,a,b] = ['target','parentA','parentB'].map((key) => base(key as typeof SLOT_KEYS[number]));
    const grandparents = GRANDPARENT_SLOT_KEYS.map(base);
    const totals: number[] = [];
    for (const i of [0,1,2,3]) for (const j of [0,1,2,3]) for (const k of [0,1,2,3]) for (const l of [0,1,2,3]) {
      if (new Set([i,j,k,l]).size !== 4) continue;
      totals.push(score([t!,a!])+score([t!,b!])+score([a!,b!])+score([t!,a!,grandparents[i]!])+score([t!,a!,grandparents[j]!])+score([t!,b!,grandparents[k]!])+score([t!,b!,grandparents[l]!]));
    }
    const layouts = enumerateReferenceGrandparentArrangements(pedigree, snapshot, { allowUnverifiedFormula: true });
    expect(layouts).toHaveLength(6);
    expect(layouts.map((row) => row.result.previewTotal)).toEqual(totals.sort((x,y) => y-x).filter((_,index) => index % 4 === 0));
    for (const row of layouts) for (const key of ['target','parentA','parentB'] as const) expect(row.pedigree[key]).toEqual(pedigree[key]);
    expect(calculateReferencePedigree(pedigree, snapshot).previewTotal).toBeNull();
  });

  it('rejects duplicate parent pairs but deduplicates valid cross-branch repeats without losing distinct factors', () => {
    const pedigree = tree();
    for (const key of GRANDPARENT_SLOT_KEYS) pedigree[key] = { costumeId: '101001', redFactor: null };
    // Four Taikis force a forbidden identical pair under both parents.
    expect(calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true }).status).toBe('invalid');
    expect(enumerateReferenceGrandparentArrangements(pedigree,snapshot)).toHaveLength(0);
    // Two Taikis and two Bourbons can form the same mixed pair on separate
    // branches. The other partitions contain a duplicate pair and are excluded.
    pedigree.grandA2.costumeId = '102601';
    pedigree.grandB2.costumeId = '102601';
    const before = structuredClone(pedigree);
    const layouts = enumerateReferenceGrandparentArrangements(pedigree, snapshot, { allowUnverifiedFormula: true });
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.result.status).toBe('preview');
    for (const pair of [['grandA1', 'grandA2'], ['grandB1', 'grandB2']] as const) {
      expect(pair.map(key => layouts[0]!.pedigree[key].costumeId).sort()).toEqual(['101001', '102601']);
    }
    expect(pedigree).toEqual(before);
    pedigree.grandA1.redFactor = { type: 'mile', stars: 1 };
    const distinct = enumerateReferenceGrandparentArrangements(pedigree, snapshot, { allowUnverifiedFormula: true });
    expect(distinct).toHaveLength(2);
    expect(distinct.every(row => row.result.status === 'preview')).toBe(true);
    expect(distinct.map(row => GRANDPARENT_SLOT_KEYS.find(key => row.pedigree[key].redFactor !== null))).toEqual(['grandA1', 'grandB1']);
  });

  it('keeps source-specific release observations and original unknowns without mutating input', () => {
    const { snapshot: original } = makeReferenceEngineFixture();
    original.applications[0]!.entityId = '100302'; original.costumes[0]!.costumeId = '100302'; original.costumes[0]!.releaseKey = 'costume:100302';
    const output = applyReferenceReleaseEvidence(original);
    expect(output.applications[0]!.kr).toMatchObject({ confirmedDate: '2022-07-25', evidence: 'official_confirmation' });
    expect(output.applications[0]!.kr.observations).toHaveLength(3);
    expect(original.applications[0]!.kr.confirmedDate).toBeNull();
    expect(output.applications[1]!.kr).toEqual(original.applications[1]!.kr);
    expect(applyReferenceReleaseEvidence(output)).toEqual(output);
    expect(RELEASE_OBSERVATIONS.every((row) => row.checkedOn === '2026-11-05')).toBe(true);
  });
});
