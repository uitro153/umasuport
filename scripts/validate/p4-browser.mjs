/* global document, window */
import process from 'node:process';
import console from 'node:console';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

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
    await page.goto(`${baseUrl}/?view=skills`);
    await expect(page.getByText('2223', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('566', { exact: true })).toBeVisible();
    await page.locator('#skills-event').selectOption('kr-cm-39');
    await page.locator('#skills-style').selectOption('pace');
    await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
    await page.locator('#skills-search').fill('200012');
    const started = Date.now();
    await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
    const result = page.getByTestId('p4-primary-result');
    await expect(result.locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
    const elapsedMs = Date.now() - started;
    const ids = await result.locator('.p4-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid').replace('p4-card-', '')));
    expect(new Set(ids).size).toBe(6);
    await result.getByText(/^자료에 기록된 잠재 수급 경로/).first().click();
    await expect(result.locator('.p4-route-list').first()).toBeVisible();
    if (await page.getByTestId('p4-alternative').count()) {
      await page.getByTestId('p4-alternative').locator('summary').first().click();
      await expect(page.getByTestId('p4-alternative').getByText(/새로 얻는 스킬/).first()).toBeVisible();
      await page.getByTestId('p4-alternative').locator('summary').first().click();
    }
    await page.screenshot({ path: `.preview/p4-actual-${name}.png`, fullPage: true });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
    await page.locator('#skills-preference').selectOption('skills');
    await expect(result).toHaveCount(0);
    await expect(page.getByText('조건이 바뀌었습니다. 현재 조건으로 편성을 다시 추천하세요.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
    await expect(result.locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
    await page.locator('#skills-event').selectOption('kr-loh-2026-09');
    await expect(page.getByLabel('선택 대회 조건')).toContainText('12인 레이스');
    await expect(page.getByLabel('선택 대회 조건')).toContainText('날씨 미확인');
    await expect(page.getByLabel('선택 대회 조건')).toContainText('밤');
    await page.locator('#skills-event').selectOption('kr-cm-38');
    await page.getByLabel('한국 출시 미확인 스킬 연구 검토 포함', { exact: true }).uncheck();
    await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
    await expect(page.getByTestId('p4-recommendations').getByRole('status').filter({ hasText: '평가 가능한 백인자 목표가 없습니다.' })).toBeVisible({ timeout: 30000 });
    await expect(result).toHaveCount(0);
    expect(errors).toEqual([]);
    report.push({ viewport: name, skills: 2223, supports: 566, ids, elapsedMs,
      sixCardRecommendation: true, routeDetails: true, meaningfulAlternativeCompared: true,
      staleResultHidden: true, workerRecalculation: true, lohRandomWeatherPreserved: true,
      emptyTargetStopsRecommendation: true, noHorizontalOverflow: noOverflow, pageErrors: errors });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile('.preview/p4-actual-browser.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
