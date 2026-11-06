import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
/* global console */

const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const expected = JSON.parse(await readFile('.preview/p86-baseline/protected-sha256.json', 'utf8'));
const protectedFiles = [];
for (const [file, sha256] of Object.entries(expected)) {
  const actual = await hash(file); assert.equal(actual, sha256, `Protected input changed: ${file}`);
  protectedFiles.push({ file, sha256: actual, unchanged: true });
}
async function files(directory, prefix = '') {
  const rows = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(rows.map(row => row.isDirectory() ? files(join(directory, row.name), join(prefix, row.name)) : [join(prefix, row.name)]))).flat().sort();
}
const sourceGroups = [];
for (const directory of ['src/engine', 'src/domain', 'data/fixtures', 'data/snapshots']) {
  const baseline = join('.preview/p86-baseline', directory);
  const paths = await files(baseline); assert.deepEqual(await files(directory), paths, `File set changed: ${directory}`);
  for (const file of paths) assert.equal(await hash(join(directory, file)), await hash(join(baseline, file)), `Original source changed: ${directory}/${file}`);
  sourceGroups.push({ directory, files: paths.length, unchanged: true });
}
const originalArtifacts = [];
for (const phase of ['p8', 'p85']) {
  const directory = `.preview/${phase}-artifacts`;
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
  const rows = manifest.files ?? manifest.artifacts;
  assert.ok(Array.isArray(rows), `No original artifact list: ${phase}`);
  for (const row of rows) {
    const file = row.file ?? row.path;
    assert.equal(await hash(join(directory, file)), row.sha256, `Original evidence changed: ${phase}/${file}`);
  }
  originalArtifacts.push({ phase, checkedFiles: rows.length, unchanged: true });
}
const outcome = { checkedOn: '2026-11-05', protectedFiles, sourceGroups, originalArtifacts,
  scope: 'Read-only byte preservation of original game packs, all domain/engine and fixture/snapshot files, saved-plan contract, and prior stable artifacts. This does not certify game rules or art redistribution.' };
await mkdir('data/local', { recursive: true });
await writeFile('data/local/p86-preservation.validation.json', JSON.stringify(outcome, null, 2) + '\n');
console.log(JSON.stringify(outcome, null, 2));
