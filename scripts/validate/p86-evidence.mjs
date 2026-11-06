import { createHash } from 'node:crypto';
import console from 'node:console';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

// Index actual files and raw execution records. This script does not run the
// application, infer process exit codes, or certify game/art accuracy.
const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const artifactRoot = join(projectRoot, '.preview/p86-artifacts');
const previewRoot = join(projectRoot, '.preview');
const finalSnapshot = process.argv.includes('--final');
const dryRun = process.argv.includes('--dry-run');
const checkedOn = '2026-11-05';
const slash = (value) => value.replaceAll('\\', '/');
const projectPath = (value) => slash(relative(projectRoot, value));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const warnings = [];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
  }).sort((a, b) => a.localeCompare(b, 'en'));
}

function describeFile(file, relativeTo = projectRoot) {
  const bytes = readFileSync(file);
  const record = { file: slash(relative(relativeTo, file)), bytes: bytes.length, sha256: digest(bytes) };
  if (/\.png$/i.test(file)) {
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Not a PNG: ${projectPath(file)}`);
    record.width = bytes.readUInt32BE(16); record.height = bytes.readUInt32BE(20);
  }
  return record;
}

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { warnings.push(`${projectPath(file)}: ${error.message}`); return null; }
}

function decodeLog(file) {
  const bytes = readFileSync(file);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
  return stripVTControlCharacters(text).replaceAll('\r', '');
}

function lastCount(text, word) {
  const matches = [...text.matchAll(new RegExp(`^\\s*(\\d+) ${word}(?: \\([^\\n]*\\))?\\s*$`, 'gm'))];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}

function logResult(file) {
  const text = decodeLog(file);
  const record = { ...describeFile(file), modifiedAt: statSync(file).mtime.toISOString(), exitCode: null };
  const expectedMatches = [...text.matchAll(/^Running (\d+) tests? using /gm)];
  if (expectedMatches.length) {
    const expected = Number(expectedMatches.at(-1)[1]);
    const passed = lastCount(text, 'passed'); const failed = lastCount(text, 'failed');
    const skipped = lastCount(text, 'skipped') ?? 0; const interrupted = lastCount(text, 'interrupted') ?? 0;
    const summaryCount = (passed ?? 0) + (failed ?? 0) + skipped + interrupted;
    const completed = summaryCount === expected && (passed !== null || failed !== null || skipped > 0 || interrupted > 0);
    return { ...record, kind: 'playwright', expected, passed, failed, skipped, interrupted,
      progressPassed: (text.match(/^\s*(?:ok|✓)\s+\d+\s+\[/gm) ?? []).length,
      progressFailed: (text.match(/^\s*(?:x|✘|×)\s+\d+\s+\[/gm) ?? []).length,
      status: !completed ? 'incomplete' : interrupted > 0 ? 'interrupted' : (failed ?? 0) > 0 ? 'completed-with-failures' : 'completed-passed',
      summaryComplete: completed,
      note: 'Per-run text summary only; focused reruns do not rewrite historical failures and different logs are not added as independent total cases.' };
  }
  const tests = [...text.matchAll(/^\s*Tests\s+(\d+) passed \((\d+)\)/gm)];
  const files = [...text.matchAll(/^\s*Test Files\s+(\d+) passed \((\d+)\)/gm)];
  if (tests.length) return { ...record, kind: /\bcheck\b/.test(file) ? 'check-with-vitest' : 'vitest',
    unitPassed: Number(tests.at(-1)[1]), unitTotal: Number(tests.at(-1)[2]),
    unitFilesPassed: files.length ? Number(files.at(-1)[1]) : null,
    buildMarkerPresent: /built in \d/m.test(text), status: 'unit-summary-recorded',
    note: 'Unit summary is explicit. A build marker is recorded separately; the full command exit code is not inferred from output text.' };
  const nodePass = /^ℹ pass (\d+)$/m.exec(text); const nodeFail = /^ℹ fail (\d+)$/m.exec(text);
  if (nodePass && nodeFail) return { ...record, kind: 'node-test', passed: Number(nodePass[1]), failed: Number(nodeFail[1]), status: Number(nodeFail[1]) ? 'completed-with-failures' : 'completed-passed' };
  return { ...record, kind: 'raw-command-output', status: 'raw-record-only',
    emptyOutput: text.trim().length === 0,
    diagnosticMarkers: { error: /(?:^|\n)(?:Error:|error TS\d+|.*\berror\s{2,})/m.test(text), build: /built in \d/m.test(text), sqliteIntegrityOk: /"integrity"\s*:\s*"ok"/.test(text), deliberateRightsGate: /(?:public|redistribution|공개|838)/i.test(text) && /(?:blocked|pending|차단|보류)/i.test(text) },
    note: 'No supported test completion summary. Empty lint/type logs are not silently promoted to a success exit code.' };
}

function purpose(file) {
  if (file === 'README.md') return 'Generated local evidence guide and separate per-run execution summaries';
  if (/^before-.*\.png$/.test(file)) return 'Actual pre-P8.6 baseline UI capture, not a game-result fixture';
  if (/before-connector/.test(file)) return 'Measured pre-P8.6 connector endpoints/anchors';
  if (/connector-measurements/.test(file)) return 'Actual connector geometry measurements across viewport sizes and zoom settings';
  if (/presentation-roundtrip.*\.json$/.test(file)) return 'V1 presentation-only save/restore, ownership/31 UUID and unchanged-input evidence';
  if (/support-table-coverage/.test(file)) return 'Current recommendation exact skill-row/support-route table coverage validation';
  if (/lineage-.*images\.png$/.test(file)) return 'Actual downloaded visual lineage-tree PNG with exact canonical images; technical IDs are not printed';
  if (/support-6-images\.png$/.test(file)) return 'Actual downloaded six-card arrangement and current compatible skill-acquisition table';
  if (/images-failed/.test(file)) return 'Intentional image-failure output preserving the same subject text without another-card substitution';
  if (/\.capture\.json$|\.canvas-text\.json$/.test(file)) return 'Actual Canvas text/image calls and internal identity audit, not default visible output';
  if (/100pct/.test(file)) return 'Native-pixel crop for legibility review of the real downloaded PNG';
  if (/-(costume-gallery|support-gallery|support-rarities)\.png$/.test(file)) return 'Actual image-centered gallery or same-character R/SR/SSR visual comparison';
  if (/gallery-layout\.json$/.test(file)) return 'Actual gallery columns, target-size and page-overflow checks';
  if (/lineage-\d+-(7|31)-\d+pct\.png$/.test(file)) return 'Actual unified lineage viewport/zoom capture';
  if (/private-static/.test(file)) return 'Private static root/nested asset and Canvas validation, not public hosting';
  if (/galleries-validation|png-visual-qa/.test(file)) return 'Named implementation/visual review evidence with explicit scope and limitations';
  if (/comparison/.test(file)) return 'Saved A/B inputs and current-data recalculation comparison';
  if (/\.json$/.test(file)) return 'Actual saved V1 input or explicit validation evidence; user factor records may be synthetic';
  if (/\.png$/.test(file)) return 'Actual local browser UI or downloaded output capture';
  return 'Preserved local validation payload';
}

mkdirSync(artifactRoot, { recursive: true });
const manifestPath = join(artifactRoot, 'manifest.json'); const readmePath = join(artifactRoot, 'README.md');
const payloadPaths = walk(artifactRoot).filter((file) => file !== manifestPath && file !== readmePath);
const payloads = payloadPaths.map((file) => ({ ...describeFile(file, artifactRoot), purpose: purpose(slash(relative(artifactRoot, file))) }));
const rawLogs = readdirSync(previewRoot).filter((name) => /^p86.*\.log$/i.test(name)).sort().map((name) => logResult(join(previewRoot, name)));

const requiredRefs = [
  'data/local/p86-preservation.validation.json', 'data/local/p86-static-assets.validation.json',
  'data/assets/p85-manifest.json', 'data/assets/p85-validation.json', 'data/assets/p85-public-release-blocked.json',
  '.preview/p86-artifacts/galleries-validation.json', '.preview/p86-artifacts/png-visual-qa.json',
  '.preview/p86-artifacts/p86-e2e-case-coverage.validation.json',
  '.preview/p86-artifacts/p86-persistence-evidence.json',
  '.preview/p86-artifacts/desktop-four-width-output.validation.json',
  '.preview/p86-artifacts/mobile-four-width-output.validation.json',
  'docs/P86_INTEGRATED_UX_OUTPUT_VALIDATION.md', 'docs/PROGRESS.md', 'README.md',
  '.preview/p86-handoff/P86_CODEX_IMPLEMENTATION_SPEC.md',
];
const extraRefs = [join(projectRoot, 'data/local'), previewRoot].flatMap((directory) => readdirSync(directory).filter((name) => /^p86.*\.json$/i.test(name)).map((name) => projectPath(join(directory, name))));
const artifactValidationRefs = payloads.filter((file) => /(?:validation|measurements)\.json$/.test(file.file)).map((file) => `.preview/p86-artifacts/${file.file}`);
const references = [...new Set([...requiredRefs, ...extraRefs, ...artifactValidationRefs])].sort().map((file) => {
  const absolute = join(projectRoot, file);
  if (!existsSync(absolute)) return { file, exists: false };
  return { ...describeFile(absolute), exists: true };
});
const preservation = readJson(join(projectRoot, 'data/local/p86-preservation.validation.json'));
const protectedSources = (preservation?.protectedFiles ?? []).map((file) => {
  const absolute = join(projectRoot, file.file); const currentSha256 = existsSync(absolute) ? digest(readFileSync(absolute)) : null;
  return { ...file, currentSha256, currentMatchesPreservationRecord: currentSha256 === file.sha256 };
});
const assetManifest = readJson(join(projectRoot, 'data/assets/p85-manifest.json'));
const assetEntries = assetManifest?.entries ?? [];
const rights = { approved: assetEntries.filter((entry) => entry.rightsStatus === 'approved').length,
  pending: assetEntries.filter((entry) => entry.rightsStatus === 'pending').length,
  totalCanonicalIds: assetEntries.length,
  restriction: 'Local reference assets and screenshots only. No legal permission inferred; pending images must stay out of ordinary public builds/P9 automatic publication.' };
const assetCounts = { costumeIds: assetEntries.filter((entry) => entry.kind === 'costume').length,
  supportIds: assetEntries.filter((entry) => entry.kind === 'support').length,
  thumbnails: assetEntries.filter((entry) => entry.thumbnail).length,
  supportArt: assetEntries.filter((entry) => entry.kind === 'support' && entry.art).length };
const pngQa = readJson(join(artifactRoot, 'png-visual-qa.json'));
const reviewedImages = [
  ...(pngQa?.outputs ?? []).map((entry) => ({ ...entry, reviewKind: 'primary-download' })),
  ...(pngQa?.crops ?? []).map((entry) => ({ ...entry, reviewKind: 'native-pixel-crop' })),
  ...(pngQa?.finalUiScreenshots ?? []).map((entry) => ({ ...entry, reviewKind: 'final-ui-screenshot' })),
];
const pngQaFreshness = reviewedImages.map((output) => {
  const file = join(artifactRoot, output.file); const currentSha256 = existsSync(file) ? digest(readFileSync(file)) : null;
  return { file: output.file, reviewKind: output.reviewKind, reviewedSha256: output.sha256 ?? null, currentSha256,
    matchesReviewedFile: !!output.sha256 && currentSha256 === output.sha256 };
});
const staleQa = pngQaFreshness.filter((output) => !output.matchesReviewedFile);
if (staleQa.length) warnings.push(`PNG visual QA refers to older/missing bytes: ${staleQa.map((file) => file.file).join(', ')}`);
if (protectedSources.some((source) => !source.currentMatchesPreservationRecord)) warnings.push('Protected-source bytes differ from the preservation record.');
const missingRefs = references.filter((file) => !file.exists);
if (missingRefs.length) warnings.push(`Missing references: ${missingRefs.map((file) => file.file).join(', ')}`);

const primaryFiles = payloads.filter((file) => /^(desktop|mobile)-(lineage-(7|31)|support-6)-images\.png$/.test(file.file));
if (finalSnapshot && primaryFiles.length !== 6) warnings.push(`Expected six current PC/mobile primary PNG files, found ${primaryFiles.length}.`);
if (finalSnapshot && primaryFiles.some((file) => !pngQaFreshness.some((review) => review.file === file.file && review.matchesReviewedFile))) warnings.push('Some current primary PNGs do not have matching explicit visual-QA hash records.');
const runLabel = (log) => log.kind === 'playwright' ? `${log.status} · ${log.passed ?? '—'} passed / ${log.failed ?? '—'} failed / expected ${log.expected}`
  : log.kind === 'vitest' || log.kind === 'check-with-vitest' ? `단위 ${log.unitPassed}/${log.unitTotal} · ${log.unitFilesPassed ?? '—'}파일${log.buildMarkerPresent ? ' · build marker 있음' : ''}`
    : log.kind === 'node-test' ? `${log.passed} passed / ${log.failed} failed` : log.status;
const logRows = rawLogs.map((log) => `| [${log.file.split('/').at(-1)}](../${log.file.split('/').at(-1)}) | ${runLabel(log)} |`).join('\n');
const outputRows = primaryFiles.map((file) => `| [${file.file}](${file.file}) | ${file.width}×${file.height} | ${file.bytes.toLocaleString('en-US')}B |`).join('\n');
const currentFull = rawLogs.find((log) => log.file === '.preview/p86-e2e-full.log');
const warningsText = warnings.length
  ? '## 인덱스 생성 시 주의\n\n' + warnings.map((warning) => '- ' + warning).join('\n') + '\n'
  : '인덱스 생성 시 파일/시각 검수 해시 불일치 경고는 없었다. 이것만으로 전체 테스트/UX/공개 권리를 인증하지 않는다.\n';
const readme = `# P8.6 통합 UI·출력 검증 산출물

기준일: ${checkedOn}. ${finalSnapshot ? '최종 요청에 따라 보존한 파일 인덱스' : '현재 파일을 읽은 중간 증거 스냅샷'}다. 이 생성기는 테스트·앱·게임 계산을 실행하지 않고 실제 파일과 원시 로그를 읽는다. 전체 테스트 성공이나 게임 정확도·권리 승인을 자동 선언하지 않는다.

현재 payload ${payloads.length}개와 PNG ${payloads.filter((file) => file.width).length}개의 바이트·SHA-256·해상도·목적은 [manifest.json](manifest.json)에 있다. 생성 README도 해시로 포함하며 manifest 자신의 순환 해시는 제외한다. 파일은 이후 수정되면 다시 인덱싱해야 한다.

**로컬 기술 검증과 공개 이미지 권리는 별개다.** 이미지 ${rights.totalCanonicalIds}개 canonical ID 중 승인 ${rights.approved}/pending ${rights.pending}. 이 폴더의 실제 게임 그림·공유 PNG·참고 스크린샷도 공개 재배포 승인이 확보된 결과물로 취급하지 않는다. 일반 공개 빌드/P9 자동 공개 게이트는 유지한다. 실제 게임 ID와 사용자 합성 인자 입력을 구분하며 완성 한국 인자의 실물 관측 인증이 아니다.

## 기본 출력 3종

| 실제 다운로드 파일 | 현재 해상도 | 파일 크기 |
|---|---:|---:|
${outputRows || '| 아직 없음 | — | — |'}

7인·31인은 같은 상위 계보를 가진 시각형 트리, 서포트6장은 카드 편성과 현재 추천의 양립 수급표다. 내부 canonical ID/UUID·원본 출처 나열을 기본 PNG에 인쇄하지 않으며 같은 이름의 \`*.capture.json\`·\`*.canvas-text.json\`과 V1 JSON에서 내부 대응을 감사한다. 표의 경로는 획득 보장·인자화 성공률이 아니다. [png-visual-qa.json](png-visual-qa.json)은 명시적으로 연 실제 출력과100% 확대 검수의 범위를 기록한다.

PNG 육안 검수 기록과 현재 바이트의 일치: ${pngQaFreshness.length}개 중 ${pngQaFreshness.filter((file) => file.matchesReviewedFile).length}개. 불일치가 있으면 최신 파일을 다시 열어 검수하기 전 최종 시각 검증으로 합산하지 않는다.

## 화면·저장·수급·연결선 증거

- \`before-{1440,1024,768,375}-*.png\`: 변경 전 실제 선택·계보·우선순위 화면. [before-connector-measurements.json](before-connector-measurements.json)은 이전 선 위치의 측정값이다.
- \`{desktop,mobile}-{width}-costume-gallery.png\`, \`support-gallery.png\`, \`support-rarities.png\`: 새 이미지 갤러리와 같은 인물의R/SR/SSR 실제 카드 비교. \`*-gallery-layout.json\`과 [galleries-validation.json](galleries-validation.json)에 열수·44px타깃·넘침·키보드/터치·검수 범위가 있다.
- \`*-lineage-{width}-{7,31}-{80,100,150}pct.png\`와 \`*-connector-measurements.json\`: 동일 트리의 viewport/zoom 및 실제 앵커/선 측정. 소유·부모 관계의 새로운 게임 규칙을 추정하지 않는다.
- \`*-presentation-roundtrip-{before,after}.json\`, \`*.validation.json\`:7/31 표시·줌·조회 전후 실제 V1 입력·31개UUID·잠금·백인자·dirty 보존 검사.
- \`*-support-table-coverage.validation.json\`: 현재 편성의 스킬 행 전체와 실제 공급 카드·양립 경로 대응. 과거 캐시의 단순 합집합을 현재 수급으로 쓰지 않는다.
- \`*-user-*.png\`, \`*-user-flow.validation.json\`: 네 화면 폭의 실제 7/31인 계보·노드 편집·본육성6장·전역 우선순위·이번 추천 적용 조건. 보이는 그림의 decode 이후 캡처하고 가로 넘침/pageerror를 검사했다.
- \`*-{width}-flow-{7,31,supports}.png\`와 \`*-four-width-output.validation.json\`: PC·모바일 프로젝트의 네 화면 폭에서 각각 실제 버튼으로 받은3종, 총24개 PNG. 대표6파일을 덮지 않고 치수·SHA·이미지ID·현재 스킬48행을 별도로 대조했다.
- \`*-automation*.json/png\`: 두 독립 자동 기능의 미리보기·취소·명시 적용, 허용 변경 범위와 전체 UUID·잠금·상위7 보존 및 오래된 미리보기 차단.
- [p86-persistence-evidence.json](p86-persistence-evidence.json): PC·모바일 각각31노드 직접 입력·저장·새로고침·명시 복원의 전체 JSON/입력/메타데이터/UUID/바이트/SHA 대조와 원본 다운로드 파일.
- [p86-e2e-case-coverage.validation.json](p86-e2e-case-coverage.validation.json): 현재112개 시나리오 목록과 실제 pass/fail 로그를 같은 프로젝트·파일·전체 제목으로 대조한 감사. 반복 통과를 새 사례로 더하지 않고 실패 이력도 남긴다. 단일112개 일괄 성공 실행이나 매 실행 소스 바이트 일치 인증은 아니다.
- \`*-comparison-*.json/png/txt\`: 저장 A/B와 현재 데이터의 추천/6장 자체 재평가. \`*-images-failed.png\`는 의도적 이미지 요청 실패 자료다.
- \`private-static-{root,nested}.png\`: 비공개 정적 이미지·Canvas 검증. 공개 호스팅이나 전체 게임DB 프로덕션 검증이 아니다.

보존 감사는 [p86-preservation.validation.json](../../data/local/p86-preservation.validation.json), 정적 검증은 [p86-static-assets.validation.json](../../data/local/p86-static-assets.validation.json)을 따른다. 해당 원문 파일·출처 매니페스트도 해시로 연결했다. 현재 보호 파일 ${protectedSources.length}개를 감사 기록의 SHA와 읽기 전용으로 대조했으며 일치 ${protectedSources.filter((file) => file.currentMatchesPreservationRecord).length}개다. 이전 P8/P8.5 산출물의 보존 범위는 감사 JSON의 \`originalArtifacts\`를 따른다.

## 원시 실행 기록 — 각 실행을 따로 보존

전체 실행 로그 현재 상태: ${currentFull ? runLabel(currentFull) : '아직 발견되지 않음'}. 진행 중이면 \`incomplete\`로 남기며 실패한 실행을 후속 통과로 덮어쓰지 않는다. 서로 다른 로그의 통과 수를 단순 합산해 전체 사례 수로 표시하지 않는다. 종료 코드가 원문에 없는 명령은 \`null\`로 남기고 빈 lint/type 로그도 임의의 성공 종료 코드로 바꾸지 않는다.

| 원시 로그 | 읽어 확인한 결과 |
|---|---|
${logRows || '| 아직 없음 | — |'}

모든 로그의 SHA·바이트와 E2E 기대/통과/실패/진행 수는 manifest의 \`rawLogs\`에 있다. 초기 선택자·시각 검수·복원 문제의 실패 로그는 삭제하지 않는다. 실제 최종 판정·실패 원인·수정 후 재실행 범위는 [P86_INTEGRATED_UX_OUTPUT_VALIDATION.md](../../docs/P86_INTEGRATED_UX_OUTPUT_VALIDATION.md)를 따른다. [이미지 출처·이용조건](../../docs/P85_ASSET_SOURCES.md)과 기존 데이터 공백도 별개로 유지한다.

${warningsText}
재생성: \`node scripts/validate/p86-evidence.mjs\` (실행 위치: 프로젝트 루트). 최종 파일이 고정된 후 \`--final\`을 지정할 수 있으며, 이 경우 누락 참조·보호 파일 불일치·PNG 검수 해시 불일치를 오류로 반환한다.
`;
if (!dryRun) writeFileSync(readmePath, readme, 'utf8');
const files = walk(artifactRoot).filter((file) => file !== manifestPath).map((file) => ({ ...describeFile(file, artifactRoot), purpose: purpose(slash(relative(artifactRoot, file))) }));
const manifest = { contract: 'uma-p86-local-evidence-index', schemaVersion: 1, checkedOn, generatedAt: new Date().toISOString(),
  stage: finalSnapshot ? 'final-requested-file-snapshot' : 'intermediate-file-snapshot', manifestSelfHashExcluded: true,
  scope: 'Local technical artifact index; whole-task completion, game-calculation accuracy, and image redistribution permission are not inferred.',
  payloadFiles: payloads.length, pngFiles: payloads.filter((file) => file.width).length,
  executionPolicy: 'Each raw run is preserved independently. Final per-scenario coverage must be assessed from the main validation report; no cross-log sum or unknown exit-code promotion.',
  rawLogs, assets: assetCounts, publicRights: rights, references, protectedSources,
  preservationGroups: preservation?.sourceGroups ?? [], previousP8Artifacts: preservation?.originalArtifacts ?? [],
  pngVisualQaFreshness: pngQaFreshness, warnings, files };
if (!dryRun) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ stage: manifest.stage, dryRun, payloadFiles: payloads.length, indexedFiles: files.length, pngFiles: manifest.pngFiles, rawLogs: rawLogs.length,
  fullE2eStatus: currentFull?.status ?? 'not-found', warnings, output: projectPath(manifestPath) }, null, 2));
if (finalSnapshot && warnings.length) process.exitCode = 1;
