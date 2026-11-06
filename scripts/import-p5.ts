import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { z } from 'zod';
import { P5_FILE_NAMES, importP5Handoff, type P5HandoffFiles } from '../src/data/import-p5';
import { mergeP5Tournaments } from '../src/domain/p5-forecast';
import { validateP3Snapshot } from '../src/domain/skill-support';

const root = resolve('.');
const sourceRoot = resolve(process.argv[2] ?? 'data/raw/p5-2026-11-05/handoff/deliverables');
const zipPath = resolve(process.argv[3] ?? 'data/raw/p5-2026-11-05/P5_2026-11-05_handoff.zip');
const output = resolve('data/local/p5-forecast.json');
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const files = {} as P5HandoffFiles;
const sourceFiles = [];
for (const file of P5_FILE_NAMES) {
  const bytes = await readFile(resolve(sourceRoot, file));
  files[file] = JSON.parse(bytes.toString('utf8')) as unknown;
  sourceFiles.push({ file, sha256: sha256(bytes), bytes: bytes.length });
}
const provenance = z.object({ baseFiles: z.array(z.object({ path: z.string(), sha256: z.string() })),
  counts: z.object({ events: z.number(), releases: z.number(), routes: z.number(), skillEvidence: z.number(), lateScreening: z.number() }) }).parse(files['provenance.json']);
const permittedBaseFiles = new Set(['data/local/p3-skill-support.json', 'data/local/p1-reference.json', 'data/local/p3-integrated.sqlite']);
const before = new Map<string, string>();
for (const file of provenance.baseFiles) {
  // Never open an arbitrary handoff-supplied absolute file. Match the known
  // workspace suffix and resolve it inside this workspace, then verify its hash.
  const suffix = file.path.replace(/\\/g, '/').replace(/^.*?\/data\//, 'data/');
  assert.ok(permittedBaseFiles.has(suffix), `Unexpected P5 base file: ${file.path}`);
  const path = resolve(root, suffix);
  assert.ok(!relative(root, path).startsWith('..'));
  const hash = sha256(await readFile(path));
  assert.equal(hash, file.sha256, `P5 base-file hash mismatch: ${suffix}`);
  before.set(path, hash);
}
assert.equal(before.size, 3);
const base = validateP3Snapshot(JSON.parse((await readFile('data/local/p3-skill-support.json')).toString('utf8')) as unknown);
const reference = z.object({ costumes: z.array(z.object({ costumeId: z.string() })),
  applications: z.array(z.object({ entityId: z.string(), jpDate: z.string().nullable(),
    kr: z.object({ confirmedDate: z.string().nullable() }) })) }).parse(JSON.parse(await readFile('data/local/p1-reference.json', 'utf8')) as unknown);
const costumeIds = new Set(reference.costumes.map((row) => row.costumeId));
const zipSha256 = sha256(await readFile(zipPath));
const snapshotId = `p5-2026-11-05-${sha256(JSON.stringify({ sourceFiles, base: base.snapshotId })).slice(0, 16)}`;
const pack = importP5Handoff(files, { snapshotId, zipSha256, sourceFiles, baseFiles: provenance.baseFiles }, base, costumeIds);
for (const release of pack.releases.filter((row) => row.entityType === 'costume')) {
  const original = reference.applications.find((row) => row.entityId === release.entityId);
  assert.ok(original, `Missing original costume release: ${release.entityId}`);
  assert.equal(release.jpDate, original.jpDate, 'P5 cannot rewrite a Japanese costume release date');
  if (release.krConfirmedDate) assert.equal(release.krConfirmedDate, original.kr.confirmedDate, 'P5 cannot invent an official costume release');
}
assert.equal(pack.tournaments.length, provenance.counts.events);
assert.equal(pack.releases.length, provenance.counts.releases);
assert.equal(pack.releases.flatMap((row) => row.routes).length, provenance.counts.routes);
assert.equal(pack.skillEvidence.length, provenance.counts.skillEvidence);
assert.equal(pack.lateRelease.screeningQueue.length, provenance.counts.lateScreening);
const merged = mergeP5Tournaments(base, pack);
assert.equal(merged.length, 53);
assert.equal(new Set(merged.map((row) => row.eventId)).size, 53);
for (const [path, hash] of before) assert.equal(sha256(await readFile(path)), hash, 'Import must not rewrite a base file');
await mkdir(resolve('data/local'), { recursive: true });
await writeFile(output, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ snapshotId: pack.snapshotId, output: relative(root, output), asOf: pack.asOf, range: pack.range,
  events: pack.tournaments.length, existingEvents: 5, addedEvents: 9, mergedEvents: merged.length,
  releases: pack.releases.length, routes: pack.releases.flatMap((row) => row.routes).length,
  skillEvidence: pack.skillEvidence.length, lateScreening: pack.lateRelease.screeningQueue.length,
  monthlyScreening: pack.lateRelease.monthlyScreeningQueue.length, baseFilesVerified: true,
  originalP3ContractUnchanged: true, sourceDerivedAvailabilityApplied: false, quantitativeRankEligibleRows: 0 }, null, 2));
