import { z } from 'zod';
import {
  affinitySchema, assetSchema, characterSchema, costumeSchema, courseSchema, releaseSchema,
  scenarioSchema, skillSchema, sourceSchema, supportSchema, tournamentSchema,
} from './entities';
import { idSchema, offsetDateTimeSchema, textSchema } from './primitives';

const snapshotStructureSchema = z.strictObject({
  schemaVersion: z.literal(1),
  snapshotId: idSchema,
  datasetVersion: textSchema,
  generatedAt: offsetDateTimeSchema,
  kind: z.enum(['fixture', 'verified']),
  sources: z.array(sourceSchema).min(1),
  characters: z.array(characterSchema),
  costumes: z.array(costumeSchema),
  supports: z.array(supportSchema),
  skills: z.array(skillSchema),
  courses: z.array(courseSchema),
  scenarios: z.array(scenarioSchema),
  tournaments: z.array(tournamentSchema),
  releases: z.array(releaseSchema),
  affinities: z.array(affinitySchema),
  assets: z.array(assetSchema),
});

/** Structural validation and cross-table validation are one ingestion boundary. */
export const snapshotSchema = snapshotStructureSchema.superRefine((snapshot, context) => {
  type IssuePath = (string | number)[];
  const issue = (path: IssuePath, message: string) => context.addIssue({ code: 'custom', path, message });
  const makeIndex = <T>(rows: T[], keyOf: (row: T) => string, table: string, idField: string) => {
    const index = new Map<string, T>();
    rows.forEach((row, i) => {
      const id = keyOf(row);
      if (index.has(id)) issue([table, i, idField], `Duplicate ID: ${id}`);
      else index.set(id, row);
    });
    return index;
  };
  const sources = makeIndex(snapshot.sources, (row) => row.sourceId, 'sources', 'sourceId');
  const characters = makeIndex(snapshot.characters, (row) => row.baseId, 'characters', 'baseId');
  const costumes = makeIndex(snapshot.costumes, (row) => row.costumeId, 'costumes', 'costumeId');
  const supports = makeIndex(snapshot.supports, (row) => row.supportId, 'supports', 'supportId');
  const skills = makeIndex(snapshot.skills, (row) => row.skillId, 'skills', 'skillId');
  const courses = makeIndex(snapshot.courses, (row) => row.courseId, 'courses', 'courseId');
  const scenarios = makeIndex(snapshot.scenarios, (row) => row.scenarioId, 'scenarios', 'scenarioId');
  makeIndex(snapshot.tournaments, (row) => row.eventId, 'tournaments', 'eventId');
  const releases = makeIndex(snapshot.releases, (row) => row.releaseId, 'releases', 'releaseId');
  const assets = makeIndex(snapshot.assets, (row) => row.assetKey, 'assets', 'assetKey');

  const reference = (exists: boolean, path: IssuePath, id: string) => {
    if (!exists) issue(path, `Unknown reference: ${id}`);
  };
  const checkSources = (ids: string[], path: IssuePath) => ids.forEach((id, i) => reference(sources.has(id), [...path, i], id));
  const tablesWithSources = [
    'characters', 'costumes', 'supports', 'skills', 'courses', 'scenarios', 'tournaments', 'releases', 'affinities', 'assets',
  ] as const;
  for (const table of tablesWithSources) {
    snapshot[table].forEach((row, i) => checkSources(row.sourceIds, [table, i, 'sourceIds']));
  }
  if (snapshot.kind === 'verified') {
    snapshot.sources.forEach((source, i) => {
      if (source.evidence === 'fixture') issue(['sources', i, 'evidence'], 'Verified snapshots cannot contain fixture sources');
    });
  }

  const entityIndexes = { costume: costumes, support: supports, scenario: scenarios, skill: skills };
  const releaseTargets = new Set<string>();
  snapshot.releases.forEach((release, i) => {
    reference(entityIndexes[release.entityType].has(release.entityId), ['releases', i, 'entityId'], release.entityId);
    const target = `${release.entityType}:${release.entityId}`;
    if (releaseTargets.has(target)) issue(['releases', i, 'entityId'], `Duplicate release target: ${target}`);
    releaseTargets.add(target);
  });

  const checkReleaseRef = (releaseRef: string, entityType: string, entityId: string, path: IssuePath) => {
    const release = releases.get(releaseRef);
    if (!release) issue(path, `Unknown release reference: ${releaseRef}`);
    else if (release.entityType !== entityType || release.entityId !== entityId) {
      issue(path, `Release ${releaseRef} targets a different entity`);
    }
  };
  snapshot.costumes.forEach((costume, i) => {
    reference(characters.has(costume.baseId), ['costumes', i, 'baseId'], costume.baseId);
    checkReleaseRef(costume.releaseRef, 'costume', costume.costumeId, ['costumes', i, 'releaseRef']);
    if (costume.assetKey !== undefined) {
      const asset = assets.get(costume.assetKey);
      if (!asset) issue(['costumes', i, 'assetKey'], `Unknown asset reference: ${costume.assetKey}`);
      else {
        const matchesCostume = asset.entityType === 'costume' && asset.entityId === costume.costumeId;
        const matchesCharacter = asset.entityType === 'character' && asset.entityId === costume.baseId;
        if (!matchesCostume && !matchesCharacter) issue(['costumes', i, 'assetKey'], 'Asset belongs to a different character or costume');
        if (asset.variantId !== undefined && asset.variantId !== costume.costumeId) {
          issue(['costumes', i, 'assetKey'], 'Asset depicts a different costume variant');
        }
      }
    }
  });
  snapshot.supports.forEach((support, i) => {
    reference(characters.has(support.ownerBaseId), ['supports', i, 'ownerBaseId'], support.ownerBaseId);
    checkReleaseRef(support.releaseRef, 'support', support.supportId, ['supports', i, 'releaseRef']);
    support.skills.forEach((entry, j) => {
      reference(skills.has(entry.skillId), ['supports', i, 'skills', j, 'skillId'], entry.skillId);
      checkSources(entry.sourceIds, ['supports', i, 'skills', j, 'sourceIds']);
      if (entry.lowerSkillId !== undefined) {
        reference(skills.has(entry.lowerSkillId), ['supports', i, 'skills', j, 'lowerSkillId'], entry.lowerSkillId);
        const skill = skills.get(entry.skillId);
        if (skill && skill.lowerSkillId !== entry.lowerSkillId) {
          issue(['supports', i, 'skills', j, 'lowerSkillId'], 'Support lower-skill route conflicts with the skill relation');
        }
      }
    });
  });
  snapshot.scenarios.forEach((scenario, i) => {
    checkReleaseRef(scenario.releaseRef, 'scenario', scenario.scenarioId, ['scenarios', i, 'releaseRef']);
    const seen = new Set<string>();
    scenario.linkedSupportIds.forEach((id, j) => {
      reference(supports.has(id), ['scenarios', i, 'linkedSupportIds', j], id);
      if (seen.has(id)) issue(['scenarios', i, 'linkedSupportIds', j], `Duplicate linked support: ${id}`);
      seen.add(id);
    });
  });
  snapshot.tournaments.forEach((event, i) => reference(courses.has(event.courseId), ['tournaments', i, 'courseId'], event.courseId));

  snapshot.skills.forEach((skill, i) => {
    if (skill.lowerSkillId === undefined) return;
    reference(skills.has(skill.lowerSkillId), ['skills', i, 'lowerSkillId'], skill.lowerSkillId);
    const visited = new Set<string>([skill.skillId]);
    let next: string | undefined = skill.lowerSkillId;
    while (next !== undefined && skills.has(next)) {
      if (visited.has(next)) {
        issue(['skills', i, 'lowerSkillId'], 'Lower-skill relations cannot form a cycle');
        break;
      }
      visited.add(next);
      next = skills.get(next)?.lowerSkillId;
    }
  });

  const affinityPairs = new Set<string>();
  snapshot.affinities.forEach((affinity, i) => {
    reference(characters.has(affinity.aBaseId), ['affinities', i, 'aBaseId'], affinity.aBaseId);
    reference(characters.has(affinity.bBaseId), ['affinities', i, 'bBaseId'], affinity.bBaseId);
    const pair = [affinity.aBaseId, affinity.bBaseId].sort().join('|');
    if (affinityPairs.has(pair)) issue(['affinities', i], 'Duplicate affinity pair; store one value for each unordered pair');
    affinityPairs.add(pair);
  });
  snapshot.assets.forEach((asset, i) => {
    const assetIndexes = { character: characters, costume: costumes, support: supports };
    reference(assetIndexes[asset.entityType].has(asset.entityId), ['assets', i, 'entityId'], asset.entityId);
    if (asset.variantId !== undefined) {
      const costume = costumes.get(asset.variantId);
      if (!costume) issue(['assets', i, 'variantId'], `Unknown costume variant: ${asset.variantId}`);
      else if (asset.entityType === 'character' && costume.baseId !== asset.entityId) {
        issue(['assets', i, 'variantId'], 'Variant belongs to a different character');
      } else if (asset.entityType === 'costume' && costume.costumeId !== asset.entityId) {
        issue(['assets', i, 'variantId'], 'Variant must match the costume');
      } else if (asset.entityType === 'support') {
        issue(['assets', i, 'variantId'], 'Costume variants cannot identify a support-card image');
      }
    }
  });
});

export type Snapshot = z.infer<typeof snapshotSchema>;

/** Throws ZodError containing field paths when an incoming data pack is invalid. */
export function validateSnapshot(input: unknown): Snapshot {
  return snapshotSchema.parse(input);
}
