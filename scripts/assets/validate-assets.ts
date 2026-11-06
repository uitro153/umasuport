import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import assert from 'node:assert/strict';
import type { GameAssetManifest } from '../../src/domain/game-assets';
import { pngInfo, sha256 } from './image-files';

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await json('data/assets/p85-manifest.json') as GameAssetManifest;
const reference = await json('data/local/p1-reference.json') as { costumes: { costumeId: string; baseId: string; displayName: string }[] };
const p3 = await json('data/local/p3-skill-support.json') as { supports: { supportId: string; type: string; rarity: string; ownerBaseId: string | null; displayName: string; raw: { type: string } }[] };
const originals: Record<string, string> = (await json('data/local/p8-persistence.validation.json')).immutableSources;
assert.equal(manifest.contract, 'uma-presentation-assets'); assert.equal(manifest.schemaVersion, 1);
const expected = new Set([...reference.costumes.map((row) => `costume:${row.costumeId}`), ...p3.supports.map((row) => `support:${row.supportId}`)]);
const keys = manifest.entries.map((entry) => `${entry.kind}:${entry.canonicalId}`);
assert.equal(new Set(keys).size, keys.length, 'Duplicate namespaced image ID');
assert.deepEqual(new Set(keys), expected, 'Manifest must cover exactly the existing canonical DB IDs');
const privateRoot = resolve('data/local/p85-assets'); const paths = new Set<string>();
const errors: { id: string; variant: string; reason: string }[] = [];
const hashes = new Map<string, string[]>(); const dimensions: Record<string, number> = {};
let thumbnailSuccess = 0; let artSuccess = 0; let bytes = 0;
for (const entry of manifest.entries) {
  const id = `${entry.kind}:${entry.canonicalId}`;
  for (const variant of ['thumbnail', 'art'] as const) {
    const file = entry[variant];
    if (!file) { if (variant === 'thumbnail' || entry.kind === 'support') errors.push({ id, variant, reason: 'missing' }); continue; }
    try {
      assert.equal(entry.mappingStatus, 'mapped');
      const expectedDirectory = entry.kind === 'costume' ? 'costumes' : variant === 'thumbnail' ? 'supports/icons' : 'supports/art';
      assert.equal(file.path, `game-assets/${expectedDirectory}/${entry.canonicalId}.png`, 'Wrong canonical local asset path');
      assert.ok(!paths.has(file.path), 'Two image variants share a file path'); paths.add(file.path);
      const absolute = resolve(privateRoot, file.path); const pathRelative = relative(privateRoot, absolute);
      assert.ok(pathRelative !== '..' && !pathRelative.startsWith(`..${sep}`));
      const info = pngInfo(await readFile(absolute));
      for (const field of ['width', 'height', 'bytes', 'sha256', 'mimeType'] as const) assert.equal(info[field], file[field], `Declared ${field} differs from actual PNG`);
      if (variant === 'thumbnail') { assert.equal(info.width, 128); assert.equal(info.height, 128); thumbnailSuccess++; assert.equal(file.sourceAssetId.split('/').at(-1)?.split('-')[0], entry.canonicalId); }
      else { assert.equal(file.sourceUrl, `https://media.gametora.com/umamusume/supports/full/small/${entry.canonicalId}.png`); assert.ok(Math.abs(info.width / info.height - 0.75) < 0.02); artSuccess++; }
      bytes += info.bytes;
      const group = `${entry.kind}:${variant}:${info.width}x${info.height}`; dimensions[group] = (dimensions[group] ?? 0) + 1;
      hashes.set(info.sha256, [...(hashes.get(info.sha256) ?? []), `${id}:${variant}`]);
    } catch (error) { errors.push({ id, variant, reason: error instanceof Error ? error.message : String(error) }); }
  }
}
const duplicateFiles = [...hashes.entries()].filter(([, ids]) => ids.length > 1).map(([hash, ids]) => ({ sha256: hash, ids }));
// Different IDs with identical bytes could be a repeated placeholder or mapping
// error. Report them for semantic inspection rather than counting existence.
assert.equal(duplicateFiles.length, 0, 'Identical image bytes across canonical identities need review');
for (const [file, expectedHash] of Object.entries(originals)) assert.equal(sha256(await readFile(file)), expectedHash, `Protected game source changed: ${file}`);
assert.ok(p3.supports.every((support) => support.type === support.raw.type), 'Presentation must not reclassify raw friend/group types');
const types = Object.fromEntries([...new Set(p3.supports.map((row) => row.type))].map((type) => [type, p3.supports.filter((row) => row.type === type).length]));
const blocked = manifest.entries.filter((entry) => entry.rightsStatus !== 'approved' || entry.publicRedistribution !== 'approved').map((entry) => ({ kind: entry.kind, canonicalId: entry.canonicalId, reason: entry.rightsStatus === 'restricted' ? 'Explicit restriction requires resolution before public distribution' : 'Game-image public redistribution permission not established; source code GPL and public availability do not grant game-art rights', localPreviewAvailable: entry.mappingStatus === 'mapped' }));
async function pendingPublicImages(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? pendingPublicImages(resolve(directory, entry.name)) : /\.(png|webp|jpe?g)$/i.test(entry.name) ? [resolve(directory, entry.name)] : []))).flat();
}
const publicImageLeaks = await pendingPublicImages('public/game-assets');
assert.equal(publicImageLeaks.length, 0, 'Pending private images must not remain under Vite public/');
await mkdir('data/assets', { recursive: true });
await writeFile('data/assets/p85-public-release-blocked.json', JSON.stringify({ checkedOn: manifest.checkedOn, note: 'This is a public redistribution gate, not missing local preview images.', count: blocked.length, entries: blocked }, null, 2) + '\n');
const summary = { checkedOn: manifest.checkedOn, scope: 'local-reference/private-development-preview', physicalCacheRoot: 'data/local/p85-assets', publicImageLeaks, targets: { costumes: reference.costumes.length, supports: p3.supports.length }, thumbnailSuccess, fullSupportArtSuccess: artSuccess, missingOrInvalid: errors, formatsAndDimensions: dimensions, actualPngFiles: paths.size, bytes, duplicateFiles, supportTypeCounts: types, publicRelease: { approved: blocked.length === 0, blockedCount: blocked.length, fullIdsFile: 'data/assets/p85-public-release-blocked.json' }, immutableOriginalHashes: originals, immutableOriginals: true, semanticValidation: 'Exact canonical source ID + original user-package SHA for every thumbnail; numeric GameTora detail/media support ID for every full card art; separate visual multi-outfit/card/rarity samples. File existence alone is not a semantic certificate.' };
await writeFile('data/assets/p85-validation.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
assert.equal(errors.length, 0, 'Missing/invalid local images');
if (process.argv.includes('--public-release')) assert.equal(blocked.length, 0, 'PUBLIC RELEASE BLOCKED: explicit game-art redistribution permission remains unverified; see complete ID list');
