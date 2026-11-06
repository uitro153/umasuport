import { supportName } from './name-search-data';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { getP3Availability } from '../../src/engine/support-acquisition';

const snapshot = validateP3Snapshot(JSON.parse(await readFile('data/local/p3-skill-support.json', 'utf8')) as unknown);
const current = snapshot.supports.map((support) => ({ support, release: getP3Availability(snapshot, 'support', support.supportId, '2026-11-05', false).state }));
async function ready(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/?view=skills');
  await expect(page.getByRole('heading', { name: '대회별 스킬 평가', exact: true })).toBeVisible({ timeout: 30000 });
  await page.locator('#skills-mode').selectOption('current');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).uncheck();
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); }

test('실제566장 목록은 타입7종·레어도3종·한국출시·이름검색을 교집합으로 표시한다', async ({ page }, info) => {
  test.setTimeout(120000); await ready(page);
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '서포트 1 선택', exact: true });
  const count = dialog.getByTestId('p85-support-result-count');
  for (const type of ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend', 'group']) {
    await dialog.locator('#support-type').selectOption(type);
    const expected = current.filter((row) => row.support.type === type && row.release === 'available');
    await expect(count).toContainText(`· ${expected.length}장 ·`);
    for (const badge of await dialog.locator('[data-support-type]').all()) await expect(badge).toHaveAttribute('data-support-type', type);
  }
  await dialog.locator('#support-type').selectOption('intelligence');
  for (const rarity of ['R', 'SR', 'SSR']) {
    await dialog.locator('#support-rarity').selectOption(rarity);
    const expected = current.filter((row) => row.support.type === 'intelligence' && row.support.rarity === rarity && row.release === 'available');
    await expect(count).toContainText(`· ${expected.length}장 ·`);
    for (const badge of await dialog.locator('[data-support-rarity]').all()) await expect(badge).toHaveAttribute('data-support-rarity', rarity);
  }
  await dialog.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30010'));
  await expect(count).toContainText('· 1장 ·');
  const fine = dialog.getByTestId('support-candidate-30010'); await expect(fine).toBeEnabled();
  await expect(fine).toContainText('파인 모션'); await expect(fine).toContainText('지능'); await expect(fine).toHaveAttribute('aria-label', /SSR 선택$/);
  await expect(fine.locator('..').locator('[data-support-rarity]')).toHaveText('SSR');
  const image = fine.getByTestId('game-asset-support-30010').locator('img');
  await expect(image).toHaveAttribute('src', /supports\/icons\/30010\.png$/);
  await fine.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await dialog.locator('#support-type').selectOption('speed');
  await expect(dialog.getByTestId('p85-support-empty')).toBeVisible();
  await dialog.getByRole('button', { name: '필터 초기화', exact: true }).click();
  await expect(dialog.locator('#support-type')).toHaveValue('all'); await expect(dialog.locator('#support-rarity')).toHaveValue('all');
  await expect(dialog.getByLabel('서포트 카드명 검색', { exact: true })).toHaveValue('');
  for (const release of ['unknown', 'unavailable', 'available']) {
    await dialog.locator('#support-state').selectOption(release);
    await expect(count).toContainText(`· ${current.filter((row) => row.release === release).length}장 ·`);
    if (release !== 'available') for (const button of await dialog.locator('[data-testid^="support-candidate-"]').all()) await expect(button).toBeDisabled();
  }
  await noOverflow(page); await dialog.screenshot({ path: info.outputPath('p86-support-filters.png') });
});

test('본육성6슬롯과 보유등록은 카드ID별 일러·등급을 유지하고 임시 필터를 저장하지 않는다', async ({ page }, info) => {
  test.setTimeout(120000); await ready(page);
  for (const [slot, id] of ['30010', '20001', '10001'].entries()) {
    await page.getByRole('button', { name: `서포트 ${slot + 1} 선택`, exact: true }).click();
    await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName(id));
    await page.getByTestId(`support-candidate-${id}`).click();
    const selected = page.getByTestId(`skills-deck-slot-${slot}`).getByTestId(`game-asset-support-${id}`);
    await expect(selected.locator('img')).toHaveAttribute('src', new RegExp(`supports/icons/${id}\\.png$`));
    await expect.poll(() => selected.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await page.locator('.p4-ownership>summary').click();
  await page.getByLabel('보유 카드명 검색', { exact: true }).fill(supportName('30067'));
  await page.locator('#p4-own-type').selectOption('group'); await page.locator('#p4-own-rarity').selectOption('SSR');
  await expect(page.getByTestId('p85-ownership-result-count')).toContainText('1장');
  await page.getByTestId('p4-own-30067').click();
  await expect(page.locator('.p85-support-owned-list').getByTestId('game-asset-support-30067').locator('img')).toHaveAttribute('src', /supports\/icons\/30067\.png$/);
  await page.locator('#p4-own-type').selectOption('friend'); await expect(page.getByTestId('p85-ownership-empty')).toBeVisible();
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-plan-manager')).toBeVisible();
  const pending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click(); const file = await pending;
  const path = info.outputPath('p86-ui-filters-not-in-v1.json'); await file.saveAs(path); const raw = await readFile(path, 'utf8');
  const plan = JSON.parse(raw) as { schemaVersion: number; inputs: { skillSettings: { deck: { supportId: string | null }[] }; supportSettings: { ownedSupports: { supportId: string }[] } } };
  expect(plan.schemaVersion).toBe(1); expect(plan.inputs.skillSettings.deck.slice(0, 3).map((row) => row.supportId)).toEqual(['30010', '20001', '10001']);
  expect(plan.inputs.supportSettings.ownedSupports.map((row) => row.supportId)).toContain('30067');
  expect(raw).not.toContain('game-assets/'); expect(raw).not.toContain('p4-own-type'); expect(raw).not.toContain('support-rarity');
  await noOverflow(page);
});

test('이미지 로딩 실패는 같은 카드의 이름·내부ID를 보존하고 다른 카드로 바꾸지 않는다', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/game-assets/supports/icons/30010.png', (route) => route.fulfill({ status: 404, body: '' }));
  await ready(page); await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30010'));
  const card = page.getByTestId('support-candidate-30010'); const image = card.getByTestId('game-asset-support-30010');
  await expect(image).toHaveAttribute('data-asset-status', 'missing'); await expect(card).toContainText('파인 모션'); await expect(image).not.toContainText('30010');
  await expect(card.locator('.p86-support-fallback-name')).toBeVisible();
  await expect(image.locator('img')).toHaveCount(0); await expect(image).toHaveAttribute('data-canonical-id', '30010');
  await card.click(); await expect(page.getByTestId('skills-deck-slot-0')).toContainText('파인 모션');
  await expect(page.getByTestId('skills-deck-slot-0').getByTestId('game-asset-support-30010')).toHaveAttribute('data-asset-status', 'missing');
  await noOverflow(page);
});
