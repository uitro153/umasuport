import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { validateSnapshot } from '../../src/domain';

const filePath = resolve(process.argv[2] ?? 'data/fixtures/p0.snapshot.json');

try {
  const input: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  const snapshot = validateSnapshot(input);
  console.log(`VALID: ${snapshot.snapshotId} (${snapshot.kind}, schema v${snapshot.schemaVersion})`);
  console.log(`${snapshot.characters.length} characters / ${snapshot.supports.length} supports / ${snapshot.releases.length} releases`);
  if (snapshot.kind === 'fixture') console.log('FIXTURE ONLY: 실제 게임 데이터가 아닙니다.');
} catch (error: unknown) {
  console.error(`INVALID: ${filePath}`);
  if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`- ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : '알 수 없는 검증 오류');
  }
  process.exitCode = 1;
}
