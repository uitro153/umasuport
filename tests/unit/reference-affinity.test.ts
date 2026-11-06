import { describe, expect, it } from 'vitest';
import { groupAffinity } from '../../src/engine/reference-affinity';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

describe('historical JP two/three-character group intersections', () => {
  it('keeps a three-way intersection independent from pair-score sums', () => {
    const { snapshot } = makeReferenceEngineFixture();
    snapshot.affinity.members = { a: ['x', 'y'], b: ['x', 'z'], c: ['y', 'z'] };
    snapshot.affinity.weights = { x: 2, y: 3, z: 5 };
    expect(groupAffinity(snapshot, ['a', 'b']).value).toBe(2);
    expect(groupAffinity(snapshot, ['a', 'c']).value).toBe(3);
    expect(groupAffinity(snapshot, ['b', 'c']).value).toBe(5);
    expect(groupAffinity(snapshot, ['a', 'b', 'c']).value).toBe(0);
  });

  it('preserves shared groups, weights, defaults and JP scope', () => {
    const { snapshot } = makeReferenceEngineFixture();
    delete snapshot.affinity.weights.all;
    const result = groupAffinity(snapshot, ['a', 'b', 'd']);
    expect(result).toMatchObject({ value: 3, groupIds: ['all', 'x'], sourceDate: '2026-09-18', server: 'JP', validation: 'unverified-current-kr', sourceIds: ['unit'] });
    expect(result.groups).toEqual([
      { groupId: 'all', weight: 1, basis: 'default-weight' },
      { groupId: 'x', weight: 2, basis: 'explicit-weight' },
    ]);
  });

  it('distinguishes unknown membership from a known empty set', () => {
    const { snapshot } = makeReferenceEngineFixture();
    snapshot.affinity.members.h = [];
    expect(groupAffinity(snapshot, ['a', 'h'])).toMatchObject({ value: 0, status: 'historical-jp-unverified-kr' });
    expect(groupAffinity(snapshot, ['a', 'missing'])).toMatchObject({ value: null, status: 'missing-character' });
    expect(groupAffinity(snapshot, ['toString', 'a'])).toMatchObject({ value: null, status: 'missing-character' });
  });

  it('reproduces explicit duplicate-ID zero policy without concealing missing IDs', () => {
    const { snapshot } = makeReferenceEngineFixture();
    expect(groupAffinity(snapshot, ['a', 'a', 'b'])).toMatchObject({ value: 0, duplicatePolicyApplied: true });
    expect(groupAffinity(snapshot, ['missing', 'missing'])).toMatchObject({ value: null, duplicatePolicyApplied: false });
  });

  it('does not double count repeated input groups or mutate supplied memberships', () => {
    const { snapshot } = makeReferenceEngineFixture();
    snapshot.affinity.members.a!.push('x');
    const before = structuredClone(snapshot.affinity);
    expect(groupAffinity(snapshot, ['a', 'b']).value).toBe(3);
    expect(snapshot.affinity).toEqual(before);
  });

  it.each([{ ids: [] }, { ids: ['a'] }, { ids: ['a', 'b', 'c', 'd'] }])('rejects unsupported group arity $ids', ({ ids }) => {
    expect(() => groupAffinity(makeReferenceEngineFixture().snapshot, ids)).toThrow(RangeError);
  });

  it('never silently accepts an invalid explicit weight', () => {
    const { snapshot } = makeReferenceEngineFixture();
    snapshot.affinity.weights.x = -2;
    expect(() => groupAffinity(snapshot, ['a', 'b'])).toThrow(RangeError);
  });
});
