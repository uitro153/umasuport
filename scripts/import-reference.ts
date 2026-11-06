import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { ZodError } from 'zod';
import { convertStaging } from '../src/data/import-staging';

// The preparation directory is read-only. Only project-local, ignored output is written.
const integrationPath = process.argv[2];
if (!integrationPath) {
  console.error('Usage: npm.cmd run data:import -- <data-integration directory>');
  process.exitCode = 1;
} else {
  try {
    const files = {
      staging: join(resolve(integrationPath), 'data', 'p1', 'staging.json'),
      labels: join(resolve(integrationPath), 'data', 'ko', 'labels.json'),
      applications: join(resolve(integrationPath), 'data', 'kr', 'applications.json'),
    };
    const inputs: Record<string, unknown> = {};
    const hashes: Record<string, string> = {};
    for (const [key, file] of Object.entries(files)) {
      const content = await readFile(file);
      hashes[key] = createHash('sha256').update(content).digest('hex');
      inputs[key] = JSON.parse(content.toString('utf8')) as unknown;
    }
    const snapshot = convertStaging({ staging: inputs.staging, labels: inputs.labels, applications: inputs.applications });
    const outputDirectory = resolve('data/local');
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, 'p1-reference.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    const report = {
      snapshotId: snapshot.snapshotId,
      importedAt: new Date().toISOString(),
      inputHashes: hashes,
      sourceManifestSha256: snapshot.sourceManifestSha256,
      counts: { characters: snapshot.characters.length, costumes: snapshot.costumes.length, pairs: snapshot.affinity.pairs.length },
      validation: snapshot.validation,
      publication: 'local-only; excluded from production bundle',
    };
    await writeFile(join(outputDirectory, 'p1-reference.report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`LOCAL REFERENCE: ${snapshot.characters.length} characters / ${snapshot.costumes.length} costumes / ${snapshot.affinity.pairs.length} pairs`);
    console.log('Output: data/local/p1-reference.json');
    console.log('구조 변환 완료. 한국 서버 상성·7인 합산·빨간 인자 정확도는 검증 대기입니다.');
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      for (const issue of error.issues.slice(0, 20)) console.error(`${issue.path.join('.')}: ${issue.message}`);
    } else console.error(error instanceof Error ? error.message : '참고 데이터 변환 실패');
    process.exitCode = 1;
  }
}
