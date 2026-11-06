import { describe, expect, it } from 'vitest';
import originalFixture from '../../data/fixtures/p0.snapshot.json';
import snapshotInput from '../../data/fixtures/p1.snapshot.json';
import rulesInput from '../../data/fixtures/p1.rules.json';
import { pedigreeRules, pedigreeSnapshot } from '../../src/data/pedigree-data';
import {
  createEmptyPedigree, pedigreeSchema, pedigreeRulesSchema, validatePedigreeRules, validateSnapshot,
} from '../../src/domain';
import { projectAvailability } from '../../src/engine/availability';

const copyRules = () => validatePedigreeRules(rulesInput, pedigreeSnapshot);

describe('P1 fictional data contract', () => {
  it('keeps the P0 contract and original fixture while adding 20 fictional characters', () => {
    const snapshot = validateSnapshot(snapshotInput);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.kind).toBe('fixture');
    expect(snapshot.characters).toHaveLength(20);
    expect(snapshot.costumes).toHaveLength(21);
    expect(snapshot.supports).toEqual(originalFixture.supports);
    expect(snapshot.tournaments).toEqual(originalFixture.tournaments);
    expect(snapshot.sources.every((source) => source.evidence === 'fixture')).toBe(true);
    expect(originalFixture.characters).toHaveLength(2);
    expect(originalFixture.snapshotId).toBe('fixture-p0-2026-11-04');
  });

  it('has a complete unordered affinity matrix including explicit self-pairs', () => {
    expect(pedigreeSnapshot.affinities).toHaveLength(210);
    for (const a of pedigreeSnapshot.characters) {
      for (const b of pedigreeSnapshot.characters) {
        const pair = pedigreeSnapshot.affinities.filter((row) =>
          (row.aBaseId === a.baseId && row.bBaseId === b.baseId)
          || (row.aBaseId === b.baseId && row.bBaseId === a.baseId));
        expect(pair).toHaveLength(1);
      }
    }
  });

  it('retains the same base identity for two separate costume versions', () => {
    const variants = pedigreeSnapshot.costumes.filter((costume) => costume.baseId === 'character_demo_a');
    expect(variants).toHaveLength(2);
    expect(variants[0]!.costumeId).not.toBe(variants[1]!.costumeId);
  });

  it('has confirmed, forecast-before-event, later, and KR-unknown costumes for filter checks', () => {
    const costumes = pedigreeSnapshot.releases.filter((release) => release.entityType === 'costume');
    const current = costumes.filter((release) => projectAvailability(release, '2026-11-05').available);
    const future = costumes.filter((release) => projectAvailability(release, '2027-02-10').available);
    expect(current).toHaveLength(18);
    expect(future).toHaveLength(19);
    expect(costumes.filter((release) => projectAvailability(release, '2027-02-10').basis === 'unknown')).toHaveLength(1);
  });

  it('pins both the data and rule provenance to one immutable fixture version', () => {
    expect(pedigreeRules.snapshotId).toBe(pedigreeSnapshot.snapshotId);
    expect(pedigreeRules.kind).toBe('fixture');
    expect(Object.isFrozen(pedigreeRules.affinity.terms[0])).toBe(true);
    expect(Object.isFrozen(pedigreeRules.aptitude.starSteps)).toBe(true);
    expect(Object.isFrozen(pedigreeSnapshot.affinities[0])).toBe(true);
  });

  it('creates seven independent empty slots', () => {
    const tree = createEmptyPedigree();
    expect(Object.keys(tree)).toHaveLength(7);
    tree.parentA.costumeId = 'costume_demo_a_default';
    expect(tree.parentB.costumeId).toBeNull();
    expect(createEmptyPedigree().parentA.costumeId).toBeNull();
    expect(pedigreeSchema.safeParse(tree).success).toBe(true);
  });

  it('preserves valid stale factors for the engine to explicitly exclude by generation/selection', () => {
    const tree = createEmptyPedigree();
    tree.target.redFactor = { type: 'dirt', stars: 3 };
    tree.parentA.redFactor = { type: 'dirt', stars: 3 };
    expect(pedigreeSchema.parse(tree)).toEqual(tree);
  });

  it.each([0, 4, -1, 1.5])('rejects a red factor with %s stars', (stars) => {
    const tree = createEmptyPedigree();
    expect(pedigreeSchema.safeParse({ ...tree, parentA: { costumeId: 'costume_demo_a_default', redFactor: { type: 'dirt', stars } } }).success).toBe(false);
  });

  it('rejects an invalid factor type and incomplete pedigree slot set', () => {
    expect(pedigreeSchema.safeParse({ ...createEmptyPedigree(), target: { costumeId: null, redFactor: { type: 'unknown', stars: 1 } } }).success).toBe(false);
    expect(pedigreeSchema.safeParse({ target: { costumeId: null, redFactor: null } }).success).toBe(false);
  });
});

describe('P1 rule ingestion boundary', () => {
  it('accepts the explicit fictional terms and zero-star boundary', () => {
    const rules = copyRules();
    expect(rules.affinity.terms).toHaveLength(11);
    expect(rules.aptitude.starSteps[0]).toEqual({ minStars: 0, gradeSteps: 0 });
    expect(rules.aptitude.initialCap).toBe('A');
  });

  it('rejects rules that point at another snapshot', () => {
    expect(() => validatePedigreeRules({ ...copyRules(), snapshotId: 'different-snapshot' }, pedigreeSnapshot)).toThrow();
  });

  it('rejects unknown rule sources and a fixture relabeled as verified', () => {
    expect(() => validatePedigreeRules({ ...copyRules(), sourceIds: ['missing'] }, pedigreeSnapshot)).toThrow();
    expect(() => validatePedigreeRules({ ...copyRules(), kind: 'verified' }, pedigreeSnapshot)).toThrow();
    expect(() => validatePedigreeRules({ ...copyRules(), kind: 'verified' }, { ...pedigreeSnapshot, kind: 'verified' })).toThrow();
  });

  it('rejects misspelled fields, unsupported versions, and unknown slot names', () => {
    expect(pedigreeRulesSchema.safeParse({ ...copyRules(), formula: 'unrecognized' }).success).toBe(false);
    expect(pedigreeRulesSchema.safeParse({ ...copyRules(), schemaVersion: 2 }).success).toBe(false);
    const rules = structuredClone(rulesInput);
    rules.affinity.terms[0]!.slotB = 'grandC1';
    expect(pedigreeRulesSchema.safeParse(rules).success).toBe(false);
  });

  it('rejects inconsistent weights between sibling grandparent slots', () => {
    const rules = copyRules();
    rules.affinity.terms.find((term) => term.termId === 'parent-a-grand-a1')!.weight = 2;
    const result = pedigreeRulesSchema.safeParse(rules);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes('equivalent relationship weights'))).toBe(true);
  });

  it('rejects restrictions that would make sibling swaps distinct candidates', () => {
    const rules = copyRules();
    rules.affinity.forbiddenSameBasePairs.push(['target', 'grandA1']);
    expect(pedigreeRulesSchema.safeParse(rules).success).toBe(false);
  });

  it('rejects duplicate term IDs and relationships', () => {
    const rules = copyRules();
    rules.affinity.terms.push({ ...rules.affinity.terms[0]! });
    expect(pedigreeRulesSchema.safeParse(rules).success).toBe(false);
  });

  it('rejects a term relating a slot to itself', () => {
    const rules = copyRules();
    rules.affinity.terms[0]!.slotB = 'target';
    expect(pedigreeRulesSchema.safeParse(rules).success).toBe(false);
  });

  it.each([
    [{ minStars: 1, gradeSteps: 1 }],
    [{ minStars: 0, gradeSteps: 1 }],
    [{ minStars: 0, gradeSteps: 0 }, { minStars: 1, gradeSteps: 1 }, { minStars: 1, gradeSteps: 2 }],
    [{ minStars: 0, gradeSteps: 0 }, { minStars: 4, gradeSteps: 2 }, { minStars: 7, gradeSteps: 1 }],
    [{ minStars: 0, gradeSteps: 0 }, { minStars: 19, gradeSteps: 7 }],
  ])('rejects invalid star-step boundaries %j', (...starSteps) => {
    const rules = copyRules();
    rules.aptitude.starSteps = starSteps;
    expect(pedigreeRulesSchema.safeParse(rules).success).toBe(false);
  });
});
