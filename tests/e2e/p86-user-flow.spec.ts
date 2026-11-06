import { supportName } from './name-search-data';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { SavedPlan } from '../../src/domain/saved-plan';
import { workspaceFingerprint } from '../../src/engine/plan-persistence';
import { closeLineageNode } from './p86-navigation';
import { focusMob } from './p9-lineage';
import { showReference, showSkills } from './p85-navigation';

const directory = '.preview/p87-artifacts/regression-p86';
const widths = [1440, 1024, 768, 375];
interface FlowArtwork { src: string; naturalWidth: number; naturalHeight: number; coordinates: number[] }
interface FlowCanvas { text: string[]; artwork: FlowArtwork[] }
interface FlowOutput {
  viewportWidth: number; variant: '7' | '31' | 'supports'; file: string;
  width: number; height: number; bytes: number; sha256: string;
  artworkIds: string[]; skillRows: number | null; allCurrentSkillNamesPrinted: boolean | null;
}
async function downloadFlowPng(page: Page, button: Locator, file: string, viewportWidth: number,
  variant: FlowOutput['variant'], expectedArtworkIds: string[], currentSkills?: { skillId: string; name: string }[]): Promise<FlowOutput> {
  await page.evaluate(() => {
    const state = window as unknown as { p86FlowCanvas: FlowCanvas; p86FlowRecorder?: boolean };
    state.p86FlowCanvas = { text: [], artwork: [] };
    if (state.p86FlowRecorder) return;
    state.p86FlowRecorder = true;
    const originalText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
      state.p86FlowCanvas.text.push(value);
      if (maxWidth === undefined) originalText.call(this, value, x, y); else originalText.call(this, value, x, y, maxWidth);
    };
    const originalImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...coordinates: number[]) {
      if (source instanceof HTMLImageElement) state.p86FlowCanvas.artwork.push({ src: source.currentSrc || source.src, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight, coordinates });
      Reflect.apply(originalImage, this, [source, ...coordinates]);
    };
  });
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent('download'); await button.click();
  const download = await pending; await download.saveAs(`${directory}/${file}`);
  const png = await readFile(`${directory}/${file}`);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect(width).toBe(variant === '7' ? 1914 : variant === '31' ? 3972 : 2080);
  expect(height).toBeGreaterThan(1000); expect(height).toBeLessThan(7000); expect(png.length).toBeGreaterThan(10000);
  const capture = await page.evaluate(() => (window as unknown as { p86FlowCanvas: FlowCanvas }).p86FlowCanvas);
  const text = capture.text.join('');
  expect(text).not.toMatch(/nodeId|costumeId|supportId|ancestor_|source_unspecified|trainers-|snapshot|128×128|300×400|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  const kind = variant === 'supports' ? '/game-assets/supports/art/' : '/game-assets/costumes/';
  expect(capture.artwork.map(image => new URL(image.src).pathname)).toEqual(expectedArtworkIds.map(id => `${kind}${id}.png`));
  for (const image of capture.artwork) {
    expect(image.naturalWidth).toBeGreaterThan(0); expect(image.naturalHeight).toBeGreaterThan(0);
    expect(image.coordinates).toHaveLength(4);
    expect(image.coordinates[2]! / image.coordinates[3]!).toBeCloseTo(image.naturalWidth / image.naturalHeight, 5);
  }
  let skillRows: number | null = null;
  if (currentSkills) {
    const groups = new Set(['필수 목표', '강력 우선 목표', '우선 목표', '유효 패시브 스킬', '그 외 유효 스킬']);
    skillRows = capture.text.filter(line => groups.has(line)).length;
    expect(skillRows).toBe(currentSkills.length);
    const normalized = text.replace(/\s/gu, '');
    for (const skill of currentSkills) expect(normalized).toContain(skill.name.replace(/\s/gu, ''));
    expect(text).toContain('스킬 수급표'); expect(text).toContain('터다지기'); expect(text).toContain('선행 코너○');
    expect(text).toContain('조건·확실성'); expect(text).toContain('획득은 보장하지 않습니다');
  } else {
    if(variant === '31') expect(capture.text.filter(line => line === '모브')).toHaveLength(24);
    expect(text).toContain('기본 상성 159점'); expect(text).toContain(variant === '7' ? '7인 계보' : '31인 계보 — 수동 적인자 설계');
    expect(text).toContain('본육성 대상'); expect(text).toContain('다이와 스칼렛');
  }
  const result = { viewportWidth, variant, file, width, height, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), artworkIds: expectedArtworkIds, skillRows, allCurrentSkillNamesPrinted: currentSkills ? true : null };
  await writeFile(`${directory}/${file.replace('.png', '.capture.json')}`, JSON.stringify({ ...result, ...capture, technicalIdentifiersPrinted: false }, null, 2));
  return result;
}
async function visiblePicturesReady(scope: Locator) {
  await scope.scrollIntoViewIfNeeded();
  const values = await scope.locator('img').evaluateAll(async images => {
    const visible = (images as HTMLImageElement[]).filter(image => {
      const rect = image.getBoundingClientRect();
      const clip = image.closest('[data-testid="p86-tree-viewport"]')?.getBoundingClientRect();
      return rect.left < innerWidth && rect.right > 0 && rect.top < innerHeight && rect.bottom > 0
        && (!clip || rect.left < clip.right && rect.right > clip.left && rect.top < clip.bottom && rect.bottom > clip.top);
    });
    return Promise.all(visible.map(async image => { await image.decode(); return image.naturalWidth > 0; }));
  });
  expect(values.length).toBeGreaterThan(0); expect(values.every(Boolean)).toBe(true);
}
test('실제 계보·본육성6장·핵심스킬·적용조건을 네 화면폭에서 읽고 편집할 수 있다', async ({ page }, info) => {
  test.setTimeout(240000); await mkdir(directory, { recursive: true });
  const sample = JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json', 'utf8')) as SavedPlan;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(Math.max(Date.parse('2026-11-05T12:00:00+09:00'), Date.parse(sample.createdAt), Date.parse(sample.updatedAt)) + 60000));
  await page.goto('/'); await expect(page.getByTestId('p86-unified-tree')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'p86-real-ids-user-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sample)) });
  await page.getByTestId('p8-apply-restore').click(); await showReference(page);
  const pngOutputs: FlowOutput[] = [];
  const lineageIds = Object.values(sample.inputs.referencePlan.nodes).slice(0,7).map(node => node.costumeId!);
  const observations: { width: number; phase: string; overflow: boolean }[] = [];
  const checkOverflow = async (width: number, phase: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    observations.push({ width, phase, overflow }); expect(overflow).toBe(false);
  };
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    const toggle = page.getByTestId('p86-toggle-lineage');
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await page.getByLabel('계보 확대', { exact: true }).selectOption('1');
    await page.getByLabel('계보 분기 이동', { exact: true }).selectOption('target');
    await expect(page.getByTestId('ref-total')).toHaveText('159');
    await visiblePicturesReady(page.getByTestId('p86-unified-tree'));
    await page.getByTestId('p86-unified-tree').screenshot({ path: `${directory}/${info.project.name}-${width}-user-tree7.png` });
    pngOutputs.push(await downloadFlowPng(page, page.getByTestId('p8-export-lineage-7'), `${info.project.name}-${width}-flow-7.png`, width, '7', lineageIds.slice(0, 7)));
    await toggle.click();
    await visiblePicturesReady(page.getByTestId('p86-unified-tree'));
    await page.getByTestId('p86-unified-tree').screenshot({ path: `${directory}/${info.project.name}-${width}-user-tree31-top.png` });
    pngOutputs.push(await downloadFlowPng(page, page.getByTestId('p8-export-lineage-31'), `${info.project.name}-${width}-flow-31.png`, width, '31', lineageIds));
    await page.getByLabel('계보 분기 이동', { exact: true }).selectOption('grandB2');
    await visiblePicturesReady(page.getByTestId('p86-unified-tree'));
    await page.getByTestId('p86-unified-tree').screenshot({ path: `${directory}/${info.project.name}-${width}-user-tree31-branch.png` });
    const editor = await focusMob(page, 'ancestor_30');
    await expect(editor.getByTestId('p87-factor-ancestor_30')).toHaveValue(sample.inputs.referencePlan.nodes.ancestor_30!.redFactor?.type ?? '');
    await expect(editor).toContainText('모브');
    expect(await editor.innerText()).not.toMatch(/ancestor_|nodeId|128×128|SHA-256|[0-9a-f]{8}-[0-9a-f]{4}-/);
    await editor.screenshot({ path: `${directory}/${info.project.name}-${width}-user-node-editor.png` });
    await closeLineageNode(page); await checkOverflow(width, 'lineage');
  }
  await showSkills(page);
  await page.getByTestId('p7-recommendation-scope').selectOption('global');
  const supportIds = ['30175', '30113', '30140', '10126', '30226', '30107'];
  for (let index = 0; index < 6; index++) {
    const clear = page.getByRole('button', { name: `서포트 ${index + 1} 비우기`, exact: true });
    if (await clear.isVisible()) await clear.click();
  }
  for (const [index, id] of supportIds.entries()) {
    await page.getByRole('button', { name: `서포트 ${index + 1} 선택`, exact: true }).click();
    await page.getByLabel('서포트 카드명 검색', { exact: true }).fill(supportName(id));
    await page.getByTestId(`support-candidate-${id}`).click();
    await page.locator(`#skills-lb-${index}`).selectOption('4');
  }
  const recommendation = page.getByTestId('p4-recommendations');
  const priorities = recommendation.getByTestId('p6-priority-settings');
  if (await priorities.getAttribute('open') === null) await priorities.locator('summary').click();
  await recommendation.getByRole('button', { name: '인자작 편성 추천', exact: true }).click();
  await expect(page.getByTestId('p4-primary-result').locator('.p4-card')).toHaveCount(6, { timeout: 60000 });
  const resultContext = page.getByTestId('p86-result-context');
  const applied = await resultContext.innerText();
  expect(applied).toContain('필수'); expect(applied).toContain('선행 코너');
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  const currentJsonPending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();
  const currentJson = await currentJsonPending;
  const currentJsonPath = `${directory}/${info.project.name}-four-width-current-v1.json`; await currentJson.saveAs(currentJsonPath);
  const currentPlan = JSON.parse(await readFile(currentJsonPath, 'utf8')) as SavedPlan;
  expect(currentPlan.resultSnapshot?.inputSignature).toBe(workspaceFingerprint(currentPlan.inputs));
  const currentDeck = currentPlan.resultSnapshot!;
  const currentSkills = await page.evaluate(async skillIds => {
    const snapshot = await (await fetch('/__local/p3-skill-support')).json() as { skills: { skillId: string; displayName: string }[] };
    return skillIds.map(skillId => ({ skillId, name: snapshot.skills.find(skill => skill.skillId === skillId)!.displayName }));
  }, currentDeck.skillIds);
  expect(currentSkills.length).toBeGreaterThan(0);
  await showSkills(page);
  const mainSix = page.locator('.skills-deck-panel');
  for (let index = 0; index < 6; index++) await expect(page.getByTestId(`skills-deck-slot-${index}`).locator('img')).toHaveAttribute('data-asset-id', supportIds[index]!);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    await mainSix.scrollIntoViewIfNeeded();
    await mainSix.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    expect(await mainSix.innerText()).not.toMatch(/ID \d{5}|300×400|128×128|SHA-256|2차 자료 날짜/);
    await mainSix.screenshot({ path: `${directory}/${info.project.name}-${width}-user-main-six.png` });
    await priorities.screenshot({ path: `${directory}/${info.project.name}-${width}-user-priorities.png` });
    await expect(resultContext).toHaveText(applied, { useInnerText: true });
    await resultContext.screenshot({ path: `${directory}/${info.project.name}-${width}-user-result-context.png` });
    pngOutputs.push(await downloadFlowPng(page, page.getByTestId('p8-export-support'), `${info.project.name}-${width}-flow-supports.png`, width, 'supports', currentDeck.cards.map(card => card.supportId), currentSkills));
    await checkOverflow(width, 'skills');
  }
  expect(errors).toEqual([]);
  expect(pngOutputs).toHaveLength(widths.length * 3);
  for (const width of widths) expect(pngOutputs.filter(output => output.viewportWidth === width).map(output => output.variant).sort()).toEqual(['31', '7', 'supports']);
  for (const variant of ['7', '31', 'supports'] as const) expect(new Set(pngOutputs.filter(output => output.variant === variant).map(output => output.sha256)).size).toBe(1);
  await writeFile(`${directory}/${info.project.name}-four-width-output.validation.json`, JSON.stringify({ viewports: widths, outputs: pngOutputs, actualButtonDownloads: true, currentResultSignatureMatches: true, currentSupportIds: currentDeck.cards.map(card => card.supportId), currentSkillRows: currentSkills, pageErrors: errors, source: 'Actual PNG button downloads at each viewport. Existing game IDs and current recommendation are checked; no engine recalculation or new game data.' }, null, 2));
  await writeFile(`${directory}/${info.project.name}-user-flow.validation.json`, JSON.stringify({ viewports: widths, observations, appliedResultContext: applied, mainSupportIds: supportIds, pageErrors: errors, source: 'Existing actual canonical IDs and V1 graph; user-authored factors and six-card selection. No new game data.' }, null, 2));
});
