import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { validateSnapshot, validatePedigreeRules } from '../../src/domain';

const snapshotPath = resolve(process.argv[2] ?? 'data/fixtures/p1.snapshot.json');
const rulesPath = resolve(process.argv[3] ?? 'data/fixtures/p1.rules.json');

try {
  const snapshot = validateSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')) as unknown);
  const rules = validatePedigreeRules(JSON.parse(await readFile(rulesPath, 'utf8')) as unknown, snapshot);
  console.log(`VALID: ${snapshot.snapshotId} / ${rules.ruleId} (${rules.kind})`);
  console.log(`${snapshot.characters.length} characters / ${snapshot.costumes.length} costumes / ${snapshot.affinities.length} affinity pairs`);
  if (snapshot.kind === 'fixture') console.log('FIXTURE ONLY: 상성·적성 수치 및 규칙은 실게임 검증 전입니다.');
} catch (error: unknown) {
  console.error('INVALID: P1 스냅샷 또는 계산 규칙');
  if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`- ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  } else console.error(error instanceof Error ? error.message : '알 수 없는 검증 오류');
  process.exitCode = 1;
}
