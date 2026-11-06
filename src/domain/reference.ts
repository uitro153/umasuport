import { z } from 'zod';
import { aptitudesSchema, dateOnlySchema, idSchema, sourceIdsSchema, textSchema } from './primitives';

const nullableText = textSchema.nullable();
const nullableDate = dateOnlySchema.nullable();
const httpUrl = z.url({ protocol: /^https?$/ });
const sha256 = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/);
const uniqueIds = z.array(idSchema).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs');

/** Source metadata remains a provenance record, not an official/game-accuracy certificate. */
export const referenceSourceSchema = z.looseObject({
  id: idSchema,
  url: httpUrl,
  repository_commit: nullableText,
  repository_updated_at: nullableText,
  data_updated_at: nullableText,
  verified_on: nullableDate,
  coverage: nullableText,
  missing: nullableText,
  status: textSchema,
});

export const referenceKrSchema = z.strictObject({
  observations: z.array(z.strictObject({
    entityId: idSchema,
    classification: z.enum(['official-confirmed', 'secondary-observed', 'forecast', 'unknown']),
    url: httpUrl, publishedOn: nullableDate, releaseDate: nullableDate, checkedOn: dateOnlySchema, note: textSchema,
  })).optional(),
  confirmedDate: nullableDate,
  observedDate: nullableDate,
  forecastDate: nullableDate,
  releasedBy: nullableDate,
  evidence: textSchema,
  sourceUrl: httpUrl.nullable(),
  checkedOn: nullableDate,
}).superRefine((kr, context) => {
  const hasDatedEvidence = kr.confirmedDate !== null || kr.observedDate !== null || kr.forecastDate !== null || kr.releasedBy !== null;
  if (hasDatedEvidence && (kr.sourceUrl === null || kr.checkedOn === null || kr.evidence === 'none')) {
    context.addIssue({ code: 'custom', message: 'Dated Korean evidence requires a source, check date and evidence classification' });
  }
  if (kr.confirmedDate !== null && !['official', 'official_notice', 'official_confirmation'].includes(kr.evidence)) {
    context.addIssue({ code: 'custom', path: ['confirmedDate'], message: 'A secondary or forecast source cannot become an official Korean release date' });
  }
});

export const referenceApplicationSchema = z.strictObject({
  entityType: z.literal('costume'),
  entityId: idSchema,
  jpDate: nullableDate,
  kr: referenceKrSchema,
  // Empty means no recorded overrides; never proof that JP and KR patches match.
  patchOverrides: z.array(z.unknown()),
});

export const referenceCharacterSchema = z.strictObject({
  baseId: idSchema,
  nameJa: textSchema,
  nameKo: nullableText,
  displayName: textSchema,
  displayLanguage: z.enum(['ko', 'ja']),
  translationStatus: textSchema,
  aliases: z.array(textSchema),
  labelSourceIds: uniqueIds,
  sourceIds: uniqueIds,
});

export const referenceCostumeSchema = z.strictObject({
  costumeId: idSchema,
  baseId: idSchema,
  nameJa: textSchema,
  outfitJa: textSchema,
  nameKo: nullableText,
  outfitKo: nullableText,
  displayName: textSchema,
  displayLanguage: z.enum(['ko', 'ja', 'mixed']),
  translationStatus: textSchema,
  aliases: z.array(textSchema),
  aptitudes: aptitudesSchema,
  sourceIds: sourceIdsSchema,
  labelSourceIds: uniqueIds,
  releaseKey: textSchema,
});

export const referenceAffinitySchema = z.strictObject({
  sourceIds: sourceIdsSchema,
  sourceDate: dateOnlySchema,
  server: z.literal('JP'),
  status: z.literal('unverified-current-kr'),
  members: z.record(idSchema, uniqueIds),
  weights: z.record(idSchema, z.number().nonnegative()),
  defaultWeight: z.literal(1),
  duplicateBasePolicy: z.literal('zero'),
  pairs: z.array(z.strictObject({
    aBaseId: idSchema,
    bBaseId: idSchema,
    baseValue: z.number().nonnegative(),
    sourceIds: sourceIdsSchema,
  })),
});

export const referenceAssetSchema = z.strictObject({
  entityType: z.literal('costume'),
  entityId: idSchema,
  path: textSchema.refine((path) => path.startsWith('images/') && !path.split(/[\\/]/).includes('..') && !path.includes('\\'), 'Expected a relative image metadata path'),
  sourceUrl: httpUrl,
  sha256,
  usageStatus: z.literal('pending'),
});

const structure = z.strictObject({
  contract: z.literal('uma-p1-reference'),
  schemaVersion: z.literal(1),
  snapshotId: idSchema,
  datasetVersion: textSchema,
  kind: z.literal('reference'),
  sourceManifestSha256: sha256,
  warnings: z.array(textSchema),
  sources: z.array(referenceSourceSchema).min(1),
  characters: z.array(referenceCharacterSchema),
  costumes: z.array(referenceCostumeSchema),
  applications: z.array(referenceApplicationSchema),
  affinity: referenceAffinitySchema,
  assets: z.array(referenceAssetSchema),
  validation: z.strictObject({
    krAffinity: z.literal('pending'),
    sevenPersonFormula: z.literal('pending'),
    redFactorRules: z.literal('pending'),
  }),
});

export const referenceSnapshotSchema = structure.superRefine((snapshot, context) => {
  type Path = (string | number)[];
  const issue = (path: Path, message: string) => context.addIssue({ code: 'custom', path, message });
  const index = <T>(rows: readonly T[], key: (row: T) => string, table: string): Map<string, T> => {
    const result = new Map<string, T>();
    rows.forEach((row, i) => {
      const id = key(row);
      if (result.has(id)) issue([table, i], `Duplicate ID: ${id}`);
      result.set(id, row);
    });
    return result;
  };
  const sources = index(snapshot.sources, (row) => row.id, 'sources');
  const characters = index(snapshot.characters, (row) => row.baseId, 'characters');
  const costumes = index(snapshot.costumes, (row) => row.costumeId, 'costumes');
  const applications = index(snapshot.applications, (row) => `${row.entityType}:${row.entityId}`, 'applications');
  index(snapshot.assets, (row) => `${row.entityType}:${row.entityId}`, 'assets');
  const checkSources = (ids: string[], path: Path) => ids.forEach((id, i) => {
    if (!sources.has(id)) issue([...path, i], `Unknown source: ${id}`);
  });
  const expectedName = (ko: string | null, ja: string) => ko ?? ja;
  snapshot.characters.forEach((row, i) => {
    checkSources(row.sourceIds, ['characters', i, 'sourceIds']);
    checkSources(row.labelSourceIds, ['characters', i, 'labelSourceIds']);
    if (row.displayName !== expectedName(row.nameKo, row.nameJa) || row.displayLanguage !== (row.nameKo === null ? 'ja' : 'ko')) {
      issue(['characters', i, 'displayName'], 'Display fallback must preserve the nullable Korean name and its language');
    }
    if (!Object.hasOwn(snapshot.affinity.members, row.baseId)) issue(['affinity', 'members', row.baseId], 'Missing affinity memberships');
  });
  snapshot.costumes.forEach((row, i) => {
    if (!characters.has(row.baseId)) issue(['costumes', i, 'baseId'], 'Unknown base character');
    checkSources(row.sourceIds, ['costumes', i, 'sourceIds']);
    checkSources(row.labelSourceIds, ['costumes', i, 'labelSourceIds']);
    const language = row.nameKo === null && row.outfitKo === null ? 'ja' : row.nameKo !== null && row.outfitKo !== null ? 'ko' : 'mixed';
    if (row.displayName !== `${expectedName(row.nameKo, row.nameJa)} [${expectedName(row.outfitKo, row.outfitJa)}]` || row.displayLanguage !== language) {
      issue(['costumes', i, 'displayName'], 'Display fallback must distinguish Korean, Japanese and mixed labels');
    }
    if (row.releaseKey !== `costume:${row.costumeId}` || !applications.has(row.releaseKey)) issue(['costumes', i, 'releaseKey'], 'Missing or mismatched application');
  });
  snapshot.applications.forEach((row, i) => {
    if (!costumes.has(row.entityId)) issue(['applications', i, 'entityId'], 'Unknown costume application');
  });
  checkSources(snapshot.affinity.sourceIds, ['affinity', 'sourceIds']);
  for (const id of Object.keys(snapshot.affinity.members)) {
    if (!characters.has(id)) issue(['affinity', 'members', id], 'Membership references an unknown character');
  }
  const pairKeys = new Set<string>();
  snapshot.affinity.pairs.forEach((row, i) => {
    if (!characters.has(row.aBaseId) || !characters.has(row.bBaseId)) issue(['affinity', 'pairs', i], 'Pair references an unknown character');
    checkSources(row.sourceIds, ['affinity', 'pairs', i, 'sourceIds']);
    const key = [row.aBaseId, row.bBaseId].sort().join('|');
    if (pairKeys.has(key)) issue(['affinity', 'pairs', i], 'Duplicate unordered affinity pair');
    pairKeys.add(key);
  });
  snapshot.assets.forEach((row, i) => {
    if (!costumes.has(row.entityId)) issue(['assets', i, 'entityId'], 'Unknown asset costume');
  });
});

export type ReferenceSnapshot = z.infer<typeof referenceSnapshotSchema>;
export type ReferenceSource = z.infer<typeof referenceSourceSchema>;
export type ReferenceCharacter = z.infer<typeof referenceCharacterSchema>;
export type ReferenceCostume = z.infer<typeof referenceCostumeSchema>;
export type ReferenceApplication = z.infer<typeof referenceApplicationSchema>;
export type ReferenceAffinity = z.infer<typeof referenceAffinitySchema>;

export function validateReferenceSnapshot(input: unknown): ReferenceSnapshot {
  return referenceSnapshotSchema.parse(input);
}
