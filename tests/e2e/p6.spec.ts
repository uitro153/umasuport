import { skillName, chooseSkillGoal } from './name-search-data';
import { test, expect, type Page } from '@playwright/test';

async function openPriorities(page: Page, style = 'pace') {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/?view=skills');
  await expect(page.getByText('2223', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('p5-tournament-info')).toBeVisible({ timeout: 30000 });
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await expect(page.locator('#skills-event option:checked')).toHaveText('[무인도] [챔미] [중거리 2200m] 한신');
  await page.locator('#skills-style').selectOption(style);
  await page.locator('#skills-scenario').selectOption('11');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  await page.locator('#skills-search').fill(skillName('200012'));
  const priorities = page.getByTestId('p6-priority-settings');
  if ((await priorities.getAttribute('open')) === null) await priorities.locator('summary').click();
  await expect(page.getByTestId('p6-priority-count')).toHaveText('0 / 10');
}
async function expectTarget(page: Page, id: string) {
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 60000 });
  await expect(page.getByTestId(`p6-target-${id}`)).toContainText('맞춤 기회 있음', { timeout: 60000 });
}

test('기본 결과를 유지하고 터다지기 우대·필수·초기화를 Worker로 재계산한다', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPriorities(page);
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const primary = page.getByTestId('p4-primary-result');
  await expect(primary.locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
  const baselineIds = await primary.locator('.p4-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')));
  await expect(primary.locator('.p6-score-metrics')).toContainText('기본 정성 384');
  await expect(page.getByTestId('p6-comparison')).toHaveCount(0);
  await chooseSkillGoal(page, '201601');
  await page.getByLabel('터다지기 우선순위', { exact: true }).selectOption('strong');
  await expectTarget(page, '201601');
  await expect(page.getByTestId('p6-base-score')).toHaveText('384');
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('24');
  await expect(page.getByTestId('p6-base-search')).toContainText('후보 96장');
  await expect(page.getByTestId('p6-custom-search')).toContainText('전역 최적 보장 없음');
  const basic = Number(await page.getByTestId('p6-custom-base-score').textContent());
  const combined = Number(await page.getByTestId('p6-custom-score').textContent());
  expect(combined).toBe(basic + 24);
  // Interrupt a real in-flight worker, then accept only the latest required
  // request. An older preferred response must not restore its bonus or deck.
  await page.getByLabel('터다지기 우선순위', { exact: true }).selectOption('preferred');
  await expect(page.getByRole('button', { name: '편성 비교 중…', exact: true })).toBeVisible();
  await page.getByLabel('터다지기 우선순위', { exact: true }).selectOption('required');
  await expect(primary).toHaveCount(0);
  await expectTarget(page, '201601');
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('0');
  await expect(page.getByTestId('p6-comparison')).toContainText('백인자 생성·계승 성공을 보장하지 않습니다.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p6-required-groundwork.png'), fullPage: true });
  await page.getByRole('button', { name: '기본 추천으로 돌아가기', exact: true }).click();
  await expect(page.getByTestId('p6-priority-count')).toHaveText('0 / 10');
  await expect(page.getByTestId('p6-comparison')).toHaveCount(0);
  await expect(primary.locator('.p4-card')).toHaveCount(6, { timeout: 60000 });
  expect(await primary.locator('.p4-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')))).toEqual(baselineIds);
  expect(errors).toEqual([]);
});

test('검색·검증된 하위 연결·10개 제한·대회 각질 변경 후 선택과 경고를 유지한다', async ({ page }) => {
  test.setTimeout(90000);
  await openPriorities(page, 'front');
  const search = page.getByLabel('우선순위 스킬명 검색', { exact: true });
  await search.fill('터다지기');
  await expect(page.getByTestId('p6-skill-201601')).toBeVisible();
  await search.fill(skillName('200431'));
  await expect(page.getByTestId('p6-skill-200431')).toContainText('금색 검색 결과');
  await expect(page.getByTestId('p6-skill-200431')).toContainText('일반 목표: 집중력');
  await page.getByTestId('p6-skill-200431').click();
  await expect(page.getByTestId('p6-selected-200432')).toBeVisible();
  await page.getByLabel('집중력 우선순위 삭제', { exact: true }).click();
  await search.fill(skillName('900011'));
  await expect(page.getByTestId('p6-skill-900011')).toBeDisabled();
  await expect(page.getByTestId('p6-skill-900011')).toContainText('일반 백인자');
  await search.fill(skillName('201321'));
  await expect(page.getByTestId('p6-skill-201321')).toContainText('일반 목표: 선행 코너○');
  await page.getByTestId('p6-skill-201321').click();
  await expect(page.getByTestId('p6-selected-201322')).toBeVisible();
  for (const id of ['201601', '200452', '201262', '201332', '200012', '200052', '200142', '200162', '200182']) await chooseSkillGoal(page, id);
  await expect(page.getByTestId('p6-priority-count')).toHaveText('10 / 10');
  await search.fill(skillName('200432'));
  await expect(page.getByTestId('p6-skill-200432')).toBeDisabled();
  await page.getByLabel('위험 회피 우선순위 삭제', { exact: true }).click();
  await expect(page.getByTestId('p6-priority-count')).toHaveText('9 / 10');
  await chooseSkillGoal(page, '201262');
  await page.locator('#skills-style').selectOption('end');
  await expect(page.getByTestId('p6-selected-201262')).toContainText('현재 대회·각질에 비해당');
  await expect(page.getByTestId('p6-priority-count')).toHaveText('10 / 10');
  await page.getByRole('button', { name: '전체 선택 초기화', exact: true }).click();
  await expect(page.getByTestId('p6-priority-count')).toHaveText('0 / 10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('위험 회피와 포지션 센스를 같은 계획으로 요구하고 보유 제약 실패를 구분한다', async ({ page }) => {
  test.setTimeout(120000);
  await openPriorities(page, 'front');
  for (const [id, name] of [['201262', '위험 회피'], ['200452', '포지션 센스']] as const) {
    await chooseSkillGoal(page, id);
    await page.getByLabel(`${name} 우선순위`, { exact: true }).selectOption('required');
  }
  await expectTarget(page, '201262');
  await expectTarget(page, '200452');
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('0');
  await page.getByLabel('보유 카드로 추천 범위 제한', { exact: true }).check();
  await page.getByLabel('미보유 카드 1장 대여 허용', { exact: true }).uncheck();
  await expect(page.getByTestId('p6-required-failure')).toHaveAttribute('data-reason', 'ownership-borrow-limit', { timeout: 60000 });
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await expect(page.getByTestId('p6-target-201262')).toContainText('충족 미확인');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('수급 미확인 목표를 필수 지정해도 확보로 표시하지 않고 미래 대회에서 재검증한다', async ({ page }) => {
  test.setTimeout(120000);
  await openPriorities(page);
  await page.getByLabel('우선순위 스킬명 검색', { exact: true }).fill(skillName('203842'));
  await page.getByTestId('p6-skill-203842').click();
  await page.getByTestId('p6-selected-203842').getByRole('combobox').selectOption('required');
  await expect(page.getByTestId('p6-required-failure')).toHaveAttribute('data-reason', 'unverified-source', { timeout: 60000 });
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await page.getByTestId('p6-base-details').locator('summary').first().click();
  await expect(page.getByTestId('p6-base-deck').locator('.p4-card')).toHaveCount(6);
  await page.locator('#skills-event').selectOption('kr-cm-40');
  await expect(page.getByTestId('p6-priority-count')).toHaveText('1 / 10');
  await expectTarget(page, '203842');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).uncheck();
  await expect(page.getByTestId('p6-required-failure')).toHaveAttribute('data-reason', 'unverified-source', { timeout: 60000 });
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
});
