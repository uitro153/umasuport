import { costumeName, skillName } from './name-search-data';
import { expect, test, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { legacyLineagePlan, focusMob } from './p9-lineage';
import type { SavedPlan } from '../../src/domain/saved-plan';

async function portraitsReady(viewport: Locator) {
  const original = await viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }));
  for (const image of await viewport.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    expect(await image.evaluate(async (element: HTMLImageElement) => { await element.decode(); return element.naturalWidth > 0; })).toBe(true);
  }
  await viewport.evaluate((element, position) => element.scrollTo(position.left, position.top), original);
}

test('P8.7 직접 선택·적인자 편집·상단 요약·수동 모브·개인 빠른 선택과 V1 독립성을 검수한다', async ({ page }, info) => {
  test.setTimeout(180000);
  const out = '.preview/p87-artifacts'; await mkdir(out, { recursive: true });
  const plan = await legacyLineagePlan();
  await page.clock.setFixedTime(new Date(Math.max(Date.parse(plan.updatedAt),Date.parse('2026-11-06T12:00:00+09:00'))+60000));
  // Explicit old user preferences are preserved; the application adds no defaults.
  await page.addInitScript(() => { if (localStorage.getItem('uma-user-quick-skills-v1') === null) localStorage.setItem('uma-user-quick-skills-v1', JSON.stringify({ version: 1, userEdited: true, skillIds: ['201601', '200452', '201262', '201332', '200432'] })); });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'existing-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await page.getByTestId('p8-apply-restore').click(); await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  await expect(page.locator('.p87-aptitude-item')).toHaveCount(10);
  await expect(page.locator('.pedigree-provenance,.skills-provenance')).toHaveCount(0);
  await portraitsReady(page.getByTestId('p86-tree-viewport'));
  await page.screenshot({ path: `${out}/${info.project.name}-seven.png`, fullPage: true });
  await page.getByTestId('p87-factor-parentA').selectOption('dirt');
  await page.getByTestId('p86-edit-parentA').click();
  const gallery = page.getByRole('dialog', { name: '부모 A 선택', exact: true });
  await expect(gallery).toBeVisible(); await expect(page.getByTestId('p86-node-editor')).toHaveCount(0);
  await gallery.locator('img').evaluateAll(async elements => {
    for (const element of elements) {
      const image = element as HTMLImageElement;
      const box = image.getBoundingClientRect();
      if (box.top < innerHeight && box.bottom > 0) await image.decode();
    }
  });
  await gallery.screenshot({ path: `${out}/${info.project.name}-direct-gallery.png` });
  await gallery.getByLabel('캐릭터·의상·별칭 검색', { exact: true }).fill(costumeName('100101'));
  await gallery.getByTestId('ref-candidate-100101').click(); await expect(gallery).toHaveCount(0);
  await expect(page.getByTestId('p86-edit-parentA')).toContainText('스페셜 위크');
  await expect(page.getByTestId('p87-factor-parentA').locator('option:checked')).toHaveText('더트 ★★★');
  await page.getByLabel('계보 노드 선택', { exact: true }).selectOption('parentA');
  const editor = page.getByTestId('p86-node-editor');
  await editor.getByLabel('부모 A 빨간 인자', { exact: true }).selectOption('long');
  await editor.getByLabel('부모 A 인자 별수', { exact: true }).selectOption('2');
  await editor.getByLabel('현재 인자·혈통 고정', { exact: true }).check();
  await editor.screenshot({ path: `${out}/${info.project.name}-direct-factor.png` });
  await editor.getByRole('button', { name: '편집 닫기', exact: true }).click();
  await expect(page.getByTestId('p87-factor-parentA').locator('option:checked')).toHaveText('장거리 ★★');
  await expect(page.getByTestId('p86-edit-parentA')).toBeDisabled();
  await page.getByTestId('p86-toggle-lineage').click();
  await expect(page.locator('[data-tree-node]')).toHaveCount(31);
  await expect(page.getByTestId('p86-lineage-settings')).toHaveCount(0);
  await expect(page.getByTestId('p873-mob')).toHaveCount(24);
  await portraitsReady(page.getByTestId('p86-tree-viewport'));
  await page.locator('.pedigree-workspace').screenshot({path:`${out}/${info.project.name}-manual-tree.png`});
  async function exportCurrent(stage: string): Promise<SavedPlan> {
    await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
    await expect(page.getByTestId('p8-export-json')).toBeEnabled({ timeout: 30000 });
    const download = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
    const file = `${out}/${info.project.name}-${stage}-v1.json`; await (await download).saveAs(file);
    return JSON.parse(await readFile(file, 'utf8')) as SavedPlan;
  }
  const beforePreferences = await exportCurrent('before-preferences');
  expect(new Set(Object.values(beforePreferences.inputs.factorInstances).map(item => item.factorInstanceId)).size).toBe(31);
  for (const [id, node] of Object.entries(plan.inputs.referencePlan.nodes)) {
    expect(beforePreferences.inputs.referencePlan.nodes[id]!.parentIds).toEqual(node.parentIds);
    if (id !== 'parentA') expect(beforePreferences.inputs.factorInstances[id]!.factorInstanceId).toBe(plan.inputs.factorInstances[id]!.factorInstanceId);
  }
  expect(beforePreferences.inputs.factorInstances.parentA!.factorInstanceId).not.toBe(plan.inputs.factorInstances.parentA!.factorInstanceId);
  await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await page.getByRole('button', { name: '스킬·서포트 분석', exact: true }).click();
  const priorities = page.getByTestId('p6-priority-settings').first();
  await expect(priorities).toBeVisible({ timeout: 30000 });
  const beforeTargets = await priorities.locator('.p6-priority-selected').textContent();
  await priorities.getByLabel('우선순위 스킬명 검색', { exact: true }).fill(skillName('200012'));
  await priorities.getByTestId('p87-quick-add-200012').click();
  await priorities.getByTestId('p87-quick-manager').locator('summary').click();
  await priorities.getByLabel('터다지기 빠른 선택 삭제', { exact: true }).click();
  await expect(priorities.getByTestId('p6-selected-201601')).toBeVisible();
  await expect(priorities.getByTestId('p6-quick-200012')).toBeVisible();
  await expect(priorities.locator('.p6-priority-selected')).toHaveText(beforeTargets!);
  await priorities.getByLabel('시계(우) 방향○ 빠른 선택 위로', { exact: true }).click();
  await priorities.screenshot({ path: `${out}/${info.project.name}-quick-skills.png` });
  const afterPreferences = await exportCurrent('after-preferences');
  expect(afterPreferences.inputs).toEqual(beforePreferences.inputs);
  expect(JSON.stringify(afterPreferences)).not.toContain('uma-user-quick-skills');
  await page.goto('/?view=skills'); await page.reload();
  await expect(page.getByTestId('p6-quick-200012').first()).toBeVisible({ timeout: 30000 });
  const refreshed = page.getByTestId('p6-priority-settings').first();
  await refreshed.getByTestId('p87-quick-manager').locator('summary').click();
  await refreshed.getByLabel('시계(우) 방향○ 빠른 선택 삭제', { exact: true }).click();
  await expect(refreshed.getByTestId('p6-quick-200012')).toHaveCount(0);
  await expect(refreshed.getByRole('button', { name: '기본 빠른 선택 복원', exact: true })).toHaveCount(0);
  await expect(refreshed.getByTestId('p6-quick-201601')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/manifest SHA|source_unspecified|p3-2026-|source_translation_not_officially_verified/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/'); await page.getByTestId('p86-toggle-lineage').click();
  const planned=await focusMob(page,'ancestor_15');
  await planned.getByTestId('p87-factor-ancestor_15').selectOption('dirt');
  await planned.getByRole('button',{name:/혈통 고정$/}).click();
  await expect(planned.getByTestId('p87-factor-ancestor_15')).toBeDisabled();
  const newPlan=await exportCurrent('locked-mob');
  expect(newPlan.inputs.referencePlan.nodes.ancestor_15).toMatchObject({costumeId:null,redFactor:{type:'dirt',stars:3},locked:true});
  expect(newPlan.inputs.factorInstances).toEqual({});
  expect(errors).toEqual([]);
  await writeFile(`${out}/${info.project.name}-workflow.validation.json`, JSON.stringify({ scoreBefore: 159, aptitudeBadges: 10, directGallery: true, factor: { type: 'long', stars: 2, locked: true }, manualMobEditing: true, quickSkillsPersistence: true, pageErrors: errors }, null, 2));
});
