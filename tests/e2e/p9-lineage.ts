import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateSavedPlan, type SavedPlan } from '../../src/domain/saved-plan';
import { createEmptyLineageSkills } from '../../src/domain/lineage-skills';

/** Existing V1 records are the only way to exercise archived deep owners.
 * No storage injection, new deep character picker or fabricated ownership. */
export async function legacyLineagePlan(cleanRecords = false): Promise<SavedPlan> {
  const saved = validateSavedPlan(JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json','utf8')));
  saved.inputs.referenceFilters.includeUnknown = true;
  for(const node of Object.values(saved.inputs.referencePlan.nodes)) node.locked = false;
  if(cleanRecords) { saved.inputs.whiteFactors=createEmptyLineageSkills(); saved.inputs.globalPriorities=[]; }
  delete saved.resultSnapshot;
  return saved;
}
export async function restoreLineage(page: Page, saved: SavedPlan) {
  await page.clock.setFixedTime(new Date(Math.max(Date.parse('2026-11-06T12:00:00+09:00'),Date.parse(saved.updatedAt))+60000));
  await page.getByRole('button',{name:'저장·복원·비교',exact:true}).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({timeout:30000});
  await page.getByTestId('p8-import-json').setInputFiles({name:'archived-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await expect(page.getByTestId('p8-apply-restore')).toBeEnabled();
  await page.getByTestId('p8-apply-restore').click();
  await page.getByRole('button',{name:'계보 화면으로',exact:true}).click();
}
export async function focusMob(page: Page, nodeId: string) {
  const toggle=page.getByTestId('p86-toggle-lineage');
  if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
  await page.getByLabel('계보 노드 선택',{exact:true}).selectOption(nodeId);
  const node=page.locator(`[data-tree-node="${nodeId}"]`);
  await expect(node.getByTestId('p873-mob')).toBeVisible();
  await expect(node.locator('img,[data-testid^="p86-edit-"]')).toHaveCount(0);
  await expect(page.getByTestId('p86-node-editor')).toHaveCount(0);
  return node;
}
