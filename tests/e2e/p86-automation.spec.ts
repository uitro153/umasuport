import { focusMob } from './p9-lineage';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { SavedPlan, WorkspaceInputs } from '../../src/domain/saved-plan';
import { getLineageSlots, getProtectedNodeIds } from '../../src/domain/lineage';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { enumerateLineageArrangements } from '../../src/engine/lineage-arrangements';
import { closeLineageNode, openLineageNode } from './p86-navigation';

const directory = '.preview/p87-artifacts/regression-p86';
async function reference(page: Page) {
  await closeLineageNode(page);
  const navigation = page.getByRole('button', { name: '계보 화면으로', exact: true });
  if (await navigation.isVisible()) await navigation.click();
  await expect(page.getByTestId('p86-unified-tree')).toBeVisible();
}
async function settings(page: Page) {
  if (await page.getByTestId('p86-toggle-lineage').getAttribute('aria-expanded') === 'false') await page.getByTestId('p86-toggle-lineage').click();
}
async function exportPlan(page: Page, filename: string): Promise<SavedPlan> {
  await closeLineageNode(page);
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-export-json')).toBeEnabled({ timeout: 30000 });
  const pending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  await (await pending).saveAs(filename);
  return JSON.parse(await readFile(filename, 'utf8')) as SavedPlan;
}
function identities(inputs: WorkspaceInputs) {
  return Object.fromEntries(Object.entries(inputs.factorInstances).map(([id, instance]) => [id, { uuid: instance.factorInstanceId, owner: instance.ownerCostumeId }]));
}

test('7인 배치와 수동 모브 편집은 UUID·연결·고정을 보존하고 날짜·UUID 변경 시 이전 배치를 차단한다', async ({ page }, info) => {
  test.setTimeout(180000); await mkdir(directory, { recursive: true });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const prefix = `${directory}/${info.project.name}-automation`;
  const sample = JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json', 'utf8')) as SavedPlan;
  const source = validateReferenceSnapshot(JSON.parse(await readFile('data/local/p1-reference.json', 'utf8')) as unknown);
  sample.name = 'P9 7인 배치·수동 모브 · 실제 ID와 사용자 합성 계획';
  sample.inputs.referenceFilters.includeUnknown = true;
  sample.inputs.lineageDesign = { profileId: 'none', rotationGrade: 'B', geneEnabled: true, geneType: 'dirt' };
  // Deliberate user-authored design inputs, not observed completed KR factors.
  // Retain all 31 original physical-owner UUIDs and the original white records.
  const slots = getLineageSlots(sample.inputs.referencePlan);
  for (const slot of slots) {
    const node = sample.inputs.referencePlan.nodes[slot.nodeId]!;
    node.locked = false;
    node.redFactor = slot.depth === 2 ? { type: 'mile', stars: 3 } : null;
  }
  sample.inputs.referencePlan.nodes.ancestor_30!.locked = true;
  sample.inputs.referencePlan.nodes.ancestor_30!.redFactor = { type: 'dirt', stars: 3 };
  delete sample.resultSnapshot;
  await page.clock.setFixedTime(new Date(Math.max(Date.parse('2026-11-05T12:00:00+09:00'), Date.parse(sample.createdAt), Date.parse(sample.updatedAt)) + 60000));
  await page.goto('/'); await expect(page.getByTestId('p86-unified-tree')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'existing-v1-user-design.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sample)) });
  await expect(page.getByTestId('p8-apply-restore')).toBeEnabled(); await page.getByTestId('p8-apply-restore').click();
  const before = await exportPlan(page, `${prefix}-before.json`);
  expect(before.inputs).toEqual(sample.inputs);
  await reference(page); await expect(page.getByTestId('ref-total')).toHaveText('159');

  // 7-person preview and cancel: no plan/record/settings mutation at all.
  await page.getByTestId('p86-arrange-preview').click();
  await expect(page.getByTestId('ref-arrangement')).toHaveCount(6);
  await page.getByTestId('p86-unified-tree').screenshot({ path: `${prefix}-seven-preview.png` });
  await page.getByTestId('p86-cancel-arrangement').click();
  const sevenCancel = await exportPlan(page, `${prefix}-seven-cancel.json`);
  expect(sevenCancel.inputs).toEqual(before.inputs);

  // The existing engine is the allowed-change baseline for this UI test. This
  // is scope/ownership verification, not a new independent game-formula claim.
  const arrangements = enumerateLineageArrangements(before.inputs.referencePlan, source);
  const changedIndex = arrangements.findIndex((row) => JSON.stringify(row.plan.nodes.parentA!.parentIds) !== JSON.stringify(before.inputs.referencePlan.nodes.parentA!.parentIds));
  expect(changedIndex).toBeGreaterThanOrEqual(0);
  await reference(page); await page.getByTestId('p86-arrange-preview').click();
  await page.getByRole('button', { name: `참고 배치 ${changedIndex + 1} 적용`, exact: true }).click();
  const sevenApplied = await exportPlan(page, `${prefix}-seven-applied.json`);
  expect(sevenApplied.inputs.referencePlan).toEqual(arrangements[changedIndex]!.plan);
  expect(identities(sevenApplied.inputs)).toEqual(identities(before.inputs));
  expect(sevenApplied.inputs.whiteFactors).toEqual(before.inputs.whiteFactors);
  const sevenMoved = Object.keys(before.inputs.referencePlan.nodes).filter((id) => JSON.stringify(before.inputs.referencePlan.nodes[id]) !== JSON.stringify(sevenApplied.inputs.referencePlan.nodes[id]));
  expect(sevenMoved.length).toBeGreaterThan(0);
  expect(sevenMoved.every((id) => id === 'parentA' || id === 'parentB')).toBe(true);
  for (const id of sevenMoved) {
    const previous = before.inputs.referencePlan.nodes[id]!; const after = sevenApplied.inputs.referencePlan.nodes[id]!;
    expect({ ...after, parentIds: previous.parentIds }).toEqual(previous);
  }

  // Folding the manual design is presentation only; applying is a direct edit.
  await reference(page); await settings(page);
  await expect(page.getByTestId('p86-lineage-settings')).toHaveCount(0);
  await page.getByTestId('p86-toggle-lineage').click();
  const redCancel = await exportPlan(page, `${prefix}-manual-folded.json`);
  expect(redCancel.inputs).toEqual(sevenApplied.inputs);
  await reference(page); await settings(page);
  const mob=await focusMob(page,'ancestor_15');
  await mob.getByTestId('p87-factor-ancestor_15').selectOption('long');
  const redApplied = await exportPlan(page, `${prefix}-red-applied.json`);
  expect(identities(redApplied.inputs)).toEqual(identities(sevenApplied.inputs));
  expect(redApplied.inputs.whiteFactors).toEqual(sevenApplied.inputs.whiteFactors);
  const depth = new Map(getLineageSlots(sevenApplied.inputs.referencePlan).map((slot) => [slot.nodeId, slot.depth]));
  const protectedIds = getProtectedNodeIds(sevenApplied.inputs.referencePlan);
  const redChanged: string[] = [];
  for (const [id, previous] of Object.entries(sevenApplied.inputs.referencePlan.nodes)) {
    const after = redApplied.inputs.referencePlan.nodes[id]!;
    expect({ ...after, redFactor: previous.redFactor }).toEqual(previous);
    if (JSON.stringify(after.redFactor) !== JSON.stringify(previous.redFactor)) {
      expect(depth.get(id)!).toBeGreaterThanOrEqual(3); expect(protectedIds.has(id)).toBe(false); redChanged.push(id);
    }
    if (depth.get(id)! <= 2 || protectedIds.has(id)) expect(after).toEqual(previous);
  }
  expect(redChanged.length).toBeGreaterThan(0);
  expect(redApplied.inputs.referencePlan.nodes.ancestor_30).toEqual(sevenApplied.inputs.referencePlan.nodes.ancestor_30);

  // The signed seven-person preview becomes unavailable for an invalid date. Restore the
  // date and explicitly cancel before reading back valid V1 data.
  await reference(page); await settings(page);
  await page.getByTestId('p86-arrange-preview').click();
  await page.locator('#reference-date').fill('');
  await expect(page.getByTestId('p86-arrangement-stale')).toBeVisible();
  await expect(page.getByTestId('ref-arrangement')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '배분안을 설계에 적용', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '31인 적인자 배분안 만들기', exact: true })).toHaveCount(0);
  await writeFile(`${prefix}-invalid-date-stale.json`, JSON.stringify({ invalidDate: await page.locator('#reference-date').inputValue(), sevenApplyButtons: await page.getByTestId('ref-arrangement').count(), redApplyButtons: await page.getByRole('button', { name: '배분안을 설계에 적용', exact: true }).count(), manualMode: true, note: 'Invalid date is UI evidence only; never serialized as a valid SavedPlan V1.' }, null, 2));
  await page.locator('#reference-date').fill(redApplied.inputs.referenceFilters.dateInput);
  await page.getByTestId('p86-cancel-arrangement').click();
  const staleCancel = await exportPlan(page, `${prefix}-stale-cancel.json`);
  expect(staleCancel.inputs).toEqual(redApplied.inputs);

  // Replace the target's physical instance: its red factor was already empty,
  // so the plan is identical while its UUID changes. Old previews must vanish.
  expect(redApplied.inputs.whiteFactors.nodes.target).toBeUndefined();
  expect(redApplied.inputs.referencePlan.nodes.target!.redFactor).toBeNull();
  await reference(page); await settings(page);
  await page.getByTestId('p86-arrange-preview').click();
  const editor = await openLineageNode(page, 'target');
  await editor.getByTestId('p8-replace-instance').click();
  await editor.getByTestId('p8-confirm-replace-instance').click();
  await closeLineageNode(page);
  await expect(page.getByTestId('p86-arrangement-stale')).toBeVisible();
  await expect(page.getByRole('button', { name: '배분안을 설계에 적용', exact: true })).toHaveCount(0);
  const replaced = await exportPlan(page, `${prefix}-uuid-stale.json`);
  expect(replaced.inputs.referencePlan).toEqual(redApplied.inputs.referencePlan);
  expect(replaced.inputs.factorInstances.target!.factorInstanceId).not.toBe(redApplied.inputs.factorInstances.target!.factorInstanceId);
  expect(replaced.inputs.factorInstances.target!.ownerCostumeId).toBe(redApplied.inputs.factorInstances.target!.ownerCostumeId);
  for (const id of Object.keys(redApplied.inputs.factorInstances).filter((id) => id !== 'target')) expect(replaced.inputs.factorInstances[id]).toEqual(redApplied.inputs.factorInstances[id]);
  expect(new Set(Object.values(replaced.inputs.factorInstances).map((instance) => instance.factorInstanceId)).size).toBe(31);
  expect(errors).toEqual([]);
  await writeFile(`${prefix}.validation.json`, JSON.stringify({ provenance: 'Existing V1 and real canonical P1 IDs; deliberate user-authored red factors/goals/locks, not observed KR completed factors.', sevenCancelInputsEqual: true, sevenMovedOwnerIds: sevenMoved, sevenOnlyParentConnectionsChanged: true, all31UuidsPreservedByArrangementAndManualEdit: true, manualFoldInputsEqual: true, manuallyChangedOwnerIds: redChanged, manualOnlyUnlockedDeepFactorsChanged: true, upperSevenUnchangedByManualEdit: true, lockedLeafPreserved: true, invalidDateStaleBlockedSeven: true, staleCancelInputsEqual: true, identicalPlanWithNewTargetUuidInvalidatesSeven: true, pageErrors: errors }, null, 2));
});
