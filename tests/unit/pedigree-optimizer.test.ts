import { describe, expect, it } from 'vitest';
import { enumerateGrandparentArrangements } from '../../src/engine/pedigree-optimizer';
import { calculateAffinity } from '../../src/engine/affinity';
import { GRANDPARENT_SLOT_KEYS } from '../../src/domain/pedigree';
import { makeEngineFixture } from './pedigree-engine-fixture';

describe('six grandparent planning arrangements', () => {
  it('enumerates exactly the six unordered pairs for the fixed parent A side', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    const results = enumerateGrandparentArrangements(pedigree, snapshot, rules);
    expect(results).toHaveLength(6);
    expect(new Set(results.map((row) => row.arrangementId)).size).toBe(6);
    expect(results.map((row) => row.originalSlotKeys.slice(0, 2).join(','))).toEqual([
      'grandA1,grandA2', 'grandA1,grandB1', 'grandA1,grandB2',
      'grandA2,grandB1', 'grandA2,grandB2', 'grandB1,grandB2',
    ]);
    // Independent hand sums of the six branch contributions: 93,63,53,51,41,11.
    // The fixed relationships contribute 31 to all six.
    expect(results.map((row) => row.result.total)).toEqual([124, 94, 84, 82, 72, 42]);
  });

  it('keeps target/parents fixed and moves each factor with its own grandparent', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    pedigree.grandA1.redFactor = { type: 'dirt', stars: 1 };
    pedigree.grandA2.redFactor = { type: 'medium', stars: 2 };
    pedigree.grandB1.redFactor = { type: 'mile', stars: 3 };
    const before = structuredClone(pedigree);
    const results = enumerateGrandparentArrangements(pedigree, snapshot, rules);
    for (const row of results) {
      expect(row.pedigree.target).toEqual(pedigree.target);
      expect(row.pedigree.parentA).toEqual(pedigree.parentA);
      expect(row.pedigree.parentB).toEqual(pedigree.parentB);
      GRANDPARENT_SLOT_KEYS.forEach((destination, index) => {
        expect(row.pedigree[destination]).toEqual(pedigree[row.originalSlotKeys[index]!]);
      });
    }
    results[0]!.pedigree.grandA1.redFactor!.stars = 3;
    expect(pedigree).toEqual(before);
  });

  it('does not create a second scoring candidate for sibling-order swaps', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    const score = calculateAffinity(pedigree, snapshot, rules).total;
    [pedigree.grandA1, pedigree.grandA2] = [pedigree.grandA2, pedigree.grandA1];
    [pedigree.grandB1, pedigree.grandB2] = [pedigree.grandB2, pedigree.grandB1];
    expect(calculateAffinity(pedigree, snapshot, rules).total).toBe(score);
    expect(enumerateGrandparentArrangements(pedigree, snapshot, rules).map((row) => row.result.total))
      .toEqual([124, 94, 84, 82, 72, 42]);
  });

  it('waits for all seven selections, rather than optimizing a partial tree', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    pedigree.parentB.costumeId = null;
    expect(enumerateGrandparentArrangements(pedigree, snapshot, rules)).toEqual([]);
  });

  it('keeps six proposals even when some required pair data is missing', () => {
    const { snapshot, rules, pedigree } = makeEngineFixture();
    snapshot.affinities = snapshot.affinities.filter((pair) => !(pair.aBaseId === 'base_1' && pair.bBaseId === 'base_3'));
    const results = enumerateGrandparentArrangements(pedigree, snapshot, rules);
    expect(results).toHaveLength(6);
    expect(results.slice(0, 3).every((row) => row.result.status === 'complete')).toBe(true);
    expect(results.slice(3).every((row) => row.result.status === 'unavailable' && row.result.total === null)).toBe(true);
    expect(enumerateGrandparentArrangements(pedigree, snapshot, rules).map((row) => row.arrangementId))
      .toEqual(results.map((row) => row.arrangementId));
  });
});
