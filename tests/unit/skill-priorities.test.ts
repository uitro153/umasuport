import { describe, expect, it } from 'vitest';
import identities from '../golden/p6-priority-identities.json';
import boundarySource from '../golden/p3-real-ui-subset.json';
import { p3SkillRelationSchema, p3SkillSchema } from '../../src/domain/skill-support';
import { getQuickSkillPriorities, MAX_SKILL_PRIORITIES, normalizeSkillPriorities, prioritySkillName,
  resolvePriorityTarget, SKILL_PRIORITY_BONUSES, type PrioritySkillData, type UserSkillPriority } from '../../src/engine/skill-priorities';

/** Actual skill/identity rows only. Deliberately not a replacement production snapshot. */
const actual: PrioritySkillData = {
  skills: identities.skills.map((row) => p3SkillSchema.parse(row)),
  skillRelations: identities.skillRelations.map((row) => p3SkillRelationSchema.parse(row)),
};

describe('P6 explicit canonical priority identities', () => {
  it('resolves only the verified five quick choices from the real source', () => {
    expect(getQuickSkillPriorities(actual).map((row) => row.skillId)).toEqual(['201601', '200452', '201262', '201332', '200432']);
    expect(SKILL_PRIORITY_BONUSES).toEqual({ preferred: 8, strong: 24, required: 0 });
    expect(MAX_SKILL_PRIORITIES).toBe(10);
  });

  it('maps a gold result to its explicit ordinary target without treating gold as a factor', () => {
    expect(resolvePriorityTarget(actual, '200431')).toMatchObject({ status: 'resolved', skillId: '200432', path: ['200431', '200432'] });
    expect(resolvePriorityTarget(actual, '200014')).toMatchObject({ status: 'resolved', skillId: '200012', path: ['200014', '200011', '200012'] });
  });

  it('collapses explicit circle/gold duplicates once with the strongest user choice and no mutation', () => {
    const before = JSON.stringify(actual);
    const input: UserSkillPriority[] = [{ skillId: '200012', priority: 'preferred' }, { skillId: '200014', priority: 'strong' },
      { skillId: '200011', priority: 'required' }, { skillId: '201601', priority: 'strong' }];
    const inputBefore = JSON.stringify(input);
    expect(normalizeSkillPriorities(actual, input)).toEqual([{ skillId: '200012', priority: 'required' }, { skillId: '201601', priority: 'strong' }]);
    expect(JSON.stringify(actual)).toBe(before);
    expect(JSON.stringify(input)).toBe(inputBefore);
  });

  it('does not use generic variants as a lower-skill identity', () => {
    expect(actual.skillRelations.some((row) => row.skillId === '200433' && row.relation === 'variant')).toBe(true);
    expect(resolvePriorityTarget(actual, '200433')).toMatchObject({ status: 'resolved', skillId: '200433' });
  });

  it.each(['10071', '100011', '900011'])('rejects native/evolution/inherited target %s even if inherited rarity is ordinary', (skillId) => {
    expect(resolvePriorityTarget(actual, skillId)).toMatchObject({ status: 'unsupported', skillId: null });
    expect(() => normalizeSkillPriorities(actual, [{ skillId, priority: 'required' }])).toThrow();
  });

  it('collapses real same-name levels only through their explicit lower relation', () => {
    const first = actual.skills.find((row) => row.skillId === '1000011')!;
    const second = actual.skills.find((row) => row.skillId === '1000012')!;
    expect(first.nameKo).toBe(second.nameKo);
    expect(normalizeSkillPriorities(actual, [{ skillId: first.skillId, priority: 'preferred' }, { skillId: second.skillId, priority: 'strong' }]))
      .toEqual([{ skillId: first.skillId, priority: 'strong' }]);
  });

  it('uses the real Japanese name when a Korean source name is absent', () => {
    const missing = actual.skills.find((row) => row.skillId === '204251')!;
    expect(missing.nameKo).toBeNull();
    expect(prioritySkillName(missing)).toBe(missing.nameJa);
  });

  it('keeps an empty preference list equivalent and enforces ten unique canonical choices', () => {
    expect(normalizeSkillPriorities(actual, undefined)).toEqual([]);
    expect(normalizeSkillPriorities(actual, [])).toEqual([]);
    const boundary: PrioritySkillData = { skills: [...actual.skills, ...boundarySource.skills.filter(row => !actual.skills.some(old => old.skillId === row.skillId)).map(row => p3SkillSchema.parse(row))],
      skillRelations: [...actual.skillRelations, ...boundarySource.skillRelations.map(row => p3SkillRelationSchema.parse(row))] };
    const ids = [...new Set(boundary.skills.flatMap(skill => { const id = resolvePriorityTarget(boundary, skill.skillId).skillId; return id ? [id] : []; }))].slice(0, 11);
    expect(ids).toHaveLength(11);
    const eleven = ids.map(skillId => ({ skillId, priority: 'preferred' as const }));
    expect(() => normalizeSkillPriorities(boundary, eleven)).toThrow('최대 10개');
    expect(normalizeSkillPriorities(boundary, eleven.slice(0, 10))).toHaveLength(10);
  });

  it('rejects unknown IDs and malformed priority input', () => {
    expect(resolvePriorityTarget(actual, 'not-in-source')).toMatchObject({ status: 'unknown', skillId: null });
    expect(() => normalizeSkillPriorities(actual, [{ skillId: 'not-in-source', priority: 'required' }])).toThrow();
    expect(() => normalizeSkillPriorities(actual, [{ skillId: '201601', priority: 'maximum' }] as unknown as UserSkillPriority[])).toThrow();
  });
});

describe('P6 malformed relation protocol cases (synthetic edits, never production game rows)', () => {
  it('keeps same-name IDs distinct when no explicit lower identity exists', () => {
    const separate: PrioritySkillData = { ...actual, skillRelations: actual.skillRelations.filter((row) => !['1000011', '1000012'].includes(row.skillId)) };
    expect(normalizeSkillPriorities(separate, [{ skillId: '1000011', priority: 'preferred' }, { skillId: '1000012', priority: 'strong' }]))
      .toEqual([{ skillId: '1000011', priority: 'preferred' }, { skillId: '1000012', priority: 'strong' }]);
  });

  it('holds a gold skill when the explicit lower relation is removed rather than following variants', () => {
    const withoutLower = { ...actual, skillRelations: actual.skillRelations.filter((row) => !(row.skillId === '200431' && row.relation === 'lower_skill')) };
    expect(resolvePriorityTarget(withoutLower, '200431')).toMatchObject({ status: 'unsupported', skillId: null });
  });

  it('does not guess between two declared lower targets', () => {
    const ambiguous: PrioritySkillData = { ...actual, skillRelations: [...actual.skillRelations,
      { skillId: '200431', relatedSkillId: '201601', relation: 'lower_skill', sourceIds: ['test-only'], evidence: 'synthetic-protocol-only' }] };
    expect(resolvePriorityTarget(ambiguous, '200431')).toMatchObject({ status: 'ambiguous', skillId: null });
  });

  it('detects a cyclic declared white family', () => {
    const cyclic: PrioritySkillData = { ...actual, skillRelations: [...actual.skillRelations,
      { skillId: '200012', relatedSkillId: '200011', relation: 'lower_skill', sourceIds: ['test-only'], evidence: 'synthetic-protocol-only' }] };
    expect(resolvePriorityTarget(cyclic, '200011')).toMatchObject({ status: 'ambiguous', skillId: null });
  });

  it('does not offer a quick ID if the Japanese identity no longer matches', () => {
    const mismatch: PrioritySkillData = { ...actual, skills: actual.skills.map((row) => row.skillId === '201601' ? { ...row, nameJa: 'synthetic identity mismatch' } : row) };
    expect(getQuickSkillPriorities(mismatch).some((row) => row.skillId === '201601')).toBe(false);
  });
});
