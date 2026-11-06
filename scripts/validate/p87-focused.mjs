import { spawn } from 'node:child_process';
import process from 'node:process';
const recovery = process.argv.includes('--p4-only');
const nameFixtures = process.argv.includes('--name-fixtures');
const files = nameFixtures ? ['p3.spec.ts', 'p4.spec.ts', 'p87.spec.ts'] : recovery ? ['p4.spec.ts'] : ['p87.spec.ts', 'p4.spec.ts', 'p85-support-ui.spec.ts', 'reference.spec.ts', 'p85-images-output.spec.ts', 'p8-output.spec.ts', 'p8-persistence.spec.ts', 'p86-lineage-geometry.spec.ts'];
const pattern = recovery ? '실제 자료로 6장 전체' : 'P8.7|실제 자료로 6장 전체|실제566장 목록|공개식 상성·적성·6배치|P8 V1 복원 후|현재 추천 6장의|실제 서포트 PNG와|손상·미래 버전|저장 사본과|동일 계보의 7·31인 연결선';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...files.map(file => `tests/e2e/${file}`), ...nameFixtures ? [] : ['--grep', pattern], '--output', nameFixtures ? '.preview/p87-name-fixture-recovery-results' : '.preview/p87-focused-final-results'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, UMA_TEST_PORT: '5197' } });
child.on('error', error => { process.stderr.write(String(error)); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
