import { legacyLineagePlan } from './p9-lineage';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { costumeName, skillName } from './name-search-data';

async function choose(page: Page, node: string, id: string) {
  await page.getByTestId(`p86-edit-${node}`).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('searchbox').fill(costumeName(id));
  await dialog.getByTestId(`${node.startsWith('ancestor') ? 'lineage' : 'ref'}-candidate-${id}`).click();
}

test('P8.7.1 부모 제한·넓은 계보·도구 모음·알림·테마·Footer를 확인한다', async ({ page }, info) => {
  test.setTimeout(90000); const out = '.preview/p871'; await mkdir(out, { recursive: true });
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await expect(page.getByTestId('p86-edit-target')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const slots = ['target', 'parentA', 'parentB', 'grandA1', 'grandA2', 'grandB1', 'grandB2'];
  for (const [index, slot] of slots.entries()) await choose(page, slot, `${1001 + index}01`);
  await page.getByTestId('p86-edit-parentA').click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('searchbox').fill(costumeName('100102'));
  await expect(dialog.getByTestId('ref-candidate-100102')).toBeDisabled();
  await expect(dialog.getByTestId('ref-candidate-100102')).toContainText('직접 부모');
  await page.keyboard.press('Escape');
  await page.getByTestId('p86-arrange-preview').click();
  const rows = page.getByTestId('ref-arrangement'); expect(await rows.count()).toBeGreaterThan(0);
  await rows.first().getByRole('button', { name: '참고 배치 1 적용', exact: true }).click();
  await expect(page.getByText('추천 계보를 적용했습니다.', { exact: true })).toBeVisible();
  await expect(page.getByText('추천 계보를 적용했습니다.', { exact: true })).toHaveCount(0, { timeout: 5000 });
  const normalWidth=(await page.locator('#main').boundingBox())!.width;
  await page.getByTestId('p86-toggle-lineage').click();
  await expect(page.getByLabel('중상작 로테이션 계획', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('유전자작 목표 사용', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('p873-mob')).toHaveCount(24);
  await expect(page.locator('[data-testid^="p86-edit-ancestor"]')).toHaveCount(0);
  await page.getByLabel('계보 노드 선택',{exact:true}).selectOption('ancestor_15');
  await page.getByTestId('p87-factor-ancestor_15').selectOption('medium');
  const workspace = page.locator('.pedigree-workspace');
  expect((await page.locator('#main').boundingBox())!.width).toBe(normalWidth);
  await expect(page.getByTestId('p86-lineage-settings')).toHaveCount(0);
  await expect(page.locator('.p871-tree-tools').getByRole('button', { name: '계보 비우기', exact: true })).toBeVisible();
  await workspace.screenshot({ path: `${out}/${info.project.name}-31-dark.png` });
  await page.getByRole('button', { name: '라이트 테마로 전환', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('p87-factor-ancestor_15')).toHaveValue('medium');
  await workspace.screenshot({ path: `${out}/${info.project.name}-31-light.png` });
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const footer = page.getByTestId('p871-footer');
  await footer.locator('summary').click();
  await expect(footer).toContainText('Kakao Games Corp.');
  await expect(footer).toContainText('제휴·후원 관계가 없습니다.');
  await footer.screenshot({ path: `${out}/${info.project.name}-footer.png` });
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow, noimageindex');
  expect((await (await page.request.get('/robots.txt')).text()).replaceAll('\r', '').trim()).toBe('User-agent: *\nAllow: /');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // A legacy invalid plan must load for repair, preserving every existing owner.
  const legacy = await legacyLineagePlan();
  legacy.inputs.referencePlan.nodes.parentB!.costumeId=legacy.inputs.referencePlan.nodes.parentA!.costumeId;
  legacy.inputs.factorInstances.parentB!.ownerCostumeId=legacy.inputs.referencePlan.nodes.parentB!.costumeId;
  if(legacy.inputs.whiteFactors.nodes.parentB)legacy.inputs.whiteFactors.nodes.parentB.ownerCostumeId=legacy.inputs.referencePlan.nodes.parentB!.costumeId;
  legacy.inputs.referencePlan.nodes.parentA!.locked=true;
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'legacy-invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.getByTestId('p8-apply-restore').click(); await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await expect(page.locator('.p871-lineage-warning')).toContainText('기존 기록은 유지합니다.');
  await expect(page.getByTestId('ref-total')).toHaveText('—');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '계보 비우기', exact: true }).click();
  await expect(page.locator('.p871-lineage-warning')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '계보 비우기', exact: true }).click();
  await expect(page.getByTestId('p86-edit-target')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '잠금된 혈통' })).toBeVisible();
  // Clearing never bypasses a saved physical bloodline lock.
  for (const [id, node] of Object.entries(legacy.inputs.referencePlan.nodes) as [string, { locked: boolean }][]) {
    if (!node.locked) continue;
    if (await page.getByTestId(`p87-factor-${id}`).count() === 0) await page.getByTestId('p86-toggle-lineage').click();
    await page.locator(`[data-tree-node="${id}"]`).getByRole('button', { name: /혈통 고정 해제/ }).click();
  }
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '계보 비우기', exact: true }).click();
  await expect(page.locator('.p871-lineage-warning')).toHaveCount(0);
  await expect(page.getByTestId('p86-edit-target')).toContainText('캐릭터 선택');
});

test('P8.7.1 새 빠른 선택은 비어 있고 목표10개·초과 안내·개인 목록·V1을 확인한다', async ({ page }, info) => {
  test.setTimeout(120000); const out = '.preview/p871'; await mkdir(out, { recursive: true });
  await page.goto('/?view=skills'); const panel = page.getByTestId('p6-priority-settings').first();
  await expect(panel).toBeVisible({ timeout: 30000 });
  const recommendations = page.getByTestId('p4-recommendations');
  expect((await recommendations.locator('.p4-run').boundingBox())!.y - (await recommendations.boundingBox())!.y).toBeLessThan(500);
  await expect(panel.locator('[data-testid^="p6-quick-"]')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '기본 빠른 선택 복원', exact: true })).toHaveCount(0);
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await page.locator('#skills-style').selectOption('pace'); await page.locator('#skills-scenario').selectOption('11');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  const ids = ['201601', '200452', '201262', '201332', '200432', '200012', '200052', '200142', '200162', '200182'];
  for (const id of ids) { await panel.getByRole('searchbox').fill(skillName(id)); await panel.getByTestId(`p6-skill-${id}`).click(); }
  await expect(panel.getByTestId('p6-priority-count')).toHaveText('10 / 10');
  await panel.getByRole('searchbox').fill(skillName('200222')); await expect(panel.getByTestId('p6-skill-200222')).toBeDisabled();
  await expect(panel).toContainText('최대 10개를 선택했습니다.');
  await panel.getByTestId('p87-quick-add-200222').click();
  await expect(panel.getByTestId('p6-priority-count')).toHaveText('10 / 10');
  await panel.getByTestId('p87-quick-manager').locator('summary').click();
  await page.getByRole('button', { name: '다크 테마로 전환', exact: true }).click();
  await panel.screenshot({ path: `${out}/${info.project.name}-10-skills-dark.png` });
  await recommendations.locator('.p4-run').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${info.project.name}-recommend-action-dark.png` });
  await expect(page.getByTestId('p6-comparison')).toBeVisible({ timeout: 60000 });
  for (const id of ids) await expect(page.getByTestId(`p6-target-${id}`)).toBeVisible();
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-export-json')).toBeEnabled({ timeout: 30000 });
  const download = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  const file = `${out}/${info.project.name}-10-goals-v1.json`; await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  expect(saved.inputs.globalPriorities.map((row: { skillId: string }) => row.skillId)).toEqual(ids);
  expect(JSON.stringify(saved.inputs)).not.toContain('uma-theme-v1');
  await page.goto('/?view=skills'); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId('p6-quick-200222').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('p871-footer')).toContainText('비영리·비공식');
});
