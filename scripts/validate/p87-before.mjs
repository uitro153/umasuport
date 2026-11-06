import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
const out = '.preview/p87-artifacts';
await mkdir(out, { recursive: true });
const plan = JSON.parse(await readFile('.preview/p86-artifacts/desktop-support-output-current-v1.json', 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 }, isMobile: width === 375, hasTouch: width === 375 });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(Math.max(Date.parse(plan.updatedAt), Date.parse(plan.createdAt), Date.parse('2026-11-05T12:00:00+09:00')) + 60000));
    await page.goto('http://127.0.0.1:5197');
    await expect(page.getByTestId('p86-unified-tree')).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
    await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
    await page.getByTestId('p8-import-json').setInputFiles({ name: 'existing-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
    await page.getByTestId('p8-apply-restore').click();
    await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
    await expect(page.getByTestId('ref-total')).toHaveText('159');
    await page.screenshot({ path: `${out}/before-${width}-seven.png`, fullPage: true });
    await page.getByTestId('p86-edit-parentA').click();
    await page.getByTestId('p86-node-editor').screenshot({ path: `${out}/before-${width}-node-editor.png` });
    await page.getByTestId('p86-node-fields').getByRole('button', { name: /부모 A 선택/ }).click();
    await page.getByRole('dialog').last().screenshot({ path: `${out}/before-${width}-gallery.png` });
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '편집 닫기', exact: true }).click();
    await page.getByTestId('p86-toggle-lineage').click();
    await page.getByTestId('p86-lineage-settings').locator('summary').first().click();
    await page.getByTestId('lineage-designer').screenshot({ path: `${out}/before-${width}-allocation.png` });
    await page.getByRole('button', { name: '스킬·서포트 분석', exact: true }).click();
    await expect(page.getByTestId('p4-recommendations')).toBeVisible({ timeout: 30000 });
    await page.locator('.p6-priority-settings').screenshot({ path: `${out}/before-${width}-quick-skills.png` });
    await context.close();
  }
} finally { await browser.close(); }
