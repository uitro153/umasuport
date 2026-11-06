import { costumeName } from './name-search-data';
import { test, expect, type Page } from '@playwright/test';
import { makeReferenceEngineFixture } from '../unit/reference-engine-fixture';
import { validateReferenceSnapshot } from '../../src/domain/reference';

function browserFixture() {
  const { snapshot } = makeReferenceEngineFixture();
  snapshot.characters[0]!.nameKo = '검증용 인물 가';
  snapshot.characters[0]!.displayName = '검증용 인물 가';
  snapshot.characters[0]!.displayLanguage = 'ko';
  snapshot.characters[0]!.translationStatus = 'source_translation_not_officially_verified';
  snapshot.costumes[0]!.nameKo = '검증용 인물 가';
  snapshot.costumes[0]!.outfitKo = '검증용 의상';
  snapshot.costumes[0]!.displayName = '검증용 인물 가 [검증용 의상]';
  snapshot.costumes[0]!.displayLanguage = 'ko';
  snapshot.costumes[0]!.translationStatus = 'source_translation_not_officially_verified';
  snapshot.costumes[1]!.nameKo = '검증용 인물 나';
  snapshot.costumes[1]!.displayName = '검증용 인물 나 [衣装B]';
  snapshot.costumes[1]!.displayLanguage = 'mixed';
  snapshot.costumes[1]!.translationStatus = 'source_translation_not_officially_verified';
  Object.assign(snapshot.applications[0]!.kr, {
    observedDate: '2026-10-30', sourceUrl: 'https://example.invalid/secondary', evidence: 'secondary_page',
  });
  return validateReferenceSnapshot(snapshot);
}

async function openReference(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.route('**/__local/p1-reference', (route) => route.fulfill({ json: browserFixture() }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible();
}

async function openSlotPicker(page: Page, nodeId: string, label: string) {
  await page.getByLabel('계보 노드 선택', { exact: true }).selectOption(nodeId);
  const editor = page.getByTestId('p86-node-editor');
  await editor.getByRole('button', { name: `${label} 선택`, exact: true }).click();
  return editor;
}

test('한국 출시 미확인·2차 날짜·명칭 대체는 서로 구분된다', async ({ page }) => {
  await openReference(page);
  await expect(page.getByTestId('ref-available-count')).toHaveText('1');
  await expect(page.getByTestId('ref-unknown-count')).toHaveText('7');
  await expect(page.getByTestId('ref-unavailable-count')).toHaveText('0');
  let editor = await openSlotPicker(page, 'target', '본육성 대상');
  await expect(page.locator('.candidate-button')).toHaveCount(1);
  await page.getByTestId('costume-detail-costume_a').click();
  const technicalA = page.getByTestId('p86-costume-detail');
  await expect(technicalA).toContainText('2차 자료 날짜 2026-10-30');
  await expect(technicalA).toContainText('출처 번역 · 공식명칭 미확인');
  await page.keyboard.press('Escape');
  if (await editor.isVisible()) await editor.getByRole('button', { name: '편집 닫기', exact: true }).click();
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
  editor = await openSlotPicker(page, 'target', '본육성 대상');
  await page.getByLabel('캐릭터·의상·별칭 검색', { exact: true }).fill('에이별칭');
  await expect(page.locator('.candidate-button')).toHaveCount(1);
  await page.getByLabel('캐릭터·의상·별칭 검색', { exact: true }).fill(costumeName('costume_b'));
  await page.getByTestId('costume-detail-costume_b').click();
  const technicalB = page.getByTestId('p86-costume-detail');
  await expect(technicalB).toContainText('한·일 혼합 표시 · 번역 미확인');
  await expect(page.getByTestId('ref-candidate-costume_b')).toContainText('출시 미확인');
  await expect(technicalB).toContainText('한국 출시 미확인');
  await page.getByTestId('ref-candidate-costume_b').click();
  if (await editor.isVisible()) await editor.getByRole('button', { name: '편집 닫기', exact: true }).click();
  await page.getByLabel('비교 기준일 · Asia/Seoul').fill('2026-10-29');
  await expect(page.getByTestId('ref-available-count')).toHaveText('0');
  await expect(page.getByTestId('ref-unknown-count')).toHaveText('7');
  await expect(page.getByTestId('ref-unavailable-count')).toHaveText('1');
  await expect(page.locator('img')).toHaveCount(0);
});

test('공개식 상성·적성·6배치가 별도 모드 없이 기본 동작한다', async ({ page }) => {
  await openReference(page);
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
  const slots = ['본육성 대상', '부모 A', '부모 B', '조부 A1', '조부 A2', '조부 B1', '조부 B2'];
  const nodeIds = ['target', 'parentA', 'parentB', 'grandA1', 'grandA2', 'grandB1', 'grandB2'];
  for (const [index, label] of slots.entries()) {
    const editor = await openSlotPicker(page, nodeIds[index]!, label);
    await page.getByTestId(`ref-candidate-costume_${'abcdefg'[index]}`).click();
    if (await editor.isVisible()) await editor.getByRole('button', { name: '편집 닫기', exact: true }).click();
  }
  await expect(page.getByTestId('ref-total')).toHaveText('25');
  await page.getByTestId('p87-factor-parentA').selectOption('dirt');
  await expect(page.getByTestId('p86-node-editor')).toHaveCount(0);
  await page.getByText('적성 보정 과정', { exact: true }).click();
  await expect(page.locator('.p87-aptitude-detail')).toContainText('★3');
  await expect(page.getByTestId('ref-aptitude-dirt').locator('b')).toHaveText('F');
  await expect(page.getByText('시작 적성은 A 상한입니다.', { exact: false })).toBeVisible();
  await page.getByTestId('p86-arrange-preview').click();
  await expect(page.getByTestId('ref-arrangement')).toHaveCount(6);
  await expect(page.getByRole('button', { name: '참고 배치 1 적용', exact: true })).toBeEnabled();
  await expect(page.getByTestId('ref-total')).toHaveText('25');
  await expect(page.getByRole('heading', { name: '기본 상성', exact: true })).toBeVisible();
  const scores = await page.locator('.arrangement-heading>b').allTextContents();
  expect(scores.map(Number)).toEqual([25, 25, 23, 21, 19, 19]);
  const parentBefore = await page.getByTestId('p86-edit-parentA').textContent();
  await page.getByRole('button', { name: '참고 배치 1 적용', exact: true }).click();
  await expect(page.getByTestId('p86-edit-parentA')).toHaveText(parentBefore!);
  await expect(page.getByLabel('검증 전 참고 합산으로 후보·배치 비교', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('reference.png'), fullPage: true });
});

test('staging 계약은 그대로 연결하지 않고 오류를 알린다', async ({ page }) => {
  await page.route('**/__local/p1-reference', (route) => route.fulfill({ json: { contract: 'uma-p1-staging' } }));
  await page.goto('/?view=fixture');
  await page.getByRole('button', { name: '로컬 준비 데이터 열기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('스냅샷 계약 검증에 실패');
  await expect(page.getByRole('heading', { name: '인자 계보 설계', exact: true })).toBeVisible();
});
