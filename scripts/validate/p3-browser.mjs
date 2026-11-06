/* global document, window */
import process from 'node:process';
import console from 'node:console';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Read the actual development endpoints; no route mocks or synthetic availability.
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5193';
await mkdir('.preview', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 375, height: 812 }]]) {
    const page = await browser.newPage({ viewport, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
    await page.goto(baseUrl);
    await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
    await page.getByRole('button', { name: '본육성 대상 선택', exact: true }).click();
    await page.getByTestId('ref-candidate-100901').click();
    await page.getByRole('button', { name: '스킬·서포트 분석', exact: true }).click();
    await expect(page.getByRole('heading', { name: '대회별 스킬 평가', exact: true })).toBeVisible();
    await expect(page.getByText('2223', { exact: true })).toBeVisible();
    await expect(page.getByText('566', { exact: true })).toBeVisible();
    for (const [index, id] of ['30028', '30016', '30023', '30007', '30009', '30011'].entries()) {
      await page.getByRole('button', { name: `서포트 ${index + 1} 선택`, exact: true }).click();
      await page.getByLabel('서포트 이름·ID 검색', { exact: true }).fill(id);
      await page.getByTestId(`support-candidate-${id}`).click();
    }
    await expect(page.getByTestId('skills-deck-count')).toHaveText('6 / 6 선택');
    await page.locator('#skills-search').fill('200332');
    const corner = page.getByTestId('skill-result-200332');
    await expect(corner).toContainText('일반 힌트');
    await expect(corner).toContainText('금색 → 하위');
    await page.getByLabel('서포트 1 돌파', { exact: true }).selectOption('0');
    await expect(corner).toContainText('힌트Lv 효과 1');
    await page.screenshot({ path: `.preview/p3-actual-${name}.png`, fullPage: true });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
    await page.locator('#skills-event').selectOption('kr-cm-37');
    await page.locator('#skills-search').fill('200012');
    await expect(page.getByTestId('skill-result-200012')).toContainText('우선 확보');
    await page.getByRole('button', { name: '계보 설계로', exact: true }).click();
    await expect(page.locator('.reference-slot').first()).toContainText('다이와 스칼렛');
    await page.getByRole('button', { name: '스킬·서포트 분석', exact: true }).click();
    await expect(page.getByTestId('skills-deck-count')).toHaveText('6 / 6 선택');
    expect(errors).toEqual([]);
    report.push({ viewport: name, skills: 2223, supports: 566, selectedSupports: 6,
      hintAndGoldLowerPaths: true, limitBreakHintEffect: true,
      courseSpecificGreenPriority: true, navigationPreservesPedigreeAndDeck: true,
      noHorizontalOverflow: noOverflow, pageErrors: errors });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile('.preview/p3-actual-browser.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
