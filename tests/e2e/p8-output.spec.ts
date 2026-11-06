import { costumeName, skillName } from './name-search-data';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { openPlanningNode as openNode, showReference, showSkills, showDetailedReference } from './p85-navigation';
import { openLineageNode, closeLineageNode } from './p86-navigation';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDefaultWorkspace, createSavedPlan, synchronizeFactorInstances } from '../../src/engine/plan-persistence';
import type { SavedPlan } from '../../src/domain/saved-plan';

const seven = [
  ['본육성 대상', '100901'], ['부모 A', '101401'], ['부모 B', '100601'],
  ['조부 A1', '102601'], ['조부 A2', '101001'], ['조부 B1', '100401'], ['조부 B2', '100301'],
] as const;
const historicalA = ['30175', '30108', '10122', '30231', '10005', '30159'];
const historicalB = ['30175', '30113', '30140', '10126', '30226', '30107'];
const artifactDirectory = join(process.cwd(), '.preview', 'p87-artifacts', 'regression-p86');
const now = '2026-11-05T12:00:00+09:00';

/** Canonical game IDs + deliberately user-authored factor records. These are
 * import/export test examples, not observed completed KR factor inventories. */
function userPlan(name: string, historicalCards?: string[]): SavedPlan {
  const inputs = createDefaultWorkspace(undefined, '2026-11-05');
  for (const [index, node] of Object.values(inputs.referencePlan.nodes).entries()) {
    node.costumeId = seven[index]?.[1] ?? '100101';
    if (index > 0) node.redFactor = { type: index === 1 ? 'dirt' : 'medium', stars: 3 };
  }
  inputs.factorInstances = synchronizeFactorInstances(inputs.referencePlan, inputs.whiteFactors, {});
  inputs.referenceFilters.includeUnknown = true;
  inputs.skillSettings = { ...inputs.skillSettings, eventId: 'kr-cm-39', scenarioId: '11', runningStyle: 'pace', mode: 'tournament', allowForecast: true };
  inputs.globalPriorities = [{ skillId: '201601', priority: 'required' }, { skillId: '201322', priority: 'preferred' }];
  inputs.whiteFactors.nodes.parentA = { nodeId: 'parentA', ownerCostumeId: '101401', inventoryStatus: 'partial', records: [
    { skillId: '201601', nameKo: '터다지기', nameJa: '地固め', stars: 2, status: 'owned', userEntered: true, classification: { status: 'review-required', evidence: ['사용자 입력 검증 예시 · 실제 게임 ID / 인자 자격 미검증'] } },
    { skillId: '201322', nameKo: '선행 코너○', nameJa: '先行コーナー○', stars: null, status: 'planned', userEntered: true, classification: { status: 'review-required', evidence: ['사용자 제작 목표 · 미확보'] } },
  ] };
  inputs.whiteFactors.nodes.ancestor_30 = { nodeId: 'ancestor_30', ownerCostumeId: '100101', inventoryStatus: 'partial', records: [
    { skillId: '200012', nameKo: '시계(우) 방향○', nameJa: '右回り○', stars: 3, status: 'owned', userEntered: true, classification: { status: 'review-required', evidence: ['사용자 입력 검증 예시 · 미인증'] } },
  ] };
  inputs.whiteFactors.nodePriorities.parentA = { ownerCostumeId: '101401', priorities: [{ skillId: '201601', priority: 'required' }] };
  const saved = createSavedPlan(inputs, { name, appVersion: 'p8-output-browser-test', snapshotIds: { reference: 'historical-reference-example', p3: 'historical-p3-example', p5: 'historical-p5-example' } }, { now });
  if (historicalCards) saved.resultSnapshot = {
    inputSignature: 'historical-reference-only-do-not-reuse', calculatedAt: now, snapshotIds: saved.snapshotIds,
    cards: historicalCards.map((supportId) => ({ supportId, limitBreak: 4, ownership: 'unregistered' })),
    // These are the supplied historical P4.1/P6 report points. The deliberately
    // incomplete two-ID cache below must never become current skill coverage.
    score: { coverageValue: 374, preferenceBonus: 8, customizedValue: 382 }, skillIds: ['201601', '201322'], greenSkillIds: [],
  };
  return saved;
}

async function ready(page: Page) {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible({ timeout: 30000 });
}
async function manager(page: Page) {
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  return page.getByTestId('p8-plan-manager');
}
async function importPlan(page: Page, plan: SavedPlan, apply: boolean) {
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'p8-output-user-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan), 'utf8') });
  await expect(page.getByTestId('p8-apply-restore')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-save-import').click();
  await expect(page.getByTestId('p8-plan-message')).toContainText('파일의 계획을 저장');
  if (apply) await page.getByTestId('p8-apply-restore').click();
  else await page.getByTestId('p8-cancel-restore').click();
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
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); }
async function captureCurrentPlan(page: Page, name: string, info: TestInfo): Promise<SavedPlan> {
  if (!(await page.getByTestId('p8-export-json').isVisible())) await manager(page);
  const pending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  const downloaded = await pending; const path = join(artifactDirectory, `${info.project.name}-${name}.json`);
  await downloaded.saveAs(path);
  return JSON.parse(await readFile(path, 'utf8')) as SavedPlan;
}

/** Capture the exact strings drawn into the real downloaded canvas. This is
 * not OCR: PNG dimensions/signature are checked separately, and root performs
 * the retained PNGs' visual inspection for clipping/glyph readability. */
async function recordCanvasText(page: Page) {
  await page.evaluate(() => {
    const target = window as unknown as { p8CanvasText: string[]; p8TextRecorderInstalled?: boolean };
    target.p8CanvasText = [];
    if (target.p8TextRecorderInstalled) return;
    target.p8TextRecorderInstalled = true;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      target.p8CanvasText.push(text);
      if (maxWidth === undefined) original.call(this, text, x, y); else original.call(this, text, x, y, maxWidth);
    };
  });
}
async function downloadPng(page: Page, button: Locator, name: string, info: TestInfo) {
  await mkdir(artifactDirectory, { recursive: true });
  await recordCanvasText(page);
  const pending = page.waitForEvent('download'); await button.click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const path = join(artifactDirectory, `${info.project.name}-${name}.png`);
  await download.saveAs(path); const png = await readFile(path);
  expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
  expect(dimensions.width).toBeGreaterThan(1400); expect(dimensions.height).toBeGreaterThan(900); expect(dimensions.height).toBeLessThan(32761); expect(dimensions.bytes).toBeGreaterThan(10000);
  const lines = await page.evaluate(() => (window as unknown as { p8CanvasText: string[] }).p8CanvasText);
  expect(lines.length).toBeGreaterThan(20);
  await writeFile(join(artifactDirectory, `${info.project.name}-${name}.canvas-text.json`), JSON.stringify({ dimensions, lines, note: 'Text drawn into the actual downloaded canvas; independent visual review required.' }, null, 2), 'utf8');
  return { ...dimensions, text: lines.join('\n'), continuousText: lines.join('') };
}

test('인자 개체 UUID는 기록 수정 시 유지하고 동일 의상 교체·혈통 재확인·잠금을 구분한다', async ({ page }) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await ready(page); await page.getByLabel('한국 출시 미확인도 선택 목록에 표시', { exact: true }).check();
  await selectTop(page, '부모 A', '100101'); await selectTop(page, '조부 B1', '100101');
  let panel = await openNode(page, 'parentA'); const originalId = await page.getByTestId('p8-factor-instance-id').getAttribute('data-instance-uuid');
  expect(originalId).toMatch(/^[0-9a-f-]{36}$/);
  await panel.getByTestId('p7-white-search').fill(skillName('201601')); await panel.getByTestId('p7-add-owned-201601').click();
  await panel.getByLabel('터다지기 실제 보유 별수', { exact: true }).selectOption('2');
  await expect(page.getByTestId('p8-factor-instance-id')).toHaveAttribute('data-instance-uuid', originalId!);
  await openNode(page, 'grandB1'); const otherId = await page.getByTestId('p8-factor-instance-id').getAttribute('data-instance-uuid'); expect(otherId).not.toBe(originalId);
  panel = await openNode(page, 'parentA');
  await page.getByTestId('p8-replace-instance').click();
  await expect(panel.getByTestId('p7-record-201601-owned')).toBeVisible();
  await page.getByTestId('p8-confirm-replace-instance').click();
  await expect(page.getByTestId('p8-factor-instance-id')).not.toHaveAttribute('data-instance-uuid', originalId!);
  await expect(panel.getByTestId('p7-record-201601-owned')).toHaveCount(0);
  await expect(page.getByTestId('p8-bloodline-review')).toContainText('조부 A1, 조부 A2');
  await expect(page.getByTestId('p8-skills-bloodline-warning')).toContainText('조상 연결 미확인');
  await showReference(page);
  await expect(page.getByTestId('p87-lineage-summary')).toContainText('연결 미확인');
  await expect(page.getByTestId('p7-lineage-panel')).not.toBeVisible();
  panel = await openNode(page, 'parentA');
  await expect(panel.getByTestId('p8-lineage-unconfirmed')).toBeVisible();
  await page.getByTestId('p8-bloodline-review').locator('summary').click(); await page.getByTestId('p8-confirm-bloodline').click(); await expect(page.getByTestId('p8-bloodline-review')).toHaveCount(0);
  await showDetailedReference(page);
  const editor = await openLineageNode(page, 'parentA');
  await editor.getByLabel('현재 인자·혈통 고정', { exact: true }).check();
  await closeLineageNode(page);
  panel = await openNode(page, 'parentA');
  await expect(page.getByTestId('p8-replace-instance')).toBeDisabled();
  await expect(panel.getByTestId('p7-white-search')).toBeDisabled();
  await noOverflow(page); expect(errors).toEqual([]);
});

test('현재 7인·31인 결과를 재계산 없이 트리 PNG로 내보내고 소유 ID·백인자는 V1에 온전히 보존한다', async ({ page }, info) => {
  test.setTimeout(150000); await ready(page); await manager(page);
  const saved = userPlan('계보 출력 검증 ○◎ ★★★'); await importPlan(page, saved, true); await showReference(page);
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  const sevenPng = await downloadPng(page, page.getByTestId('p8-export-lineage-7'), 'lineage-7', info);
  expect(sevenPng.continuousText).toContain('기본 상성 159점'); expect(sevenPng.continuousText).toContain('○◎ ★★★');
  expect(sevenPng.continuousText).toContain('더트 ★★★'); expect(sevenPng.continuousText).toContain('중거리 ★★★');
  expect(sevenPng.continuousText).not.toContain(saved.inputs.factorInstances.parentA!.factorInstanceId);
  for (const [, id] of seven) expect(sevenPng.continuousText).not.toContain(`의상 ID ${id}`);
  expect(sevenPng.continuousText).not.toContain('nodeId ancestor_30');
  const fullPng = await downloadPng(page, page.getByTestId('p8-export-lineage-31'), 'lineage-31', info);
  expect(fullPng.height).toBeGreaterThan(sevenPng.height);
  expect(fullPng.width).toBeGreaterThan(3000); expect(fullPng.height).toBeLessThan(2500);
  for (const [id, instance] of Object.entries(saved.inputs.factorInstances)) { expect(fullPng.continuousText).not.toContain(`nodeId ${id}`); expect(fullPng.continuousText).not.toContain(instance.factorInstanceId); }
  expect(fullPng.continuousText).not.toMatch(/snapshot|source_unspecified|128×128|UUID|unentered/);
  const afterPng = await captureCurrentPlan(page, 'lineage-output-preserved-v1', info);
  expect(afterPng.inputs).toEqual(saved.inputs);
  expect(Object.keys(afterPng.inputs.factorInstances)).toHaveLength(31);
  expect(afterPng.inputs.whiteFactors.nodes.parentA!.records).toEqual(saved.inputs.whiteFactors.nodes.parentA!.records);
  expect(afterPng.inputs.whiteFactors.nodes.ancestor_30!.records).toEqual(saved.inputs.whiteFactors.nodes.ancestor_30!.records);
  await writeFile(join(artifactDirectory, `${info.project.name}-lineage-user-example.json`), JSON.stringify(saved, null, 2), 'utf8');
  await noOverflow(page);
});

test('실제 서포트 PNG와 저장 A/B의 현재 재추천·고정 6장 재평가·계보 입력 차이를 확인한다', async ({ page }, info) => {
  test.setTimeout(300000); const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await ready(page); await manager(page);
  const left = userPlan('비교 A ○◎ ★★★', historicalA); const right = userPlan('비교 B ○◎ ★★★', historicalB);
  right.inputs.factorInstances.parentA!.bloodlineStatus = 'unconfirmed';
  right.inputs.referencePlan.nodes.parentA!.redFactor = { type: 'turf', stars: 1 };
  right.inputs.whiteFactors.nodes.parentA!.records[0]!.stars = 1;
  right.inputs.whiteFactors.nodePriorities.parentA!.priorities = [{ skillId: '201322', priority: 'strong' }];
  await importPlan(page, left, true); await showReference(page);
  await showSkills(page);
  await expect(page.locator('#skills-event')).toHaveValue('kr-cm-39', { timeout: 30000 });
  await expect(page.locator('#skills-scenario')).toHaveValue('11');
  await page.locator('#skills-search').fill(skillName('200012'));
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const primary = page.getByTestId('p4-primary-result');
  await expect(primary.locator('.p4-card')).toHaveCount(6, { timeout: 90000 });
  await expect(page.getByTestId('p6-custom-base-score')).toHaveText('374');
  await expect(page.getByTestId('p6-preference-bonus')).toHaveText('8');
  const displayedIds = await primary.locator('.p4-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')!.replace('p4-card-', '')));
  const supportPng = await downloadPng(page, page.getByTestId('p8-export-support'), 'support-6', info);
  for (const id of displayedIds) expect(supportPng.continuousText).not.toContain(`[${id}]`);
  expect(supportPng.continuousText).toContain('터다지기'); expect(supportPng.continuousText).toContain('선행 코너○');
  expect(supportPng.continuousText).toContain('정성 374 + 사용자 8 = 382');
  expect(supportPng.continuousText).toContain('스킬 수급표'); expect(supportPng.continuousText).toContain('조건·확실성');
  expect(supportPng.continuousText).not.toMatch(/supportId|source_unspecified|trainers-|snapshot|300×400/);
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByRole('button', { name: '편성 비교 중…', exact: true })).toBeVisible();
  await page.locator('#skills-style').selectOption('end');
  await expect(page.getByTestId('p8-export-support')).toHaveCount(0);
  await manager(page); await importPlan(page, right, false);
  await page.getByTestId('p8-compare-left').selectOption(left.planId); await page.getByTestId('p8-compare-right').selectOption(right.planId);
  await page.getByTestId('p8-compare-plans').click(); const comparison = page.getByTestId('plan-comparison');
  await expect(comparison.getByTestId('plan-comparison-context')).toContainText('동일 계산 조건 비교');
  await expect(comparison.getByTestId('plan-comparison-score-0')).toHaveText('정성 374 + 사용자 8 = 맞춤 382', { timeout: 120000 });
  await expect(comparison.getByTestId('plan-comparison-score-1')).toHaveText('정성 374 + 사용자 8 = 맞춤 382', { timeout: 120000 });
  await expect(comparison.getByTestId('plan-comparison-skill-difference')).toContainText('새로 확보: 없음');
  await expect(comparison).toContainText('혈통 재확인 필요');
  const fixed = comparison.getByText('저장 당시 6장 자체를 현재 규칙으로 재평가', { exact: true });
  await expect(fixed).toHaveCount(2);
  await fixed.nth(0).click(); await fixed.nth(1).click();
  await expect(comparison.locator('.plan-comparison-side').nth(0)).toContainText('현재 정성 374 + 사용자 8 = 382 · 양립 48 · 패시브 스킬 9');
  await expect(comparison.locator('.plan-comparison-side').nth(1)).toContainText('현재 정성 374 + 사용자 8 = 382 · 양립 48 · 패시브 스킬 8');
  const differences = comparison.getByTestId('plan-comparison-node-differences'); await differences.locator('summary').first().click();
  const parent = comparison.getByTestId('plan-comparison-node-parentA'); await parent.locator('summary').click();
  await expect(parent).toContainText('터다지기'); await expect(parent).toContainText('선행 코너○'); await expect(parent).toContainText('잔디 ★ (1성)');
  await expect(comparison.getByTestId('p86-comparison-technical')).toHaveCount(0);
  await expect(comparison).not.toContainText(left.inputs.factorInstances.parentA!.factorInstanceId);
  await expect(comparison).not.toContainText(right.inputs.factorInstances.parentA!.factorInstanceId);
  expect(left.inputs.factorInstances.parentA!.factorInstanceId).not.toBe(right.inputs.factorInstances.parentA!.factorInstanceId);
  await expect(comparison.locator('.plan-seven-inputs')).toHaveCount(2);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(join(artifactDirectory, `${info.project.name}-comparison-a.json`), JSON.stringify(left, null, 2), 'utf8');
  await writeFile(join(artifactDirectory, `${info.project.name}-comparison-b.json`), JSON.stringify(right, null, 2), 'utf8');
  await writeFile(join(artifactDirectory, `${info.project.name}-comparison-current.txt`), await comparison.innerText(), 'utf8');
  await comparison.screenshot({ path: join(artifactDirectory, `${info.project.name}-comparison.png`) });
  const different = userPlan('추입 · 다른 조건 참고 비교', historicalB); different.inputs.skillSettings.runningStyle = 'end';
  await importPlan(page, different, false);
  await page.getByTestId('p8-compare-right').selectOption(different.planId); await page.getByTestId('p8-compare-plans').click();
  await expect(comparison.getByTestId('plan-comparison-context')).toContainText('서로 다른 조건의 참고 비교');
  await expect(comparison.getByTestId('plan-comparison-context')).toContainText('점수로 우열을 판정하지 않습니다');
  await expect(comparison).toContainText('다른 조건: runningStyle');
  await comparison.getByRole('button', { name: '비교 닫기', exact: true }).click();
  await noOverflow(page); expect(errors).toEqual([]);
});
