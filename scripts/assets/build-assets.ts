import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import assert from 'node:assert/strict';
import type { GameAssetEntry, GameAssetFile, GameAssetManifest } from '../../src/domain/game-assets';
import { pngInfo, sha256 } from './image-files';

interface SourceAsset { entity_type: 'trainee' | 'support'; entity_id: number; path: string; url: string; sha256: string; copyright: string }
interface CachedArt { url: string; sourcePage: string; checkedOn: string; status: number; lastModified: string | null; etag: string | null; file: GameAssetFile | null; error?: string }
const checkedOn = '2026-11-05';
const workspace = resolve('.');
const sourceArgument = process.argv.indexOf('--source-root');
const sourceRoot = resolve(sourceArgument < 0 ? 'C:/Users/uitro/.codex/.chatgpt-projects/g-p-6ad309bd21c48191b13e4b588afa9fee/audit-input/uma_db' : process.argv[sourceArgument + 1]!);
const fetchArt = !process.argv.includes('--no-download');
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const baseline: Record<string, string> = (await readJson('data/local/p8-persistence.validation.json')).immutableSources;
async function assertOriginals() { for (const [file, hash] of Object.entries(baseline)) assert.equal(sha256(await readFile(file)), hash, `Protected original changed: ${file}`); }
await assertOriginals();
const reference = await readJson('data/local/p1-reference.json') as { costumes: { costumeId: string }[] };
const p3 = await readJson('data/local/p3-skill-support.json') as { supports: { supportId: string; type: string; rarity: string; ownerBaseId: string | null; raw: { url_name?: string; type: string } }[] };
const sourceAssets = await readJson('data/raw/p3-base-2026-11-04/json/asset.json') as SourceAsset[];
const sourceMap = new Map(sourceAssets.map((asset) => [`${asset.entity_type === 'trainee' ? 'costume' : 'support'}:${asset.entity_id}`, asset]));
assert.equal(sourceMap.size, sourceAssets.length, 'Source asset IDs must be unique within each kind');
async function output(path: string, bytes: Uint8Array | string) { const target = resolve(path); assert.ok(relative(workspace, target) !== '..' && !relative(workspace, target).startsWith(`..${sep}`), 'Output must remain within workspace'); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
const rows = [
  ...reference.costumes.map(({ costumeId }) => ({ kind: 'costume' as const, id: costumeId })),
  ...p3.supports.map(({ supportId }) => ({ kind: 'support' as const, id: supportId })),
];
const entries: GameAssetEntry[] = [];
for (const { kind, id } of rows) {
  assert.match(id, /^\d+$/);
  const source = sourceMap.get(`${kind}:${id}`);
  const entry: GameAssetEntry = { kind, canonicalId: id, mappingStatus: 'missing', rightsStatus: 'pending', usageScope: 'local-reference', publicRedistribution: 'not-verified', thumbnail: null, art: null, errors: [] };
  if (!source) { entry.errors.push('No exact canonical source asset mapping'); entries.push(entry); continue; }
  try {
    assert.ok(source.path.startsWith(kind === 'costume' ? 'images/character_thumbs/' : 'images/support_thumbs/'));
    assert.equal(source.path.split('/').at(-1)?.split('-')[0], id, 'Source filename ID differs from canonical ID');
    const sourcePath = resolve(sourceRoot, source.path);
    assert.ok(!relative(sourceRoot, sourcePath).startsWith(`..${sep}`), 'Source path escaped package');
    const bytes = await readFile(sourcePath); const info = pngInfo(bytes);
    assert.equal(info.sha256, source.sha256, 'User-provided source SHA differs from original asset catalog');
    assert.equal(info.width, 128); assert.equal(info.height, 128);
    const path = `game-assets/${kind === 'costume' ? 'costumes' : 'supports/icons'}/${id}.png`;
    await output(`data/local/p85-assets/${path}`, bytes);
    entry.thumbnail = { path, ...info, sourceUrl: source.url, sourceAssetId: source.path, sourceId: 'user-provided-uma-tools' };
    entry.mappingStatus = 'mapped';
  } catch (error) { entry.mappingStatus = 'invalid'; entry.errors.push(error instanceof Error ? error.message : String(error)); }
  entries.push(entry);
}

async function supportArt(entry: GameAssetEntry) {
  const id = entry.canonicalId;
  const support = p3.supports.find((row) => row.supportId === id)!;
  // The actual GameTora support detail page exposes /supports/full/small/30175.png.
  // IDs come exclusively from the existing canonical DB, never name matching.
  const url = `https://media.gametora.com/umamusume/supports/full/small/${id}.png`;
  const sourcePage = `https://gametora.com/umamusume/supports/${support.raw.url_name ?? id}`;
  const cacheFile = `data/assets/full-art-downloads/${id}.json`;
  const path = `game-assets/supports/art/${id}.png`;
  try {
    const cached = await readJson(cacheFile) as CachedArt;
    if (cached.file && cached.url === url) {
      const bytes = await readFile(`data/local/p85-assets/${cached.file.path}`);
      assert.equal(pngInfo(bytes).sha256, cached.file.sha256);
      entry.art = cached.file; return;
    }
    if (!fetchArt) { entry.errors.push(cached.error ?? 'Full card art was not acquired'); return; }
  } catch { /* First import or invalid cache: retrieve a public source once. */ }
  if (!fetchArt) { entry.errors.push('Full card art has not been downloaded'); return; }
  let cached: CachedArt;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, `Public art HTTP ${response.status}; access denial is not bypassed`);
    assert.match(response.headers.get('content-type') ?? '', /^image\/png(?:;|$)/);
    const bytes = Buffer.from(await response.arrayBuffer()); const info = pngInfo(bytes);
    assert.ok(info.width >= 192 && info.height >= 256 && Math.abs(info.width / info.height - 0.75) < 0.02, 'Expected a complete portrait card illustration');
    await output(`data/local/p85-assets/${path}`, bytes);
    entry.art = { path, ...info, sourceUrl: url, sourceAssetId: `umamusume/supports/full/small/${id}.png`, sourceId: 'gametora-media' };
    cached = { url, sourcePage, checkedOn, status: response.status, lastModified: response.headers.get('last-modified'), etag: response.headers.get('etag'), file: entry.art };
  } catch (error) { const message = error instanceof Error ? error.message : String(error); entry.errors.push(message); cached = { url, sourcePage, checkedOn, status: 0, lastModified: null, etag: null, file: null, error: message }; }
  await output(cacheFile, JSON.stringify(cached, null, 2) + '\n');
}
const supportEntries = entries.filter((entry) => entry.kind === 'support');
let next = 0; let completed = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while (next < supportEntries.length) { const entry = supportEntries[next++]!; await supportArt(entry); completed++; if (completed % 100 === 0) process.stdout.write(`Full card source checks ${completed}/${supportEntries.length}\n`); } }));
const manifest: GameAssetManifest = {
  contract: 'uma-presentation-assets', schemaVersion: 1, checkedOn,
  sources: [
    { id: 'user-provided-uma-tools', url: 'https://github.com/daftuyda/UmaTools/tree/d0a2a652605ca319e4176445c1e1bf52a8cd8fdb/public/assets', rightsStatus: 'pending', note: 'User-provided PNG package and exact original SHA-256/ID catalog. Repository code GPL does not certify game-art redistribution rights.' },
    { id: 'gametora-media', url: 'https://gametora.com/umamusume/supports/30175-mejiro-ramonu', rightsStatus: 'pending', note: 'Full/small numeric support-ID images exposed by public detail page. Locally retained for this requested private development preview; public redistribution permission has not been established.' },
  ], entries,
};
await output('data/assets/p85-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await output('data/local/p85-assets/game-assets/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
// Only compact file descriptors enter JS. Binary images and full provenance stay separate.
const compact = { contract: manifest.contract, schemaVersion: 1, usageScope: 'local-reference', rightsStatus: 'pending', publicRedistribution: 'not-verified', entries: Object.fromEntries(entries.filter((entry) => entry.mappingStatus === 'mapped').map((entry) => [`${entry.kind}:${entry.canonicalId}`, {
  thumbnail: entry.thumbnail ? [entry.thumbnail.path, entry.thumbnail.width, entry.thumbnail.height, entry.thumbnail.sourceAssetId, entry.thumbnail.sourceUrl] : null,
  art: entry.art ? [entry.art.path, entry.art.width, entry.art.height, entry.art.sourceAssetId, entry.art.sourceUrl] : null,
}])) };
await output('data/assets/p85-index.json', JSON.stringify(compact) + '\n');
await assertOriginals();
console.log(JSON.stringify({ costumes: entries.filter((entry) => entry.kind === 'costume').length, supportCards: supportEntries.length, mapped: entries.filter((entry) => entry.mappingStatus === 'mapped').length, invalidOrMissing: entries.filter((entry) => entry.mappingStatus !== 'mapped').map((entry) => `${entry.kind}:${entry.canonicalId}`), fullSupportArt: supportEntries.filter((entry) => entry.art).length, publicRedistribution: 'not-verified', immutableOriginals: true }, null, 2));
