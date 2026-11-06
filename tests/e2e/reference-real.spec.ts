import { test, expect } from '@playwright/test';
import real from '../golden/real-reference-subset.json' with { type: 'json' };
import { closeLineageNode, openLineageNode } from './p86-navigation';

test('실데이터 계보가 외부 159점·적성 보정·6배치에 연결된다', async ({ page }) => {
  await page.route('**/__local/p1-reference', (route) => route.fulfill({ json: real }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible();
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
  const labels = ['본육성 대상','부모 A','부모 B','조부 A1','조부 A2','조부 B1','조부 B2'];
  const ids = ['100901','101401','100601','102601','101001','100401','100301'];
  const nodeIds = ['target','parentA','parentB','grandA1','grandA2','grandB1','grandB2'];
  for (const [index,label] of labels.entries()) {
    await openLineageNode(page, nodeIds[index]!);
    await page.getByRole('button', { name: `${label} 선택`, exact: true }).click();
    await page.getByTestId(`ref-candidate-${ids[index]}`).click();
    await closeLineageNode(page);
  }
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  expect(await page.locator('.affinity-breakdown li>b').allTextContents()).toEqual(['31','26','24','22','23','15','18']);
  await page.getByTestId('p87-factor-parentA').selectOption('dirt');
  await expect(page.getByTestId('ref-aptitude-dirt').locator('b')).toHaveText('F');
  await page.getByText('적성 보정 과정', { exact: true }).click();
  await expect(page.locator('.p87-aptitude-detail')).toContainText('더트 G → F');
  await page.getByTestId('p86-arrange-preview').click();
  await expect(page.getByTestId('ref-arrangement')).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('real-reference.png'), fullPage: true });
});
