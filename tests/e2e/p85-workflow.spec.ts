import { costumeName, skillName } from './name-search-data';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedPlan } from '../../src/domain/saved-plan';
import { openPlanningNode, showDetailedReference, showReference } from './p85-navigation';
import { closeLineageNode, openLineageNode } from './p86-navigation';

import { focusMob } from './p9-lineage';

const artifacts = join(process.cwd(), '.preview/p87-artifacts/regression-p86');
async function ready(page: Page, skills = false) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto(skills ? '/?view=skills' : '/');
  await expect(page.getByRole('heading', { name: skills ? '대회별 스킬 평가' : '나의 인자 계보', exact: true })).toBeVisible({ timeout: 30000 });
}
async function choose(page: Page, label: string, id: string) {
  await openLineageNode(page, label === '부모 A' ? 'parentA' : 'parentB');
  await page.getByRole('button', { name: `${label} 선택`, exact: true }).click();
  await page.getByLabel('캐릭터·의상·별칭 검색', { exact: true }).fill(costumeName(id));
  const image = page.getByTestId(`ref-candidate-${id}`).getByTestId(`game-asset-costume-${id}`).locator('img');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 128)).toBe(true);
  await page.getByTestId(`ref-candidate-${id}`).click();
  await closeLineageNode(page);
}
async function exportCurrent(page: Page, path: string): Promise<SavedPlan> {
  const pending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  const download = await pending; await download.saveAs(path);
  return JSON.parse(await readFile(path, 'utf8')) as SavedPlan;
}

test('기본·웨딩 의상은 선택/7인/31인/복원에서 같은ID 이미지를 유지하며 백인자는 인자작 계획에서만 편집한다', async ({ page }, info) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await mkdir(artifacts, { recursive: true }); await ready(page);
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
  await expect(page.getByRole('button', { name: '백인자·스킬', exact: true })).toHaveCount(0);
  for (const [label, basic, wedding] of [['부모 A', '102401', '102402'], ['부모 B', '101801', '101802']]) {
    await choose(page, label!, basic!);
    const slot = page.getByTestId(label === '부모 A' ? 'ref-slot-parentA' : 'ref-slot-parentB');
    const basicSrc = await slot.getByTestId(`game-asset-costume-${basic}`).locator('img').getAttribute('src');
    await choose(page, label!, wedding!);
    const weddingImage = slot.getByTestId(`game-asset-costume-${wedding}`).locator('img');
    await expect(weddingImage).toHaveAttribute('src', new RegExp(`costumes/${wedding}\\.png$`));
    expect(await weddingImage.getAttribute('src')).not.toBe(basicSrc);
  }
  await showDetailedReference(page);
  const mob = await focusMob(page, 'ancestor_7');
  await mob.getByTestId('p87-factor-ancestor_7').selectOption('medium');
  await expect(mob.getByTestId('p87-factor-ancestor_7').locator('option:checked')).toHaveText('중거리 ★★★');
  await expect(page.getByTestId('ref-slot-parentA').getByTestId('game-asset-costume-102402').locator('img')).toHaveAttribute('src', /costumes\/102402\.png$/);
  await openLineageNode(page, 'parentA');
  const instance = await page.getByTestId('p8-factor-instance-id').getAttribute('data-instance-uuid');
  expect(instance).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByTestId('p7-lineage-panel')).toHaveCount(0);
  await closeLineageNode(page);
  await page.getByTestId('ref-slot-parentA').screenshot({ path: join(artifacts, `${info.project.name}-wedding-lineage-card.png`) });
  const panel = await openPlanningNode(page, 'parentA');
  await expect(page.getByRole('heading', { name: '인자작 계획', exact: true })).toBeVisible();
  await expect(page.getByTestId('p8-factor-instance-id')).toHaveAttribute('data-instance-uuid', instance!);
  await panel.getByTestId('p7-white-search').fill(skillName('201601'));
  await panel.getByTestId('p7-add-owned-201601').click();
  await panel.getByLabel('터다지기 실제 보유 별수', { exact: true }).selectOption('2');
  await page.getByTestId('p85-node-editor').screenshot({ path: join(artifacts, `${info.project.name}-factor-planning-editor.png`) });
  await showReference(page);
  await expect(page.getByTestId('p7-lineage-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '백인자·스킬', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled();
  const original = await exportCurrent(page, join(artifacts, `${info.project.name}-p85-workflow-v1.json`));
  expect(original.schemaVersion).toBe(1); expect(original.inputs.factorInstances.parentA?.factorInstanceId).toBe(instance);
  expect(original.inputs.whiteFactors.nodes.parentA?.ownerCostumeId).toBe('102402');
  expect(original.inputs.whiteFactors.nodes.parentA?.records[0]).toMatchObject({ skillId: '201601', status: 'owned', stars: 2 });
  expect(JSON.stringify(original)).not.toContain('game-assets/');
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'existing-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original), 'utf8') });
  await expect(page.getByTestId('p8-apply-restore')).toBeEnabled(); await page.getByTestId('p8-apply-restore').click();
  const restored = await exportCurrent(page, join(artifacts, `${info.project.name}-p85-workflow-restored-v1.json`));
  expect(restored.inputs).toEqual(original.inputs);
  await showReference(page);
  await expect(page.getByTestId('ref-slot-parentA').getByTestId('game-asset-costume-102402').locator('img')).toHaveAttribute('src', /costumes\/102402\.png$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test('대회 기본목록은14예정의짧은제목이며 과거39개·선택된과거ID·실제시나리오는별도로보존한다', async ({ page }, info) => {
  test.setTimeout(120000); await mkdir(artifacts, { recursive: true }); await ready(page, true);
  await expect(page.locator('#skills-event option[value="p5-kr-loh-jp-16"]')).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('#skills-event option')).toHaveCount(14);
  await expect(page.locator('#skills-event option[value="kr-cm-38"]')).toHaveCount(0);
  for (const label of await page.locator('#skills-event option').allTextContents()) {
    expect(label).toMatch(/^\[.+\] \[(챔미|LoH)\] \[(단거리|마일|중거리|장거리) \d+m\] /);
    expect(label).not.toMatch(/202[0-9]-|JP-|대응 후보|한국 /);
  }
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await expect(page.locator('#skills-event option:checked')).toHaveText('[무인도] [챔미] [중거리 2200m] 한신');
  await page.locator('#skills-scenario').selectOption('1');
  await page.locator('#skills-event').selectOption('kr-cm-44');
  await expect(page.locator('#skills-event option:checked')).toHaveText('[Beyond Dreams] [챔미] [중거리 2200m] デルマー');
  await expect(page.locator('#skills-scenario')).toHaveValue('1');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).uncheck();
  await expect(page.locator('#skills-event option:checked')).toHaveText('[Beyond Dreams] [챔미] [중거리 2200m] デルマー');
  await page.locator('.skills-context').screenshot({ path: join(artifacts, `${info.project.name}-compact-tournament-context.png`) });
  await page.getByTestId('p85-show-past-events').check();
  await expect(page.locator('#skills-event option')).toHaveCount(53);
  await page.locator('#skills-event').selectOption('kr-cm-38'); await page.getByTestId('p85-show-past-events').uncheck();
  await expect(page.locator('#skills-event')).toHaveValue('kr-cm-38');
  await expect(page.getByTestId('p85-restored-past-event')).toBeVisible();
  await expect(page.locator('#skills-event option')).toHaveCount(15);
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  const saved = await exportCurrent(page, join(artifacts, `${info.project.name}-historical-event-preserved-v1.json`));
  expect(saved.inputs.skillSettings.eventId).toBe('kr-cm-38'); expect(saved.inputs.skillSettings.scenarioId).toBe('1');
  expect(JSON.stringify(saved)).not.toContain('showPastEvents');
});
