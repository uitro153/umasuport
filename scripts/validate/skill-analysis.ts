import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { evaluateSkills } from '../../src/engine/skill-evaluation';
import { analyzeSupportDeck, getP3Availability } from '../../src/engine/support-acquisition';

const snapshot = validateP3Snapshot(JSON.parse(await readFile('data/local/p3-skill-support.json', 'utf8')) as unknown);
const deck = ['30028', '30016', '30023', '30007', '30009', '30011'].map((supportId) => ({ supportId, limitBreak: 4 }));
const analyze = (eventId: string, runningStyle: 'front' | 'end', preference: 'balanced' | 'skills' | 'stability' = 'balanced') => {
  const event = snapshot.tournaments.find((row) => row.eventId === eventId)!;
  const course = snapshot.courses.find((row) => row.courseId === event.courseId)!;
  return evaluateSkills(snapshot, {
    course: { courseId: course.courseId, trackId: course.trackId, distanceM: event.conditions.distance,
      surface: event.conditions.surface === 1 ? 'turf' : 'dirt', rotation: event.conditions.direction,
      season: event.conditions.season, weather: event.conditions.weather, groundCondition: event.conditions.ground },
    runningStyle, cutoffDate: '2026-11-05', deck, includeUnknown: true, preference,
  });
};
const mile = analyze('kr-cm-36', 'end');
const classic = analyze('kr-cm-38', 'front');
const long = analyze('kr-cm-37', 'end');
const skill = (rows: typeof mile.rows, id: string) => {
  const row = rows.find((candidate) => candidate.skillId === id);
  assert.ok(row, `Missing real skill ${id}`);
  return row;
};
// These expectations are direct source-record/condition transcriptions, not measured race gains.
assert.equal(skill(mile.rows, '200012').cost, 90);
assert.equal(skill(mile.rows, '200012').grade, 'priority');
assert.equal(skill(classic.rows, '200012').applicability, 'inapplicable');
assert.equal(skill(classic.rows, '200022').grade, 'priority');
assert.equal(skill(classic.rows, '200172').grade, 'priority');
assert.equal(skill(classic.rows, '202652').cost, 180);
assert.equal(skill(classic.rows, '202652').grade, 'supplementary');
assert.equal(skill(mile.rows, '200011').totalCost, 200);
assert.equal(skill(mile.rows, '200014').totalCost, 330);
assert.equal(skill(classic.rows, '200642').applicability, 'inapplicable');
assert.equal(skill(long.rows, '200642').applicability, 'conditional');
assert.ok(mile.rows.every((row) => row.bashinGain === null && row.activationRate === null));
assert.ok(mile.rows.every((row) => row.availability.state === 'unknown'));
assert.equal(mile.deckAnalysis.cards.filter((card) => card.accepted).length, 6);
const corner = skill(mile.rows, '200332');
assert.ok(corner.routes.some((route) => route.supportId === '30028' && route.kind === 'hint'));
assert.ok(corner.routes.some((route) => route.supportId === '30028' && route.kind === 'gold-lower' && route.goldSkillId === '200331'));
assert.ok(skill(mile.rows, '200352').routes.some((route) => route.supportId === '30016' && route.kind === 'gold-lower' && route.goldSkillId === '200351'));
const oneCard0 = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 0 }], '2026-11-05');
const oneCard4 = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2026-11-05');
assert.equal(oneCard0.routes.find((route) => route.kind === 'hint')?.hintLevel, 1);
assert.equal(oneCard4.routes.find((route) => route.kind === 'hint')?.hintLevel, 2);
assert.equal(getP3Availability(snapshot, 'support', '30028', '2022-07-24').state, 'unavailable');
assert.equal(getP3Availability(snapshot, 'support', '30028', '2022-07-25').basis, 'secondary-date');
assert.equal(getP3Availability(snapshot, 'support', '20089', '2026-10-10').state, 'unavailable');
assert.equal(getP3Availability(snapshot, 'support', '20089', '2026-11-05').state, 'available');
for (const preference of ['skills', 'stability'] as const) {
  const variant = analyze('kr-cm-36', 'end', preference);
  assert.deepEqual(variant.rows.map((row) => row.skillId).sort(), mile.rows.map((row) => row.skillId).sort());
  for (const row of variant.rows) assert.equal(row.grade, skill(mile.rows, row.skillId).grade);
}
const report = {
  checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId,
  scope: 'actual-data-qualitative-evaluation-and-route-regression',
  skills: snapshot.skills.length, supports: snapshot.supports.length,
  sourceManifestSha256: snapshot.sourceManifestSha256,
  officialTournaments: snapshot.tournaments.filter((event) => event.dateStatus === 'confirmed').length,
  undatedTournamentNotExtrapolated: snapshot.tournaments.find((event) => event.eventId === 'kr-cm-39-undated')?.startAt === null,
  sixKnownSupportCardsAnalyzed: mile.deckAnalysis.cards.filter((card) => card.accepted).length,
  routeCounts: { hint: mile.deckAnalysis.routes.filter((route) => route.kind === 'hint').length,
    event: mile.deckAnalysis.routes.filter((route) => route.kind === 'event').length,
    goldLower: mile.deckAnalysis.routes.filter((route) => route.kind === 'gold-lower').length },
  examples: [
    { case: 'right-90Pt-mile', skillId: '200012', grade: skill(mile.rows, '200012').grade },
    { case: 'right-excluded-left-course', skillId: '200012', applicability: skill(classic.rows, '200012').applicability },
    { case: 'left-90Pt-classic', skillId: '200022', grade: skill(classic.rows, '200022').grade },
    { case: 'spring-90Pt', skillId: '200172', grade: skill(classic.rows, '200172').grade },
    { case: 'confident-180Pt', skillId: '202652', grade: skill(classic.rows, '202652').grade },
    { case: 'circle-doublecircle-gold-totalPt', totalPt: [90, skill(mile.rows, '200011').totalCost, skill(mile.rows, '200014').totalCost] },
    { case: 'end-style-only', skillId: '200642', front: skill(classic.rows, '200642').applicability, end: skill(long.rows, '200642').applicability },
  ],
  preferencePreservesSkillSetAndGrades: true,
  skillAvailabilityCertifiedBySupportDate: false,
  counts: { mile: mile.counts, classic: classic.counts, long: long.counts },
  measuredBashinCases: 0, independentKrGameplayCases: 0,
  note: 'Actual source records and qualitative policy checks; not a race simulator, measured activation rate, or certification of historical Korean skill patches.',
};
await writeFile('data/local/p3-analysis.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
