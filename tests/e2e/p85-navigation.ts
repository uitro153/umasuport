import { expect, type Page } from '@playwright/test';
import { closeLineageNode } from './p86-navigation';

/** P8.5 moves P7 record editing into the skill/support planning area. These
 * helpers navigate the visible app; they do not mutate storage or skip inputs. */
export async function showSkills(page: Page) {
  await closeLineageNode(page);
  const heading = page.getByRole('heading', { name: '대회별 스킬 평가', exact: true });
  if (!(await heading.isVisible())) {
    const fromReference = page.getByRole('button', { name: '스킬·서포트 분석', exact: true });
    if (await fromReference.isVisible()) await fromReference.click();
    else await page.getByRole('button', { name: '스킬·서포트 화면으로', exact: true }).click();
  }
  await expect(heading).toBeVisible({ timeout: 30000 });
}
export async function showReference(page: Page) {
  await closeLineageNode(page);
  const heading = page.getByRole('heading', { name: '나의 인자 계보', exact: true });
  if (!(await heading.isVisible())) {
    const fromSkills = page.getByRole('button', { name: '계보 설계로', exact: true });
    if (await fromSkills.isVisible()) await fromSkills.click();
    else await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  }
  await expect(heading).toBeVisible({ timeout: 30000 });
}
export async function openPlanningNode(page: Page, nodeId: string) {
  await showSkills(page);
  await page.getByTestId('p7-node-select').selectOption(nodeId);
  const panel = page.getByTestId('p7-lineage-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  await expect(panel).toHaveAttribute('data-node-id', nodeId);
  return panel;
}
export async function showDetailedReference(page: Page) {
  await showReference(page);
  const toggle = page.getByTestId('p86-toggle-lineage');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
export async function runPlanningNode(page: Page) {
  await page.locator('.p7-context-actions').getByRole('button', { name: '선택한 인자의 서포트 추천', exact: true }).click();
}
