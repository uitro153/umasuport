import { describe, expect, it } from 'vitest';
import { calculateAffinity, compareAffinityResults } from '../../src/engine/affinity';
import { createEmptyPedigree } from '../../src/domain/pedigree';
import { pinSnapshot } from '../../src/data/snapshot';
import { makeEngineFixture } from './pedigree-engine-fixture';

describe('versioned synthetic basic-affinity calculation', () => {
  it('sums the eleven specified base-pair terms to an independently calculated total', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    const result = calculateAffinity(pedigree, snapshot, rules);
    // Parents 4+6+7, target-grandparents 2+3+4+5, parent-grandparents 30+20+18+25.
    expect(result.total).toBe(124);
    expect(result.partialTotal).toBe(124);
    expect(result.status).toBe('complete');
    expect(result.contributions).toHaveLength(11);
    expect(result.contributions.every((term) => term.sourceIds.includes('source_fixture'))).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('is symmetric under reversing every stored unordered pair', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    snapshot.affinities = snapshot.affinities.map((pair) => ({ ...pair, aBaseId: pair.bBaseId, bBaseId: pair.aBaseId }));
    expect(calculateAffinity(pedigree, snapshot, rules).total).toBe(124);
  });

  it('uses base-character IDs across alternative costumes', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    pedigree.parentA.costumeId = 'costume_1_alt';
    expect(calculateAffinity(pedigree, snapshot, rules).total).toBe(124);
    pedigree.parentB.costumeId = 'costume_1';
    const result = calculateAffinity(pedigree, snapshot, rules);
    expect(result.status).toBe('invalid');
    expect(result.total).toBeNull();
    expect(result.issues.some((issue) => issue.includes('같은 인물'))).toBe(true);
  });

  it('distinguishes a verified zero pair from a missing pair', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    snapshot.affinities[0]!.baseValue = 0;
    expect(calculateAffinity(pedigree, snapshot, rules)).toMatchObject({ status: 'complete', total: 120 });
    snapshot.affinities.shift();
    const missing = calculateAffinity(pedigree, snapshot, rules);
    expect(missing).toMatchObject({ status: 'unavailable', total: null, partialTotal: 120 });
    expect(missing.contributions[0]!.value).toBeNull();
  });

  it('does not publish a complete total before all seven slots are chosen', () => {
    const { snapshot, rules } = makeEngineFixture();
    const pedigree = createEmptyPedigree();
    expect(calculateAffinity(pedigree, snapshot, rules)).toMatchObject({ status: 'partial', total: null, partialTotal: 0 });
    pedigree.target.costumeId = 'costume_0';
    pedigree.parentA.costumeId = 'costume_1';
    expect(calculateAffinity(pedigree, snapshot, rules)).toMatchObject({ status: 'partial', total: null, partialTotal: 4 });
  });

  it('marks unknown selected costumes and mixed rule snapshots invalid', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    pedigree.grandB2.costumeId = 'missing_costume';
    expect(calculateAffinity(pedigree, snapshot, rules)).toMatchObject({ status: 'invalid', total: null });
    pedigree.grandB2.costumeId = 'costume_6';
    expect(calculateAffinity(pedigree, snapshot, { ...rules, snapshotId: 'different' })).toMatchObject({ status: 'invalid', total: null });
  });

  it('never changes frozen inputs and red factors do not add affinity points', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    pedigree.parentA.redFactor = { type: 'medium', stars: 3 };
    const frozen = Object.freeze({ ...pedigree, parentA: Object.freeze({ ...pedigree.parentA }) });
    expect(calculateAffinity(frozen, pinSnapshot(snapshot), rules).total).toBe(124);
  });

  it('ranks unknown results after known complete scores instead of as zero', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    const known = calculateAffinity(pedigree, snapshot, rules);
    snapshot.affinities.shift();
    const unknown = calculateAffinity(pedigree, snapshot, rules);
    expect(compareAffinityResults(known, unknown)).toBeLessThan(0);
  });
});
