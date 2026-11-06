import { z } from 'zod';
import { dateOnlySchema, idSchema, offsetDateTimeSchema, textSchema } from './primitives';
import { p3TournamentSchema, type P3Snapshot, type P3Tournament } from './skill-support';
import type { DeepReadonly } from '../data/snapshot';

const nullableDate = dateOnlySchema.nullable();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/);
export const p5SourceSchema = z.looseObject({
  url: z.url({ protocol: /^https?$/ }), checkedOn: dateOnlySchema,
  type: textSchema, verificationStatus: textSchema,
});
const intervalSchema = z.strictObject({ from: dateOnlySchema, through: dateOnlySchema })
  .refine((range) => range.from <= range.through, 'Reversed date interval');
const expectedWindowSchema = z.strictObject({ from: dateOnlySchema, through: dateOnlySchema, basis: textSchema })
  .refine((range) => range.from <= range.through, 'Reversed forecast interval');
export const p5TournamentSchema = z.strictObject({
  eventId: idSchema, name: textSchema, startAt: offsetDateTimeSchema.nullable(),
  server: z.literal('KR'), dateStatus: z.enum(['confirmed', 'forecast', 'secondary', 'unknown']),
  format: z.enum(['champions-meeting', 'league-of-heroes']),
  courseId: idSchema, conditions: p3TournamentSchema.shape.conditions,
  fieldSize: z.number().int().positive(), timeOfDay: z.enum(['day', 'night']).nullable(),
  sourceIds: z.array(idSchema), sourceUrl: z.url({ protocol: /^https?$/ }), evidence: textSchema,
  checkedOn: dateOnlySchema, sources: z.array(p5SourceSchema).min(1),
  expectedDate: nullableDate, expectedMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),
  expectedWindow: expectedWindowSchema.nullable(),
  jpEventId: idSchema, jpStartAt: offsetDateTimeSchema.nullable(),
  rangeMembership: textSchema.nullable(), analysisWindow: intervalSchema.nullable(),
  specialRulesStatus: textSchema.nullable(), assumptions: z.array(textSchema), raw: z.unknown(),
}).superRefine((event, ctx) => {
  if (event.expectedMonth) {
    const [year, month] = event.expectedMonth.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
    if (!event.expectedWindow || event.expectedWindow.from !== `${event.expectedMonth}-01`
      || event.expectedWindow.through !== `${event.expectedMonth}-${lastDay}` || event.expectedDate !== null) {
      ctx.addIssue({ code: 'custom', message: 'Monthly forecast requires its full-month interval and no invented exact date' });
    }
  }
  if (event.dateStatus === 'forecast' && event.startAt !== null) ctx.addIssue({ code: 'custom', message: 'A forecast does not create a confirmed start timestamp' });
  if (event.format === 'league-of-heroes' && (event.conditions.weather !== null || event.conditions.ground !== null)) {
    ctx.addIssue({ code: 'custom', message: 'This handoff has random LoH weather and going; preserve null' });
  }
  if (event.analysisWindow && (!event.expectedWindow || event.analysisWindow.from < event.expectedWindow.from
    || event.analysisWindow.through > event.expectedWindow.through)) ctx.addIssue({ code: 'custom', message: 'Analysis interval must stay inside forecast interval' });
});
export const p5RouteSchema = z.strictObject({
  supportId: idSchema, skillId: idSchema, server: z.enum(['KR', 'JP']), acquisition: z.enum(['hint', 'event']),
  sourceGroup: z.number().int().nullable(), sourceIds: z.array(idSchema).min(1),
  eventId: idSchema.optional(), choiceId: idSchema.optional(), hintLevel: z.number().nullable(),
  appliesTo: z.array(idSchema), monthlyForecastApplicability: z.array(z.strictObject({ eventId: idSchema, status: textSchema })),
  whiteFactorEligibility: textSchema, krApplicability: textSchema, raw: z.unknown(),
});
export const p5ReleaseSchema = z.strictObject({
  entityType: z.enum(['support', 'scenario', 'costume']), entityId: idSchema,
  nameKo: textSchema.nullable(), nameJa: textSchema.nullable(), displayName: textSchema,
  jpDate: nullableDate, krConfirmedDate: nullableDate, krForecastDate: nullableDate,
  releaseStatus: textSchema, sources: z.array(p5SourceSchema).min(1), routes: z.array(p5RouteSchema), raw: z.unknown(),
});
export const p5SkillEvidenceSchema = z.strictObject({
  eventId: idSchema, courseId: idSchema, runningStyle: z.enum(['front', 'pace', 'late', 'end']),
  skillId: idSchema, kind: textSchema, sourceServer: z.enum(['KR', 'JP']),
  effectiveRate: z.number().nullable(), measuredMargin: z.number().nullable(),
  enginePriority: z.literal('advisory-not-hard-constraint'), sources: z.array(p5SourceSchema).min(1),
  patchVersion: textSchema.nullable(), unresolved: z.array(textSchema), raw: z.unknown(),
});
const correctionSchema = z.strictObject({
  entityType: z.literal('scenario'), entityId: idSchema, originalObservedDate: dateOnlySchema,
  proposedField: z.literal('forecastDate'), proposedDate: dateOnlySchema, status: textSchema,
  sources: z.array(p5SourceSchema).min(1),
});
const screeningSchema = z.looseObject({
  eventId: idSchema, entityType: z.enum(['support', 'scenario', 'costume']), entityId: idSchema,
  forecastReleaseDate: dateOnlySchema, forecastEventDate: dateOnlySchema,
  daysUntilEvent: z.number().int(), screeningOnly: z.literal(true), separateRecommendation: z.literal(false),
  recommendationClass: z.null(), expectedGain: z.null(), routeSkillIds: z.array(idSchema),
});
const monthlyScreeningSchema = z.looseObject({
  eventId: idSchema, entityType: z.enum(['support', 'scenario', 'costume']), entityId: idSchema,
  forecastReleaseDate: dateOnlySchema, eventMonth: textSchema,
  daysUntilEventRange: z.strictObject({ minimum: z.number().int(), maximum: z.number().int() }),
  classification: z.null(), separateRecommendation: z.literal(false), reason: textSchema,
});
export const p5SnapshotSchema = z.strictObject({
  contract: z.literal('uma-p5-forecast'), schemaVersion: z.literal(1), snapshotId: idSchema,
  asOf: dateOnlySchema, range: intervalSchema, baseSnapshotId: idSchema,
  sourceFiles: z.array(z.strictObject({ file: textSchema, sha256: sha256Schema, bytes: z.number().int().positive() })).min(6),
  baseFiles: z.array(z.strictObject({ path: textSchema, sha256: sha256Schema })).min(3),
  tournaments: z.array(p5TournamentSchema), releases: z.array(p5ReleaseSchema),
  skillEvidence: z.array(p5SkillEvidenceSchema),
  lateRelease: z.strictObject({ records: z.array(z.unknown()), screeningQueue: z.array(screeningSchema),
    monthlyScreeningQueue: z.array(monthlyScreeningSchema), reason: textSchema }),
  proposedCorrections: z.array(correctionSchema),
  sourceDerived: z.strictObject({ availabilityByEvent: z.array(z.unknown()), monthlyAvailabilityByEvent: z.array(z.unknown()),
    coverage: z.array(z.unknown()), unplacedJpEvents: z.array(z.unknown()), patchChanges: z.array(z.unknown()),
    patchChangesStatus: textSchema, unreviewedEventIds: z.array(idSchema), quantitativeRankEligibleRows: z.literal(0) }),
  provenance: z.unknown(),
  importMetadata: z.strictObject({ sourcePolicy: z.literal('review-only-no-active-db-overwrite'),
    integrationPolicy: z.literal('validated-separate-increment-requested-by-user'),
    derivedAvailabilityPolicy: z.literal('preserved-reference-only-recompute-by-common-engine'),
    zipSha256: sha256Schema, baseFilesVerified: z.literal(true) }),
});

export type P5Snapshot = z.infer<typeof p5SnapshotSchema>;
export type P5Tournament = z.infer<typeof p5TournamentSchema>;
export type P5Release = z.infer<typeof p5ReleaseSchema>;
export type P5Route = z.infer<typeof p5RouteSchema>;
export type P5SkillEvidence = z.infer<typeof p5SkillEvidenceSchema>;
export type P5TournamentChoice = P3Tournament & { forecast: DeepReadonly<P5Tournament> | null };

/** A separate increment. Validation does not mutate or broaden the strict P3 contract. */
export function validateP5Snapshot(input: unknown, base?: DeepReadonly<P3Snapshot>, costumeIds?: ReadonlySet<string>): P5Snapshot {
  const pack = p5SnapshotSchema.parse(input);
  unique(pack.tournaments.map((event) => event.eventId), 'tournament');
  unique(pack.tournaments.map((event) => event.jpEventId), 'JP tournament');
  unique(pack.releases.map((release) => `${release.entityType}:${release.entityId}`), 'release');
  unique(pack.sourceFiles.map((file) => file.file), 'source file');
  const events = new Set(pack.tournaments.map((event) => event.eventId));
  for (const event of pack.tournaments) {
    const window = event.expectedWindow ?? (event.expectedDate ? { from: event.expectedDate, through: event.expectedDate } : null);
    if (window && (window.through < pack.range.from || window.from > pack.range.through)) throw new Error(`Forecast is outside analysis horizon: ${event.eventId}`);
    if (window && window.through > pack.range.through && (!event.rangeMembership?.startsWith('boundary-uncertain')
      || !event.analysisWindow || event.analysisWindow.from < pack.range.from || event.analysisWindow.through > pack.range.through)) throw new Error(`Boundary forecast requires explicit membership and clipped analysis interval: ${event.eventId}`);
  }
  for (const row of pack.releases) for (const route of row.routes) {
    if (row.entityType !== 'support' || route.supportId !== row.entityId) throw new Error('P5 route owner must be its canonical support');
    for (const id of [...route.appliesTo, ...route.monthlyForecastApplicability.map((item) => item.eventId)]) if (!events.has(id)) throw new Error(`Unknown derived route event: ${id}`);
  }
  for (const row of [...pack.skillEvidence, ...pack.lateRelease.screeningQueue, ...pack.lateRelease.monthlyScreeningQueue]) if (!events.has(row.eventId)) throw new Error(`Unknown P5 event reference: ${row.eventId}`);
  for (const row of [...pack.sourceDerived.availabilityByEvent, ...pack.sourceDerived.monthlyAvailabilityByEvent]) {
    const eventId = z.object({ eventId: idSchema }).parse(row).eventId;
    if (!events.has(eventId)) throw new Error(`Unknown source-derived event: ${eventId}`);
  }
  if (!base) return pack;
  if (pack.baseSnapshotId !== base.snapshotId) throw new Error('P5 base snapshot mismatch');
  const supports = new Set(base.supports.map((row) => row.supportId));
  const skills = new Set(base.skills.map((row) => row.skillId));
  const scenarios = new Set(base.scenarios.map((row) => row.scenarioId));
  const sources = new Set(base.sources.map((row) => row.id));
  const routeKeys = new Set(base.supportSkills.map(routeKey));
  for (const event of pack.tournaments) {
    const course = base.courses.find((row) => row.courseId === event.courseId);
    if (!course || course.distance !== event.conditions.distance || course.surface !== event.conditions.surface) throw new Error(`Unknown/mismatched P5 course: ${event.courseId}`);
    for (const source of event.sourceIds) if (!sources.has(source)) throw new Error(`Unknown P3 source: ${source}`);
    const existing = base.tournaments.find((row) => row.eventId === event.eventId);
    if (existing && (existing.courseId !== event.courseId || JSON.stringify(existing.conditions) !== JSON.stringify(event.conditions))) throw new Error(`Conflicting existing tournament: ${event.eventId}`);
  }
  for (const release of pack.releases) {
    const known = release.entityType === 'support' ? supports.has(release.entityId) : release.entityType === 'scenario' ? scenarios.has(release.entityId) : costumeIds?.has(release.entityId);
    if (known === false || (release.entityType !== 'costume' && !known)) throw new Error(`Unknown canonical P5 entity: ${release.entityType}/${release.entityId}`);
    const original = release.entityType === 'costume' ? undefined : base.applications.find((row) => row.entityType === release.entityType && row.entityId === release.entityId);
    if (original && original.jpDate !== release.jpDate) throw new Error(`Conflicting P5 Japanese release date: ${release.entityId}`);
    if (release.krConfirmedDate && original?.kr.confirmedDate !== release.krConfirmedDate) throw new Error('P5 may not invent Korean official releases');
    for (const route of release.routes) {
      if (!skills.has(route.skillId) || !supports.has(route.supportId)) throw new Error('Unknown P5 route ID');
      if (!routeKeys.has(routeKey(route))) throw new Error(`P5 route is not an existing source route: ${route.supportId}/${route.skillId}`);
      for (const id of route.sourceIds) if (!sources.has(id)) throw new Error(`Unknown route source: ${id}`);
    }
  }
  for (const row of pack.skillEvidence) if (!skills.has(row.skillId) || row.courseId !== pack.tournaments.find((event) => event.eventId === row.eventId)?.courseId) throw new Error('Unknown/mismatched skill evidence');
  for (const row of pack.proposedCorrections) {
    const original = base.applications.find((item) => item.entityType === 'scenario' && item.entityId === row.entityId);
    if (!original || original.kr.observedDate !== row.originalObservedDate || row.proposedDate !== row.originalObservedDate) throw new Error('Correction must preserve the recorded original date');
  }
  for (const row of [...pack.lateRelease.screeningQueue, ...pack.lateRelease.monthlyScreeningQueue]) {
    const release = pack.releases.find((item) => item.entityType === row.entityType && item.entityId === row.entityId);
    if (!release) throw new Error('Screening entity must reference a canonical P5 release');
    if ('routeSkillIds' in row) for (const id of z.array(idSchema).parse(row.routeSkillIds)) if (!skills.has(id)) throw new Error('Unknown late-screening skill');
  }
  return pack;
}

/** Display view only: never feed this augmented object into validateP3Snapshot. */
export function mergeP5Tournaments(base: DeepReadonly<P3Snapshot>, pack: DeepReadonly<P5Snapshot>): P5TournamentChoice[] {
  const forecastById = new Map(pack.tournaments.map((event) => [event.eventId, event]));
  const choices: P5TournamentChoice[] = base.tournaments.map((event) => {
    const forecast = forecastById.get(event.eventId);
    if (!forecast || event.dateStatus === 'confirmed') return { ...event, conditions: { ...event.conditions }, sourceIds: [...event.sourceIds], forecast: forecast ?? null };
    return choice(forecast);
  });
  const known = new Set(choices.map((event) => event.eventId));
  for (const event of pack.tournaments) if (!known.has(event.eventId)) { choices.push(choice(event)); known.add(event.eventId); }
  return choices;
}
function choice(event: DeepReadonly<P5Tournament>): P5TournamentChoice {
  return { eventId: event.eventId, name: event.name, startAt: event.startAt, server: event.server, format: event.format,
    fieldSize: event.fieldSize, ...(event.timeOfDay ? { timeOfDay: event.timeOfDay } : {}), dateStatus: event.dateStatus,
    courseId: event.courseId, conditions: { ...event.conditions }, sourceIds: [...event.sourceIds], sourceUrl: event.sourceUrl,
    evidence: event.evidence, checkedOn: event.checkedOn, forecast: event };
}
function unique(ids: readonly string[], label: string) { if (new Set(ids).size !== ids.length) throw new Error(`Duplicate P5 ${label} ID`); }
function routeKey(route: { supportId: string; skillId: string; server: string; acquisition: string; sourceGroup: number | null }) {
  return [route.supportId, route.skillId, route.server, route.acquisition, route.sourceGroup].join('|');
}
