import { applyReferenceReleaseEvidence } from './reference-evidence';
import { z } from 'zod';
import {
  referenceAffinitySchema, referenceApplicationSchema, referenceAssetSchema, referenceSourceSchema,
  validateReferenceSnapshot, type ReferenceSnapshot,
} from '../domain/reference';
import { aptitudesSchema, idSchema, textSchema, sourceIdsSchema } from '../domain/primitives';

const nullableText = textSchema.nullable();
const labelSchema = z.strictObject({
  entityType: z.enum(['character', 'costume', 'support', 'scenario']),
  entityId: idSchema,
  name: nullableText,
  title: nullableText,
  aliases: z.array(textSchema),
  status: textSchema,
  sourceIds: sourceIdsSchema,
});
const applicationInputSchema = referenceApplicationSchema.extend({ entityType: z.enum(['costume', 'support']) });
const assetInputSchema = referenceAssetSchema.extend({ entityType: z.enum(['costume', 'support']) });
const stagingSchema = z.strictObject({
  contract: z.literal('uma-p1-staging'),
  schemaVersion: z.literal(1),
  datasetVersion: textSchema,
  kind: z.literal('unverified'),
  sourceManifestSha256: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/),
  warnings: z.array(textSchema),
  sources: z.array(referenceSourceSchema).min(1),
  characters: z.array(z.strictObject({ baseId: idSchema, nameJa: textSchema })),
  costumes: z.array(z.strictObject({
    costumeId: idSchema, baseId: idSchema, nameJa: textSchema, outfitJa: textSchema,
    nameKo: nullableText, outfitKo: nullableText, displayName: textSchema,
    translationStatus: textSchema, aliases: z.array(textSchema), aptitudes: aptitudesSchema,
    sourceIds: sourceIdsSchema, releaseKey: textSchema,
  })),
  affinity: referenceAffinitySchema.omit({ defaultWeight: true, duplicateBasePolicy: true }),
  applications: z.array(applicationInputSchema),
  assets: z.array(assetInputSchema),
});

export interface StagingInput {
  staging: unknown;
  labels: unknown;
  applications: unknown;
}

function contentFingerprint(value: unknown): string {
  // A deterministic identity suffix, not an authenticity/security digest. The original
  // SHA-256 remains separately preserved. Include the KO/KR layers in version identity.
  const text = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * One-way P1 conversion. Raw source/translation/release claims remain unverified;
 * this output deliberately cannot be parsed as a P0 snapshot or verified pack.
 */
export function convertStaging(input: StagingInput): ReferenceSnapshot {
  const staging = stagingSchema.parse(input.staging);
  const labels = z.array(labelSchema).parse(input.labels);
  const applications = z.array(applicationInputSchema).parse(input.applications);
  const sourceIds = new Set(staging.sources.map((source) => source.id));
  const labelMap = new Map<string, z.infer<typeof labelSchema>>();
  for (const label of labels) {
    const key = `${label.entityType}:${label.entityId}`;
    if (labelMap.has(key)) throw new Error(`Duplicate Korean label: ${key}`);
    if (label.sourceIds.some((id) => !sourceIds.has(id))) throw new Error(`Unknown Korean label source: ${key}`);
    labelMap.set(key, label);
  }
  const appMap = new Map<string, z.infer<typeof applicationInputSchema>>();
  for (const row of applications) {
    const key = `${row.entityType}:${row.entityId}`;
    if (appMap.has(key)) throw new Error(`Duplicate Korean application: ${key}`);
    appMap.set(key, row);
  }
  // Validate and preserve the staging copy too, while separate KR/KO layers are authoritative.
  const stagedAppKeys = new Set<string>();
  for (const row of staging.applications) {
    const key = `${row.entityType}:${row.entityId}`;
    if (stagedAppKeys.has(key)) throw new Error(`Duplicate staging application: ${key}`);
    stagedAppKeys.add(key);
  }
  const costumes = staging.costumes.map((row) => {
    const label = labelMap.get(`costume:${row.costumeId}`);
    const nameKo = label?.name ?? null;
    const outfitKo = label?.title ?? null;
    return {
      ...row,
      nameKo,
      outfitKo,
      displayName: `${nameKo ?? row.nameJa} [${outfitKo ?? row.outfitJa}]`,
      displayLanguage: nameKo === null && outfitKo === null ? 'ja' as const : nameKo !== null && outfitKo !== null ? 'ko' as const : 'mixed' as const,
      translationStatus: label?.status ?? 'missing',
      aliases: label?.aliases ?? [],
      labelSourceIds: label?.sourceIds ?? [],
    };
  });
  const included = new Set(costumes.map((row) => row.costumeId));
  const includedApplications = costumes.map((row) => {
    const application = appMap.get(row.releaseKey);
    if (!application || application.entityType !== 'costume') throw new Error(`Missing Korean application: ${row.releaseKey}`);
    return { ...application, entityType: 'costume' as const };
  });
  for (const label of labels) {
    if (label.entityType === 'costume' && !included.has(label.entityId)) throw new Error(`Unknown costume in Korean labels: ${label.entityId}`);
    if (label.entityType === 'character' && !staging.characters.some((row) => row.baseId === label.entityId)) throw new Error(`Unknown character in Korean labels: ${label.entityId}`);
  }
  for (const application of applications) {
    if (application.entityType === 'costume' && !included.has(application.entityId)) throw new Error(`Unknown costume in applications: ${application.entityId}`);
  }
  return applyReferenceReleaseEvidence(validateReferenceSnapshot({
    contract: 'uma-p1-reference',
    schemaVersion: 1,
    snapshotId: `reference-p1-${staging.sourceManifestSha256.slice(0, 12)}-${contentFingerprint({ staging, labels, applications })}`,
    datasetVersion: staging.datasetVersion,
    kind: 'reference',
    sourceManifestSha256: staging.sourceManifestSha256,
    warnings: staging.warnings,
    sources: staging.sources,
    characters: staging.characters.map((row) => {
      const label = labelMap.get(`character:${row.baseId}`);
      const nameKo = label?.name ?? null;
      return {
        ...row,
        nameKo,
        displayName: nameKo ?? row.nameJa,
        displayLanguage: nameKo === null ? 'ja' : 'ko',
        translationStatus: label?.status ?? 'missing',
        aliases: label?.aliases ?? [],
        labelSourceIds: label?.sourceIds ?? [],
        // Staging does not attribute the base-name row; do not invent a source ID.
        sourceIds: [],
      };
    }),
    costumes,
    applications: includedApplications,
    affinity: { ...staging.affinity, defaultWeight: 1, duplicateBasePolicy: 'zero' },
    assets: staging.assets.filter((row) => row.entityType === 'costume').map((row) => ({ ...row, entityType: 'costume' as const })),
    validation: { krAffinity: 'pending', sevenPersonFormula: 'pending', redFactorRules: 'pending' },
  }));
}
