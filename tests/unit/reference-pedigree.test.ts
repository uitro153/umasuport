import { describe, expect, it } from 'vitest';
import { calculateReferencePedigree, enumerateReferenceGrandparentArrangements } from '../../src/engine/reference-pedigree';
import { createEmptyPedigree, GRANDPARENT_SLOT_KEYS } from '../../src/domain/pedigree';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

describe('explicitly unverified seven-person reference assumption', () => {
  it('blocks a default aggregate while retaining individual historical comparisons', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    const result = calculateReferencePedigree(pedigree, snapshot);
    expect(result).toMatchObject({ status: 'unavailable', previewTotal: null, validation: 'pending', formulaStatus: 'public-supported-kr-pending' });
    expect(result.contributions.map((term) => term.value)).toEqual([3, 5, 1, 3, 3, 5, 5]);
    expect(result.contributions[3]!.groupIds).toEqual(['all', 'x']);
    expect(result.contributions[3]!.baseIds).toEqual(['a', 'b', 'd']);
  });

  it('provides only an opt-in preview, never a verified game total', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    // Independent sum: pair terms 3+5+1; triads 3+3+5+5; assumed aggregate 25.
    expect(calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true })).toMatchObject({ status: 'preview', previewTotal: 25, previewContribution: 25, validation: 'pending' });
    expect(snapshot.validation).toEqual({ krAffinity: 'pending', sevenPersonFormula: 'pending', redFactorRules: 'pending' });
  });

  it('distinguishes incomplete choices, missing memberships and unknown costumes', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    expect(calculateReferencePedigree(createEmptyPedigree(), snapshot, { allowUnverifiedFormula: true })).toMatchObject({ status: 'incomplete', previewTotal: null });
    delete snapshot.affinity.members.d;
    expect(calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true })).toMatchObject({ status: 'unavailable', previewTotal: null });
    pedigree.grandA1.costumeId = 'missing';
    expect(calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true })).toMatchObject({ status: 'invalid', previewTotal: null });
  });

  it('returns exactly six proposals, preserving target, parents and factor ownership', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    pedigree.grandA1.redFactor = { type: 'dirt', stars: 1 };
    pedigree.grandB1.redFactor = { type: 'mile', stars: 3 };
    const before = structuredClone(pedigree);
    const result = enumerateReferenceGrandparentArrangements(pedigree, snapshot, { allowUnverifiedFormula: true });
    expect(result).toHaveLength(6);
    expect(new Set(result.map((row) => row.arrangementId)).size).toBe(6);
    expect(result.map((row) => row.result.previewTotal)).toEqual([25, 25, 23, 21, 19, 19]);
    for (const row of result) {
      expect(row.pedigree.target).toEqual(pedigree.target);
      expect(row.pedigree.parentA).toEqual(pedigree.parentA);
      expect(row.pedigree.parentB).toEqual(pedigree.parentB);
      GRANDPARENT_SLOT_KEYS.forEach((destination, index) => expect(row.pedigree[destination]).toEqual(pedigree[row.originalSlotKeys[index]!]));
    }
    result[0]!.pedigree.grandA1.redFactor!.stars = 2;
    expect(pedigree).toEqual(before);
  });

  it('does not score-rank six layouts by an unapproved aggregate', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    const results = enumerateReferenceGrandparentArrangements(pedigree, snapshot);
    expect(results).toHaveLength(6);
    expect(results.every((row) => row.result.previewTotal === null)).toBe(true);
    pedigree.parentA.costumeId = null;
    expect(enumerateReferenceGrandparentArrangements(pedigree, snapshot, { allowUnverifiedFormula: true })).toEqual([]);
  });

  it('is invariant to sibling-slot order and ignores red factors for affinity', () => {
    const { snapshot, pedigree } = makeReferenceEngineFixture();
    const initial = calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true }).previewTotal;
    [pedigree.grandA1, pedigree.grandA2] = [pedigree.grandA2, pedigree.grandA1];
    pedigree.parentB.redFactor = { type: 'medium', stars: 3 };
    expect(calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true }).previewTotal).toBe(initial);
  });
});
