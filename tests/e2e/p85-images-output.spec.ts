import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedPlan } from '../../src/domain/saved-plan';
import { workspaceFingerprint } from '../../src/engine/plan-persistence';

const outputDirectory = join(process.cwd(), '.preview', 'p87-artifacts', 'regression-p86');
const now = '2026-11-05T12:00:00+09:00';
interface DrawnArtwork { src: string; naturalWidth: number; naturalHeight: number; coordinates: number[] }
interface CanvasCapture { text: string[]; artwork: DrawnArtwork[] }

/** Existing V1 example + deliberate UI test settings. Canonical game IDs are
 * real; factor records remain synthetic user statements, not observed items. */
async function samplePlan(): Promise<SavedPlan> {
  const plan = JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json', 'utf8')) as SavedPlan;
  plan.name = 'P8.6 이미지 계보 검증 ○◎ ★★★';
  plan.inputs.referenceFilters.includeUnknown = true;
  plan.inputs.selectedNodeId = null;
  plan.inputs.supportSettings = { ownedSupports: [], ownedOnly: false, allowBorrow: true };
  plan.inputs.skillSettings.deck = Array.from({ length: 6 }, () => ({ supportId: null, limitBreak: 0 }));
  delete plan.resultSnapshot;
  return plan;
}
async function ready(page: Page, plan: SavedPlan) {
  await page.clock.setFixedTime(new Date(Math.max(Date.parse(now), Date.parse(plan.createdAt), Date.parse(plan.updatedAt)) + 60_000));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '나의 인자 계보', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'p85-existing-v1-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan), 'utf8') });
  await expect(page.getByTestId('p8-apply-restore')).toBeEnabled();
  await page.getByTestId('p8-apply-restore').click();
  await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await expect(page.getByTestId('ref-total')).toHaveText('159');
}
async function installCanvasRecorder(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { p85Canvas: CanvasCapture; p85Recorder?: boolean };
    state.p85Canvas = { text: [], artwork: [] };
    if (state.p85Recorder) return;
    state.p85Recorder = true;
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
      state.p85Canvas.text.push(value);
      if (maxWidth === undefined) text.call(this, value, x, y); else text.call(this, value, x, y, maxWidth);
    };
    const image = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...coordinates: number[]) {
      if (source instanceof HTMLImageElement) state.p85Canvas.artwork.push({ src: source.currentSrc || source.src, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight, coordinates });
      Reflect.apply(image, this, [source, ...coordinates]);
    };
  });
}
async function downloadPng(page: Page, button: Locator, name: string, info: TestInfo) {
  await mkdir(outputDirectory, { recursive: true });
  await installCanvasRecorder(page);
  const pending = page.waitForEvent('download'); await button.click();
  const download = await pending; const path = join(outputDirectory, `${info.project.name}-${name}.png`);
  await download.saveAs(path);
  const png = await readFile(path);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
  expect(dimensions.width).toBeGreaterThan(1400); expect(dimensions.height).toBeLessThanOrEqual(32760); expect(dimensions.bytes).toBeGreaterThan(10000);
  const capture = await page.evaluate(() => (window as unknown as { p85Canvas: CanvasCapture }).p85Canvas);
  await writeFile(join(outputDirectory, `${info.project.name}-${name}.capture.json`), JSON.stringify({ dimensions, ...capture, note: 'Real downloaded PNG and actual drawImage/fillText calls; image identity uses canonical manifest paths. Visual review is separate.' }, null, 2), 'utf8');
  return { ...capture, dimensions, textJoined: capture.text.join(''), path };
}
function assertArtwork(capture: CanvasCapture, kind: 'costume' | 'support', ids: readonly string[]) {
  const directory = kind === 'costume' ? '/game-assets/costumes/' : '/game-assets/supports/art/';
  expect(capture.artwork).toHaveLength(ids.length);
  expect(capture.artwork.map((image) => new URL(image.src).pathname)).toEqual(ids.map((id) => `${directory}${id}.png`));
  for (const image of capture.artwork) {
    expect(image.naturalWidth).toBeGreaterThan(0); expect(image.naturalHeight).toBeGreaterThan(0);
    expect(image.coordinates).toHaveLength(4);
    expect(image.coordinates[2]! / image.coordinates[3]!).toBeCloseTo(image.naturalWidth / image.naturalHeight, 5);
  }
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); }

test('P8 V1 복원 후 7·31인 PNG에 정확한 의상 초상화를 그리고 모든 기존 기록을 유지한다', async ({ page }, info) => {
  test.setTimeout(180000); const plan = await samplePlan(); await ready(page, plan);
  const nodes = Object.values(plan.inputs.referencePlan.nodes);
  const sevenIds = nodes.slice(0, 7).map((node) => node.costumeId!);
  for (const id of sevenIds) await expect(page.locator(`img[data-asset-kind="costume"][data-asset-id="${id}"]`).first()).toHaveAttribute('src', `/game-assets/costumes/${id}.png`);
  const seven = await downloadPng(page, page.getByTestId('p8-export-lineage-7'), 'lineage-7-images', info);
  assertArtwork(seven, 'costume', sevenIds);
  expect(seven.textJoined).toContain('기본 상성 159점');
  expect(seven.textJoined).toContain('○◎ ★★★'); expect(seven.textJoined).toContain('부모 A');
  expect(seven.textJoined).not.toMatch(/nodeId|costumeId|parentA|unentered|snapshot|128×128/);
  const full = await downloadPng(page, page.getByTestId('p8-export-lineage-31'), 'lineage-31-images', info);
  assertArtwork(full, 'costume', sevenIds);
  expect(full.text.filter(text => text === '모브')).toHaveLength(24);
  for(const node of nodes.slice(7)) {
    if(node.redFactor) expect(full.textJoined).toContain(({turf:'잔디',dirt:'더트',sprint:'단거리',mile:'마일',medium:'중거리',long:'장거리',front:'도주',pace:'선행',late:'선입',end:'추입'})[node.redFactor.type] + ' ' + '★'.repeat(node.redFactor.stars));
  }
  expect(full.textJoined).not.toContain('ancestor_30');
  for (const instance of Object.values(plan.inputs.factorInstances)) expect(full.textJoined).not.toContain(instance.factorInstanceId);
  expect(full.dimensions.width).toBeGreaterThan(3000); expect(full.dimensions.height).toBeLessThan(2500);
  for (const node of nodes) expect(full.textJoined).not.toContain(`[${node.costumeId}]`);
  expect(full.dimensions.height).toBeGreaterThan(seven.dimensions.height);
  await writeFile(join(outputDirectory, `${info.project.name}-image-input-v1.json`), JSON.stringify(plan, null, 2), 'utf8');
  await noOverflow(page);
});

test('현재 추천 6장의 동일 카드ID 일러스트를 PNG에 포함하고 스킬·점수·이벤트 근거를 보존한다', async ({ page }, info) => {
  test.setTimeout(180000); await ready(page, await samplePlan());
  await page.getByRole('button', { name: '스킬·서포트 분석', exact: true }).first().click();
  await expect(page.locator('#skills-event')).toHaveValue('kr-cm-39');
  await page.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  const result = page.getByTestId('p4-primary-result');
  await expect(result.locator('.p4-card')).toHaveCount(6, { timeout: 90000 });
  const ids = await result.locator('.p4-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')!.replace('p4-card-', '')));
  for (const id of ids) await expect(result.locator(`img[data-asset-kind="support"][data-asset-id="${id}"]`).first()).toHaveAttribute('src', new RegExp(`/game-assets/supports/(?:icons|art)/${id}\\.png$`));
  const png = await downloadPng(page, page.getByTestId('p8-export-support'), 'support-6-images', info);
  assertArtwork(png, 'support', ids);
  for (const id of ids) expect(png.textJoined).not.toContain(`[${id}]`);
  expect(png.textJoined).toContain('정성 374 + 사용자 8 = 382'); expect(png.textJoined).toContain('스킬 수급표');
  expect(png.textJoined).toContain('터다지기'); expect(png.textJoined).toContain('선행 코너○');
  expect(png.textJoined).toContain('조건·확실성');
  expect(png.textJoined).toContain('획득은 보장하지 않습니다');
  expect(png.textJoined).not.toMatch(/supportId|source_unspecified|trainers-|snapshot|300×400/);
  expect(png.dimensions.height).toBeLessThan(7000);
  // Inspect the newly published result only as independent technical evidence;
  // the renderer above uses the live recommendation, never this saved cache.
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  const pendingJson = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  const json = await pendingJson; const jsonPath = join(outputDirectory, `${info.project.name}-support-output-current-v1.json`);
  await json.saveAs(jsonPath);
  const currentPlan = JSON.parse(await readFile(jsonPath, 'utf8')) as SavedPlan;
  expect(currentPlan.resultSnapshot?.inputSignature).toBe(workspaceFingerprint(currentPlan.inputs));
  expect(currentPlan.resultSnapshot?.cards.map((card) => card.supportId)).toEqual(ids);
  const currentIds = currentPlan.resultSnapshot!.skillIds;
  expect(currentIds).toHaveLength(48);
  const names = await page.evaluate(async (skillIds) => {
    const snapshot = await (await fetch('/__local/p3-skill-support')).json() as { skills: { skillId: string; displayName: string }[] };
    return skillIds.map((id) => ({ skillId: id, name: snapshot.skills.find((skill) => skill.skillId === id)!.displayName }));
  }, currentIds);
  const normalizedText = png.textJoined.replace(/\s/gu, '');
  for (const row of names) expect(normalizedText).toContain(row.name.replace(/\s/gu, ''));
  const tableGroups = new Set(['필수 목표', '강력 우선 목표', '우선 목표', '유효 패시브 스킬', '그 외 유효 스킬']);
  expect(png.text.filter((line) => tableGroups.has(line)).length).toBe(currentIds.length);
  await writeFile(join(outputDirectory, `${info.project.name}-support-table-coverage.validation.json`), JSON.stringify({ currentSignatureMatches: true, supportIds: ids, rowCount: currentIds.length, currentSkillRows: names, selectedEvents: currentPlan.resultSnapshot!.eventDecisions, allCurrentRowsPrinted: true, technicalIdsPrinted: false }, null, 2), 'utf8');
  await noOverflow(page);
});

test('이미지 요청이 실패해도 다른 의상으로 대체하지 않고 기존 이름·인자를 PNG에 남긴다', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.route(/\.(?:png|webp|jpe?g)(?:\?.*)?$/i, (route) => route.abort());
  const plan = await samplePlan(); await ready(page, plan);
  const png = await downloadPng(page, page.getByTestId('p8-export-lineage-7'), 'lineage-images-failed', info);
  expect(png.artwork).toHaveLength(0);
  expect(png.textJoined.replace(/\s/g, '')).toContain('이미지로딩실패');
  expect(png.textJoined).toContain('엘 콘도르 파사'); expect(png.textJoined).toContain('오구리 캡');
  for (const node of Object.values(plan.inputs.referencePlan.nodes).slice(0, 7)) expect(png.textJoined).not.toContain(`의상 ID ${node.costumeId}`);
  expect(png.textJoined).not.toContain(plan.inputs.factorInstances.parentA!.factorInstanceId);
  expect(png.textJoined).toContain('기본 상성 159점');
  await noOverflow(page);
});

test('비동기 이미지 로딩 중 입력을 바꾸면 다른 계획의 정보를 섞은 PNG를 내려받지 않는다', async ({ page }) => {
  test.setTimeout(120000); await ready(page, await samplePlan());
  await page.evaluate(() => {
    const state = window as unknown as { p85ReleaseImages: (() => void)[] };
    state.p85ReleaseImages = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, get: descriptor.get,
      set(this: HTMLImageElement, value: string) {
        if (this.crossOrigin === 'anonymous') state.p85ReleaseImages.push(() => descriptor.set!.call(this, value));
        else descriptor.set!.call(this, value);
      },
    });
  });
  const downloads: string[] = []; page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByTestId('p8-export-lineage-7').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { p85ReleaseImages: unknown[] }).p85ReleaseImages.length)).toBeGreaterThan(0);
  await page.getByLabel('비교 기준일 · Asia/Seoul', { exact: true }).fill('2026-11-06');
  await page.evaluate(() => { (window as unknown as { p85ReleaseImages: (() => void)[] }).p85ReleaseImages.forEach((release) => release()); });
  await expect(page.getByText('입력이 변경되어 이전 결과는 출력할 수 없습니다. 현재 조건으로 다시 계산하세요.', { exact: true })).toBeVisible();
  expect(downloads).toEqual([]);
  await noOverflow(page);
});
