import { supportName } from './name-search-data';
import { expect, test, type Page } from '@playwright/test';
import real from '../golden/p3-real-ui-subset.json' with { type: 'json' };

async function openRecommendations(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  // Existing real-source regression records. No invented skill/card values.
  await page.route('**/__local/p3-skill-support', (route) => route.fulfill({ json: real }));
  await page.goto('/?view=skills');
  await expect(page.getByRole('heading', { name: '인자작 서포트 6장 추천', exact: true })).toBeVisible();
  await page.getByTestId('p85-show-past-events').check();
}

test('실제 자료로 6장 전체 추천·수급 비교를 표시하고 조건 변경 시 오래된 추천을 숨긴다', async ({ page }) => {
  await openRecommendations(page);
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const result = page.getByTestId('p4-primary-result');
  await expect(result).toBeVisible({ timeout: 20000 });
  await expect(result.locator('.p4-card')).toHaveCount(6);
  const cardIds = await result.locator('.p4-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')));
  expect(new Set(cardIds).size).toBe(6);
  await expect(page.getByTestId('skills-deck-count')).toHaveText('0 / 6 선택');
  await result.getByText(/^자료에 기록된 잠재 수급 경로/).first().click();
  await expect(result.locator('.p4-route-list').first()).toBeVisible();
  await expect(result).toContainText('중복되는 스킬');
  await expect(result).toContainText('확보하지 못한 주요 스킬');
  expect(await page.getByTestId('p4-alternative').count()).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('p87-search-scope')).toContainText('전역 최적 보장 없음');
  await expect(page.locator('details.p4-search-meta')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p4-recommendation.png'), fullPage: true });
  await page.locator('#skills-style').selectOption('end');
  await expect(result).toHaveCount(0);
  await expect(page.getByText('조건이 바뀌었습니다. 현재 조건으로 편성을 다시 추천하세요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 20000 });
  await page.getByLabel('한국 출시 미확인 스킬 연구 검토 포함', { exact: true }).uncheck();
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await expect(page.getByTestId('p4-recommendations').getByRole('status').filter({ hasText: '평가 가능한 백인자 목표가 없습니다.' })).toBeVisible();
});

test('선택 등록한 보유 카드의 돌파·대여 제한을 적용하고 부족한 편성은 만들지 않는다', async ({ page }) => {
  await openRecommendations(page);
  await page.getByLabel('보유 카드로 추천 범위 제한', { exact: true }).check();
  await page.getByLabel('미보유 카드 1장 대여 허용', { exact: true }).uncheck();
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByText('출시·보유 조건에 맞는 서로 다른 서포트 6장이 부족합니다.', { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await page.locator('.p4-ownership>summary').click();
  const ids = ['30028', '30016', '30023', '30007', '30009', '30011'];
  for (const id of ids) {
    await page.getByLabel('보유 카드명 검색', { exact: true }).fill(supportName(id, real));
    await page.getByTestId(`p4-own-${id}`).click();
  }
  await page.getByLabel('보유 30028 돌파', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const result = page.getByTestId('p4-primary-result');
  await expect(result.locator('.p4-card')).toHaveCount(6, { timeout: 20000 });
  await expect(result.getByTestId('p4-card-30028')).toContainText('0돌파 · 보유');
  for (const id of ids) await expect(result.getByTestId(`p4-card-${id}`)).toBeVisible();
  await expect(result).not.toContainText(' · 대여');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
