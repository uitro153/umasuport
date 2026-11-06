import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import console from 'node:console';

const raw = await readFile('data/local/p3-skill-support.json');
const snapshot = JSON.parse(raw.toString('utf8'));
const baseline = JSON.parse(await readFile('data/local/p41-baseline/baseline.json', 'utf8'));
const sha256 = createHash('sha256').update(raw).digest('hex');
assert.equal(sha256, baseline.snapshotSha256);
const db = new DatabaseSync('data/local/p3-integrated.sqlite', { readOnly: true });
const counts = {};
try {
  assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check), ['ok']);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  const stored = db.prepare('SELECT json FROM p3_snapshot WHERE id = ?').get(snapshot.snapshotId);
  assert.ok(stored, 'Latest Trainers snapshot is required, not the historical P3 row');
  assert.deepEqual(JSON.parse(stored.json), snapshot);
  for (const [table, key, id] of [['p3_skill', 'skills', 'skillId'], ['p3_support', 'supports', 'supportId'], ['p3_event', 'supportEvents', 'eventId']]) {
    // Table identifiers are fixed in source, never user input.
    const records = db.prepare(`SELECT id,json FROM ${table}`).all();
    const expected = new Map(snapshot[key].map((row) => [row[id], row]));
    assert.equal(records.length, expected.size);
    for (const row of records) assert.deepEqual(JSON.parse(row.json), expected.get(row.id));
    counts[table] = records.length;
  }
  const routes = db.prepare('SELECT json FROM p3_route ORDER BY id').all().map((row) => JSON.parse(row.json));
  assert.deepEqual(routes, snapshot.supportSkills);
  counts.p3_route = routes.length;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM quantitative_evidence').get().n, 1993);
} finally { db.close(); }
const report = { checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId, snapshotSha256: sha256,
  unchangedFromBaseline: true, sqliteReadOnly: true, integrity: 'ok', foreignKeyViolations: 0,
  latestEmbeddedSnapshotMatches: true, materializedRowsMatch: true, counts,
  scope: 'Storage consistency and source preservation; not a gameplay accuracy certificate.' };
await writeFile('data/local/p41-integrity.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
