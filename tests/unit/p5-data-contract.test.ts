import { describe, it, expect } from 'vitest';
import real from '../golden/p5-real-contract-subset.json' with { type: 'json' };
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { mergeP5Tournaments, validateP5Snapshot } from '../../src/domain/p5-forecast';
import { importP5Handoff, type P5HandoffFiles } from '../../src/data/import-p5';

const base = validateP3Snapshot(real.base);
const pack = () => structuredClone(real.p5);
const parsed = () => validateP5Snapshot(pack(), base, new Set());

/** Only the envelope is reconstructed; every game record is the extracted source row. */
function handoff(): P5HandoffFiles {
  const p = parsed();
  const envelope = { schemaVersion: 1, asOf: p.asOf, range: p.range, baseSnapshotId: p.baseSnapshotId,
    importPolicy: 'review-only-no-active-db-overwrite' };
  return {
    'p5-korean-tournament-forecast.json': { ...envelope, records: p.tournaments.map((row) => row.raw),
      coverage: p.sourceDerived.coverage, unplacedJpEvents: p.sourceDerived.unplacedJpEvents },
    'p5-release-and-skill-routes.json': { ...envelope, records: p.releases.map((row) => row.raw),
      availabilityByEvent: p.sourceDerived.availabilityByEvent, monthlyAvailabilityByEvent: p.sourceDerived.monthlyAvailabilityByEvent,
      patchChanges: p.sourceDerived.patchChanges, patchChangesStatus: p.sourceDerived.patchChangesStatus },
    'p5-tournament-skill-evidence.json': { ...envelope, records: p.skillEvidence.map((row) => row.raw),
      unreviewedEventIds: p.sourceDerived.unreviewedEventIds, quantitativeRankEligibleRows: p.sourceDerived.quantitativeRankEligibleRows },
    'p5-late-release-candidates.json': { ...envelope, ...p.lateRelease },
    'proposed-corrections.json': p.proposedCorrections, 'provenance.json': p.provenance,
  };
}

describe('separate P5 real-source increment contract', () => {
  it('preserves all 14 actual candidate IDs, original Japanese events and random LoH conditions', () => {
    const p = parsed();
    expect(p.tournaments).toHaveLength(14);
    expect(new Set(p.tournaments.map((event) => event.jpEventId)).size).toBe(14);
    expect(p.tournaments.filter((event) => event.format === 'league-of-heroes')).toHaveLength(5);
    for (const event of p.tournaments.filter((event) => event.format === 'league-of-heroes')) {
      expect(event.conditions.weather).toBeNull(); expect(event.conditions.ground).toBeNull();
      expect(event.fieldSize).toBe(12);
    }
  });

  it('merges by stable event ID and adds only the nine new candidates', () => {
    const choices = mergeP5Tournaments(base, parsed());
    expect(choices).toHaveLength(base.tournaments.length + 9);
    expect(new Set(choices.map((row) => row.eventId)).size).toBe(choices.length);
    expect(choices.filter((row) => row.eventId === 'kr-cm-39')).toHaveLength(1);
    expect(choices.find((row) => row.eventId === 'kr-cm-39')?.forecast?.jpEventId).toBe('JP-cm-39');
  });

  it('keeps the confirmed existing tournament fields and never rewrites base data', () => {
    const copy = structuredClone(base); const before = JSON.stringify(copy);
    const official = copy.tournaments.find((row) => row.dateStatus === 'confirmed');
    expect(official).toBeDefined();
    const merged = mergeP5Tournaments(copy, parsed());
    expect(merged.find((row) => row.eventId === official!.eventId)).toEqual({ ...official, forecast: null });
    expect(JSON.stringify(copy)).toBe(before);
  });

  it('keeps July-November monthly bounds without creating exact start dates', () => {
    const monthly = parsed().tournaments.filter((event) => event.expectedMonth);
    expect(monthly.map((event) => event.expectedMonth)).toEqual(['2027-07', '2027-08', '2027-09', '2027-10', '2027-11']);
    for (const event of monthly) { expect(event.startAt).toBeNull(); expect(event.expectedDate).toBeNull(); }
    const edge = monthly.at(-1)!;
    expect(edge.expectedWindow?.through).toBe('2027-11-30');
    expect(edge.analysisWindow?.through).toBe('2027-11-04');
    expect(edge.rangeMembership).toContain('may-start-after-2027-11-04');
  });

  it('rejects a fabricated exact timestamp and fixed random LoH weather', () => {
    const time = pack(); time.tournaments[9]!.startAt = '2027-07-01T03:00:00Z' as never;
    expect(() => validateP5Snapshot(time)).toThrow();
    const weather = pack(); weather.tournaments[1]!.conditions.weather = 1 as never;
    expect(() => validateP5Snapshot(weather)).toThrow();
    const month = pack(); month.tournaments[9]!.expectedDate = '2027-07-01' as never;
    expect(() => validateP5Snapshot(month)).toThrow(/no invented exact date/);
  });

  it('retains reviewed-source policies and all raw derived lists without applying them', () => {
    const p = parsed();
    const result = importP5Handoff(handoff(), { snapshotId: p.snapshotId, zipSha256: p.importMetadata.zipSha256,
      sourceFiles: p.sourceFiles, baseFiles: p.baseFiles }, base, new Set());
    expect(result.sourceDerived).toEqual(p.sourceDerived);
    expect(result.releases.flatMap((row) => row.routes).map((row) => row.raw)).toEqual(p.releases.flatMap((row) => row.routes).map((row) => row.raw));
    expect(result.importMetadata.derivedAvailabilityPolicy).toBe('preserved-reference-only-recompute-by-common-engine');
    expect(result.importMetadata.sourcePolicy).toBe('review-only-no-active-db-overwrite');
  });

  it('keeps scenario future-date corrections as metadata and preserves their original value', () => {
    const before = JSON.stringify(base.applications); const p = parsed();
    expect(p.proposedCorrections.map((row) => row.entityId)).toEqual(['12', '13']);
    expect(p.releases.find((row) => row.entityId === '13')?.krForecastDate).toBe('2027-06-15');
    expect(base.applications.find((row) => row.entityType === 'scenario' && row.entityId === '13')?.kr.observedDate).toBe('2027-06-15');
    expect(JSON.stringify(base.applications)).toBe(before);
    const changed = pack(); changed.proposedCorrections[1]!.proposedDate = '2027-06-14';
    expect(() => validateP5Snapshot(changed, base)).toThrow(/preserve the recorded original date/);
  });

  it('refuses a different base snapshot, duplicate event and wrong canonical ID', () => {
    const mismatch = pack(); mismatch.baseSnapshotId = 'different';
    expect(() => validateP5Snapshot(mismatch, base)).toThrow(/base snapshot mismatch/);
    const duplicate = pack(); duplicate.tournaments.push(duplicate.tournaments[0]!);
    expect(() => validateP5Snapshot(duplicate)).toThrow(/Duplicate P5 tournament/);
    const unknown = pack(); unknown.releases.find((row) => row.entityType === 'scenario')!.entityId = 'not-a-real-canonical-entity';
    expect(() => validateP5Snapshot(unknown, base)).toThrow(/Unknown canonical/);
  });

  it('refuses source-unspecified and any new route not already present in the P3 source pack', () => {
    const unspecified = pack(); unspecified.releases.find((row) => row.entityType === 'support')!.routes[0]!.server = 'source_unspecified' as never;
    expect(() => validateP5Snapshot(unspecified, base)).toThrow();
    const invented = pack(); invented.releases.find((row) => row.entityType === 'support')!.routes[0]!.skillId = 'not-a-known-skill';
    expect(() => validateP5Snapshot(invented, base)).toThrow(/Unknown P5 route/);
  });

  it('preserves advisory evidence, zero quantitative certification and no separate late recommendation', () => {
    const p = parsed();
    expect(p.skillEvidence).toHaveLength(11);
    for (const row of p.skillEvidence) {
      expect(row.enginePriority).toBe('advisory-not-hard-constraint');
      expect(row.measuredMargin).toBeNull(); expect(row.effectiveRate).toBeNull();
    }
    expect(p.sourceDerived.quantitativeRankEligibleRows).toBe(0);
    expect(p.lateRelease.records).toEqual([]);
    for (const row of p.lateRelease.screeningQueue) { expect(row.separateRecommendation).toBe(false); expect(row.expectedGain).toBeNull(); }
  });
});
