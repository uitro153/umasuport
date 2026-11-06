import { legacyLineagePlan, restoreLineage, focusMob } from './p9-lineage';
import { costumeName, skillName, supportName, chooseSkillGoal } from './name-search-data';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPlanningNode as openNode, showReference, showSkills, showDetailedReference } from './p85-navigation';
import { openLineageNode, closeLineageNode } from './p86-navigation';
import { readFile } from 'node:fs/promises';
import type { SavedPlan } from '../../src/domain/saved-plan';

const STORAGE_KEY = 'uma.p8.saved-plans.v1';
const seven = [
  ['본육성 대상', '100901'], ['부모 A', '101401'], ['부모 B', '100601'],
  ['조부 A1', '102601'], ['조부 A2', '101001'], ['조부 B1', '100401'], ['조부 B2', '100301'],
] as const;

/** Actual source IDs with deliberately user-authored factors/settings. These
 * examples are not a claim that an observed KR factor has these skills. */
async function openReference(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('p8-dirty-status')).toHaveText('저장 전 계획');
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
  await expect(page.getByTestId('p8-dirty-status')).toHaveText('미저장 변경 있음');
}
async function selectTop(page: Page, label: string, id: string) {
  await showReference(page);
  const ids: Record<string, string> = { '본육성 대상': 'target', '부모 A': 'parentA', '부모 B': 'parentB', '조부 A1': 'grandA1', '조부 A2': 'grandA2', '조부 B1': 'grandB1', '조부 B2': 'grandB2' };
  await openLineageNode(page, ids[label]!);
  await page.getByRole('button', { name: `${label} 선택`, exact: true }).click();
  await page.getByLabel('캐릭터·의상·별칭 검색', { exact: true }).fill(costumeName(id));
  await page.getByTestId(`ref-candidate-${id}`).click();
  await closeLineageNode(page);
}
async function manager(page: Page) {
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  const panel = page.getByTestId('p8-plan-manager');
  await expect(panel).toBeVisible({ timeout: 30000 });
  await expect(panel.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  return panel;
}
async function downloadPlan(page: Page, name = 'p8-current-user-input.json'): Promise<SavedPlan> {
  const event = page.waitForEvent('download');
  await page.getByTestId('p8-export-json').click();
  const download = await event;
  const path = test.info().outputPath(name);
  await download.saveAs(path);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const raw = await readFile(path, 'utf8');
  const plan = JSON.parse(raw) as SavedPlan;
  expect(plan.contract).toBe('uma-saved-plan');
  expect(raw).not.toContain('supportSkillLinks');
  return plan;
}
async function saveCurrent(page: Page, name: string) {
  await page.getByTestId('p8-plan-name').fill(name);
  await page.getByTestId('p8-save-new').click();
  await expect(page.getByTestId('p8-plan-message')).toContainText('새 계획으로 저장');
  return downloadPlan(page, `${name}.json`);
}
async function importJson(page: Page, value: unknown, name = 'user-plan.json') {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  await page.getByTestId('p8-import-json').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw, 'utf8') });
}
async function addRecord(panel: Locator, skillId: string, status: 'owned' | 'planned') {
  await panel.getByTestId('p7-white-search').fill(skillName(skillId));
  await panel.getByTestId(`p7-add-${status}-${skillId}`).click();
}
async function configureRace(page: Page) {
  await showSkills(page);
  await expect(page.locator('#skills-event option[value="p5-kr-loh-jp-16"]')).toHaveCount(1, { timeout: 30000 });
  await page.locator('#skills-event').selectOption('kr-cm-39');
  await page.locator('#skills-style').selectOption('pace');
  await page.locator('#skills-scenario').selectOption('11');
  await page.getByLabel('날짜가 있는 미래시 포함', { exact: true }).check();
  await page.locator('#skills-search').fill(skillName('200012'));
}
async function storedPlans(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as { plans: SavedPlan[]; lastPlanId: string | null }, STORAGE_KEY);
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); }

test('실제 ID로 입력한 31인·백인자·설정 전체를 저장하고 새로고침 후 원자적으로 같은 입력을 복원한다', async ({ page }) => {
  // Import the archived 31 physical owners, then edit all 24 mob factors and
  // current settings through the UI. Preserve the complete ownership/settings
  // round-trip, including legacy actual stars and hidden V1 fields.
  test.setTimeout(420000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openReference(page);
  const legacy = await legacyLineagePlan(true);
  legacy.inputs.skillSettings.deck=Array.from({length:6},()=>({supportId:null,limitBreak:0}));
  legacy.inputs.supportSettings={ownedSupports:[],ownedOnly:false,allowBorrow:true};
  for(let index=7;index<31;index++) legacy.inputs.referencePlan.nodes[`ancestor_${index}`]!.redFactor={type:'mile',stars:(index%3+1) as 1|2|3};
  await restoreLineage(page,legacy);
  for (const [label, id] of seven) await selectTop(page, label, id);
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  const parentEditor=await openLineageNode(page, 'parentA');
  await parentEditor.getByLabel('부모 A 빨간 인자', { exact: true }).selectOption('turf');
  await parentEditor.getByLabel('부모 A 인자 별수', { exact: true }).selectOption('3');
  await closeLineageNode(page);
  let panel = await openNode(page, 'parentA');
  await addRecord(panel, '201601', 'owned');
  await panel.getByLabel('터다지기 실제 보유 별수', { exact: true }).selectOption('2');
  await addRecord(panel, '201322', 'planned');
  await panel.getByTestId('p7-inventory-status').selectOption('reviewed');
  const goals = panel.getByTestId('p7-node-priorities').getByTestId('p6-priority-settings');
  if ((await goals.getAttribute('open')) === null) await goals.locator('summary').click();
  await goals.getByLabel('우선순위 스킬명 검색', { exact: true }).fill(skillName('201601'));
  await goals.getByTestId('p6-skill-201601').click();
  await goals.getByTestId('p6-selected-201601').getByRole('combobox').selectOption('required');
  await showDetailedReference(page);
  await expect(page.locator('[data-tree-node]')).toHaveCount(31);
  for (let index = 7; index < 31; index++) {
    const id = `ancestor_${index}`;
    const mob = await focusMob(page,id);
    await mob.getByTestId(`p87-factor-${id}`).selectOption(index%2?'dirt':'mile');
    await expect(mob.getByTestId(`p87-factor-${id}`).locator('option:checked')).toHaveText(`${index%2?'더트':'마일'} ${'★'.repeat(index%3+1)}`);
  }
  await page.getByTestId('p86-arrange-preview').click();
  await page.getByRole('button', { name: '참고 배치 6 적용', exact: true }).click();
  // All 31 physical owners and deep links survive the arrangement in this
  // same tree; they must not be copied by screen position.
  await expect(page.locator('[data-tree-node]')).toHaveCount(31);
  const lockedMob=await focusMob(page,'ancestor_30');
  await lockedMob.getByRole('button',{name:/혈통 고정$/}).click();
  const lockEditor = await openLineageNode(page, 'parentB');
  await lockEditor.getByLabel('현재 인자·혈통 고정', { exact: true }).check();
  await closeLineageNode(page);
  if (await page.getByTestId('p86-toggle-lineage').getAttribute('aria-expanded') === 'false') await page.getByTestId('p86-toggle-lineage').click();
  panel = await openNode(page, 'ancestor_15');
  if (await panel.getByTestId('p7-white-search').isDisabled()) await panel.getByLabel('잠금된 인자의 백인자 기록 편집', { exact: true }).check();
  await addRecord(panel, '200012', 'owned');
  await expect(panel.getByLabel('시계(우) 방향○ 실제 보유 별수', { exact: true })).toHaveValue('');
  await configureRace(page);
  const supportIds = ['30175', '30108', '10122', '30231', '10005', '30159'];
  for (const [index, id] of supportIds.entries()) {
    await page.getByRole('button', { name: `서포트 ${index + 1} 선택`, exact: true }).click();
    await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName(id));
    await page.getByTestId(`support-candidate-${id}`).click();
    await page.locator(`#skills-lb-${index}`).selectOption(String(index % 5));
  }
  await page.locator('#skills-preference').selectOption('stability');
  await page.getByTestId('p7-recommendation-scope').selectOption('global');
  const recommendation = page.getByTestId('p4-recommendations');
  const priorities = recommendation.getByTestId('p6-priority-settings');
  if ((await priorities.getAttribute('open')) === null) await priorities.locator('summary').click();
  await chooseSkillGoal(priorities, '201601');
  await priorities.getByTestId('p6-selected-201601').getByRole('combobox').selectOption('strong');
  await recommendation.locator('.p4-ownership>summary').click();
  for (const [index, id] of supportIds.slice(0, 3).entries()) {
    await page.getByLabel('보유 카드명 검색', { exact: true }).fill(supportName(id));
    await page.getByTestId(`p4-own-${id}`).click();
    await page.getByLabel(`보유 ${id} 돌파`, { exact: true }).selectOption(String(index + 1));
  }
  await page.getByLabel('보유 카드로 추천 범위 제한', { exact: true }).check();
  await page.getByLabel('미보유 카드 1장 대여 허용', { exact: true }).uncheck();
  await page.getByTestId('p7-node-select').selectOption('parentA');
  await page.getByTestId('p7-acquisition-mode').selectOption('forecast');
  await manager(page);
  const original = await saveCurrent(page, 'P8 실제ID 사용자입력 31인');
  expect(Object.values(original.inputs.referencePlan.nodes).filter((row) => row.costumeId)).toHaveLength(31);
  expect(new Set(Object.values(original.inputs.factorInstances).map((row) => row.factorInstanceId)).size).toBe(31);
  expect(original.inputs.whiteFactors.nodes.parentA?.records).toEqual(expect.arrayContaining([expect.objectContaining({ skillId: '201601', status: 'owned', stars: 2 }), expect.objectContaining({ skillId: '201322', status: 'planned', stars: null })]));
  expect(original.inputs.whiteFactors.nodes.ancestor_15?.records[0]?.stars).toBeNull();
  expect(original.inputs.whiteFactors.nodePriorities.parentA?.priorities).toEqual([{ skillId: '201601', priority: 'required' }]);
  for(const [id,instance] of Object.entries(legacy.inputs.factorInstances)) {
    expect(original.inputs.factorInstances[id]!.factorInstanceId).toBe(instance.factorInstanceId);
    expect(original.inputs.factorInstances[id]!.ownerCostumeId).toBe(instance.ownerCostumeId);
  }
  expect(original.inputs.referencePlan.nodes.ancestor_30?.locked).toBe(true);
  expect(original.inputs.referencePlan.nodes.parentB?.locked).toBe(true);
  expect(original.inputs.skillSettings.deck).toEqual(supportIds.map((supportId, index) => ({ supportId, limitBreak: index % 5 })));
  // Removed controls must preserve the imported V1 values, not reset them to
  // fresh-workspace defaults or silently reactivate them in current calculation.
  expect(original.inputs.lineageDesign).toEqual(legacy.inputs.lineageDesign);
  expect(original.inputs.skillSettings.nodeModes.parentA).toBe('forecast');
  expect(original.inputs.globalPriorities).toEqual([{ skillId: '201601', priority: 'strong' }]);
  expect(original.inputs.supportSettings).toEqual({ ownedSupports: supportIds.slice(0, 3).map((supportId, index) => ({ supportId, limitBreak: index + 1 })), ownedOnly: true, allowBorrow: false });
  await page.reload();
  await manager(page);
  await expect(page.getByTestId('p8-active-plan')).toHaveCount(0);
  const fresh = await downloadPlan(page, 'p8-fresh-workspace-before-explicit-restore.json');
  expect(Object.values(fresh.inputs.referencePlan.nodes).filter((row) => row.costumeId)).toHaveLength(0);
  await page.getByTestId('p8-last-plan-preview').click();
  await expect(page.getByTestId('p8-restore-preview')).toContainText('캐릭터 7 / 7명 · 모브 24칸');
  await page.getByTestId('p8-apply-restore').click();
  await expect(page.getByTestId('p8-plan-message')).toContainText('함께 복원');
  const restored = await downloadPlan(page, 'p8-restored-exact-31-user-input.json');
  expect(restored.inputs).toEqual(original.inputs);
  expect(restored.planId).toBe(original.planId);
  expect((await storedPlans(page)).plans[0]?.inputs).toEqual(original.inputs);
  await expect(page.getByTestId('p8-dirty-status')).toHaveText('저장한 입력과 같음');
  await noOverflow(page);
  await page.getByTestId('p8-plan-manager').screenshot({ path: test.info().outputPath('p8-restored-manager.png') });
  expect(errors).toEqual([]);
});

test('저장 사본과 가져오기 충돌을 명시 처리하며 복제·이름 변경·삭제가 다른 계획을 바꾸지 않는다', async ({ page }) => {
  test.setTimeout(120000);
  await openReference(page);
  await selectTop(page, '부모 A', '100101');
  await manager(page);
  const a = await saveCurrent(page, '독립 계획 A');
  await page.getByTestId('p8-clone-plan').click();
  await page.getByTestId('p8-action-name').fill('독립 계획 B');
  await page.getByTestId('p8-confirm-name').click();
  const b = (await storedPlans(page)).plans.find((plan) => plan.name === '독립 계획 B')!;
  expect(b.planId).not.toBe(a.planId);
  expect(b.inputs.factorInstances).toEqual(a.inputs.factorInstances);
  const modified = structuredClone(b);
  modified.inputs.globalPriorities = [{ skillId: '201322', priority: 'preferred' }];
  await importJson(page, modified);
  await expect(page.getByTestId('p8-plan-id-collision')).toBeVisible();
  await expect(page.getByTestId('p8-apply-restore')).toBeDisabled();
  await page.getByTestId('p8-import-overwrite').click();
  await page.getByTestId('p8-cancel-action').click();
  expect((await storedPlans(page)).plans.find((plan) => plan.planId === b.planId)?.inputs).toEqual(b.inputs);
  await page.getByTestId('p8-import-overwrite').click();
  await page.getByTestId('p8-confirm-action').click();
  expect((await storedPlans(page)).plans.find((plan) => plan.planId === b.planId)?.inputs).toEqual(modified.inputs);
  expect((await storedPlans(page)).plans.find((plan) => plan.planId === a.planId)).toEqual(a);
  expect((await downloadPlan(page, 'p8-working-A-after-B-overwrite.json')).inputs).toEqual(a.inputs);
  await page.getByTestId('p8-apply-restore').click();
  expect((await downloadPlan(page, 'p8-working-B.json')).inputs).toEqual(modified.inputs);
  await page.getByTestId('p8-rename-plan').click();
  await page.getByTestId('p8-action-name').fill('이름 변경 B');
  await page.getByTestId('p8-confirm-name').click();
  await expect(page.getByTestId('p8-active-plan')).toContainText('이름 변경 B');
  await importJson(page, a);
  await page.getByTestId('p8-import-clone').click();
  await expect(page.getByTestId('p8-plan-id-collision')).toHaveCount(0);
  await page.getByTestId('p8-save-import').click();
  const importedCopy = (await storedPlans(page)).plans.find((plan) => plan.name === `${a.name} (가져온 사본)`)!;
  expect(importedCopy.planId).not.toBe(a.planId);
  expect(importedCopy.inputs.factorInstances).toEqual(a.inputs.factorInstances);
  await page.getByTestId('p8-cancel-restore').click();
  await page.getByTestId('p8-save-as').click();
  await page.getByTestId('p8-action-name').fill('다른 이름 C');
  await page.getByTestId('p8-confirm-name').click();
  const c = await downloadPlan(page, 'p8-save-as-C.json');
  expect(c.inputs).toEqual(modified.inputs);
  expect(c.planId).not.toBe(b.planId);
  await page.getByTestId('p8-delete-plan').click();
  await page.getByTestId('p8-cancel-action').click();
  expect((await storedPlans(page)).plans.some((plan) => plan.planId === c.planId)).toBe(true);
  await page.getByTestId('p8-delete-plan').click();
  await page.getByTestId('p8-confirm-action').click();
  const final = await storedPlans(page);
  expect(final.plans.some((plan) => plan.planId === c.planId)).toBe(false);
  expect(final.plans.find((plan) => plan.planId === a.planId)).toEqual(a);
  expect((await downloadPlan(page, 'p8-current-input-preserved-after-delete.json')).inputs).toEqual(modified.inputs);
  await noOverflow(page);
});

test('손상·미래 버전·알 수 없는 ID·개체 UUID 충돌·잘못된 그래프·과대 파일을 거부하며 입력을 보존한다', async ({ page }) => {
  test.setTimeout(120000);
  await openReference(page);
  await selectTop(page, '부모 A', '100101');
  await selectTop(page, '부모 B', '100201');
  await manager(page);
  const before = await saveCurrent(page, '오류 전 보존 계획');
  const repositoryBefore = await storedPlans(page);
  const future = { ...structuredClone(before), schemaVersion: 999 };
  const missing = structuredClone(before);
  missing.inputs.referencePlan.nodes.parentA!.costumeId = 'missing_costume_900000';
  missing.inputs.factorInstances.parentA!.ownerCostumeId = 'missing_costume_900000';
  const collision = structuredClone(before);
  collision.inputs.factorInstances.parentB!.factorInstanceId = collision.inputs.factorInstances.parentA!.factorInstanceId;
  const cycle = structuredClone(before);
  cycle.inputs.referencePlan.nodes.parentA!.parentIds = ['target', 'grandA1'];
  for (const [index, candidate] of ['{bad JSON', future, missing, collision, cycle].entries()) {
    await importJson(page, candidate, `invalid-${index}.json`);
    await expect(page.getByTestId('p8-restore-preview')).toBeVisible();
    await expect(page.getByTestId('p8-apply-restore')).toBeDisabled();
    await expect(page.getByTestId('p8-validation-issues')).toBeVisible();
    expect((await downloadPlan(page, `p8-unchanged-after-invalid-${index}.json`)).inputs).toEqual(before.inputs);
    expect(await storedPlans(page)).toEqual(repositoryBefore);
    if (index === 1) {
      const event = page.waitForEvent('download');
      await page.getByTestId('p8-export-import-backup').click();
      const download = await event;
      const path = test.info().outputPath('p8-unsupported-future-original.json');
      await download.saveAs(path);
      expect(await readFile(path, 'utf8')).toBe(JSON.stringify(future));
    }
  }
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
  await expect(page.getByTestId('p8-plan-error')).toContainText('2MB');
  await expect(page.getByTestId('p8-restore-preview')).toHaveCount(0);
  expect((await downloadPlan(page, 'p8-unchanged-after-oversize.json')).inputs).toEqual(before.inputs);
  expect(await storedPlans(page)).toEqual(repositoryBefore);
  await noOverflow(page);
});

test('저장 공간·비공개 접근 오류를 성공으로 알리지 않고 JSON 백업과 기존 저장본을 보존한다', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript((key) => {
    const flags = window as unknown as Record<string, unknown>;
    flags.__p8FailWrites = false;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (flags.__p8FailWrites && storageKey === key) throw new DOMException('검증용 저장 공간 부족', 'QuotaExceededError');
      return original.call(this, storageKey, value);
    };
  }, STORAGE_KEY);
  await openReference(page);
  await selectTop(page, '부모 A', '100101');
  await manager(page);
  const before = await saveCurrent(page, '할당량 오류 전 계획');
  const stored = await storedPlans(page);
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__p8FailWrites = true; });
  await page.getByTestId('p8-plan-name').fill('저장 실패해야 하는 계획');
  await page.getByTestId('p8-save-new').click();
  await expect(page.getByTestId('p8-plan-error')).toBeVisible();
  await expect(page.getByTestId('p8-plan-message')).toHaveCount(0);
  expect(await storedPlans(page)).toEqual(stored);
  expect((await downloadPlan(page, 'p8-quota-failure-json-backup.json')).inputs).toEqual(before.inputs);
  await page.getByTestId('p8-save-overwrite').click();
  await page.getByTestId('p8-confirm-action').click();
  await expect(page.getByTestId('p8-plan-error')).toBeVisible();
  expect(await storedPlans(page)).toEqual(stored);
  await page.getByTestId('p8-cancel-action').click();
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('검증용 저장소 접근 금지', 'SecurityError'); } }); });
  await page.reload();
  await manager(page);
  await expect(page.getByTestId('p8-retry-storage')).toBeVisible();
  await expect(page.getByTestId('p8-plan-manager')).toContainText('저장 목록을 읽지 못했습니다');
  const backup = await downloadPlan(page, 'p8-private-storage-json-backup.json');
  expect(backup.inputs.referencePlan.rootId).toBe('target');
  await noOverflow(page);
});

test('단순 노드 조회는 dirty로 표시하지 않으며 실행 중 복원은 이전 Worker와 결과를 무효화한다', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const flags = window as unknown as Record<string, unknown>;
    flags.__p8Terminations = 0;
    const original = Worker.prototype.terminate;
    Worker.prototype.terminate = function () {
      flags.__p8Terminations = Number(flags.__p8Terminations) + 1;
      return original.call(this);
    };
  });
  await openReference(page);
  await selectTop(page, '부모 A', '101401');
  await configureRace(page);
  await manager(page);
  await expect(page.getByTestId('p8-dirty-status')).toHaveText('미저장 변경 있음');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  const original = await saveCurrent(page, '실행 경합 복원 계획');
  await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await openNode(page, 'parentA');
  await manager(page);
  await expect(page.getByTestId('p8-dirty-status')).toHaveText('저장한 입력과 같음');
  await page.getByRole('button', { name: '스킬·서포트 화면으로', exact: true }).click();
  await page.getByTestId('p7-recommendation-scope').selectOption('global');
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByRole('button', { name: '편성 비교 중…', exact: true })).toBeVisible();
  const terminations = await page.evaluate(() => Number((window as unknown as Record<string, unknown>).__p8Terminations));
  await manager(page);
  await page.getByTestId('p8-last-plan-preview').click();
  await page.getByTestId('p8-apply-restore').click();
  await expect(page.getByTestId('p8-plan-message')).toContainText('함께 복원');
  await expect.poll(() => page.evaluate(() => Number((window as unknown as Record<string, unknown>).__p8Terminations))).toBeGreaterThan(terminations);
  expect((await downloadPlan(page, 'p8-inflight-restored-inputs.json')).inputs).toEqual(original.inputs);
  await page.getByRole('button', { name: '스킬·서포트 화면으로', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '인자작 편성 추천', exact: true })).toBeEnabled();
  await noOverflow(page);
});
