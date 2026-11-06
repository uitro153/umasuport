import { readFile, writeFile } from 'node:fs/promises';
import expected from '../../tests/golden/public-expectations.json';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { createEmptyPedigree, SLOT_KEYS } from '../../src/domain/pedigree';
import { createLineagePlan, getLineageSlotMap, validateLineagePlan, type LineageConstraints } from '../../src/domain/lineage';
import { allocateRedFactors } from '../../src/engine/red-factor-allocator';
import { enumerateLineageArrangements } from '../../src/engine/lineage-arrangements';
import { calculateReferencePedigree } from '../../src/engine/reference-pedigree';

const snapshot = validateReferenceSnapshot(JSON.parse(await readFile('data/local/p1-reference.json', 'utf8')) as unknown);
const pedigree = createEmptyPedigree();
expected.calculator.costumes.forEach((id, index) => { pedigree[SLOT_KEYS[index]!].costumeId = id; });
const plan = createLineagePlan(pedigree);
const positions = getLineageSlotMap(plan);
const constraints: LineageConstraints = { grandparentGoals: {}, preserveParentFactorTargets: true };
for (const key of ['grandA1', 'grandA2', 'grandB1', 'grandB2'] as const) {
  const nodeId = positions[key];
  plan.nodes[nodeId]!.redFactor = { type: 'mile', stars: 3 };
  constraints.grandparentGoals[nodeId] = { targetFactorType: 'mile', rotationRequirements: { turf: 'A' }, geneType: 'dirt' };
}
const before = JSON.stringify(plan);
const allocation = allocateRedFactors(plan, snapshot, constraints);
if (allocation.status !== 'feasible' || !allocation.plan || !allocation.after?.hardSatisfied) throw new Error(`실자료 설계 배분 실패: ${allocation.reasons.join(' / ')}`);
validateLineagePlan(allocation.plan);
if (JSON.stringify(plan) !== before) throw new Error('배분 중 원래 계보가 변경되었습니다.');
for (const [id, node] of Object.entries(plan.nodes)) {
  const next = allocation.plan.nodes[id]!;
  if (next.nodeId !== node.nodeId || next.costumeId !== node.costumeId || JSON.stringify(next.parentIds) !== JSON.stringify(node.parentIds)) throw new Error('인자 소유 관계 또는 혈통 연결 변경');
}
const seven = calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true });
if (seven.previewTotal !== expected.calculator.total || JSON.stringify(seven.contributions.map((term) => term.value)) !== JSON.stringify(expected.calculator.termsInEngineOrder)) throw new Error('기존 159점 공개식 회귀');
const layouts = enumerateLineageArrangements(allocation.plan, snapshot);
if (layouts.length !== 6) throw new Error('31인 혈통의 6배치가 유지되지 않았습니다.');
const report = {
  checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId,
  scope: 'public-formula-regression-and-31-node-planning-constraints',
  externalP1Total: seven.previewTotal,
  externalP1Terms: seven.contributions.map((term) => term.value),
  nodes: Object.keys(allocation.plan.nodes).length,
  changedFactors: allocation.changes.length,
  ownersAndConnectionsPreserved: true,
  hardConstraintsSatisfied: allocation.after.hardSatisfied,
  genes: allocation.after.genes,
  checks: allocation.after.checks,
  arrangementScores: layouts.map((row) => row.result.previewTotal),
  examinedStates: allocation.examinedStates,
  newIndependentKrGameplayCases: 0,
  note: 'Public-rule planning verification. Planned factors on unspecified future owners are not claimed as acquired factors.',
};
await writeFile('data/local/p2-lineage.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ nodes: report.nodes, externalP1Total: seven.previewTotal, changedFactors: report.changedFactors,
  hardConstraintsSatisfied: report.hardConstraintsSatisfied, genes: report.genes.map((row) => ({ nodeId: row.nodeId, level: row.level, stars: row.totalStars })),
  arrangementScores: report.arrangementScores, ownersAndConnectionsPreserved: true, examinedStates: report.examinedStates, newIndependentKrGameplayCases: 0 }, null, 2));
