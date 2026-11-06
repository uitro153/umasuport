import { skillName, supportName } from './name-search-data';
import { test, expect, type Page } from '@playwright/test';
import real from '../golden/p3-real-ui-subset.json' with { type: 'json' };

async function openAnalysis(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.route('**/__local/p3-skill-support', (route) => route.fulfill({ json: real }));
  await page.goto('/?view=skills');
  await expect(page.getByRole('heading', { name: '대회별 스킬 평가', exact: true })).toBeVisible();
  // These fixed-source regressions intentionally use already-ended events.
  // History is now explicit UI state and never changes the evaluation input.
  await page.getByTestId('p85-show-past-events').check();
}

test('실제 스킬은 대회 방향·각질에 따라 달라지며 저비용 패시브 스킬을 우대한다', async ({ page }) => {
  await openAnalysis(page);
  await expect(page.locator('#skills-event')).toHaveValue('kr-cm-38');
  await page.locator('#skills-list-view').selectOption('all');
  await page.locator('#skills-search').fill(skillName('200012', real));
  const clockwise = page.getByTestId('skill-result-200012');
  await expect(clockwise).toContainText('비해당');
  await page.locator('#skills-event').selectOption('kr-cm-37');
  await expect(clockwise).toContainText('우선 확보');
  await expect(clockwise).toContainText('전제 포함 90 Pt');
  await expect(clockwise).toContainText('스피드 패시브 스킬');
  await expect(clockwise).toContainText('한국 출시 미확인');
  await expect(clockwise).not.toContainText(/\d+(\.\d+)?%/);
  await page.locator('#skills-search').fill(skillName('201542', real));
  const lateSavvy = page.getByTestId('skill-result-201542');
  await expect(lateSavvy).toContainText('비해당');
  await page.locator('#skills-style').selectOption('late');
  await expect(lateSavvy).not.toContainText('대회·각질 비해당');
  const resultCount = await page.getByTestId('skills-result-count').textContent();
  await page.locator('#skills-preference').selectOption('skills');
  await expect(page.getByTestId('skills-result-count')).toHaveText(resultCount!);
  await expect(lateSavvy).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('실제 본육성 6장의 일반·이벤트·금색 하위 경로를 구분하고 추가 힌트 후보를 유지한다', async ({ page }) => {
  await openAnalysis(page);
  const ids = ['30028', '30016', '30023', '30007', '30009', '30011'];
  for (const [index, id] of ids.entries()) {
    await page.getByRole('button', { name: `서포트 ${index + 1} 선택`, exact: true }).click();
    await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName(id, real));
    await page.getByTestId(`support-candidate-${id}`).click();
  }
  await expect(page.getByTestId('skills-deck-count')).toHaveText('6 / 6 선택');
  await page.locator('#skills-search').fill(skillName('200332', real));
  const adept = page.getByTestId('skill-result-200332');
  await expect(adept).toContainText('일반 힌트');
  await expect(adept).toContainText('레어 → 하위');
  await expect(adept).toContainText('추가 힌트 후보로 유지');
  await expect(adept).toContainText('힌트Lv 효과 2');
  await page.getByLabel('서포트 1 돌파', { exact: true }).selectOption('0');
  await expect(adept).toContainText('힌트Lv 효과 1');
  await page.locator('#skills-search').fill(skillName('200331', real));
  await expect(page.getByTestId('skill-result-200331')).toContainText('이벤트');
  await expect(page.getByTestId('skill-result-200331')).toContainText('확정 수급 아님');
  await page.screenshot({ path: test.info().outputPath('p3-deck-analysis.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('기준일 이후·한국 출시 미확인·한국 일정 미확인을 구분한다', async ({ page }) => {
  await openAnalysis(page);
  await expect(page.getByTestId('skills-cutoff')).toHaveText('2026-10-10');
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('20089', real));
  await expect(page.getByTestId('support-candidate-20089')).toHaveCount(0);
  await page.getByLabel('한국 출시 상태', { exact: true }).selectOption('unavailable');
  await expect(page.getByTestId('support-candidate-20089')).toBeDisabled();
  await page.getByLabel('한국 출시 상태', { exact: true }).selectOption('unknown');
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('10001', real));
  await expect(page.getByTestId('support-candidate-10001')).toBeDisabled();
  await expect(page.getByText('한국 출시 근거가 부족한 자료입니다.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '서포트 1 선택', exact: true })).toBeFocused();
  await page.locator('#skills-mode').selectOption('current');
  await expect(page.getByTestId('skills-cutoff')).toHaveText('2026-11-05');
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('20089', real));
  await expect(page.getByTestId('support-candidate-20089')).toBeEnabled();
  await page.getByTestId('support-candidate-20089').click();
  await page.locator('#skills-event').selectOption('kr-cm-39-undated');
  await page.locator('#skills-mode').selectOption('tournament');
  await expect(page.getByTestId('skills-cutoff')).toHaveText('대회 일정 미확인');
  await expect(page.getByRole('alert')).toContainText('대회 시작일 근거가 없어');
  await page.locator('#skills-mode').selectOption('current');
  await page.locator('#skills-search').fill(skillName('200012', real));
  await expect(page.getByTestId('skill-result-200012')).toBeVisible();
  await expect(page.getByLabel('선택 대회 조건')).toContainText('한국 적용 조건 확인 필요');
});
