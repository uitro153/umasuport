import { z } from 'zod';
import { validateP5Snapshot, type P5Snapshot } from '../domain/p5-forecast';
import type { P3Snapshot } from '../domain/skill-support';
import type { DeepReadonly } from './snapshot';

export const P5_FILE_NAMES = [
  'p5-korean-tournament-forecast.json', 'p5-release-and-skill-routes.json',
  'p5-tournament-skill-evidence.json', 'p5-late-release-candidates.json',
  'proposed-corrections.json', 'provenance.json',
] as const;
export type P5HandoffFiles = Record<typeof P5_FILE_NAMES[number], unknown>;
export interface P5ImportMetadata {
  snapshotId: string; zipSha256: string;
  sourceFiles: P5Snapshot['sourceFiles']; baseFiles: P5Snapshot['baseFiles'];
}

const envelopeSchema = z.looseObject({
  schemaVersion: z.literal(1), asOf: z.literal('2026-11-05'),
  range: z.strictObject({ from: z.literal('2026-11-05'), through: z.literal('2027-11-04') }),
  baseSnapshotId: z.string(), importPolicy: z.literal('review-only-no-active-db-overwrite'), records: z.array(z.unknown()),
});
const recordSchema = z.record(z.string(), z.unknown());
function record(input: unknown): Record<string, unknown> { return recordSchema.parse(input); }
function array(input: unknown): unknown[] { return z.array(z.unknown()).parse(input); }

/** Normalize the handoff into a separate pack; source-derived availability remains reference-only. */
export function importP5Handoff(files: P5HandoffFiles, metadata: P5ImportMetadata,
  base: DeepReadonly<P3Snapshot>, costumeIds: ReadonlySet<string>): P5Snapshot {
  const tournaments = envelopeSchema.parse(files['p5-korean-tournament-forecast.json']);
  const releases = envelopeSchema.parse(files['p5-release-and-skill-routes.json']);
  const evidence = envelopeSchema.parse(files['p5-tournament-skill-evidence.json']);
  const late = envelopeSchema.parse(files['p5-late-release-candidates.json']);
  for (const file of [tournaments, releases, evidence, late]) {
    if (file.baseSnapshotId !== base.snapshotId) throw new Error('P5 handoff targets a different P3 snapshot');
  }
  const normalized = {
    contract: 'uma-p5-forecast', schemaVersion: 1, snapshotId: metadata.snapshotId,
    asOf: tournaments.asOf, range: tournaments.range, baseSnapshotId: base.snapshotId,
    sourceFiles: metadata.sourceFiles, baseFiles: metadata.baseFiles,
    tournaments: tournaments.records.map((input) => {
      const row = record(input); const sources = array(row.sources);
      const first = record(sources[0]);
      return {
        eventId: row.eventId, name: row.name, startAt: row.startAt, server: row.server,
        dateStatus: row.dateStatus, format: row.format, courseId: row.courseId, conditions: row.conditions,
        fieldSize: row.fieldSize, timeOfDay: row.timeOfDay ?? null, sourceIds: row.sourceIds ?? [],
        sourceUrl: row.sourceUrl ?? first.url, evidence: row.evidence ?? 'p5-source-forecast-reference',
        checkedOn: row.checkedOn ?? first.checkedOn, sources,
        expectedDate: row.expectedDate ?? null, expectedMonth: row.expectedMonth ?? null,
        expectedWindow: row.expectedWindow ?? null, jpEventId: row.jpEventId, jpStartAt: row.jpStartAt ?? null,
        rangeMembership: row.rangeMembership ?? null, analysisWindow: row.analysisWindow ?? null,
        specialRulesStatus: row.specialRulesStatus ?? null, assumptions: row.assumptions ?? [], raw: input,
      };
    }),
    releases: releases.records.map((input) => {
      const row = record(input);
      return {
        entityType: row.entityType, entityId: row.entityId, nameKo: row.nameKo, nameJa: row.nameJa, displayName: row.displayName,
        jpDate: row.jpDate, krConfirmedDate: row.krConfirmedDate, krForecastDate: row.krForecastDate,
        releaseStatus: row.releaseStatus, sources: row.sources,
        routes: array(row.routes).map((inputRoute) => {
          const route = record(inputRoute);
          return {
            supportId: route.supportId, skillId: route.skillId, server: route.server, acquisition: route.acquisition,
            sourceGroup: route.sourceGroup, sourceIds: route.sourceIds,
            ...(route.eventId !== undefined ? { eventId: route.eventId } : {}),
            ...(route.choiceId !== undefined ? { choiceId: route.choiceId } : {}), hintLevel: route.hintLevel ?? null,
            appliesTo: route.appliesTo ?? [], monthlyForecastApplicability: route.monthlyForecastApplicability ?? [],
            whiteFactorEligibility: route.whiteFactorEligibility, krApplicability: route.krApplicability, raw: inputRoute,
          };
        }), raw: input,
      };
    }),
    skillEvidence: evidence.records.map((input) => {
      const row = record(input);
      return {
        eventId: row.eventId, courseId: row.courseId, runningStyle: row.runningStyle, skillId: row.skillId,
        kind: row.kind, sourceServer: row.sourceServer, effectiveRate: row.effectiveRate,
        measuredMargin: row.measuredMargin, enginePriority: row.enginePriority, sources: row.sources,
        patchVersion: row.patchVersion, unresolved: row.unresolved, raw: input,
      };
    }),
    lateRelease: { records: late.records, screeningQueue: late.screeningQueue,
      monthlyScreeningQueue: late.monthlyScreeningQueue, reason: late.reason },
    proposedCorrections: files['proposed-corrections.json'],
    sourceDerived: {
      availabilityByEvent: releases.availabilityByEvent, monthlyAvailabilityByEvent: releases.monthlyAvailabilityByEvent,
      coverage: tournaments.coverage, unplacedJpEvents: tournaments.unplacedJpEvents,
      patchChanges: releases.patchChanges, patchChangesStatus: releases.patchChangesStatus,
      unreviewedEventIds: evidence.unreviewedEventIds, quantitativeRankEligibleRows: evidence.quantitativeRankEligibleRows,
    },
    provenance: files['provenance.json'],
    importMetadata: { sourcePolicy: tournaments.importPolicy, integrationPolicy: 'validated-separate-increment-requested-by-user',
      derivedAvailabilityPolicy: 'preserved-reference-only-recompute-by-common-engine',
      zipSha256: metadata.zipSha256, baseFilesVerified: true },
  };
  return validateP5Snapshot(normalized, base, costumeIds);
}
