import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/?view=fixture');
});

test('빈 7인 계보에서 별칭·일문 검색과 의상 구분으로 선택한다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '인자 계보 설계', exact: true })).toBeVisible();
  await expect(page.getByText('가상 fixture · 실게임 검증 전', { exact: true })).toBeVisible();
  await expect(page.locator('.pedigree-slot')).toHaveCount(7);
  await expect(page.getByTestId('affinity-total')).toHaveText('—');
  await expect(page.getByRole('button', { name: '조부모 6배치 비교', exact: true })).toBeDisabled();
  const trigger = page.getByRole('button', { name: '본육성 대상 선택', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '본육성 대상 선택', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('이름·별칭 검색')).toBeFocused();
  await dialog.getByLabel('이름·별칭 검색').fill('가상가');
  await expect(dialog.locator('.candidate-button')).toHaveCount(2);
  await dialog.getByTestId('candidate-costume_demo_a_alternate').click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('slot-target')).toContainText('대체 의상');
  await trigger.click();
  await page.getByLabel('이름·별칭 검색').fill('キャラクターB');
  await expect(page.getByTestId('candidate-costume_demo_b_default')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('상성 갱신·빨간 인자·6가지 배치 적용이 한 계보에서 연결된다', async ({ page }) => {
  await page.getByRole('button', { name: '가상 예시 채우기', exact: true }).click();
  await expect(page.getByTestId('affinity-total')).not.toHaveText('—');
  const parentBefore = await page.getByTestId('slot-parentA').locator('.slot-copy').textContent();
  const targetBefore = await page.getByTestId('slot-target').locator('.slot-copy').textContent();
  const scoreBefore = Number(await page.getByTestId('affinity-total').textContent());
  await page.getByLabel('부모 A 빨간 인자', { exact: true }).selectOption('dirt');
  await expect(page.getByTestId('aptitude-dirt')).toContainText('★3');
  await expect(page.getByTestId('aptitude-dirt').locator('strong')).toHaveText('F');
  await page.getByLabel('조부 A1 빨간 인자', { exact: true }).selectOption('dirt');
  await page.getByLabel('조부 A1 인자 별수', { exact: true }).selectOption('1');
  await expect(page.getByTestId('aptitude-dirt')).toContainText('★4');
  await expect(page.getByTestId('aptitude-dirt').locator('strong')).toHaveText('E');
  await page.getByRole('button', { name: '조부모 6배치 비교', exact: true }).click();
  await expect(page.getByTestId('arrangement-row')).toHaveCount(6);
  const scores = await page.locator('.arrangement-heading>b').allTextContents();
  expect(scores.map(Number)).toEqual(scores.map(Number).sort((a, b) => b - a));
  await page.getByRole('button', { name: '배치 1 적용', exact: true }).click();
  expect(Number(await page.getByTestId('affinity-total').textContent())).toBeGreaterThanOrEqual(scoreBefore);
  await expect(page.getByTestId('slot-parentA').locator('.slot-copy')).toHaveText(parentBefore!);
  await expect(page.getByTestId('slot-target').locator('.slot-copy')).toHaveText(targetBefore!);
  await expect(page.getByTestId('aptitude-dirt')).toContainText('★4');
  await page.getByRole('button', { name: '조부 B2 비우기', exact: true }).click();
  await expect(page.getByTestId('affinity-total')).toHaveText('—');
  await expect(page.getByRole('button', { name: '조부모 6배치 비교', exact: true })).toBeDisabled();
});

test('출시 필터는 미래시 선택을 구분하고 기준일 전환 시 제외된 선택을 보존한다', async ({ page }) => {
  await page.getByRole('button', { name: '본육성 대상 선택', exact: true }).click();
  const futureCandidate = page.getByTestId('candidate-costume_demo_r_default');
  await expect(futureCandidate).toContainText('미래시 · 변동 가능');
  await futureCandidate.click();
  const selectedName = await page.getByTestId('slot-target').locator('.slot-copy').textContent();
  await page.getByLabel('출시 판단 시점', { exact: true }).selectOption('current');
  await expect(page.getByTestId('pedigree-cutoff')).toHaveText('2026-11-05');
  await expect(page.getByRole('alert')).toContainText('기준일에서 제외된 선택: 본육성 대상');
  await expect(page.getByTestId('slot-target').locator('.slot-copy')).toHaveText(selectedName!);
  await expect(page.getByTestId('affinity-total')).toHaveText('—');
  await page.getByRole('button', { name: '본육성 대상 선택', exact: true }).click();
  await expect(page.getByTestId('candidate-costume_demo_r_default')).toHaveCount(0);
  await expect(page.getByTestId('candidate-costume_demo_s_default')).toHaveCount(0);
  await expect(page.getByTestId('candidate-costume_demo_t_default')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('모바일 분기 접기·후보 정렬·P0 전환 후 계보 유지와 레이아웃을 검수한다', async ({ page }) => {
  await page.getByRole('button', { name: '가상 예시 채우기', exact: true }).click();
  const score = await page.getByTestId('affinity-total').textContent();
  await page.getByRole('button', { name: '데이터 기준 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '출시 시점 기준 확인' })).toBeVisible();
  await page.getByRole('button', { name: '계보 설계로', exact: true }).click();
  await expect(page.getByTestId('affinity-total')).toHaveText(score!);
  await page.locator('.grandparent-branch').first().locator('summary').click();
  await expect(page.getByRole('button', { name: '조부 A1 선택', exact: true })).not.toBeVisible();
  await page.locator('.grandparent-branch').first().locator('summary').click();
  await page.getByRole('button', { name: '부모 A 선택', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const comparableScores = await dialog.locator('.candidate-button:not(:disabled) .candidate-score').evaluateAll((nodes) => nodes.map((node) => Number(node.firstChild?.textContent)));
  expect(comparableScores).toEqual([...comparableScores].sort((a, b) => b - a));
  await page.screenshot({ path: test.info().outputPath('p1-picker.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByText('관계별 상성 기여', { exact: true }).click();
  await expect(page.locator('.affinity-breakdown li')).toHaveCount(11);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p1-filled.png'), fullPage: true });
  await page.getByRole('button', { name: '계보 비우기', exact: true }).click();
  await expect(page.getByTestId('affinity-total')).toHaveText('—');
});
