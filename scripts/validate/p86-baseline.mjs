import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
/* global document, console */

const output = '.preview/p86-artifacts';
await mkdir(output, { recursive: true });
const plan = JSON.parse(await readFile('.preview/p85-artifacts/desktop-image-input-v1.json', 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
const records = [];
try {
  for (const width of [1440, 1024, 768, 375]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 }, isMobile: width === 375, hasTouch: width <= 768 });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
    await page.goto('http://127.0.0.1:5196/');
    await expect(page.getByRole('heading', { name: '준비 데이터 계보 검토', exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
    await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
    await page.getByTestId('p8-import-json').setInputFiles({ name: 'p86-before-existing-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
    await page.getByTestId('p8-apply-restore').click();
    await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
    await expect(page.getByTestId('ref-total')).toHaveText('159');
    await page.locator('.tree-panel').screenshot({ path: `${output}/before-${width}-tree7.png` });
    const geometry = await page.evaluate(() => {
      const center = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return r.x + r.width / 2; };
      const r = document.querySelector('.tree-connector').getBoundingClientRect();
      return { lineEnds: [r.x + r.width * .25, r.x + r.width * .75], parentCenters: [center('[data-testid="ref-slot-parentA"]'), center('[data-testid="ref-slot-parentB"]')] };
    });
    records.push({ width, ...geometry, maxErrorCssPx: Math.max(...geometry.lineEnds.map((x, i) => Math.abs(x - geometry.parentCenters[i]))) });
    await page.getByTestId('ref-slot-parentA').getByRole('button', { name: '부모 A 선택', exact: true }).click();
    await page.getByRole('dialog').screenshot({ path: `${output}/before-${width}-costumes.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '상세 31인 보기', exact: true }).click();
    for (const branch of await page.locator('.lineage-branch').all()) if (await branch.getAttribute('open') === null) await branch.locator('summary').click();
    await page.locator('#lineage-details').screenshot({ path: `${output}/before-${width}-tree31.png` });
    await page.getByRole('button', { name: '스킬·서포트 분석', exact: true }).click();
    await expect(page.getByRole('heading', { name: '대회별 스킬 평가', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
    await page.getByRole('dialog').screenshot({ path: `${output}/before-${width}-supports.png` });
    await page.keyboard.press('Escape');
    await page.getByTestId('p4-recommendations').screenshot({ path: `${output}/before-${width}-priorities.png` });
    await context.close();
  }
  await writeFile(`${output}/before-connector-measurements.json`, JSON.stringify({ scope: 'Actual preserved P8.5 UI at localhost:5196, existing V1 synthetic factor records and actual canonical IDs', records }, null, 2));
  console.log(JSON.stringify(records, null, 2));
} finally { await browser.close(); }
