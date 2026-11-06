import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createEmptyPedigree, SLOT_KEYS } from '../../src/domain/pedigree';
import { createLineagePlan, getLineageSlots } from '../../src/domain/lineage';
import type { ReferenceSnapshot } from '../../src/domain/reference';
import { createDefaultWorkspace, reconcileWorkspaceLineage } from '../../src/engine/plan-persistence';
import { allocateRedFactors } from '../../src/engine/red-factor-allocator';
import { factorOnlyConstraints } from '../../src/engine/lineage-goals';
import { migrateQuickSkills, readQuickSkills, serializeQuickSkills, QUICK_SKILLS_KEY } from '../../src/ui/skills/quick-skill-preferences';
import { chooseInlineFactor } from '../../src/ui/lineage/inline-factor';

const five = ['201601', '200452', '201262', '201332', '200432'];
it('clears only the exact unmarked automatic five once, including persisted migration', () => {
  let raw = JSON.stringify({ version: 1, skillIds: five }); let writes = 0;
  const storage = { getItem: (key: string) => { expect(key).toBe(QUICK_SKILLS_KEY); return raw; }, setItem: (_key: string, value: string) => { raw = value; writes++; } };
  expect(readQuickSkills(storage)).toEqual([]); expect(writes).toBe(1);
  expect(readQuickSkills(storage)).toEqual([]); expect(writes).toBe(1);
  raw = serializeQuickSkills(five); expect(readQuickSkills(storage)).toEqual(five);
});
it('preserves personal additions, deletions, reordering and explicitly edited default-shaped lists', () => {
  for (const ids of [[...five, '200012'], five.slice(1), [...five].reverse()]) {
    const migrated = migrateQuickSkills(JSON.stringify({ version: 1, skillIds: ids }));
    expect(migrated.ids).toEqual(ids); expect(migrateQuickSkills(migrated.writeBack).ids).toEqual(ids);
  }
  expect(migrateQuickSkills(JSON.stringify({ version: 1, skillIds: five, userEdited: true })).ids).toEqual(five);
  expect(migrateQuickSkills(null)).toEqual({ ids: null, writeBack: null });
});
it('defaults only new plans to three stars and preserves existing one/two-star observations', () => {
  expect(chooseInlineFactor(null, 'dirt')).toEqual({ type: 'dirt', stars: 3 });
  for (const stars of [1, 2] as const) expect(chooseInlineFactor({ type: 'mile', stars }, 'long')).toEqual({ type: 'long', stars });
  expect(chooseInlineFactor({ type: 'mile', stars: 1 }, 'long', false)).toEqual({ type: 'long', stars: 3 });
  expect(chooseInlineFactor({ type: 'mile', stars: 2 }, '')).toBeNull();
});

it('allocates real seven-only inputs into two blank planned nodes and preserves UUIDs, links and fixed bloodline', () => {
  const snapshot = JSON.parse(readFileSync('data/local/p1-reference.json', 'utf8')) as ReferenceSnapshot;
  const pedigree = createEmptyPedigree();
  ['100901', '101401', '100601', '102601', '101001', '100401', '100301'].forEach((id, index) => { pedigree[SLOT_KEYS[index]!].costumeId = id; });
  pedigree.parentA.redFactor = { type: 'turf', stars: 2 };
  pedigree.grandA1.redFactor = { type: 'sprint', stars: 3 };
  const plan = createLineagePlan(pedigree); plan.nodes.parentB!.locked = true;
  const inputs = reconcileWorkspaceLineage(createDefaultWorkspace(undefined, '2026-11-06'), plan);
  const original = structuredClone(inputs); const result = allocateRedFactors(plan, snapshot, factorOnlyConstraints(plan));
  expect(result.status).toBe('feasible'); expect(result.changes).toHaveLength(2);
  expect(result.changes.every(change => change.before === null && change.after?.type === 'sprint')).toBe(true);
  expect(result.changes.reduce((sum, change) => sum + change.after!.stars, 0)).toBe(4);
  expect(result.after!.nodeEvaluations.grandA1!.changes.find(change => change.type === 'sprint')).toMatchObject({ base: 'C', result: 'A' });
  expect(inputs).toEqual(original);
  const applied = reconcileWorkspaceLineage(inputs, result.plan!);
  expect(applied.factorInstances).toEqual(inputs.factorInstances);
  for (const slot of getLineageSlots(plan)) {
    expect(applied.referencePlan.nodes[slot.nodeId]!.parentIds).toEqual(plan.nodes[slot.nodeId]!.parentIds);
    if (slot.depth >= 3) expect(applied.referencePlan.nodes[slot.nodeId]!.costumeId).toBeNull();
    if (slot.depth <= 2 || slot.path.startsWith('R')) expect(applied.referencePlan.nodes[slot.nodeId]).toEqual(plan.nodes[slot.nodeId]);
  }
  const locked = structuredClone(plan); locked.nodes.parentA!.locked = true;
  const failure = allocateRedFactors(locked, snapshot, factorOnlyConstraints(locked));
  expect(failure.status).toBe('infeasible'); expect(failure.reasons.join(' ')).toContain('조부 A1');
  expect(failure.reasons.join(' ')).toContain('고정'); expect(failure.plan).toBeNull();
});
