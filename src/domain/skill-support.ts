import { z } from 'zod';
import { dateOnlySchema, idSchema, offsetDateTimeSchema, sourceIdsSchema, textSchema } from './primitives';
import { referenceKrSchema, referenceSourceSchema } from './reference';

const maybeText = textSchema.nullable();
const conditionGroupSchema = z.strictObject({
  condition: maybeText, precondition: maybeText, baseTime: z.number().nullable(),
  effects: z.array(z.strictObject({ type: z.number(), value: z.number(), raw: z.unknown() })),
  raw: z.unknown(),
});
export const p3SkillSchema = z.strictObject({
  skillId: idSchema, nameJa: maybeText, nameKo: maybeText, nameEn: maybeText,
  displayName: textSchema, translationStatus: textSchema,
  rarity: z.number().int().nullable(), cost: z.number().nonnegative().nullable(),
  descriptionKo: maybeText, descriptionJa: maybeText, descriptionEn: maybeText,
  iconId: z.number().int().nullable(), conditionGroups: z.array(conditionGroupSchema),
  sourceIds: sourceIdsSchema, raw: z.unknown(),
});
export const p3SupportSchema = z.strictObject({
  supportId: idSchema, nameJa: maybeText, nameKo: maybeText, nameEn: maybeText,
  displayName: textSchema, translationStatus: textSchema,
  rarity: z.enum(['R', 'SR', 'SSR']), type: textSchema,
  uniqueEffect: z.unknown(), sourceIds: sourceIdsSchema, raw: z.unknown(),
  ownerBaseId: idSchema.nullable().optional(),
});
export const p3SkillRelationSchema = z.strictObject({
  skillId: idSchema, relatedSkillId: idSchema,
  relation: z.enum(['variant', 'evolves_from', 'inherited_version', 'lower_skill']),
  sourceIds: sourceIdsSchema, evidence: textSchema,
});
export const p3SupportSkillSchema = z.strictObject({
  supportId: idSchema, skillId: idSchema, server: textSchema,
  acquisition: textSchema, sourceGroup: z.number().int().nullable(), sourceIds: sourceIdsSchema,
  eventId: idSchema.optional(), choiceId: idSchema.optional(), hintLevel: z.number().nullable().optional(),
});
export const p3ApplicationSchema = z.strictObject({
  entityType: z.enum(['support', 'scenario', 'skill']), entityId: idSchema,
  jpDate: dateOnlySchema.nullable(), kr: referenceKrSchema, patchOverrides: z.array(z.unknown()),
});
export const p3TournamentSchema = z.strictObject({
  eventId: idSchema, name: textSchema, startAt: offsetDateTimeSchema.nullable(),
  server: z.enum(['KR', 'JP']).optional(),
  format: z.enum(['champions-meeting', 'league-of-heroes']).optional(),
  fieldSize: z.number().int().positive().optional(),
  timeOfDay: z.enum(['day', 'night']).optional(),
  dateStatus: z.enum(['confirmed', 'forecast', 'secondary', 'unknown']), courseId: idSchema,
  conditions: z.strictObject({
    distance: z.number().int().positive(), surface: z.union([z.literal(1), z.literal(2)]),
    direction: z.union([z.literal(1), z.literal(2)]),
    season: z.number().int().positive(),
    weather: z.number().int().positive().nullable(), ground: z.number().int().positive().nullable(),
  }), sourceIds: sourceIdsSchema, sourceUrl: z.url({ protocol: /^https?$/ }),
  evidence: textSchema, checkedOn: dateOnlySchema,
});
export const p3SnapshotSchema = z.strictObject({
  contract: z.literal('uma-p3-skill-support'), schemaVersion: z.literal(1),
  snapshotId: idSchema, datasetVersion: textSchema, generatedAt: offsetDateTimeSchema,
  sourceManifestSha256: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/),
  warnings: z.array(textSchema), sources: z.array(referenceSourceSchema).min(1),
  skills: z.array(p3SkillSchema), supports: z.array(p3SupportSchema),
  skillRelations: z.array(p3SkillRelationSchema), supportSkills: z.array(p3SupportSkillSchema),
  skillRevisions: z.array(z.strictObject({
    skillId: idSchema, server: textSchema, snapshot: textSchema, status: textSchema,
    conditionGroups: z.array(conditionGroupSchema), sourceIds: sourceIdsSchema,
  })),
  supportLimitBreakEffects: z.array(z.strictObject({
    supportId: idSchema, limitBreak: z.number().int().min(0).max(4), level: z.number().int().positive(),
    effectId: z.number().int(), value: z.number().nullable(), sourceIds: sourceIdsSchema,
  })),
  applications: z.array(p3ApplicationSchema),
  courses: z.array(z.strictObject({
    courseId: idSchema, trackId: idSchema, venue: textSchema, distance: z.number().positive(),
    surface: z.number().int(), lastSpurtStart: z.number().nullable(),
    finalCornerStart: z.number().nullable(), finalStraightStart: z.number().nullable(),
    sourceIds: sourceIdsSchema, raw: z.unknown(),
  })),
  races: z.array(z.strictObject({
    raceId: idSchema, courseId: idSchema, name: textSchema, season: z.number().nullable(),
    sourceIds: sourceIdsSchema, raw: z.unknown(),
  })),
  scenarios: z.array(z.strictObject({
    scenarioId: idSchema, nameJa: textSchema, nameKo: maybeText, nameEn: maybeText,
    displayName: textSchema, jpDate: dateOnlySchema.nullable(), status: textSchema, sourceIds: sourceIdsSchema,
  })),
  tournaments: z.array(p3TournamentSchema),
  supportEvents: z.array(z.strictObject({
    eventId: idSchema, supportId: idSchema, label: textSchema, server: textSchema,
    choices: z.array(z.strictObject({ choiceId: idSchema, label: textSchema,
      skills: z.array(z.strictObject({skillId: idSchema, hintLevel: z.number().nullable()})), raw: z.unknown() })),
    sourceIds: sourceIdsSchema, raw: z.unknown(),
  })).optional(),
  scenarioSkillRoutes: z.array(z.strictObject({scenarioId: idSchema, skillId: idSchema, label: textSchema, sourceIds: sourceIdsSchema})).optional(),
  research: z.array(z.strictObject({courseId: idSchema, style: textSchema, skillId: idSchema,
    reportedValue: z.number(), sourceUrl: z.url(), fetchedAt: textSchema, status: z.literal('context-unverified'), raw: z.unknown()})).optional(),
});

export type P3Snapshot = z.infer<typeof p3SnapshotSchema>;
export type P3Skill = z.infer<typeof p3SkillSchema>;
export type P3Support = z.infer<typeof p3SupportSchema>;
export type P3SkillRelation = z.infer<typeof p3SkillRelationSchema>;
export type P3SupportSkill = z.infer<typeof p3SupportSkillSchema>;
export type P3Application = z.infer<typeof p3ApplicationSchema>;
export type P3Tournament = z.infer<typeof p3TournamentSchema>;

/** Structural validation never upgrades source translations or JP snapshots to KR certification. */
export function validateP3Snapshot(input: unknown): P3Snapshot {
  const snapshot = p3SnapshotSchema.parse(input);
  const sources = new Set(snapshot.sources.map((row) => row.id));
  const skills = unique(snapshot.skills.map((row) => row.skillId), 'skills');
  const supports = unique(snapshot.supports.map((row) => row.supportId), 'supports');
  const courses = unique(snapshot.courses.map((row) => row.courseId), 'courses');
  const scenarios = unique(snapshot.scenarios.map((row) => row.scenarioId), 'scenarios');
  unique(snapshot.tournaments.map((row) => row.eventId), 'tournaments');
  unique(snapshot.applications.map((row) => `${row.entityType}:${row.entityId}`), 'applications');
  function references(rows: readonly { sourceIds: string[] }[]) {
    for (const row of rows) for (const id of row.sourceIds) if (!sources.has(id)) throw new Error(`Unknown source: ${id}`);
  }
  references(snapshot.skills); references(snapshot.supports); references(snapshot.skillRelations);
  references(snapshot.supportSkills); references(snapshot.skillRevisions); references(snapshot.supportLimitBreakEffects);
  references(snapshot.courses); references(snapshot.races); references(snapshot.scenarios); references(snapshot.tournaments);
  for (const row of snapshot.skillRelations) if (!skills.has(row.skillId) || !skills.has(row.relatedSkillId)) throw new Error('Unknown skill relation target');
  for (const row of snapshot.supportSkills) if (!skills.has(row.skillId) || !supports.has(row.supportId)) throw new Error('Unknown support skill target');
  for (const row of snapshot.skillRevisions) if (!skills.has(row.skillId)) throw new Error('Unknown skill revision target');
  for (const row of snapshot.supportLimitBreakEffects) if (!supports.has(row.supportId)) throw new Error('Unknown limit break support');
  for (const row of snapshot.races) if (!courses.has(row.courseId)) throw new Error('Unknown race course');
  for (const row of snapshot.tournaments) if (!courses.has(row.courseId)) throw new Error('Unknown tournament course');
  for (const row of snapshot.applications) {
    const ids = row.entityType === 'support' ? supports : row.entityType === 'skill' ? skills : scenarios;
    if (!ids.has(row.entityId)) throw new Error('Unknown application entity');
  }
  references(snapshot.supportEvents ?? []); references(snapshot.scenarioSkillRoutes ?? []);
  unique((snapshot.supportEvents ?? []).map(row => row.eventId), 'supportEvents');
  for (const row of snapshot.supportEvents ?? []) {
    if (!supports.has(row.supportId)) throw new Error('Unknown event support');
    for (const choice of row.choices) for (const skill of choice.skills) if (!skills.has(skill.skillId)) throw new Error('Unknown event skill');
  }
  for (const row of snapshot.scenarioSkillRoutes ?? []) if (!scenarios.has(row.scenarioId) || !skills.has(row.skillId)) throw new Error('Unknown scenario skill target');
  for (const row of snapshot.research ?? []) if (!courses.has(row.courseId) || !skills.has(row.skillId)) throw new Error('Unknown research target');
  const lower = new Map(snapshot.skillRelations.filter(row => row.relation === 'lower_skill').map(row => [row.skillId, row.relatedSkillId]));
  for (const start of lower.keys()) { const seen = new Set<string>(); let next: string | undefined = start;
    while (next !== undefined) { if (seen.has(next)) throw new Error('Lower skill cycle'); seen.add(next); next = lower.get(next); }
  }
  return snapshot;
}

function unique(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} ID`);
  return new Set(ids);
}
