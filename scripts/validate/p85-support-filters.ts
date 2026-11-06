import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { getP3Availability } from '../../src/engine/support-acquisition';
import { matchesSupportFilters, normalizeSupportType, SUPPORT_TYPES, type SupportListFilters } from '../../src/ui/skills/support-filters';

const sourcePath = 'data/local/p3-skill-support.json';
const optimizerPath = 'src/engine/support-deck-optimizer.ts';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(sourcePath); const optimizer = await readFile(optimizerPath);
const snapshot = validateP3Snapshot(JSON.parse(source.toString('utf8')) as unknown);
const types = SUPPORT_TYPES.filter(([type]) => type !== 'all');
const counts = Object.fromEntries(types.map(([type]) => [type, snapshot.supports.filter((row) => normalizeSupportType(row.type) === type).length]));
assert.equal(snapshot.supports.length, 566); assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), snapshot.supports.length);
const rows = snapshot.supports.map((support) => ({ support, release: getP3Availability(snapshot, 'support', support.supportId, '2026-11-05', false).state }));
const matrix = types.flatMap(([type]) => (['R', 'SR', 'SSR'] as const).flatMap((rarity) => (['available', 'unknown', 'unavailable'] as const).map((release) => {
  const filters: SupportListFilters = { query: '', type, rarity, release };
  const actual = rows.filter((row) => matchesSupportFilters(row.support, row.release, filters)).map((row) => row.support.supportId);
  // Independent expectation: the actual current DB uses the exact seven
  // lower-case types; friend/group must not be folded by the UI alias table.
  const expected = rows.filter((row) => row.support.type === type && row.support.rarity === rarity && row.release === release).map((row) => row.support.supportId);
  assert.deepEqual(actual, expected);
  return { type, rarity, release, count: actual.length };
})));
for (const row of snapshot.supports.filter((support) => support.type === 'friend' || support.type === 'group')) {
  assert.equal(typeof row.raw, 'object'); assert.notEqual(row.raw, null);
  assert.equal((row.raw as { type?: unknown }).type, row.type);
}
assert.equal(hash(await readFile(sourcePath)), hash(source)); assert.equal(hash(await readFile(optimizerPath)), hash(optimizer));
const report = { checkedOn: '2026-11-05', sourceSnapshotId: snapshot.snapshotId, targetCount: snapshot.supports.length, rawTypeCounts: counts,
  typeRarityReleaseIntersections: matrix.length, matrix, sourceSha256: hash(source), optimizerSha256: hash(optimizer), sourceAndOptimizerUnchanged: true,
  policy: 'UI-only intersection filters. Current KR availability is supplied unchanged by the existing P3 engine. Raw friend/group are distinct.' };
await mkdir('data/local', { recursive: true }); await writeFile('data/local/p85-support-filters.validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ count: report.targetCount, counts, matrixCases: matrix.length, unchanged: true }, null, 2));
