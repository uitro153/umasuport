import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+09:00'));
  await page.goto('/?view=data');
});

test('대회 기준에서 확정/예상 출시는 구분되고 현재 기준 전환이 동작한다', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await expect(page.getByRole('heading', { name: '출시 시점 기준 확인' })).toBeVisible();
  await expect(page.getByText('개발용 fixture · 실제 게임 데이터 아님', { exact: true })).toBeVisible();
  await expect(page.getByTestId('cutoff-date')).toHaveText('2027-02-10');
  await expect(page.getByTestId('confirmed-count')).toHaveText('2');
  await expect(page.getByTestId('forecast-count')).toHaveText('1');
  await expect(page.getByTestId('excluded-count')).toHaveText('2');
  await expect(page.getByTestId('release-row')).toHaveCount(5);
  await expect(page.getByText('미래시 포함 · 변동 가능', { exact: true })).toBeVisible();

  await page.getByLabel('출시 판단 시점').selectOption('current');
  await expect(page.getByTestId('cutoff-date')).toHaveText('2026-11-04');
  await expect(page.getByTestId('confirmed-count')).toHaveText('1');
  await expect(page.getByTestId('forecast-count')).toHaveText('0');
  await expect(page.getByTestId('excluded-count')).toHaveText('4');
  await expect(page.getByText('한국 일정 미확인 · 제외', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('대회 교체 시 시작일을 갱신하고 가로 넘침 없이 조작할 수 있다', async ({ page }) => {
  await page.getByLabel('선택 대회', { exact: true }).selectOption('event_demo_past');
  await expect(page.getByTestId('cutoff-date')).toHaveText('2026-10-20');
  await expect(page.getByTestId('confirmed-count')).toHaveText('1');
  await page.getByText('fixture 출처 정보', { exact: true }).click();
  await expect(page.getByText('검증일 2026-11-04 · fixture')).toBeVisible();
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p0.png'), fullPage: true });
});
