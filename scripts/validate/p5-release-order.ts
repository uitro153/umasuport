import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { validateP5Snapshot } from '../../src/domain/p5-forecast';
import { buildP5AvailabilityContext, getP5Availability } from '../../src/engine/p5-availability';

const p3Bytes = await readFile('data/local/p3-skill-support.json');
const p5Bytes = await readFile('data/local/p5-forecast.json');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const snapshot = validateP3Snapshot(JSON.parse(p3Bytes.toString('utf8')) as unknown);
const p5 = validateP5Snapshot(JSON.parse(p5Bytes.toString('utf8')) as unknown, snapshot);
const baselineHash = hash(p3Bytes);
assert.equal(snapshot.skills.length, 2223); assert.equal(snapshot.supports.length, 566);
assert.equal(p5.tournaments.length, 14); assert.equal(p5.releases.length, 120);
const contexts = new Map(p5.tournaments.map((event) => [event.eventId, buildP5AvailabilityContext(snapshot, p5, event.eventId)!]));
const events = p5.tournaments.map((event) => {
  const context = contexts.get(event.eventId)!;
  const content = p5.releases.map((release) => ({ entityType: release.entityType, entityId: release.entityId,
    displayName: release.displayName, jpReleaseDate: release.jpDate, krDisplayDate: release.krForecastDate,
    allowed: getP5Availability(snapshot, release.entityType, release.entityId, context, true),
    forecastDisabled: getP5Availability(snapshot, release.entityType, release.entityId, context, false),
  }));
  const counts = (type: 'support' | 'scenario', allowForecast: boolean) => {
    const ids = type === 'support' ? snapshot.supports.map((row) => row.supportId) : snapshot.scenarios.map((row) => row.scenarioId);
    const result = { available: 0, unavailable: 0, unknown: 0, jpOrderExpected: 0, availableIds: [] as string[] };
    for (const id of ids) {
      const availability = getP5Availability(snapshot, type, id, context, allowForecast);
      result[availability.state]++;
      if (availability.state === 'available') result.availableIds.push(id);
      if (availability.state === 'available' && availability.basis === 'jp-release-order') result.jpOrderExpected++;
    }
    return result;
  };
  const support = counts('support', true); const scenario = counts('scenario', true);
  const forecastOffSupport = counts('support', false); const forecastOffScenario = counts('scenario', false);
  assert.ok(support.available >= forecastOffSupport.available);
  assert.ok(scenario.available >= forecastOffScenario.available);
  if (event.format === 'league-of-heroes') {
    assert.equal(event.conditions.weather, null); assert.equal(event.conditions.ground, null);
  }
  if (event.expectedMonth) { assert.equal(event.startAt, null); assert.equal(event.expectedDate, null); }
  return { eventId: event.eventId, format: event.format, jpEventId: event.jpEventId, jpEventDate: context.jpEventDate,
    expectedDate: event.expectedDate, expectedMonth: event.expectedMonth, expectedWindow: event.expectedWindow,
    startAt: event.startAt, rangeMembership: event.rangeMembership, analysisWindow: event.analysisWindow,
    support, scenario, forecastOffSupport, forecastOffScenario, content };
});
const cm44 = events.find((event) => event.eventId === 'kr-cm-44')!;
const conflicts = cm44.content.filter((row) => row.jpReleaseDate !== null && row.krDisplayDate !== null
  && (row.jpReleaseDate <= cm44.jpEventDate!) !== (row.krDisplayDate <= cm44.expectedDate!));
assert.equal(conflicts.length, 16);
assert.equal(conflicts.filter((row) => row.entityType === 'costume').length, 3);
assert.equal(conflicts.filter((row) => row.entityType === 'support').length, 12);
assert.equal(conflicts.filter((row) => row.entityType === 'scenario').length, 1);
assert.ok(conflicts.every((row) => row.allowed.state === 'available' && row.allowed.basis === 'jp-release-order'));
assert.ok(conflicts.every((row) => row.forecastDisabled.state !== 'available'));
const scenario13 = conflicts.find((row) => row.entityType === 'scenario' && row.entityId === '13')!;
assert.equal(scenario13.jpReleaseDate, '2026-02-24'); assert.equal(scenario13.krDisplayDate, '2027-06-15');
assert.equal(cm44.jpEventDate, '2026-03-22'); assert.equal(cm44.expectedDate, '2027-06-14');

const routeRows = p5.releases.flatMap((release) => release.routes.map((route, index) => {
  const providerAvailableEventIds: string[] = []; const selectedSourceEventIds: string[] = [];
  const withheldEvents: { eventId: string; reason: string }[] = [];
  for (const event of p5.tournaments) {
    const context = contexts.get(event.eventId)!;
    const provider = getP5Availability(snapshot, release.entityType, release.entityId, context, true);
    const sourceSkill = getP5Availability(snapshot, 'skill', route.skillId, context, true);
    if (provider.state !== 'available') { withheldEvents.push({ eventId: event.eventId, reason: 'provider-order-not-available' }); continue; }
    if (sourceSkill.state === 'unavailable') { withheldEvents.push({ eventId: event.eventId, reason: 'source-skill-after-event' }); continue; }
    providerAvailableEventIds.push(event.eventId);
    const selectedServer = provider.basis === 'jp-release-order' ? 'JP' : 'KR';
    if (route.server === selectedServer) selectedSourceEventIds.push(event.eventId);
    else withheldEvents.push({ eventId: event.eventId, reason: 'reference-source-family-not-used-as-new-KR-supply' });
  }
  const legacyDatedIds = route.appliesTo;
  const datedEvents = p5.tournaments.filter((event) => event.expectedDate !== null).map((event) => event.eventId);
  return { providerType: release.entityType, providerId: release.entityId, routeIndex: index,
    skillId: route.skillId, sourceServer: route.server, acquisition: route.acquisition,
    legacyDatedIds, providerAvailableEventIds, selectedSourceEventIds, withheldEvents,
    changedDatedOrder: datedEvents.filter((id) => legacyDatedIds.includes(id) !== providerAvailableEventIds.includes(id)),
    monthly: route.monthlyForecastApplicability.map((old) => ({ eventId: old.eventId, oldStatus: old.status,
      recomputedProviderState: providerAvailableEventIds.includes(old.eventId) ? 'expected-available-by-JP-order' : 'not-available-by-JP-order',
      selectedRecordedSource: selectedSourceEventIds.includes(old.eventId) })),
  };
}));
assert.equal(routeRows.length, 1871);
assert.ok(routeRows.every((row) => ['KR', 'JP'].includes(row.sourceServer)));
const monthly = events.filter((event) => event.expectedMonth !== null);
assert.deepEqual(monthly.map((event) => event.expectedMonth), ['2027-07', '2027-08', '2027-09', '2027-10', '2027-11']);
const boundary = monthly.at(-1)!;
assert.equal(boundary.expectedWindow?.through, '2027-11-30');
assert.equal(boundary.analysisWindow?.through, '2027-11-04');
const knownSkillJpDates = snapshot.applications.filter((row) => row.entityType === 'skill' && row.jpDate !== null).length;
assert.equal(knownSkillJpDates, 0);
const compareSourceCounts = (rows: unknown[]) => rows.map((source) => {
  const eventId = source !== null && typeof source === 'object' && 'eventId' in source ? source.eventId : null;
  const current = events.find((event) => event.eventId === eventId);
  assert.ok(current, 'A reference availability row must identify a known P5 event');
  return { sourceReference: source, recomputed: { eventId: current.eventId, jpEventDate: current.jpEventDate,
    support: current.support, scenario: current.scenario },
  interpretation: 'The source Korean-date aggregates are preserved for comparison, never used as recommendation eligibility.' };
});
const legacyAvailabilityComparison = compareSourceCounts(p5.sourceDerived.availabilityByEvent);
const monthlyAvailabilityComparison = compareSourceCounts(p5.sourceDerived.monthlyAvailabilityByEvent);
assert.equal(hash(await readFile('data/local/p3-skill-support.json')), baselineHash);
assert.equal(hash(await readFile('data/local/p5-forecast.json')), hash(p5Bytes));
const report = { checkedOn: p5.asOf, snapshotId: snapshot.snapshotId, p5SnapshotId: p5.snapshotId,
  p3Sha256: baselineHash, immutableSource: true, policy: 'official-KR-preserved-otherwise-JP-release-vs-JP-event',
  conflictCount: conflicts.length, cm44Conflicts: conflicts,
  derivedAudit: { sourceAvailabilityByEventRows: p5.sourceDerived.availabilityByEvent.length,
    sourceMonthlyAvailabilityRows: p5.sourceDerived.monthlyAvailabilityByEvent.length,
    sourceRowsRemainReferenceOnly: true, recomputedEvents: events.length, recomputedRoutes: routeRows.length,
    routeRowsWithChangedDatedOrder: routeRows.filter((row) => row.changedDatedOrder.length > 0).length,
    changedDatedOrderDecisions: routeRows.reduce((sum, row) => sum + row.changedDatedOrder.length, 0),
    sameMonthReferenceDecisions: routeRows.flatMap((row) => row.monthly).filter((row) => row.oldStatus === 'within-event-month-order-uncertain').length,
    originalAppliesToNotUsedForRecommendation: true },
  events, routes: routeRows, legacyAvailabilityComparison, monthlyAvailabilityComparison,
  limitations: { knownSkillFirstJpReleaseDates: knownSkillJpDates,
    firstReleaseDatesInvented: 0, expectedSupplyCanUseRecordedJpBeforeProvider: true,
    expectedSupplyIsNotKrOrPatchCertification: true, skillDataQuantitativeCertificationRows: 0,
    novemberLohMayBeginAfterHorizon: true, noSingleDateCreatedForMonthlyOrConditionalWindowEvents: true },
};
await writeFile('data/local/p5-release-order.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ conflicts: report.conflictCount, derivedAudit: report.derivedAudit,
  events: events.map((event) => ({ eventId: event.eventId, jp: event.jpEventDate,
    expectedMonth: event.expectedMonth, support: event.support.available, supportForecastOff: event.forecastOffSupport.available,
    scenario: event.scenario.available, scenarioForecastOff: event.forecastOffScenario.available })),
  limitations: report.limitations }, null, 2));
