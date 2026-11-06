import { describe, expect, it } from 'vitest';
import fixture from '../../data/fixtures/p0.snapshot.json';
import { snapshotSchema, validateSnapshot, type Snapshot } from '../../src/domain';

const copy = (): Snapshot => validateSnapshot(structuredClone(fixture));

function expectInvalidAt(input: unknown, path: (string | number)[]): void {
  const result = snapshotSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(path);
  }
}

describe('P0 snapshot ingestion boundary', () => {
  it('accepts the fictional snapshot and preserves its provenance and version', () => {
    const snapshot = validateSnapshot(fixture);
    expect(snapshot.kind).toBe('fixture');
    expect(snapshot.snapshotId).toBe('fixture-p0-2026-11-04');
    expect(snapshot.datasetVersion).toBe('fixture.1');
    expect(snapshot.sources[0]?.evidence).toBe('fixture');
    expect(snapshot.supports).toHaveLength(5);
    expect(snapshot.skills.every((skill) => skill.costPt === null)).toBe(true);
  });

  it('distinguishes multiple costume IDs for one base character', () => {
    const snapshot = copy();
    const costumes = snapshot.costumes.filter((costume) => costume.baseId === 'character_demo_a');
    expect(costumes.map((costume) => costume.costumeId)).toEqual([
      'costume_demo_a_default', 'costume_demo_a_alternate',
    ]);
    expect(costumes[0]?.aptitudes).not.toEqual(costumes[1]?.aptitudes);
  });

  it('does not mutate a caller-owned pack during validation', () => {
    const input = structuredClone(fixture);
    const before = JSON.stringify(input);
    const snapshot = validateSnapshot(input);
    snapshot.characters[0]!.nameKo = '변경된 복사본';
    expect(JSON.stringify(input)).toBe(before);
  });

  const idTables = [
    ['sources', 'sourceId'], ['characters', 'baseId'], ['costumes', 'costumeId'],
    ['supports', 'supportId'], ['skills', 'skillId'], ['courses', 'courseId'],
    ['scenarios', 'scenarioId'], ['tournaments', 'eventId'], ['releases', 'releaseId'],
  ] as const;

  it.each(idTables)('rejects duplicate IDs in %s', (table, idField) => {
    const snapshot = copy();
    const rows: unknown[] = snapshot[table];
    const duplicateIndex = rows.length;
    rows.push(structuredClone(rows[0]));
    expectInvalidAt(snapshot, [table, duplicateIndex, idField]);
  });

  const foreignKeys: { name: string; path: (string | number)[]; change: (snapshot: Snapshot) => void }[] = [
    { name: 'costume base character', path: ['costumes', 0, 'baseId'], change: (s) => { s.costumes[0]!.baseId = 'missing_character'; } },
    { name: 'support owner', path: ['supports', 0, 'ownerBaseId'], change: (s) => { s.supports[0]!.ownerBaseId = 'missing_character'; } },
    { name: 'support hint skill', path: ['supports', 0, 'skills', 0, 'skillId'], change: (s) => { s.supports[0]!.skills[0]!.skillId = 'missing_skill'; } },
    { name: 'skill lower relation', path: ['skills', 2, 'lowerSkillId'], change: (s) => { s.skills[2]!.lowerSkillId = 'missing_skill'; } },
    { name: 'scenario linked support', path: ['scenarios', 0, 'linkedSupportIds', 0], change: (s) => { s.scenarios[0]!.linkedSupportIds[0] = 'missing_support'; } },
    { name: 'tournament course', path: ['tournaments', 0, 'courseId'], change: (s) => { s.tournaments[0]!.courseId = 'missing_course'; } },
    { name: 'release entity', path: ['releases', 0, 'entityId'], change: (s) => { s.releases[0]!.entityId = 'missing_costume'; } },
    { name: 'affinity character', path: ['affinities', 0, 'bBaseId'], change: (s) => { s.affinities[0]!.bBaseId = 'missing_character'; } },
  ];

  it.each(foreignKeys)('rejects a missing $name reference', ({ path, change }) => {
    const snapshot = copy();
    change(snapshot);
    expectInvalidAt(snapshot, path);
  });

  const provenanceTables = [
    'characters', 'costumes', 'supports', 'skills', 'courses',
    'scenarios', 'tournaments', 'releases', 'affinities',
  ] as const;

  it.each(provenanceTables)('rejects unknown source IDs in %s', (table) => {
    const snapshot = copy();
    snapshot[table][0]!.sourceIds = ['missing_source'];
    expectInvalidAt(snapshot, [table, 0, 'sourceIds', 0]);
  });

  it('checks provenance on the nested hint route as well as its card', () => {
    const snapshot = copy();
    snapshot.supports[0]!.skills[0]!.sourceIds = ['missing_source'];
    expectInvalidAt(snapshot, ['supports', 0, 'skills', 0, 'sourceIds', 0]);
  });

  it('rejects missing and repeated provenance rather than implying verification', () => {
    const snapshot = copy();
    snapshot.costumes[0]!.sourceIds = [];
    expectInvalidAt(snapshot, ['costumes', 0, 'sourceIds']);
    snapshot.costumes[0]!.sourceIds = ['source_fixture', 'source_fixture'];
    expectInvalidAt(snapshot, ['costumes', 0, 'sourceIds']);
  });

  it('cannot relabel fictional evidence as a verified snapshot', () => {
    const snapshot = copy();
    snapshot.kind = 'verified';
    expectInvalidAt(snapshot, ['sources', 0, 'evidence']);
  });

  it('rejects an unsupported schema version and misspelled fields', () => {
    expectInvalidAt({ ...copy(), schemaVersion: 2 }, ['schemaVersion']);
    expect(snapshotSchema.safeParse({ ...copy(), dataVersion: 'typo' }).success).toBe(false);
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01'])('rejects nonexistent or unpadded release date %s', (date) => {
    const snapshot = copy();
    snapshot.releases[0]!.krConfirmedDate = date;
    expectInvalidAt(snapshot, ['releases', 0, 'krConfirmedDate']);
  });

  it.each(['krConfirmedDate', 'krForecastDate'] as const)('rejects %s before the Japanese original date', (field) => {
    const snapshot = copy();
    snapshot.releases[0]![field] = '2024-12-31';
    expectInvalidAt(snapshot, ['releases', 0, field]);
  });

  it('accepts a changed forecast alongside a later confirmed date', () => {
    const snapshot = copy();
    const release = snapshot.releases.find((row) => row.releaseId === 'release_support_confirmed_future')!;
    expect(release.krForecastDate).toBe('2027-01-05');
    expect(release.krConfirmedDate).toBe('2027-01-15');
    expect(() => validateSnapshot(snapshot)).not.toThrow();
  });

  it('requires explicit offsets for tournament start and snapshot generation', () => {
    const snapshot = copy();
    snapshot.tournaments[0]!.startAt = '2027-02-10T12:00:00';
    expectInvalidAt(snapshot, ['tournaments', 0, 'startAt']);
    expectInvalidAt({ ...copy(), generatedAt: '2026-11-04T14:00:00' }, ['generatedAt']);
  });

  it('rejects nonexistent or mismatched release references', () => {
    const snapshot = copy();
    snapshot.costumes[0]!.releaseRef = 'missing_release';
    expectInvalidAt(snapshot, ['costumes', 0, 'releaseRef']);
    snapshot.costumes[0]!.releaseRef = 'release_costume_a_alternate';
    expectInvalidAt(snapshot, ['costumes', 0, 'releaseRef']);
    snapshot.supports[0]!.releaseRef = 'release_scenario_demo';
    expectInvalidAt(snapshot, ['supports', 0, 'releaseRef']);
  });

  it('rejects competing release records for one entity', () => {
    const snapshot = copy();
    snapshot.releases.push({ ...snapshot.releases[0]!, releaseId: 'release_duplicate_target' });
    expectInvalidAt(snapshot, ['releases', snapshot.releases.length - 1, 'entityId']);
  });

  it('rejects a cycle in lower-skill relations', () => {
    const snapshot = copy();
    snapshot.skills[0]!.lowerSkillId = 'skill_demo_gold_a';
    expectInvalidAt(snapshot, ['skills', 0, 'lowerSkillId']);
  });

  it('rejects a support route that contradicts the gold skill lower relation', () => {
    const snapshot = copy();
    snapshot.supports[0]!.skills[2]!.lowerSkillId = 'skill_demo_white_b';
    expectInvalidAt(snapshot, ['supports', 0, 'skills', 2, 'lowerSkillId']);
  });

  it('rejects reversed duplicate affinity pairs rather than counting them twice', () => {
    const snapshot = copy();
    const original = snapshot.affinities[0]!;
    snapshot.affinities.push({ ...original, aBaseId: original.bBaseId, bBaseId: original.aBaseId });
    expectInvalidAt(snapshot, ['affinities', 1]);
  });

  it('keeps asset references tied to the correct base and costume', () => {
    const snapshot = copy();
    snapshot.assets.push({
      assetKey: 'asset_demo_b', entityType: 'character', entityId: 'character_demo_b',
      path: '/images/fallback/demo.svg', usageStatus: 'fallback', sourceIds: ['source_fixture'],
    });
    snapshot.costumes[0]!.assetKey = 'asset_demo_b';
    expectInvalidAt(snapshot, ['costumes', 0, 'assetKey']);
  });

  it('rejects external image hotlinks and directory traversal paths', () => {
    const snapshot = copy();
    const asset = {
      assetKey: 'asset_demo_a', entityType: 'character' as const, entityId: 'character_demo_a',
      path: 'https://example.invalid/portrait.webp', usageStatus: 'pending' as const, sourceIds: ['source_fixture'],
    };
    snapshot.assets.push(asset);
    expectInvalidAt(snapshot, ['assets', 0, 'path']);
    snapshot.assets[0]!.path = '/images/approved/../private.webp';
    expectInvalidAt(snapshot, ['assets', 0, 'path']);
  });

  it('rejects negative skill costs and invalid aptitude labels', () => {
    const snapshot = copy();
    snapshot.skills[0]!.costPt = -1;
    expectInvalidAt(snapshot, ['skills', 0, 'costPt']);
    const invalid = structuredClone(fixture);
    invalid.costumes[0]!.aptitudes.turf = 'SS';
    expectInvalidAt(invalid, ['costumes', 0, 'aptitudes', 'turf']);
  });
});
