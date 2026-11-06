import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { getLineageSlots, setLineageLock, updateLineageNode, validateLineagePlan, extractPedigree } from '../../src/domain/lineage';
import { validateSavedPlan } from '../../src/domain/saved-plan';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { findLineageCharacterIssues } from '../../src/engine/lineage-validity';
import { evaluateLineage } from '../../src/engine/lineage-evaluation';
import { reconcileWorkspaceLineage } from '../../src/engine/plan-persistence';
import { evaluateSavedPlanLineage } from '../../src/engine/plan-comparison';
import { enumerateLineageArrangements } from '../../src/engine/lineage-arrangements';
import { createLineagePngDocument, layoutPngDocument } from '../../src/ui/plans/png-export';
import { chooseInlineFactor } from '../../src/ui/lineage/inline-factor';

const reference = validateReferenceSnapshot(JSON.parse(readFileSync('data/local/p1-reference.json','utf8')));
const sample = () => validateSavedPlan(JSON.parse(readFileSync('data/local/p8-persistence/31-node-example.json','utf8')));

it('retains legacy deep characters but excludes them from identity, source lookup and seven-character results', () => {
  const saved = sample(); saved.inputs.referenceFilters.includeUnknown = true;
  for (const node of Object.values(saved.inputs.referencePlan.nodes)) node.locked = false;
  const plan = saved.inputs.referencePlan;
  const before = evaluateSavedPlanLineage(saved, reference);
  expect(before.blocked).toBe(false);
  const copy = structuredClone(plan);
  copy.nodes.ancestor_7!.costumeId = copy.nodes.grandA1!.costumeId;
  copy.nodes.ancestor_8!.costumeId = copy.nodes.grandA1!.costumeId;
  copy.nodes.ancestor_30!.costumeId = 'legacy-unresolved-owner';
  expect(findLineageCharacterIssues(copy, reference)).toEqual([]);
  expect(evaluateLineage(copy, reference).status).toBe('valid');
  // Model an old imported V1, not a current owner-replacement operation (which
  // intentionally invalidates physical bloodline confirmation).
  const changed = structuredClone(saved); changed.inputs.referencePlan = copy;
  for (const id of ['ancestor_7','ancestor_8','ancestor_30']) {
    changed.inputs.factorInstances[id]!.ownerCostumeId = copy.nodes[id]!.costumeId;
    if(changed.inputs.whiteFactors.nodes[id]) changed.inputs.whiteFactors.nodes[id]!.ownerCostumeId = copy.nodes[id]!.costumeId;
    if(changed.inputs.whiteFactors.nodePriorities[id]) changed.inputs.whiteFactors.nodePriorities[id]!.ownerCostumeId = copy.nodes[id]!.costumeId;
  }
  const after = evaluateSavedPlanLineage(changed, reference);
  expect(after.blocked).toBe(false); expect(after.affinity).toEqual(before.affinity); expect(after.aptitudes).toEqual(before.aptitudes);
  copy.nodes.parentA!.costumeId = copy.nodes.target!.costumeId;
  expect(findLineageCharacterIssues(copy, reference).length).toBeGreaterThan(0);
});

it('edits and locks an ownerless mob plan at three stars without fabricating a character or UUID', () => {
  const saved = sample();
  for (const node of Object.values(saved.inputs.referencePlan.nodes)) node.locked = false;
  const plan = structuredClone(saved.inputs.referencePlan);
  plan.nodes.ancestor_30!.costumeId = null; plan.nodes.ancestor_30!.redFactor = null;
  const inputs = reconcileWorkspaceLineage(saved.inputs, plan);
  const factor = chooseInlineFactor(null,'medium',false);
  let next = updateLineageNode(plan,'ancestor_30',{redFactor:factor});
  next = setLineageLock(next,'ancestor_30',true);
  expect(next.nodes.ancestor_30).toMatchObject({costumeId:null,redFactor:{type:'medium',stars:3},locked:true});
  expect(() => updateLineageNode(next,'ancestor_30',{redFactor:null})).toThrow('고정');
  const reconciled = reconcileWorkspaceLineage(inputs,next);
  expect(reconciled.factorInstances).toEqual(inputs.factorInstances);
  expect(reconciled.referencePlan.nodes.ancestor_30!.costumeId).toBeNull();
  expect(validateSavedPlan(JSON.parse(JSON.stringify({...saved,inputs:reconciled}))).inputs).toEqual(reconciled);
});

it('preserves all original V1 records and connections and keeps six-way arrangements as subtree moves', () => {
  const saved = sample(); const before = structuredClone(saved);
  const plan = saved.inputs.referencePlan;
  const editable = getLineageSlots(plan).find(slot => slot.depth > 2 && !plan.nodes[slot.nodeId]!.locked)!;
  // Explicitly unlock the example only for this user-authored editing case.
  for (const node of Object.values(plan.nodes)) node.locked = false;
  const inputs = reconcileWorkspaceLineage(saved.inputs,updateLineageNode(plan,editable.nodeId,{redFactor:{type:'long',stars:3}}));
  expect(inputs.factorInstances).toEqual(before.inputs.factorInstances);
  expect(inputs.whiteFactors).toEqual(before.inputs.whiteFactors);
  for (const [id,node] of Object.entries(before.inputs.referencePlan.nodes)) {
    expect(inputs.referencePlan.nodes[id]!.costumeId).toBe(node.costumeId);
    expect(inputs.referencePlan.nodes[id]!.parentIds).toEqual(node.parentIds);
  }
  expect(validateSavedPlan(JSON.parse(JSON.stringify({...saved,inputs}))).inputs).toEqual(inputs);
  const rows = enumerateLineageArrangements(plan,reference);
  expect(rows.length).toBeGreaterThan(0); expect(rows.length).toBeLessThanOrEqual(6);
  for (const row of rows) { expect(findLineageCharacterIssues(row.plan,reference)).toEqual([]); expect(extractPedigree(row.plan)).toEqual(row.pedigree); }
});

it('prints only seven actual portraits plus 24 mob factors while keeping the complete legacy audit untouched', () => {
  const saved = sample(); const before = structuredClone(saved);
  const document = createLineagePngDocument({title:'P8.7.3',inputs:saved.inputs,reference,snapshotIds:saved.snapshotIds,affinity:null,aptitudes:null,variant:'full'});
  if(document.visual?.kind !== 'lineage') throw new Error('Expected tree');
  const visual = document.visual;
  const deep = visual.nodes.filter(node => visual.geometry.nodes.find(box=>box.nodeId===node.nodeId)!.depth>2);
  expect(deep).toHaveLength(24); expect(deep.every(node=>node.character==='모브'&&!node.image&&!node.outfit)).toBe(true);
  const layout=layoutPngDocument(document,(text,size)=>[...text].length*size*0.6);
  expect(layout.images).toHaveLength(7); expect(layout.connectors).toHaveLength(30);
  expect(layout.lines.filter(line=>line.text==='모브')).toHaveLength(24);
  expect(document.audit!.lineage!.plan).toEqual(saved.inputs.referencePlan);
  expect(validateLineagePlan(document.audit!.lineage!.plan)).toEqual(saved.inputs.referencePlan);
  expect(saved).toEqual(before);
});
