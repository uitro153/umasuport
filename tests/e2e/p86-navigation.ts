import { expect, type Page } from '@playwright/test';

/** Navigate the visible editor; never inject plan state or skip owner edits. */
export async function closeLineageNode(page: Page) {
  const editor = page.getByTestId('p86-node-editor');
  if (await editor.isVisible()) await editor.getByRole('button', { name: '편집 닫기', exact: true }).click();
}
export async function openLineageNode(page: Page, nodeId: string) {
  await closeLineageNode(page);
  const toggle = page.getByTestId('p86-toggle-lineage');
  if (nodeId.startsWith('ancestor_') && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.getByLabel('계보 노드 선택', { exact: true }).selectOption(nodeId);
  const editor = page.getByTestId('p86-node-editor');
  await expect(editor).toBeVisible();
  const records = editor.locator('.p87-record-tools'); if (await records.count()) await records.locator('summary').first().click();
  return editor;
}
