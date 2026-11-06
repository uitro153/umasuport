import { skillName, supportName } from './name-search-data';
import { test, expect, type Page } from '@playwright/test';

async function openP5(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/?view=skills');
  await expect(page.getByText('2223', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#skills-event option[value="p5-kr-loh-jp-16"]')).toHaveCount(1, { timeout: 30000 });
  await expect(page.getByTestId('p85-show-past-events')).not.toBeChecked();
  await expect(page.locator('#skills-event option')).toHaveCount(14);
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  await page.locator('#skills-style').selectOption('pace');
  await page.locator('#skills-search').fill(skillName('200012'));
}

test('14개 미래시와 7~11월 월 대회를 가짜 개최일 없이 선택한다', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openP5(page);
  const futureOptions = page.locator('#skills-event optgroup[label="예정 챔미·LoH"] option');
  await expect(futureOptions).toHaveCount(14);
  const labels = await futureOptions.allTextContents();
  expect(labels.every((label) => /^\[.+\] \[(챔미|LoH)\] \[(단거리|마일|중거리|장거리) \d+m\] .+/.test(label))).toBe(true);
  expect(labels.every((label) => !/20\d\d-\d\d|JP-|월 단위 예상/.test(label))).toBe(true);
  await page.getByTestId('p85-show-past-events').check();
  await expect(page.locator('#skills-event option')).toHaveCount(53);
  await page.locator('#skills-event').selectOption('kr-cm-38');
  await page.getByTestId('p85-show-past-events').uncheck();
  await expect(page.locator('#skills-event')).toHaveValue('kr-cm-38');
  await expect(page.locator('#skills-event optgroup[label="저장 계획의 지난 대회"] option[value="kr-cm-38"]')).toHaveCount(1);
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await expect(page.locator('#skills-event option')).toHaveCount(14);
  const ids = await futureOptions.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(new Set(ids).size).toBe(14);
  for (const id of ids) {
    await page.locator('#skills-event').selectOption(id);
    await expect(page.getByTestId('p5-tournament-info')).toBeVisible();
    await expect(page.getByTestId('skills-cutoff')).toContainText('JP ');
    await expect(page.getByRole('button', { name: '인자작 편성 추천', exact: true })).toBeEnabled();
  }
  for (const [eventId, month, jpDate] of [
    ['kr-cm-45', '2027-07', '2026-04-23'], ['p5-kr-loh-jp-15', '2027-08', '2026-05-22'],
    ['kr-cm-46', '2027-09', '2026-06-23'], ['kr-cm-47', '2027-10', '2026-07-24'],
    ['p5-kr-loh-jp-16', '2027-11', '2026-08-14'],
  ]) {
    await page.locator('#skills-event').selectOption(eventId!);
    await expect(page.getByTestId('p5-tournament-info')).toContainText(`${month} 월 단위 예상`);
    await expect(page.getByTestId('p5-tournament-info')).toContainText('정확한 한국 개최일은 미정');
    await expect(page.getByTestId('skills-cutoff')).toHaveText(`JP ${jpDate}`);
  }
  await expect(page.getByTestId('p5-boundary-note')).toContainText('2027-11-04 이후 개최될 수 있는 경계 후보');
  await expect(page.getByTestId('p5-tournament-info')).toContainText('날씨·주로 상태는 랜덤');
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const result = page.getByTestId('p4-primary-result');
  await expect(result.locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
  await expect(result).toContainText('양립 가능한 목표');
  await expect(page.getByTestId('p4-recommendations')).toContainText('별도 추천 0건');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p5-monthly-boundary.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('챔미44 시나리오13과 직전 출시 카드가 같은 일본 순서 기준을 따른다', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openP5(page);
  await page.locator('#skills-event').selectOption('kr-cm-44');
  await expect(page.locator('#skills-event option:checked')).toContainText('[Beyond Dreams]');
  const scenario13 = page.locator('#skills-scenario option[value="13"]');
  await expect(scenario13).toHaveJSProperty('disabled', false);
  await expect(scenario13).toContainText('일본 순서상 가용 예상');
  await page.locator('#skills-scenario').selectOption('13');
  await expect(page.getByTestId('skills-cutoff')).toHaveText('JP 2026-03-22');
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).uncheck();
  await expect(scenario13).toHaveJSProperty('disabled', true);
  await expect(page.locator('#skills-scenario')).not.toHaveValue('13');
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await expect(page.getByText('조건이 바뀌었습니다. 현재 조건으로 편성을 다시 추천하세요.', { exact: true })).toBeVisible();
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await expect(page.locator('#skills-event option:checked')).toHaveText('[무인도] [챔미] [중거리 2200m] 한신');
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30259'));
  await expect(page.getByTestId('support-candidate-30259')).toBeEnabled();
  // The unchanged JP-order evidence moved out of the default gallery tile.
  await page.getByTestId('support-candidate-30259').locator('..').locator('.p86-support-info').click();
  const cardDetails = page.getByTestId('p86-support-detail');
  const releaseEvidence = cardDetails;
  await expect(releaseEvidence).toContainText('일본 대회 이전 출시 · 가용 예상');
  await cardDetails.getByRole('button', { name: '상세 닫기', exact: true }).click();
  await page.getByTestId('support-candidate-30259').click();
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
  await page.getByTestId('p5-late-release').locator('summary').click();
  await expect(page.getByTestId('p5-late-release')).toContainText('3일 차이');
  await expect(page.getByTestId('p5-late-release')).toContainText('별도 추천 0건');
  await expect(page.getByTestId('p5-late-release')).toContainText('큰 재제작 부담을 입증한 기록이 없어');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p5-release-order.png'), fullPage: true });
  await page.locator('#skills-event').selectOption('kr-cm-45');
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 30000 });
  const monthlyLate = page.getByTestId('p5-late-release');
  await monthlyLate.locator('summary').click();
  const included = monthlyLate.getByTestId('p5-late-support-10144');
  await expect(included).toContainText('기본 추천 반영');
  await expect(included).toContainText('이 편성에서 이 카드만 제공하는 목표');
  await expect(included).not.toContainText('새로 얻는 스킬');
  await page.locator('#skills-mode').selectOption('current');
  await expect(page.getByTestId('p5-availability-basis')).toContainText('현재 시점: 기존 한국 출시 근거와 한국 기준일');
  await expect(page.locator('.skills-context-note')).toContainText('현재 기준일 이후 출시 제외');
  expect(errors).toEqual([]);
});
