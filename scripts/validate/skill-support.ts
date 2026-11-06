import { readFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';

// The regression subset contains real source records, not invented game values.
const path = process.argv[2] ?? 'tests/golden/p3-real-ui-subset.json';
const snapshot = validateP3Snapshot(JSON.parse(await readFile(path, 'utf8')) as unknown);
console.log(`VALID P3: ${snapshot.snapshotId} · ${snapshot.skills.length} skills / ${snapshot.supports.length} supports`);
console.log('Source-data structure only: Korean release/effects and measured race gains require separate evidence.');
