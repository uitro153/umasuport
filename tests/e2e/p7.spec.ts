import { legacyLineagePlan, restoreLineage, focusMob } from './p9-lineage';
import { costumeName, skillName, supportName, chooseSkillGoal } from './name-search-data';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPlanningNode as openNode, runPlanningNode, showReference, showSkills, showDetailedReference } from './p85-navigation';
import { openLineageNode, closeLineageNode } from './p86-navigation';

/** These are explicit UI-entered examples using actual source IDs. They are
 * not screenshots or records of KR-observed completed factors. */
async function openReference(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
}
async function selectTop(page: Page, label: string, costumeId: string) {
  await showReference(page);
  const ids: Record<string, string> = { '본육성 대상': 'target', '부모 A': 'parentA', '부모 B': 'parentB', '조부 A1': 'grandA1', '조부 A2': 'grandA2', '조부 B1': 'grandB1', '조부 B2': 'grandB2' };
  await openLineageNode(page, ids[label]!);
  await page.getByRole('button', { name: `${label} 선택`, exact: true }).click();
  await page.getByLabel('캐릭터·의상·별칭 검색', { exact: true }).fill(costumeName(costumeId));
  await page.getByTestId(`ref-candidate-${costumeId}`).click();
  await closeLineageNode(page);
}
async function addRecord(panel: Locator, skillId: string, status: 'owned' | 'planned') {
  await panel.getByTestId('p7-white-search').fill(skillName(skillId));
  await panel.getByTestId(`p7-add-${status}-${skillId}`).click();
}
async function openNodePriorities(panel: Locator) {
  const settings = panel.getByTestId('p7-node-priorities').getByTestId('p6-priority-settings');
  if ((await settings.getAttribute('open')) === null) await settings.locator('summary').click();
  return settings;
}
async function setNodeGoal(panel: Locator, skillId: string, priority: 'preferred' | 'strong' | 'required') {
  const settings = await openNodePriorities(panel);
  await settings.getByLabel('우선순위 스킬명 검색', { exact: true }).fill(skillName(skillId));
  await settings.getByTestId(`p6-skill-${skillId}`).click();
  await settings.getByTestId(`p6-selected-${skillId}`).getByRole('combobox').selectOption(priority);
}
async function setRace(page: Page, event = 'kr-cm-39') {
  await expect(page.locator('#skills-event option[value="p5-kr-loh-jp-16"]')).toHaveCount(1, { timeout: 30000 });
  await page.locator('#skills-event').selectOption(event);
  await page.locator('#skills-style').selectOption('pace');
  await page.locator('#skills-scenario').selectOption('11');
  await page.locator('#skills-search').fill(skillName('200012'));
}

test('백인자 보유·계획·미입력은 소유 노드별로 구분하고 화면 전환과 인물 교체를 따른다', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openReference(page);
  await selectTop(page, '부모 A', '100101');
  await selectTop(page, '부모 B', '100201');
  let panel = await openNode(page, 'parentA');
  await expect(panel.getByTestId('p7-inventory-status')).toHaveValue('unentered');
  await expect(panel).toContainText('백인자가 없다는 뜻은 아닙니다.');
  await addRecord(panel, '201602', 'owned');
  await expect(panel.getByTestId('p7-record-201601-owned')).toContainText('사용자 직접 입력');
  await expect(panel.getByTestId('p7-record-201601-owned')).toContainText('검토 필요');
  await panel.getByLabel('터다지기 실제 보유 별수', { exact: true }).selectOption('2');
  await addRecord(panel, '201322', 'planned');
  await expect(panel.getByTestId('p7-record-201322-planned')).toContainText('미확보');
  await expect(panel.getByTestId('p7-node-priorities').getByTestId('p6-priority-count')).toHaveText('0 / 10');
  panel = await openNode(page, 'parentB');
  await expect(panel.getByTestId('p7-record-201601-owned')).toHaveCount(0);
  await expect(panel.getByTestId('p7-inventory-status')).toHaveValue('unentered');
  await panel.getByTestId('p7-inventory-status').selectOption('reviewed');
  await expect(panel).toContainText('사용자가 확인한 목록에 기록된 백인자가 없습니다.');
  panel = await openNode(page, 'parentA');
  await expect(panel.getByLabel('터다지기 실제 보유 별수', { exact: true })).toHaveValue('2');
  await showSkills(page);
  await expect(page.getByRole('heading', { name: '대회별 스킬 평가', exact: true })).toBeVisible();
  await showReference(page);
  await expect(page.getByTestId('p7-lineage-panel')).not.toBeVisible();
  panel = await openNode(page, 'parentA');
  await expect(panel.getByTestId('p7-record-201601-owned')).toBeVisible();
  await selectTop(page, '부모 A', '100301');
  panel = await openNode(page, 'parentA');
  await expect(panel.getByTestId('p7-record-201601-owned')).toHaveCount(0);
  await expect(panel.getByTestId('p7-record-201322-planned')).toHaveCount(0);
  await expect(panel.getByTestId('p7-inventory-status')).toHaveValue('unentered');
  panel = await openNode(page, 'parentB');
  await expect(panel.getByTestId('p7-inventory-status')).toHaveValue('reviewed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('깊은 조상의 기록과 잠금 명시 편집을 지키고 조부 재배치 후 실제 소유자를 따른다', async ({ page }) => {
  test.setTimeout(120000);
  await openReference(page);
  await restoreLineage(page, await legacyLineagePlan(true));
  for (const [label, id] of [['본육성 대상', '100901'], ['부모 A', '101401'], ['부모 B', '100601'], ['조부 A1', '102601'], ['조부 A2', '101001'], ['조부 B1', '100401'], ['조부 B2', '100301']]) await selectTop(page, label!, id!);
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  let panel = await openNode(page, 'grandA1');
  await addRecord(panel, '201601', 'owned');
  await showDetailedReference(page);
  let leaf = await focusMob(page, 'ancestor_15');
  await leaf.getByRole('button', { name: /혈통 고정$/ }).click();
  panel = await openNode(page, 'ancestor_15');
  await expect(panel.getByTestId('p7-white-search')).toBeDisabled();
  await expect(panel).toContainText('6명은 31인 범위 밖');
  await panel.getByLabel('잠금된 인자의 백인자 기록 편집', { exact: true }).check();
  await addRecord(panel, '200012', 'owned');
  await showDetailedReference(page);
  leaf = await focusMob(page, 'ancestor_15');
  await expect(leaf.getByRole('button', { name: /혈통 고정 해제$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(leaf.locator('[data-testid^="p86-edit-"]')).toHaveCount(0);
  panel = await openNode(page, 'target');
  await expect(panel.locator('.p7-generation-list').first().getByTestId('p7-relative-parentA')).toBeVisible();
  await panel.locator('.p7-deeper').locator('summary').click();
  await expect(panel.getByTestId('p7-relative-ancestor_15')).toContainText('시계(우) 방향○');
  await expect(panel.locator('.p7-generation-list').first()).not.toContainText('시계(우) 방향○');
  await showDetailedReference(page);
  await page.getByTestId('p86-arrange-preview').click();
  await page.getByRole('button', { name: '참고 배치 6 적용', exact: true }).click();
  panel = await openNode(page, 'grandA1');
  await expect(panel.getByTestId('p7-record-201601-owned')).toBeVisible();
  await expect(panel).toHaveAttribute('data-node-id', 'grandA1');
  await showDetailedReference(page);
  leaf = await focusMob(page, 'ancestor_15');
  await expect(leaf.getByRole('button', { name: /혈통 고정 해제$/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await openNode(page, 'grandA1');
  await page.screenshot({ path: test.info().outputPath('p7-lineage-owner.png'), fullPage: true });
});

test('부모 목표를 P6에 명시 전달하고 본육성 중복과 노드·전역 범위를 분리한다', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openReference(page);
  await selectTop(page, '부모 A', '101401');
  await selectTop(page, '부모 B', '100601');
  await showSkills(page);
  await setRace(page);
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('30024'));
  await page.getByTestId('support-candidate-30024').click();
  const recommendation = page.getByTestId('p4-recommendations');
  let priorities = recommendation.getByTestId('p6-priority-settings');
  if ((await priorities.getAttribute('open')) === null) await priorities.locator('summary').click();
  await chooseSkillGoal(priorities, '201601');
  await priorities.getByLabel('터다지기 우선순위', { exact: true }).selectOption('strong');
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('24', { timeout: 60000 });
  await showReference(page);
  let panel = await openNode(page, 'parentA');
  await addRecord(panel, '201601', 'owned');
  await setNodeGoal(panel, '201601', 'required');
  await setNodeGoal(panel, '201322', 'preferred');
  await panel.getByRole('button', { name: '선택한 인자의 서포트 추천', exact: true }).click();
  await expect(page.getByTestId('p7-recommendation-context')).toHaveAttribute('data-node-id', 'parentA');
  await expect(page.getByTestId('p7-acquisition-mode')).toHaveValue('current');
  await expect(page.getByTestId('p7-recommendation-context')).toContainText('전역 목표 1개는 별도로 보존');
  await expect(page.getByTestId('p6-target-201601')).toContainText('맞춤 기회 있음', { timeout: 60000 });
  await expect(page.getByTestId('p6-target-201322')).toContainText('맞춤 기회 있음');
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('8');
  await expect(page.getByTestId('p6-custom-base-score')).toHaveText('374');
  await expect(page.getByTestId('p7-supply-comparison').locator('[data-support-id="30024"]').first()).toHaveAttribute('data-support-id', '30024');
  await expect(page.getByTestId('p7-supply-201601')).toHaveAttribute('data-owned-node-ids', /parentA/);
  await expect(page.getByTestId('p7-supply-201601')).toContainText('일반 힌트');
  await expect(page.getByTestId('p7-recommendation-context')).toContainText('이 덱을 부모·조부 인자작용 덱으로 사용하지 않습니다.');
  // Node mode requires an explicit run. Switch context while that real worker
  // is running; the older owner may not publish a hidden requirement/result.
  await runPlanningNode(page);
  await expect(page.getByRole('button', { name: '편성 비교 중…', exact: true })).toBeVisible();
  await page.getByTestId('p7-node-select').selectOption('parentB');
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await expect(page.getByTestId('p7-lineage-panel').getByTestId('p6-priority-count')).toHaveText('0 / 10');
  await runPlanningNode(page);
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 60000 });
  await expect(page.getByTestId('p6-comparison')).toHaveCount(0);
  await page.getByTestId('p7-node-select').selectOption('parentA');
  await expect(page.getByTestId('p7-lineage-panel').getByTestId('p6-priority-count')).toHaveText('2 / 10');
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await page.getByTestId('p7-recommendation-scope').selectOption('global');
  await expect(page.getByTestId('p7-recommendation-context')).toHaveAttribute('data-node-id', 'global');
  priorities = recommendation.getByTestId('p6-priority-settings');
  // The P8.5 node editor owns its priority fields. Returning to global
  // remounts this independent details panel in its default collapsed state.
  if ((await priorities.getAttribute('open')) === null) await priorities.locator('summary').click();
  await expect(priorities.getByTestId('p6-priority-count')).toHaveText('1 / 10');
  await expect(priorities.getByTestId('p6-selected-201601').getByRole('combobox')).toHaveValue('strong');
  await expect(priorities.getByTestId('p6-selected-201322')).toHaveCount(0);
  await page.getByTestId('p7-node-select').selectOption('parentA');
  await runPlanningNode(page);
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('8', { timeout: 60000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('p7-parent-recommendation.png'), fullPage: true });
  await page.getByTestId('p6-comparison').screenshot({ path: test.info().outputPath('p7-score-comparison.png') });
  await page.getByTestId('p7-recommendation-context').screenshot({ path: test.info().outputPath('p7-node-context.png') });
  expect(errors).toEqual([]);
  panel = page.getByTestId('p7-lineage-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-node-id', 'parentA');
});

test('현재 인자작은 미래 카드를 제외하고 명시한 미래시에서만 수급을 허용한다', async ({ page }) => {
  test.setTimeout(150000);
  await openReference(page);
  await selectTop(page, '부모 A', '101401');
  await showSkills(page);
  await setRace(page, 'kr-cm-40');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  await page.getByRole('button', { name: '서포트 1 선택', exact: true }).click();
  await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName('10133'));
  await page.getByTestId('support-candidate-10133').click();
  await showReference(page);
  const panel = await openNode(page, 'parentA');
  await addRecord(panel, '203842', 'planned');
  await setNodeGoal(panel, '201601', 'required');
  await panel.getByRole('button', { name: '선택한 인자의 서포트 추천', exact: true }).click();
  const context = page.getByTestId('p7-recommendation-context');
  await expect(context).toHaveAttribute('data-mode', 'current');
  await expect(page.getByTestId('p6-target-201601')).toContainText('맞춤 기회 있음', { timeout: 60000 });
  await expect(page.getByTestId('p4-primary-result').getByTestId('p4-card-10133')).toHaveCount(0);
  await expect(page.getByTestId('p7-supply-203842').locator('[data-support-id="10133"]').first()).toHaveAttribute('data-support-id', '10133');
  await expect(page.getByTestId('p7-supply-203842')).toContainText('JP');
  const priorities = await openNodePriorities(page.getByTestId('p7-lineage-panel'));
  if ((await priorities.getAttribute('open')) === null) await priorities.locator('summary').click();
  await priorities.getByLabel('터다지기 우선순위 삭제', { exact: true }).click();
  await priorities.getByLabel('우선순위 스킬명 검색', { exact: true }).fill(skillName('203842'));
  await priorities.getByTestId('p6-skill-203842').click();
  await priorities.getByTestId('p6-selected-203842').getByRole('combobox').selectOption('required');
  await runPlanningNode(page);
  await expect(page.getByTestId('p6-required-failure')).toHaveAttribute('data-reason', 'unverified-source', { timeout: 60000 });
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await page.getByTestId('p7-acquisition-mode').selectOption('forecast');
  await expect(context).toHaveAttribute('data-mode', 'forecast');
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await runPlanningNode(page);
  await expect(page.getByTestId('p6-target-203842')).toContainText('맞춤 기회 있음', { timeout: 60000 });
  await expect(page.getByTestId('p4-primary-result').getByTestId('p4-card-10133')).toBeVisible();
  await expect(page.getByTestId('p6-custom-base-score')).toHaveText('378');
  await expect(context).toContainText('한국 적용 미인증');
  await page.getByTestId('p7-acquisition-mode').selectOption('current');
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await runPlanningNode(page);
  await expect(page.getByTestId('p6-required-failure')).toHaveAttribute('data-reason', 'unverified-source', { timeout: 60000 });
  await page.getByTestId('p7-node-select').selectOption('parentB');
  await expect(page.getByTestId('p7-acquisition-mode')).toHaveValue('current');
  await expect(page.getByTestId('p7-lineage-panel').getByTestId('p6-priority-count')).toHaveText('0 / 10');
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
