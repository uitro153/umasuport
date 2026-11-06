import console from 'node:console';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

// This audit reads existing logs; it never starts a browser or modifies tests.
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const listFile = '.preview/p86-e2e-final-list.log';
const runFiles = [
  '.preview/p86-e2e-full.log',
  '.preview/p86-save-final-e2e.log',
  '.preview/p86-final-focused-e2e.log',
  '.preview/p86-user-flow-final-e2e.log',
  '.preview/p86-user-flow-image-ready-e2e.log',
  '.preview/p86-four-width-output-e2e.log',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalizeTitle = (title) => title.normalize('NFC').replace(/\s+/g, ' ').trim();
const basename = (file) => file.replaceAll('\\', '/').split('/').at(-1);
const keyOf = (project, file, title) => JSON.stringify([project, basename(file), normalizeTitle(title)]);

function readLog(file) {
  const bytes = readFileSync(join(root, file));
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
  return { text: stripVTControlCharacters(text).replaceAll('\r', ''), metadata: {
    file, bytes: bytes.length, sha256: sha(bytes), modifiedAt: statSync(join(root, file)).mtime.toISOString(),
  } };
}

const listing = readLog(listFile);
const declared = /Total:\s*(\d+) tests? in (\d+) files?/.exec(listing.text);
const cases = [];
for (const [index, line] of listing.text.split('\n').entries()) {
  const match = /^\s*\[([^\]]+)\]\s+›\s+(.+?\.spec\.[cm]?[jt]sx?):(\d+):(\d+)\s+›\s+(.+?)\s*$/.exec(line);
  if (!match) continue;
  const [, project, file, sourceLine, sourceColumn, title] = match;
  cases.push({ key: keyOf(project, file, title), project, file: basename(file), title: normalizeTitle(title),
    listedLocation: `${file}:${sourceLine}:${sourceColumn}`, listLogLine: index + 1 });
}
if (!declared || cases.length !== Number(declared[1])) throw new Error('Current test list did not parse completely.');
if (new Set(cases.map((entry) => entry.key)).size !== cases.length) throw new Error('Duplicate current project/file/title identities.');
const currentFiles = new Set(cases.map((entry) => entry.file));
if (currentFiles.size !== Number(declared[2])) throw new Error('Current test-file count differs from the collected list.');

const events = [];
const logs = [];
for (const [runOrder, file] of runFiles.entries()) {
  if (!existsSync(join(root, file))) throw new Error(`Required pass/failure evidence is missing: ${file}`);
  const { text, metadata } = readLog(file);
  const runEvents = [];
  for (const [index, line] of text.split('\n').entries()) {
    const match = /^\s*(ok|✓|✔|x|✘|×)\s+(\d+)\s+\[([^\]]+)\]\s+›\s+(.+?\.spec\.[cm]?[jt]sx?):(\d+):(\d+)\s+›\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const [, marker, ordinal, project, sourceFile, sourceLine, sourceColumn, ending] = match;
    const duration = /\s+\((\d+(?:\.\d+)?(?:ms|s|m))\)\s*$/.exec(ending);
    const title = normalizeTitle(duration ? ending.slice(0, duration.index) : ending);
    const event = { key: keyOf(project, sourceFile, title), project, file: basename(sourceFile), title,
      status: ['ok', '✓', '✔'].includes(marker) ? 'passed' : 'failed',
      log: file, logLine: index + 1, runOrder, ordinal: Number(ordinal),
      locationAtExecution: `${sourceFile}:${sourceLine}:${sourceColumn}`, duration: duration?.[1] ?? null };
    events.push(event); runEvents.push(event);
  }
  const summaryCount = (word) => {
    const values = [...text.matchAll(new RegExp(`^\\s*(\\d+) ${word}(?: \\([^\\n]*\\))?\\s*$`, 'gm'))];
    return values.length ? Number(values.at(-1)[1]) : 0;
  };
  const expected = /^Running (\d+) tests? using /m.exec(text);
  const passed = summaryCount('passed'); const failed = summaryCount('failed');
  const skipped = summaryCount('skipped'); const interrupted = summaryCount('interrupted');
  const parsedPasses = runEvents.filter((event) => event.status === 'passed').length;
  const parsedFailures = runEvents.filter((event) => event.status === 'failed').length;
  logs.push({ ...metadata, expected: expected ? Number(expected[1]) : null, passed, failed, skipped, interrupted,
    parsedPassEvents: parsedPasses, parsedFailureEvents: parsedFailures,
    completeSummary: !!expected && passed + failed + skipped + interrupted === Number(expected[1]),
    eventCountsMatchSummary: parsedPasses === passed && parsedFailures === failed });
}

const expectedKeys = new Set(cases.map((entry) => entry.key));
const results = cases.map((entry) => {
  const evidence = events.filter((event) => event.key === entry.key);
  const passes = evidence.filter((event) => event.status === 'passed');
  const failures = evidence.filter((event) => event.status === 'failed');
  const latest = evidence.at(-1) ?? null;
  return { ...entry, hasPassEvidence: passes.length > 0, latestObservedStatus: latest?.status ?? 'not-observed',
    passEvidence: passes, historicalFailures: failures, latestEvidence: latest };
});
const missingPass = results.filter((entry) => !entry.hasPassEvidence);
const latestNotPassed = results.filter((entry) => entry.latestObservedStatus !== 'passed');
const unknownEvents = events.filter((event) => !expectedKeys.has(event.key));
const historicalFailures = events.filter((event) => event.status === 'failed');
const projectSummary = [...new Set(cases.map((entry) => entry.project))].map((project) => {
  const selected = results.filter((entry) => entry.project === project);
  return { project, currentCases: selected.length, withPassEvidence: selected.filter((entry) => entry.hasPassEvidence).length,
    latestObservedPassed: selected.filter((entry) => entry.latestObservedStatus === 'passed').length };
});
const allLogsComplete = logs.every((log) => log.completeSummary && log.eventCountsMatchSummary);
const report = {
  phase: 'P8.6', checkedOn: '2026-11-05', generatedAt: new Date().toISOString(),
  scope: 'Read-only case-identity comparison of the current collected tests and named actual execution logs; no browser/test execution or exact revision attestation.',
  identity: '[project] + spec basename + full NFC title; source line/column and execution duration excluded. No fuzzy title matching.',
  executionOrder: runFiles,
  policy: 'Historical failures stay separate. Repeated passes are evidence for the same case, not extra cases. Later observed failure requires a later pass. A single clean 112-case run is not inferred.',
  collection: { ...listing.metadata, declaredTests: Number(declared[1]), declaredFiles: Number(declared[2]),
    parsedCurrentCases: cases.length, uniqueCurrentCaseKeys: expectedKeys.size, currentFiles: [...currentFiles].sort() },
  projectSummary,
  totals: { currentCases: cases.length, casesWithPassEvidence: results.filter((entry) => entry.hasPassEvidence).length,
    latestObservedPassed: results.filter((entry) => entry.latestObservedStatus === 'passed').length,
    rawPassEvents: events.filter((event) => event.status === 'passed').length,
    uniquePassedCaseKeysAcrossLogs: new Set(events.filter((event) => event.status === 'passed').map((event) => event.key)).size,
    historicalFailureEvents: historicalFailures.length, uniqueHistoricalFailedCaseKeys: new Set(historicalFailures.map((event) => event.key)).size,
    missingPassCases: missingPass.length, latestNotPassedCases: latestNotPassed.length, unmatchedEvents: unknownEvents.length },
  allLogsComplete, allCurrentCasesHavePassEvidence: missingPass.length === 0,
  allCurrentCasesLatestObservedPassed: latestNotPassed.length === 0,
  logs, missingPass, latestNotPassed, unmatchedEvents: unknownEvents, historicalFailures, cases: results,
  limitations: ['Identity coverage does not certify that every case was executed in one run or attest to exact source bytes at every historical run.', 'Functional execution evidence and actual screenshot/PNG visual review are separate.'],
};
const output = join(root, '.preview/p86-artifacts/p86-e2e-case-coverage.validation.json');
mkdirSync(join(root, '.preview/p86-artifacts'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report.totals, projectSummary, allLogsComplete,
  runs: logs.map(({ file, passed, failed, completeSummary, eventCountsMatchSummary }) => ({ file, passed, failed, completeSummary, eventCountsMatchSummary })),
  output: '.preview/p86-artifacts/p86-e2e-case-coverage.validation.json' }, null, 2));
if (!allLogsComplete || missingPass.length || latestNotPassed.length) process.exitCode = 1;
