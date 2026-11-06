import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { SavedPlan } from '../../src/domain/saved-plan';
import { closeLineageNode } from './p86-navigation';

import { focusMob } from './p9-lineage';

const directory = '.preview/p87-artifacts/regression-p86';
async function manager(page: Page) {
  await closeLineageNode(page);
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
}
async function exportPlan(page: Page, filename: string): Promise<SavedPlan> {
  await manager(page);
  const pending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  const download = await pending; await download.saveAs(filename);
  return JSON.parse(await readFile(filename, 'utf8')) as SavedPlan;
}
test('P8.6 접기·펼치기·줌·노드 조회는31인 UUID·연결·백인자·목표·dirty를 바꾸지 않는다', async ({ page }, info) => {
  test.setTimeout(180000); await mkdir(directory, { recursive: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const input = JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json', 'utf8')) as SavedPlan;
  // The actual-data CLI regenerates this example using its execution time.
  // Keep the original V1 metadata and set this isolated browser after it.
  await page.clock.setFixedTime(new Date(Math.max(Date.parse('2026-11-05T12:00:00+09:00'), Date.parse(input.createdAt), Date.parse(input.updatedAt)) + 60000));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible({ timeout: 30000 });
  await manager(page);
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'p86-existing-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await page.getByTestId('p8-apply-restore').click();
  const prefix = `${directory}/${info.project.name}-presentation-roundtrip`;
  const before = await exportPlan(page, `${prefix}-before.json`);
  const dirty = await page.getByTestId('p8-dirty-status').textContent();
  await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  const upper = await page.locator('[data-tree-node]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-tree-node'), style: element.getAttribute('style') })));
  for (let index = 0; index < 3; index++) {
    await page.getByTestId('p86-toggle-lineage').click();
    await expect(page.locator('[data-tree-node]')).toHaveCount(31);
    const afterUpper = await page.locator('[data-tree-node][data-depth="0"], [data-tree-node][data-depth="1"], [data-tree-node][data-depth="2"]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-tree-node'), style: element.getAttribute('style') })));
    expect(afterUpper).toEqual(upper);
    await page.getByLabel('계보 확대', { exact: true }).selectOption(String([.8, 1, 1.5][index]));
    await focusMob(page, 'ancestor_30');
    await page.getByTestId('p86-toggle-lineage').click();
    await expect(page.locator('[data-tree-node]')).toHaveCount(7);
    await expect(page.getByTestId('ref-total')).toHaveText('159');
  }
  const after = await exportPlan(page, `${prefix}-after.json`);
  expect(after.inputs).toEqual(before.inputs);
  expect(after).toEqual(before);
  expect(Object.keys(after.inputs.factorInstances)).toHaveLength(31);
  expect(new Set(Object.values(after.inputs.factorInstances).map(value => value.factorInstanceId)).size).toBe(31);
  await expect(page.getByTestId('p8-dirty-status')).toHaveText(dirty!);
  expect(errors).toEqual([]);
  await writeFile(`${prefix}.validation.json`, JSON.stringify({ inputsEqual: true, all31UuidsEqual: true, upperSevenStylesEqual: true, dirtyBefore: dirty, dirtyAfter: await page.getByTestId('p8-dirty-status').textContent(), pageErrors: errors, scope: 'Existing V1 plan; real canonical IDs, synthetic user factor records. Presentation-only operations.' }, null, 2));
});
