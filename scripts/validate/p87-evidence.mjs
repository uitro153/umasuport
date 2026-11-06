import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import console from 'node:console';
const dir = '.preview/p87-artifacts';
function walk(root) { return fs.readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(root, e.name)) : [path.join(root, e.name)]); }
function describe(file) {
  const data = fs.readFileSync(file); const result = { file: file.replaceAll('\\', '/'), bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
  if (/\.png$/.test(file)) Object.assign(result, { width: data.readUInt32BE(16), height: data.readUInt32BE(20) });
  return result;
}
const outputs = ['lineage-7-images', 'lineage-31-images', 'support-6-images'].flatMap(name => ['desktop', 'mobile'].map(profile => `${dir}/regression-p86/${profile}-${name}.png`));
const rows = outputs.map(file => { const d = describe(file); return `| [${path.basename(file)}](regression-p86/${path.basename(file)}) | ${d.width}×${d.height} | ${d.bytes}B |`; }).join('\n');
const logs = fs.readdirSync('.preview').filter(name => /^p87.*\.log$/.test(name)).sort().map(name => describe(`.preview/${name}`));
const coverage = JSON.parse(fs.readFileSync(`${dir}/p87-e2e-case-coverage.validation.json`, 'utf8'));
const integrity = JSON.parse(fs.readFileSync(`${dir}/integrity-security.validation.json`, 'utf8'));
if (!coverage.allCurrentCasesLatestObservedPassed || !coverage.allLogsComplete || !integrity.preservation.unchanged) throw new Error('Final case coverage or original-data preservation not confirmed.');
const readme = `# P8.7 로컬 검증 산출물

[최종 보고서](../../docs/P87_USER_FLOW_VALIDATION.md) · [고유 사례 대조](p87-e2e-case-coverage.validation.json) · [원본·보안 점검](integrity-security.validation.json)

실제 PC·모바일 화면은 desktop/mobile-{seven,direct-gallery,direct-factor,allocation,quick-skills}.png, 변경 전 비교는 before-{1440,375}-*.png다. 개인 빠른 선택 전후의 실제 V1 JSON과 workflow 검증 JSON도 같은 폴더에 있다. regression-p86/는 이번에 다시 실행한 기존 계보·자동 기능·갤러리·PNG 회귀의 결과다. 이전 단계의 통과 수를 재사용하지 않는다.

브라우저 ${coverage.totals.currentCases}개 모두 실제 통과 증거가 있으며 최신 관측도 통과다. 최초 전체 실행의 실패와 수정 후 재실행을 구분하며 반복 수를 더하지 않는다. 각 사건의 로그·프로젝트·전체 제목은 사례 대조 JSON을 따른다.

| 실제 다운로드 PNG | 해상도 | 크기 |
|---|---:|---:|
${rows}

게임 그림은 로컬 참고용이며 838개 canonical ID의 공개 권리는 pending이다. 이번 이미지·스크린샷·출력의 기술 검증이 공개 재배포 허가를 의미하지 않는다. 사용자 인자 기록은 합성 검증 자료이며 한국 서버 실물 관측 인증이 아니다.

원시 로그는 다음 파일에 보존했다. 파일별 바이트·SHA, 모든 산출물의 SHA·PNG 치수는 [manifest.json](manifest.json)에 있다.

${logs.map(log => `- [${path.basename(log.file)}](../${path.basename(log.file)})`).join('\n')}
`;
fs.writeFileSync(`${dir}/README.md`, readme.replaceAll('\\`', '`'));
const manifest = { phase: 'P8.7', generatedAt: new Date().toISOString(), scope: 'Local file evidence, bounded security check and per-case execution coverage; no public rights or gameplay recertification.',
  files: walk(dir).filter(file => path.basename(file) !== 'manifest.json').map(describe), logs,
  references: ['docs/P87_USER_FLOW_VALIDATION.md', 'docs/PROGRESS.md', 'README.md', '.preview/p87-baseline/protected-sha256.json'].map(describe),
  caseTotals: coverage.totals, rights: { approved: 0, pendingCanonicalIds: 838 }, manifestSelfHashExcluded: true };
fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ files: manifest.files.length, logs: logs.length, caseTotals: coverage.totals, output: `${dir}/manifest.json` }, null, 2));
