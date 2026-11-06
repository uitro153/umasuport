import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { mergeP5Tournaments, validateP5Snapshot } from '../../src/domain/p5-forecast';
import periods from '../../src/data/tournament-display-periods.json';
import { buildTournamentOptions, representativeScenario } from '../../src/ui/skills/tournament-options';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const p3Bytes = await readFile('data/local/p3-skill-support.json');
const p5Bytes = await readFile('data/local/p5-forecast.json');
const snapshot = validateP3Snapshot(JSON.parse(p3Bytes.toString('utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(p5Bytes.toString('utf8')) as unknown, snapshot);
const choices = mergeP5Tournaments(snapshot, p5);
const options = buildTournamentOptions(snapshot, p5, choices, '2026-11-05');
const rawSource = periods.sources.find((source) => source.id === 'gt-ko-cm-periods')!;
assert.ok(rawSource.file); assert.ok(rawSource.sha256);
const rawBytes = await readFile(rawSource.file);
assert.equal(digest(rawBytes), rawSource.sha256);
const raw = JSON.parse(rawBytes.toString('utf8')) as { id: number; start: number; end: number }[];
const koreanDate = (seconds: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(seconds * 1000));
assert.equal(periods.periods.length, 44);
assert.equal(new Set(periods.periods.map((row) => row.eventId)).size, 44);
for (const row of periods.periods) assert.ok(snapshot.tournaments.some((event) => event.eventId === row.eventId), `Unknown period event ${row.eventId}`);
for (const cm of raw) {
  const row = periods.periods.find((period) => period.eventId === `kr-cm-${cm.id}`)!;
  assert.ok(row); assert.equal(row.sourceId, 'gt-ko-cm-periods'); assert.equal(row.endOn, koreanDate(cm.end));
}
const loh = periods.periods.find((row) => row.eventId === 'kr-loh-2026-09')!;
assert.equal(loh.endOn, '2026-09-21'); assert.equal(loh.sourceId, 'kr-loh-2026-09-help');
assert.equal(snapshot.tournaments.find((event) => event.eventId === loh.eventId)!.startAt?.slice(0, 10), '2026-09-12');
assert.equal(choices.length, 53); assert.equal(new Set(choices.map((event) => event.eventId)).size, 53);
const past = options.filter((option) => option.past); const upcoming = options.filter((option) => !option.past);
assert.equal(past.length, 39); assert.equal(upcoming.length, 14);
assert.equal(upcoming.filter((option) => option.event.forecast).length, 14);
assert.equal(past.filter((option) => option.event.forecast).length, 0);
assert.equal(options.find((option) => option.event.eventId === 'kr-cm-39')!.label, '[무인도] [챔미] [중거리 2200m] 한신');
const event44 = choices.find((event) => event.eventId === 'kr-cm-44')!;
assert.deepEqual(representativeScenario(snapshot, p5, event44), { scenarioId: '13', label: 'Beyond Dreams', basis: 'jp-release-order' });
const scenario13 = p5.releases.find((release) => release.entityType === 'scenario' && release.entityId === '13')!;
assert.equal(scenario13.jpDate, '2026-02-24'); assert.equal(event44.forecast?.jpStartAt?.slice(0, 10), '2026-03-22');
assert.equal(scenario13.krForecastDate, '2027-06-15'); assert.equal(event44.forecast?.expectedDate, '2027-06-14');
for (const option of options) {
  assert.match(option.label, /^\[.+\] \[(챔미|LoH)\] \[(단거리|마일|중거리|장거리) \d+m\] .+/);
  assert.doesNotMatch(option.label, /20\d\d-\d\d|JP-|일본|회차|월 단위 예상/);
  if (option.event.forecast?.expectedMonth) { assert.equal(option.event.forecast.startAt, null); assert.equal(option.event.forecast.expectedDate, null); }
  if (option.event.format === 'league-of-heroes' && option.event.forecast) {
    assert.equal(option.event.conditions.weather, null); assert.equal(option.event.conditions.ground, null);
  }
}
assert.deepEqual(upcoming.filter((option) => option.event.forecast?.expectedMonth).map((option) => option.event.forecast!.expectedMonth), ['2027-07', '2027-08', '2027-09', '2027-10', '2027-11']);
assert.equal(digest(await readFile('data/local/p3-skill-support.json')), digest(p3Bytes));
assert.equal(digest(await readFile('data/local/p5-forecast.json')), digest(p5Bytes));
const report = {
  checkedOn: '2026-11-05', contract: 'uma-tournament-display-validation', gameDataChanged: false,
  snapshotIds: { p3: snapshot.snapshotId, p5: p5.snapshotId },
  originalHashes: { p3: digest(p3Bytes), p5: digest(p5Bytes), gtKoPeriods: digest(rawBytes) },
  periodRecords: periods.periods.length, knownHistorical: past.length, visibleUpcoming: upcoming.length,
  allCanonicalEventsRetained: options.length, monthlyForecastsKept: 5,
  policy: 'Historical display filter uses evidenced KR end dates; forecast/unknown dates are retained. Display representative never changes saved scenario inputs or recommendation eligibility.',
  event44Scenario13: { representative: representativeScenario(snapshot, p5, event44), jpRelease: scenario13.jpDate, jpEvent: event44.forecast?.jpStartAt, krDisplayRelease: scenario13.krForecastDate, krDisplayEvent: event44.forecast?.expectedDate },
  periodSources: periods.sources,
  options: options.map((option) => ({ eventId: option.event.eventId, label: option.label, past: option.past, representative: representativeScenario(snapshot, p5, option.event), jpEventId: option.event.forecast?.jpEventId ?? null, expectedMonth: option.event.forecast?.expectedMonth ?? null })),
  limitations: ['GameTora Korean CM periods remain secondary schedule data.', 'LoH September year context is retained from existing P3 evidence; this display layer is not new official-year certification.'],
};
await writeFile('data/local/p85-tournaments.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ total: report.allCanonicalEventsRetained, historical: report.knownHistorical, upcoming: report.visibleUpcoming, monthlyKept: report.monthlyForecastsKept, cm39: options.find((option) => option.event.eventId === 'kr-cm-39')!.label, cm44: report.event44Scenario13, originalPacksUnchanged: true }, null, 2));
