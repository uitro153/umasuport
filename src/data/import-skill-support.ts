import { z } from 'zod';
import { validateP3Snapshot, type P3Snapshot, type P3Tournament } from '../domain/skill-support';
import { p3Tournaments, p3TournamentSources } from './p3-tournaments';
import { applyP3ReleaseEvidence, p3ReleaseSources } from './p3-release-evidence';

const rowSchema = z.record(z.string(), z.unknown());
const tableSchema = z.array(rowSchema);
type Row = z.infer<typeof rowSchema>;
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
function id(value: unknown): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) throw new Error('Missing original ID');
  return String(value);
}
const object = (value: unknown): Row => rowSchema.safeParse(value).data ?? {};
const rows = (value: unknown): Row[] => tableSchema.parse(value);
const source = (row: Row): string[] => [id(row.source_id)];
function groups(value: unknown): P3Snapshot['skills'][number]['conditionGroups'] {
  if (value === undefined || value === null) return [];
  return rows(value).map((group) => ({
    condition: text(group.condition), precondition: text(group.precondition), baseTime: number(group.base_time),
    effects: rows(group.effects ?? []).map((effect) => {
      const effectType = number(effect.type); const effectValue = number(effect.value);
      if (effectType === null || effectValue === null) throw new Error('Malformed original skill effect');
      return { type: effectType, value: effectValue, raw: effect };
    }), raw: group,
  }));
}

export interface P3ImportInput {
  skills: unknown; skillRevisions: unknown; skillRelations: unknown; rawMasterSkills: unknown;
  supports: unknown; supportSkills: unknown; supportLimitBreakEffects: unknown;
  courses: unknown; races: unknown; scenarios: unknown; sources: unknown;
  applications: unknown; labels: unknown;
}
export interface P3ImportOptions {
  sourceManifestSha256: string; generatedAt: string;
  tournaments?: P3Tournament[]; additionalSources?: P3Snapshot['sources'];
}

/** No original script is executed. The JP payload and KR locale overlay keep their own provenance. */
export function importSkillSupport(input: P3ImportInput, options: P3ImportOptions): P3Snapshot {
  const skillRows = rows(input.skills);
  const supportRows = rows(input.supports);
  const labels = rows(input.labels);
  const labelFor = (type: string, entityId: unknown) => labels.find((row) => row.entityType === type && row.entityId === id(entityId));
  const skills: P3Snapshot['skills'] = skillRows.map((row) => {
    const raw = object(row.raw);
    return {
      skillId: id(row.id), nameJa: text(row.name_ja), nameKo: text(row.name_ko), nameEn: text(row.name_en),
      displayName: text(row.name_ko) ?? text(row.name_ja) ?? text(row.name_en) ?? id(row.id),
      translationStatus: 'source_translation_not_officially_verified', rarity: number(row.rarity), cost: number(row.cost),
      descriptionKo: text(raw.desc_ko), descriptionJa: text(raw.jpdesc) ?? text(raw.description),
      descriptionEn: text(raw.desc_en) ?? text(raw.endesc), iconId: number(raw.iconid) ?? number(raw.icon_id),
      conditionGroups: groups(raw.condition_groups), sourceIds: source(row), raw,
    };
  });
  const supports: P3Snapshot['supports'] = supportRows.map((row) => {
    const label = labelFor('support', row.id);
    const nameKo = text(label?.name) ?? text(row.name_ko);
    return {
      supportId: id(row.id), nameJa: text(row.name_ja), nameKo, nameEn: text(row.name_en),
      displayName: nameKo ?? text(row.name_ja) ?? id(row.id),
      translationStatus: text(label?.status) ?? 'source_translation_not_officially_verified',
      rarity: z.enum(['R', 'SR', 'SSR']).parse(row.rarity), type: z.string().min(1).parse(row.type),
      uniqueEffect: row.unique_effect ?? null, sourceIds: source(row), raw: row.raw ?? null,
    };
  });
  const skillRelations: P3Snapshot['skillRelations'] = rows(input.skillRelations).map((row) => ({
    skillId: id(row.skill_id), relatedSkillId: id(row.related_skill_id),
    relation: z.enum(['variant', 'evolves_from', 'inherited_version']).parse(row.relation),
    sourceIds: source(row), evidence: 'explicit_source_relation;variant_is_not_a_lower_skill',
  }));
  const master: Row[] = rows(input.rawMasterSkills).map((row) => ({ ...object(row.payload), snapshot: text(row.snapshot), server: text(row.server) }));
  const skillById = new Map(skills.map((row) => [row.skillId, row]));
  // Historical group rank is additional evidence. A variant alone never establishes a prerequisite.
  // Link the preceding positive rank, preserving ○→◎→gold chains and excluding negative variants.
  for (const upper of master) {
    const upperId = id(upper.id); const current = skillById.get(upperId);
    const upperRank = number(upper.group_rate); const upperRarity = number(upper.rarity);
    if (!current || ![1, 2].includes(upperRarity ?? 0) || upperRank === null || upperRank <= 1) continue;
    if (!current.conditionGroups.some((group) => group.effects.some((effect) => effect.value > 0))) continue;
    const variants = new Set((Array.isArray(object(current.raw).versions) ? object(current.raw).versions as unknown[] : []).map(id));
    const candidates = master.filter((lower) => {
      const lowerId = id(lower.id); const lowerCurrent = skillById.get(lowerId); const rank = number(lower.group_rate);
      const lowerVariants = Array.isArray(object(lowerCurrent?.raw).versions) ? object(lowerCurrent?.raw).versions as unknown[] : [];
      return lower.group_id === upper.group_id && number(lower.rarity) === 1 && rank !== null && rank > 0 && rank < upperRank
        && variants.has(lowerId) && lowerVariants.map(id).includes(upperId)
        && lowerCurrent?.conditionGroups.some((group) => group.effects.some((effect) => effect.value > 0));
    }).sort((a, b) => (number(b.group_rate) ?? 0) - (number(a.group_rate) ?? 0));
    const precedingRank = number(candidates[0]?.group_rate);
    const preceding = candidates.filter((row) => number(row.group_rate) === precedingRank);
    if (preceding.length !== 1) continue;
    skillRelations.push({ skillId: upperId, relatedSkillId: id(preceding[0]!.id), relation: 'lower_skill', sourceIds: current.sourceIds,
      evidence: `historical-master-group-rank-and-current-mutual-variant;JP-${upper.snapshot ?? 'unknown'};kr-pending`,
    });
  }
  const scenarios: P3Snapshot['scenarios'] = rows(input.scenarios).map((row) => ({
    scenarioId: id(row.id), nameJa: z.string().min(1).parse(row.name_ja), nameKo: text(row.name_ko), nameEn: text(row.name_en),
    displayName: text(row.name_ko) ?? id(row.name_ja), jpDate: text(row.jp_release_date),
    status: z.string().min(1).parse(row.status), sourceIds: source(row),
  }));
  const applications = rows(input.applications).filter((row) => row.entityType === 'support') as P3Snapshot['applications'];
  const unknownKr = { confirmedDate: null, observedDate: null, forecastDate: null, releasedBy: null, evidence: 'none', sourceUrl: null, checkedOn: null };
  for (const skill of skills) applications.push({ entityType: 'skill', entityId: skill.skillId, jpDate: null, kr: { ...unknownKr }, patchOverrides: [] });
  for (const scenario of scenarios) applications.push({ entityType: 'scenario', entityId: scenario.scenarioId, jpDate: scenario.jpDate, kr: { ...unknownKr }, patchOverrides: [] });
  const snapshot = validateP3Snapshot({
    contract: 'uma-p3-skill-support', schemaVersion: 1,
    snapshotId: `p3-${options.sourceManifestSha256.slice(0, 16)}`, datasetVersion: 'jp-public-source-snapshots-with-separate-kr-evidence-2026-11-05',
    generatedAt: options.generatedAt, sourceManifestSha256: options.sourceManifestSha256,
    warnings: [
      'JP public source snapshots and KR locale overlays are not independently verified against the current KR master.',
      'Source translations are not certified official Korean names. Unknown releases are not unreleased.',
      'No measured horse-length gains or activation rates were supplied; no precise estimates are generated.',
      'Lower-skill prerequisites require historical master group/rank plus current mutual variants; KR patch validation is pending.',
      'Unowned support event narratives are not attached to cards. Source reverse hint/event links remain distinct and are not guaranteed acquisition.',
    ],
    sources: [...rows(input.sources), ...p3TournamentSources, ...p3ReleaseSources, ...(options.additionalSources ?? [])], skills, supports, skillRelations,
    skillRevisions: rows(input.skillRevisions).map((row) => ({
      skillId: id(row.skill_id), server: id(row.server), snapshot: id(row.snapshot), status: id(row.status),
      conditionGroups: groups(row.effects), sourceIds: source(row),
    })),
    supportSkills: rows(input.supportSkills).map((row) => ({ supportId: id(row.support_id), skillId: id(row.skill_id),
      server: id(row.server), acquisition: id(row.acquisition), sourceGroup: number(row.source_group), sourceIds: source(row) })),
    supportLimitBreakEffects: rows(input.supportLimitBreakEffects).map((row) => ({ supportId: id(row.support_id),
      limitBreak: number(row.limit_break), level: number(row.level), effectId: number(row.effect_id), value: number(row.value), sourceIds: source(row) })),
    applications: applyP3ReleaseEvidence(applications),
    courses: rows(input.courses).map((row) => ({ courseId: id(row.id), trackId: id(row.track_id), venue: id(row.venue),
      distance: number(row.distance), surface: number(row.surface), lastSpurtStart: number(row.last_spurt_start),
      finalCornerStart: number(row.final_corner_start), finalStraightStart: number(row.final_straight_start), sourceIds: source(row), raw: row })),
    races: rows(input.races).map((row) => ({ raceId: id(row.id), courseId: id(row.course_id), name: id(row.name),
      season: number(object(row.raw).season), sourceIds: source(row), raw: row })),
    scenarios, tournaments: options.tournaments ?? p3Tournaments,
  });
  // Identity changes with curated KR evidence and tournaments as well as the original manifest.
  let fingerprint = 0x811c9dc5;
  const content = JSON.stringify({ ...snapshot, generatedAt: null, snapshotId: null });
  for (let index = 0; index < content.length; index++) fingerprint = Math.imul(fingerprint ^ content.charCodeAt(index), 0x01000193);
  snapshot.snapshotId += `-${(fingerprint >>> 0).toString(16).padStart(8, '0')}`;
  return snapshot;
}
