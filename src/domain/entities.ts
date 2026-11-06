import { z } from 'zod';
import { aptitudesSchema, dateOnlySchema, idSchema, offsetDateTimeSchema, sourceIdsSchema, textSchema } from './primitives';

export const sourceSchema = z.strictObject({
  sourceId: idSchema,
  title: textSchema,
  url: z.url({ protocol: /^https?$/ }),
  accessedAt: dateOnlySchema,
  evidence: z.enum(['fixture', 'official', 'observed', 'research']),
});

export const characterSchema = z.strictObject({
  baseId: idSchema,
  nameKo: textSchema,
  nameJa: textSchema,
  aliases: z.array(textSchema),
  sourceIds: sourceIdsSchema,
});

export const costumeSchema = z.strictObject({
  costumeId: idSchema,
  baseId: idSchema,
  nameKo: textSchema,
  aptitudes: aptitudesSchema,
  releaseRef: idSchema,
  assetKey: idSchema.optional(),
  sourceIds: sourceIdsSchema,
});

export const skillSchema = z.strictObject({
  skillId: idSchema,
  nameKo: textSchema,
  nameJa: textSchema,
  costPt: z.number().int().nonnegative().nullable(),
  lowerSkillId: idSchema.optional(),
  sourceIds: sourceIdsSchema,
});

export const supportSkillSchema = z.strictObject({
  skillId: idSchema,
  path: z.enum(['hint', 'event', 'gold']),
  lowerSkillId: idSchema.optional(),
  sourceIds: sourceIdsSchema,
});

export const supportSchema = z.strictObject({
  supportId: idSchema,
  ownerBaseId: idSchema,
  nameKo: textSchema,
  rarity: z.enum(['R', 'SR', 'SSR']),
  type: z.enum(['speed', 'stamina', 'power', 'guts', 'wisdom', 'friend', 'group']),
  skills: z.array(supportSkillSchema),
  releaseRef: idSchema,
  sourceIds: sourceIdsSchema,
});

export const courseSchema = z.strictObject({
  courseId: idSchema,
  nameKo: textSchema,
  distanceM: z.number().int().positive(),
  surface: z.enum(['turf', 'dirt']),
  direction: z.enum(['left', 'right', 'straight']),
  sourceIds: sourceIdsSchema,
});

export const scenarioSchema = z.strictObject({
  scenarioId: idSchema,
  nameKo: textSchema,
  releaseRef: idSchema,
  linkedSupportIds: z.array(idSchema),
  sourceIds: sourceIdsSchema,
});

export const tournamentConditionsSchema = z.strictObject({
  season: z.enum(['spring', 'summer', 'autumn', 'winter', 'unknown']),
  weather: z.enum(['sunny', 'cloudy', 'rainy', 'snowy', 'unknown']),
  trackCondition: z.enum(['firm', 'good', 'soft', 'heavy', 'unknown']),
});

export const tournamentSchema = z.strictObject({
  eventId: idSchema,
  nameKo: textSchema,
  type: z.enum(['champions-meeting', 'league-of-heroes']),
  courseId: idSchema,
  startAt: offsetDateTimeSchema,
  dateStatus: z.enum(['confirmed', 'forecast']),
  conditions: tournamentConditionsSchema,
  sourceIds: sourceIdsSchema,
});

export const releaseEntityTypeSchema = z.enum(['costume', 'support', 'scenario', 'skill']);
export const releaseSchema = z.strictObject({
  releaseId: idSchema,
  entityType: releaseEntityTypeSchema,
  entityId: idSchema,
  jpDate: dateOnlySchema.nullable(),
  krConfirmedDate: dateOnlySchema.nullable(),
  krForecastDate: dateOnlySchema.nullable(),
  sourceIds: sourceIdsSchema,
}).superRefine((release, context) => {
  if (release.jpDate === null) return;
  for (const field of ['krConfirmedDate', 'krForecastDate'] as const) {
    const krDate = release[field];
    if (krDate !== null && krDate < release.jpDate) {
      context.addIssue({ code: 'custom', path: [field], message: 'KR release cannot precede the JP release' });
    }
  }
});

export const affinitySchema = z.strictObject({
  aBaseId: idSchema,
  bBaseId: idSchema,
  baseValue: z.number().nonnegative(),
  sourceIds: sourceIdsSchema,
});

export const assetSchema = z.strictObject({
  assetKey: idSchema,
  entityType: z.enum(['character', 'costume', 'support']),
  entityId: idSchema,
  variantId: idSchema.optional(),
  path: z.string().regex(/^\/images\/(?:approved|fallback)\/[A-Za-z0-9_./-]+(?![\s\S])/, 'Expected a local image path'),
  usageStatus: z.enum(['approved', 'pending', 'fallback']),
  owner: textSchema.optional(),
  credit: textSchema.optional(),
  sourceIds: sourceIdsSchema,
}).superRefine((asset, context) => {
  if (asset.path.split('/').includes('..')) {
    context.addIssue({ code: 'custom', path: ['path'], message: 'Asset paths cannot traverse directories' });
  }
  if (asset.usageStatus === 'fallback' && !asset.path.startsWith('/images/fallback/')) {
    context.addIssue({ code: 'custom', path: ['path'], message: 'Fallback assets must use the fallback directory' });
  }
  if (asset.usageStatus === 'approved' && !asset.path.startsWith('/images/approved/')) {
    context.addIssue({ code: 'custom', path: ['path'], message: 'Approved assets must use the approved directory' });
  }
});

export type Source = z.infer<typeof sourceSchema>;
export type Character = z.infer<typeof characterSchema>;
export type Costume = z.infer<typeof costumeSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type SupportSkill = z.infer<typeof supportSkillSchema>;
export type Support = z.infer<typeof supportSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type ReleaseEntityType = z.infer<typeof releaseEntityTypeSchema>;
export type Affinity = z.infer<typeof affinitySchema>;
export type Asset = z.infer<typeof assetSchema>;
