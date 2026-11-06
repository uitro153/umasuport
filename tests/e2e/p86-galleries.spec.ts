import { supportName } from './name-search-data';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const artifacts = '.preview/p87-artifacts/regression-p86';
const viewports = [{ width: 1440, height: 1000 }, { width: 1024, height: 1000 }, { width: 768, height: 1000 }, { width: 375, height: 812 }];

async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function columns(page: Page, selector: string) { return page.locator(selector).evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length); }
async function visibleImagesReady(page: Page, selector: string) {
  const decoded = await page.locator(`${selector} img`).evaluateAll(async (elements) => {
    const visible = (elements as HTMLImageElement[]).filter((image) => { const rect = image.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0; });
    return Promise.all(visible.map(async (image) => { try { await image.decode(); return image.naturalWidth > 0; } catch { return false; } }));
  });
  expect(decoded.length).toBeGreaterThan(0); expect(decoded.every(Boolean)).toBe(true);
}

for (const viewport of viewports) {
  test(`P8.6 ${viewport.width}px 의상·카드 갤러리의 밀도·정확한 이미지·선택과 상세·키보드·필터를 검수한다`, async ({ page }, info) => {
    test.setTimeout(150000); await mkdir(artifacts, { recursive: true });
    await page.setViewportSize(viewport); await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
    await page.goto('/');
    const editor = page.getByTestId('ref-slot-target');
    const trigger = page.getByTestId('p86-edit-target');
    await trigger.click();
    const costumes = page.getByRole('dialog', { name: '본육성 대상 선택', exact: true });
    const costumeSearch = costumes.getByLabel('캐릭터·의상·별칭 검색', { exact: true });
    await expect(costumeSearch).toBeFocused();
    expect(await columns(page, '.p86-costume-grid')).toBe(viewport.width === 1440 ? 6 : viewport.width === 1024 ? 5 : viewport.width === 768 ? 4 : 2);
    await expect(costumes.getByTestId('p86-costume-gallery')).not.toContainText(/costumeId|baseId|128×128|SHA-256/);
    await visibleImagesReady(page, '.p86-costume-grid');
    await costumes.screenshot({ path: `${artifacts}/${info.project.name}-${viewport.width}-costume-gallery.png` });
    await costumeSearch.fill('에어 그루브');
    for (const id of ['101801', '101802']) {
      const image = costumes.getByTestId(`ref-candidate-${id}`).getByTestId(`game-asset-costume-${id}`).locator('img');
      await expect(image).toHaveAttribute('src', new RegExp(`/costumes/${id}\\.png$`));
    }
    await costumes.getByTestId('costume-detail-101802').click();
    const costumeDetail = costumes.getByTestId('p86-costume-detail');
    await expect(costumeDetail).toContainText('에어 그루브');
    await expect(costumeDetail).not.toContainText('의상 ID');
    await costumeDetail.getByRole('button', { name: '상세 닫기', exact: true }).click();
    if (info.project.name === 'mobile') await costumes.getByTestId('ref-candidate-101802').tap(); else await costumes.getByTestId('ref-candidate-101802').click();
    await expect(editor.getByTestId('game-asset-costume-101802').locator('img').first()).toHaveAttribute('src', /costumes\/101802\.png$/);
    await trigger.click(); await costumeSearch.fill('존재하지않는의상xyz');
    await expect(costumes.getByText('조건에 맞는 의상이 없습니다.', { exact: false })).toBeVisible();
    await costumes.getByRole('button', { name: '검색 초기화', exact: true }).click(); await expect(costumeSearch).toHaveValue('');
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await expect(editor.getByTestId('game-asset-costume-101802').locator('img').first()).toHaveAttribute('src', /costumes\/101802\.png$/);
    await noOverflow(page);

    await page.goto('/?view=skills');
    await expect(page.getByRole('heading', { name: '대회별 스킬 평가', exact: true })).toBeVisible({ timeout: 30000 });
    await page.locator('#skills-mode').selectOption('current'); await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).uncheck();
    const supportTrigger = page.getByRole('button', { name: '서포트 1 선택', exact: true }); await supportTrigger.click();
    const supports = page.getByRole('dialog', { name: '서포트 1 선택', exact: true });
    const supportSearch = supports.getByLabel('서포트 카드명 검색', { exact: true }); await expect(supportSearch).toBeFocused();
    const supportColumns = await columns(page, '.support-picker-list.p86-support-gallery');
    expect(supportColumns).toBeGreaterThanOrEqual(viewport.width === 1440 ? 8 : viewport.width === 1024 ? 7 : viewport.width === 768 ? 5 : 3);
    if (viewport.width === 375) expect(supportColumns).toBe(3);
    await expect(supports.getByTestId('p86-support-gallery')).not.toContainText(/supportId|300×400|SHA-256|原本/);
    const targetSizes = await supports.locator('.p86-support-icon-choice,.p86-support-info').evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return [rect.width, rect.height]; }));
    expect(targetSizes.every(([width, height]) => width! >= 44 && height! >= 44)).toBe(true);
    await visibleImagesReady(page, '.support-picker-list.p86-support-gallery');
    await supports.screenshot({ path: `${artifacts}/${info.project.name}-${viewport.width}-support-gallery.png` });
    await writeFile(`${artifacts}/${info.project.name}-${viewport.width}-gallery-layout.json`, JSON.stringify({ viewport, costumeColumns: viewport.width === 1440 ? 6 : viewport.width === 1024 ? 5 : viewport.width === 768 ? 4 : 2, supportColumns, targetsAtLeast44px: targetSizes.every(([width, height]) => width! >= 44 && height! >= 44), pageOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) }, null, 2));
    await supportSearch.fill('스페셜 위크');
    for (const [id, rarity] of [['10001', 'R'], ['20043', 'SR'], ['30001', 'SSR'], ['30025', 'SSR']]) {
      const sameCharacter = supports.getByTestId(`support-candidate-${id}`);
      await expect(sameCharacter).toHaveClass(new RegExp(`p86-card-rarity-${rarity!.toLowerCase()}`));
      await expect(sameCharacter.locator('img')).toHaveAttribute('src', new RegExp(`supports/icons/${id}\\.png$`));
    }
    await visibleImagesReady(page, '.support-picker-list.p86-support-gallery');
    await supports.screenshot({ path: `${artifacts}/${info.project.name}-${viewport.width}-support-rarities.png` });
    await supports.locator('#support-type').selectOption('intelligence'); await supports.locator('#support-rarity').selectOption('SSR'); await supportSearch.fill(supportName('30010'));
    await expect(supports.getByTestId('p85-support-result-count')).toContainText('· 1장 ·');
    const fine = supports.getByTestId('support-candidate-30010'); await expect(fine).toBeEnabled();
    await expect(fine.locator('img')).toHaveAttribute('src', /supports\/icons\/30010\.png$/);
    await supports.getByRole('button', { name: /파인 모션.*상세 보기/ }).focus(); await page.keyboard.press('Enter');
    const supportDetail = supports.getByTestId('p86-support-detail'); await expect(supportDetail).toContainText('파인 모션');
    await expect(supportDetail).not.toContainText('ID 30010');
    await supportDetail.getByRole('button', { name: '상세 닫기', exact: true }).click();
    await supports.locator('#support-type').selectOption('speed'); await expect(supports.getByTestId('p85-support-empty')).toBeVisible();
    await supports.getByRole('button', { name: '필터 초기화', exact: true }).click(); await supportSearch.fill(supportName('30010')); await fine.click();
    await expect(page.getByTestId('skills-deck-slot-0').getByTestId('game-asset-support-30010').locator('img')).toHaveAttribute('src', /supports\/icons\/30010\.png$/);
    await page.getByRole('button', { name: '서포트 2 선택', exact: true }).click(); await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30010'));
    await expect(page.getByTestId('support-candidate-30010')).toBeDisabled(); await expect(page.getByTestId('support-candidate-30010')).toContainText('편성 중');
    await page.keyboard.press('Escape'); await noOverflow(page);
  });
}
