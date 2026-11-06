import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import type { GameAssetManifest } from '../../src/domain/game-assets';

const phase = process.argv.includes('--p86') ? 'p86' : 'p85';
const workspace = resolve('.'); const artifactDirectory = resolve(`.preview/${phase}-artifacts`);
await mkdir(artifactDirectory, { recursive: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function allFiles(directory: string): Promise<string[]> {
  let items;
  try { items = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  return (await Promise.all(items.map((item) => item.isDirectory() ? allFiles(resolve(directory, item.name)) : [resolve(directory, item.name)]))).flat().sort();
}
async function directoryHash(directory: string) { const files = await allFiles(directory); return hash(Buffer.from(JSON.stringify(await Promise.all(files.map(async (file) => [relative(directory, file), hash(await readFile(file))]))))); }
async function command(name: string, text: string, environment: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', text], { cwd: workspace, encoding: 'utf8', env: { ...process.env, ...environment }, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`;
  await writeFile(resolve('.preview', `${phase}-static-${name}.log`), output, 'utf8');
  return { status: result.status, output };
}
const originalHashes: Record<string, string> = JSON.parse(await readFile('data/local/p8-persistence.validation.json', 'utf8')).immutableSources;
async function originalGuard() { for (const [file, expected] of Object.entries(originalHashes)) assert.equal(hash(await readFile(file)), expected, `Protected original changed: ${file}`); }
await originalGuard();
const normalBuild = await command('public-build', 'npm.cmd run build', { VITE_PRIVATE_ASSET_VALIDATION: '' });
assert.equal(normalBuild.status, 0, normalBuild.output.slice(-2000));
const publicFiles = await allFiles(resolve('dist'));
const publicGameImages = publicFiles.filter((file) => relative(resolve('dist'), file).replaceAll('\\', '/').startsWith('game-assets/') && /\.(png|jpe?g|webp|avif)$/i.test(file));
assert.equal(publicGameImages.length, 0, 'Default public dist must not include pending game-art files');
const inlineImages: string[] = [];
for (const file of publicFiles.filter((name) => /\.js$/i.test(name))) {
  const source = await readFile(file, 'utf8');
  if (/data:image\/png;base64,[A-Za-z0-9+/]{128,}|iVBORw0KGgoAAA[A-Za-z0-9+/]{128,}/.test(source)) inlineImages.push(relative(workspace, file));
}
assert.equal(inlineImages.length, 0, 'Game PNG binaries must not be inlined in JS');
const beforeRejectedBuild = await directoryHash(resolve('dist'));
const rejectedBuild = await command('rejected-private-outdir', 'npx.cmd vite build --outDir dist', { VITE_PRIVATE_ASSET_VALIDATION: '1' });
assert.notEqual(rejectedBuild.status, 0, 'Private validation must reject public dist override');
assert.match(rejectedBuild.output, /Private asset validation output must be/);
const afterRejectedBuild = await directoryHash(resolve('dist'));
assert.equal(afterRejectedBuild, beforeRejectedBuild, 'Rejected override changed public files before stopping');
const privateBuild = await command('private-build', 'npm.cmd run build:private-assets', { VITE_PRIVATE_ASSET_VALIDATION: '' });
assert.equal(privateBuild.status, 0, privateBuild.output.slice(-2000));
const privateDirectory = resolve('.preview/p85-private-static');
const privatePngFiles = (await allFiles(resolve(privateDirectory, 'game-assets'))).filter((file) => /\.png$/i.test(file));
const manifest = JSON.parse(await readFile('data/assets/p85-manifest.json', 'utf8')) as GameAssetManifest;
const assets: { path: string; width: number; height: number; kind: string; canonicalId: string; variant: string }[] = [];
for (const entry of manifest.entries) for (const variant of ['thumbnail', 'art'] as const) {
  const file = entry[variant]; if (file) assets.push({ path: file.path, width: file.width, height: file.height, kind: entry.kind, canonicalId: entry.canonicalId, variant });
}
assert.equal(assets.length, 1404); assert.equal(privatePngFiles.length, assets.length);
const pendingIds = manifest.entries.filter((entry) => entry.rightsStatus !== 'approved' || entry.publicRedistribution !== 'approved').map((entry) => `${entry.kind}:${entry.canonicalId}`);
assert.equal(pendingIds.length, 838, 'Do not silently promote image rights during technical verification');

// Two mounts of the real static output exercise Vite BASE_URL='./' without
// supplying the development game-DB endpoints. P9 full data loading is separate.
const publicDirectory = resolve('dist');
const mounts = [{ prefix: '/public/', directory: publicDirectory }, { prefix: '/nested/uma/', directory: privateDirectory }, { prefix: '/', directory: privateDirectory }];
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const mount = mounts.find((item) => path.startsWith(item.prefix));
    if (!mount) { response.writeHead(404).end(); return; }
    const suffix = path.slice(mount.prefix.length) || 'index.html';
    const file = resolve(mount.directory, suffix); const within = relative(mount.directory, file);
    if (within === '..' || within.startsWith(`..${sep}`)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address(); assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const browserOutcomes: { mount: string; expected: number; decoded: number; errors: unknown[]; canvasUntaintedSamples: number; completeAppShell: boolean }[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  // tsx preserves names on nested probe helpers; supply that serialization-only
  // identity helper in the test page. Application bundles do not depend on it.
  await page.addInitScript({ content: 'globalThis.__name = (value) => value;' });
  await page.goto(`${origin}/public/`);
  await page.locator('#root').waitFor();
  const publicImageStatus = await page.evaluate(async () => (await fetch('game-assets/costumes/100101.png')).status);
  assert.equal(publicImageStatus, 404, 'Unapproved game image should not exist in public static output');
  for (const mount of ['/', '/nested/uma/']) {
    await page.goto(`${origin}${mount}`);
    await page.locator('#root').waitFor();
    const completeAppShell = await page.evaluate(() => (document.getElementById('root')?.textContent?.length ?? 0) > 20);
    assert.ok(completeAppShell, 'Built static application shell did not mount');
    const result = await page.evaluate(async (rows) => {
      const errors: { path: string; error: string }[] = []; let decoded = 0; let next = 0;
      const load = async (row: typeof rows[number]) => {
        const image = new Image(); image.src = new URL(row.path, document.baseURI).href;
        await image.decode();
        if (image.naturalWidth !== row.width || image.naturalHeight !== row.height) throw new Error('Decoded dimensions do not match canonical manifest');
        return image;
      };
      await Promise.all(Array.from({ length: 8 }, async () => { while (next < rows.length) { const row = rows[next++]!; try { await load(row); decoded++; } catch (error) { errors.push({ path: row.path, error: String(error) }); } } }));
      const canvasRows = [rows.find((row) => row.kind === 'costume')!, rows.find((row) => row.kind === 'support' && row.variant === 'thumbnail')!, rows.find((row) => row.kind === 'support' && row.variant === 'art')!];
      let canvasUntaintedSamples = 0;
      for (const row of canvasRows) {
        const image = await load(row); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); context.getImageData(0, 0, 1, 1);
        if (!canvas.toDataURL('image/png').startsWith('data:image/png;base64,')) throw new Error('Canvas PNG export failed');
        canvasUntaintedSamples++;
      }
      return { decoded, errors, canvasUntaintedSamples };
    }, assets);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors)); assert.equal(result.decoded, assets.length); assert.equal(result.canvasUntaintedSamples, 3);
    browserOutcomes.push({ mount, expected: assets.length, ...result, completeAppShell });
    const samples = [assets.find((row) => row.kind === 'costume' && row.canonicalId === '101801')!, assets.find((row) => row.kind === 'costume' && row.canonicalId === '101802')!, assets.find((row) => row.kind === 'support' && row.canonicalId === '30175' && row.variant === 'thumbnail')!, assets.find((row) => row.kind === 'support' && row.canonicalId === '30175' && row.variant === 'art')!];
    await page.evaluate(({ rows, phase }) => {
      const section = document.createElement('section'); section.style.cssText = 'padding:24px;background:white;color:#123;font:20px sans-serif';
      const title = document.createElement('h1'); title.textContent = `${phase === 'p86' ? 'P8.6' : 'P8.5'} private static asset validation — rights pending`; section.append(title);
      for (const row of rows) { const label = document.createElement('p'); label.textContent = `${row.kind}:${row.canonicalId} / ${row.variant} / ${row.width}×${row.height}`; const image = new Image(); image.src = new URL(row.path, document.baseURI).href; image.style.cssText = 'max-width:180px;max-height:240px;object-fit:contain'; section.append(label, image); }
      document.body.replaceChildren(section);
    }, { rows: samples, phase });
    await page.locator('img').evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
    await page.screenshot({ path: resolve(artifactDirectory, mount === '/' ? 'private-static-root.png' : 'private-static-nested.png'), fullPage: true });
  }
} finally { await browser.close(); await new Promise<void>((done) => server.close(() => done())); }
await originalGuard();
const publicGate = await command('public-rights-gate', 'npx.cmd tsx scripts/assets/validate-assets.ts --public-release');
assert.notEqual(publicGate.status, 0); assert.match(publicGate.output, /PUBLIC RELEASE BLOCKED/);
const outcome = { checkedOn: '2026-11-05', scope: 'Technical private static validation; not public game-art redistribution approval or P9 full game-DB production loading', normalBuildPassed: true, publicOutput: { directory: 'dist', pendingGameImageCount: publicGameImages.length, inlinePngJsFiles: inlineImages, directPendingImageStatus: 404 }, rejectedPrivatePublicOutputOverride: { status: rejectedBuild.status, distHashBefore: beforeRejectedBuild, distHashAfter: afterRejectedBuild, untouched: beforeRejectedBuild === afterRejectedBuild }, privateOutput: { directory: '.preview/p85-private-static', pngCount: privatePngFiles.length, copiedOnlyWithExplicitFlag: true }, browserOutcomes, publicRights: { approved: 0, pendingCanonicalIds: pendingIds.length, gateBlockedAsExpected: true, fullIdsFile: 'data/assets/p85-public-release-blocked.json' }, immutableOriginalHashes: originalHashes, immutableOriginals: true };
await writeFile(`data/local/${phase}-static-assets.validation.json`, JSON.stringify(outcome, null, 2) + '\n');
console.log(JSON.stringify(outcome, null, 2));
