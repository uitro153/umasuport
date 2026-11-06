import { describe, expect, it } from 'vitest';
import { applyLineageGrandparentArrangement, createLineagePlan, extractPedigree, getInheritedNodeIds, getLineageSlotMap, getLineageSlots, getProtectedNodeIds, lineagePlanSchema, setLineageLock, updateLineageFromPedigree, updateLineageNode, validateLineagePlan } from '../../src/domain/lineage';
import { makeReferenceEngineFixture } from './reference-engine-fixture';

function sample() { const { pedigree } = makeReferenceEngineFixture(); return createLineagePlan(pedigree); }

describe('31-person ownership graph', () => {
  it('keeps seven selections and creates exact 1/2/4/8/16 connected slots', () => {
    const { pedigree } = makeReferenceEngineFixture();
    const plan = createLineagePlan(pedigree);
    const slots = getLineageSlots(plan);
    expect(Object.keys(plan.nodes)).toHaveLength(31);
    expect([0, 1, 2, 3, 4].map((depth) => slots.filter((slot) => slot.depth === depth).length)).toEqual([1, 2, 4, 8, 16]);
    expect(extractPedigree(plan)).toEqual(pedigree);
    expect(new Set(slots.map((slot) => slot.path)).size).toBe(31);
    expect(slots.find((slot) => slot.path === 'LLL')?.label).toBe('증조 1');
    expect(slots.find((slot) => slot.path === 'RRRR')?.label).toBe('고조 16');
  });

  it('rejects absent owners, cycles, shared instances, unconnected nodes and wrong-depth links', () => {
    const missing = sample(); delete missing.nodes.ancestor_30;
    expect(() => validateLineagePlan(missing)).toThrow();
    const cycle = sample(); cycle.nodes.parentA!.parentIds![0] = cycle.rootId;
    expect(() => validateLineagePlan(cycle)).toThrow();
    const shared = sample(); shared.nodes.parentB!.parentIds![0] = 'grandA1';
    expect(() => validateLineagePlan(shared)).toThrow();
    const extra = sample(); extra.nodes.unconnected = { nodeId: 'unconnected', costumeId: null, redFactor: null, parentIds: null, locked: false };
    expect(() => validateLineagePlan(extra)).toThrow();
    const deep = sample(); deep.nodes.ancestor_30!.parentIds = ['target', 'parentA'];
    expect(() => validateLineagePlan(deep)).toThrow();
    const detached = sample(); detached.nodes.grandA1!.parentIds = null;
    expect(() => validateLineagePlan(detached)).toThrow();
  });

  it('distinguishes repeated characters from repeated factor-owner instances', () => {
    const plan = sample(); plan.nodes.grandA1!.costumeId = plan.nodes.grandB1!.costumeId;
    expect(() => validateLineagePlan(plan)).not.toThrow();
    plan.nodes.grandA1!.nodeId = 'grandB1';
    expect(() => validateLineagePlan(plan)).toThrow();
  });

  it('permits explicit future factors on unspecified owners without claiming owned factors', () => {
    const plan = updateLineageNode(sample(), 'ancestor_15', { redFactor: { type: 'dirt', stars: 3 } });
    expect(plan.nodes.ancestor_15).toMatchObject({ costumeId: null, redFactor: { type: 'dirt', stars: 3 }, locked: false });
    expect(setLineageLock(plan, 'ancestor_15', true).nodes.ancestor_15!.locked).toBe(true);
    expect(setLineageLock(plan, 'grandA1', true).nodes.grandA1!.locked).toBe(true);
    const invalid = structuredClone(plan); invalid.nodes.ancestor_15!.locked = true;
    expect(lineagePlanSchema.safeParse(invalid).success).toBe(true);
  });

  it('keeps every owner, factor and older subtree when the four grandparents move', () => {
    let plan = sample();
    plan = updateLineageNode(plan, 'ancestor_11', { redFactor: { type: 'mile', stars: 2 } });
    const before = structuredClone(plan);
    const result = applyLineageGrandparentArrangement(plan, ['grandA1', 'grandB1', 'grandA2', 'grandB2']);
    expect(result.nodes.parentA!.parentIds).toEqual(['grandA1', 'grandB1']);
    expect(result.nodes.parentB!.parentIds).toEqual(['grandA2', 'grandB2']);
    expect(result.nodes.grandB1).toEqual(plan.nodes.grandB1);
    expect(result.nodes.ancestor_11).toEqual(plan.nodes.ancestor_11);
    expect(getInheritedNodeIds(result, 'grandB1')).toEqual(getInheritedNodeIds(plan, 'grandB1'));
    expect(extractPedigree(result).grandA2).toEqual(extractPedigree(plan).grandB1);
    expect(plan).toEqual(before);
  });

  it('protects a completed owner and its entire older bloodline but permits placing it elsewhere', () => {
    const original = sample();
    const fixed = setLineageLock(original, 'grandA1', true);
    const protectedIds = getProtectedNodeIds(fixed);
    expect(protectedIds.size).toBe(7);
    expect(protectedIds.has('ancestor_15')).toBe(true);
    expect(protectedIds.has('parentA')).toBe(false);
    expect(() => updateLineageNode(fixed, 'ancestor_15', { redFactor: { type: 'dirt', stars: 3 } })).toThrow(/고정/);
    expect(() => updateLineageNode(fixed, 'grandA1', { costumeId: 'costume_h' })).toThrow(/고정/);
    expect(() => applyLineageGrandparentArrangement(fixed, ['grandB1', 'grandB2', 'grandA1', 'grandA2'])).not.toThrow();
    expect(original.nodes.grandA1!.locked).toBe(false);
  });

  it('does not change fixed parent ancestry and allows harmless sibling order requests', () => {
    const fixed = setLineageLock(sample(), 'parentA', true);
    expect(() => applyLineageGrandparentArrangement(fixed, ['grandA1', 'grandB1', 'grandA2', 'grandB2'])).toThrow(/고정/);
    const same = applyLineageGrandparentArrangement(fixed, ['grandA2', 'grandA1', 'grandB1', 'grandB2']);
    expect(same.nodes.parentA!.parentIds).toEqual(fixed.nodes.parentA!.parentIds);
    expect(() => applyLineageGrandparentArrangement(fixed, ['grandA1', 'grandA1', 'grandB1', 'grandB2'])).toThrow();
  });

  it('updates basic selections through current connections while preserving older plans', () => {
    let plan = applyLineageGrandparentArrangement(sample(), ['grandA1', 'grandB1', 'grandA2', 'grandB2']);
    plan = updateLineageNode(plan, 'ancestor_11', { redFactor: { type: 'mile', stars: 2 } });
    const pedigree = extractPedigree(plan); pedigree.grandA2.redFactor = { type: 'dirt', stars: 3 };
    const next = updateLineageFromPedigree(plan, pedigree);
    expect(getLineageSlotMap(next).grandA2).toBe('grandB1');
    expect(next.nodes.grandB1!.redFactor).toEqual({ type: 'dirt', stars: 3 });
    expect(next.nodes.ancestor_11).toEqual(plan.nodes.ancestor_11);
    const owned = updateLineageNode(next, 'ancestor_11', { costumeId: 'costume_h' });
    const locked = setLineageLock(owned, 'grandB1', true);
    pedigree.grandA2.redFactor = null;
    expect(() => updateLineageFromPedigree(locked, pedigree)).toThrow(/고정/);
  });

  it('prevents partial unlocks inside an already fixed bloodline', () => {
    const fixed = setLineageLock(sample(), 'parentA', true);
    expect(() => setLineageLock(fixed, 'grandA1', true)).toThrow(/고정/);
    const unlocked = setLineageLock(fixed, 'parentA', false);
    expect(getProtectedNodeIds(unlocked).size).toBe(0);
    expect(() => updateLineageNode(unlocked, 'ancestor_15', { redFactor: { type: 'dirt', stars: 3 } })).not.toThrow();
  });
});
