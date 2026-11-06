import { describe, expect, it } from 'vitest';
import actual from '../golden/p3-real-ui-subset.json';
import { validateP3Snapshot, type P3Snapshot } from '../../src/domain/skill-support';
import { recommendPersonalizedSupportDecks, recommendSupportDecks, type P4RecommendationRequest } from '../../src/engine/support-deck-optimizer';

const source = validateP3Snapshot(actual);
const request: P4RecommendationRequest = { course: { courseId: '10903', distanceM: 1600, surface: 'turf', trackId: '10009', rotation: 1, season: 1, weather: 1, groundCondition: 1 }, runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true };

/** Test-only acquisition/set-cover protocol, never production game records. */
function protocol(sets: string[][]): P3Snapshot {
  const skillBase = source.skills.find((row) => row.skillId === '200012')!;
  const supportBase = source.supports[0]!;
  return { ...structuredClone(source), snapshotId: 'test-only-p6-protocol',
    skills: [...new Set(sets.flat())].sort().map((skillId) => ({ ...structuredClone(skillBase), skillId,
      nameJa: `test-only-${skillId}`, nameKo: `합성 ${skillId}`, displayName: `합성 ${skillId}`, rarity: 1, cost: 90,
      conditionGroups: [{ condition: 'always==1', precondition: null, baseTime: -1,
        effects: [{ type: 1, value: 400000, raw: {} }], raw: {} }], raw: { type: ['test-only'] } })),
    supports: sets.map((_, index) => ({ ...structuredClone(supportBase), supportId: `test-card-${index}`,
      displayName: `합성 카드 ${index}`, rarity: 'SSR', ownerBaseId: `test-owner-${index}` })),
    supportSkills: sets.flatMap((ids, index) => ids.map((skillId) => ({ supportId: `test-card-${index}`, skillId, server: 'KR', acquisition: 'hint', sourceGroup: 0, sourceIds: ['ut'] }))),
    applications: sets.map((_, index) => ({ entityType: 'support', entityId: `test-card-${index}`, jpDate: null, patchOverrides: [],
      kr: { confirmedDate: null, observedDate: '2020-01-01', releasedBy: null, forecastDate: null,
        evidence: 'secondary_page', sourceUrl: 'https://example.invalid/test-only-p6', checkedOn: '2026-11-05' } })),
    supportEvents: [], skillRelations: [], skillRevisions: [], supportLimitBreakEffects: [],
  };
}
function branches(snapshot: P3Snapshot, index: number, options: string[][]) {
  snapshot.supportSkills.filter((row) => row.supportId === `test-card-${index}`).forEach((row) => { row.acquisition = 'event'; });
  snapshot.supportEvents!.push({ eventId: `test-event-${index}`, supportId: `test-card-${index}`, label: '합성 배타 선택', server: 'KR', sourceIds: ['ut'], raw: { selection: 'single' },
    choices: options.map((skills, choice) => ({ choiceId: `choice-${choice}`, label: `분기 ${choice}`, skills: skills.map((skillId) => ({ skillId, hintLevel: 1 })), raw: {} })) });
}
const fixed = [['f0'], ['f1'], ['f2'], ['f3'], ['f4']];
const chooseRequired = (skillId: string) => ({ skillId, priority: 'required' as const });

describe('P6 preference layer and required opportunity constraints', () => {
  it('returns the identical P5 result for absent or empty selections and no fabricated custom deck', () => {
    const snapshot = protocol([...fixed, ['a'], ['b']]);
    const original = recommendSupportDecks(snapshot, request);
    expect(recommendSupportDecks(snapshot, { ...request, skillPriorities: [] })).toEqual(original);
    expect(recommendPersonalizedSupportDecks(snapshot, request)).toEqual({ base: original, customized: null, comparison: null });
  });
  it('does not let unowned branch pruning alter the no-selection owned-only baseline', () => {
    const snapshot = protocol([...fixed, ['a'], ['b', 'c']]);
    branches(snapshot, 6, [['b'], ['c']]);
    const ownedSupports = snapshot.supports.slice(0, 6).map((row) => ({ supportId: row.supportId, limitBreak: 4 }));
    const result = recommendSupportDecks(snapshot, { ...request, ownedOnly: true, allowBorrow: false, ownedSupports, search: { eventPlanLimit: 1 } });
    expect(result.search.eventPlansPruned).toBe(false);
    expect(result.search.globalOptimal).toBe(true);
  });
  it('counts preference once despite six duplicate suppliers and keeps the three scores separate', () => {
    const snapshot = protocol(Array.from({ length: 6 }, () => ['wanted']));
    const preferred = recommendSupportDecks(snapshot, { ...request, skillPriorities: [{ skillId: 'wanted', priority: 'preferred' }] }).recommendations[0]!;
    const strong = recommendSupportDecks(snapshot, { ...request, skillPriorities: [{ skillId: 'wanted', priority: 'strong' }] }).recommendations[0]!;
    expect(preferred.score).toMatchObject({ coverageValue: 16, preferenceBonus: 8, customizedValue: 24 });
    expect(strong.score).toMatchObject({ coverageValue: 16, preferenceBonus: 24, customizedValue: 40 });
    expect(strong.duplicateSkillIds).toEqual(['wanted']);
  });
  it('canonicalizes explicit circle upgrades and duplicate priorities to one strongest bonus', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    snapshot.skills.push({ ...structuredClone(snapshot.skills.find((row) => row.skillId === 'wanted')!), skillId: 'upgrade' });
    snapshot.skillRelations.push({ skillId: 'upgrade', relatedSkillId: 'wanted', relation: 'lower_skill', evidence: 'test-only-explicit', sourceIds: ['ut'] });
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [{ skillId: 'upgrade', priority: 'preferred' }, { skillId: 'wanted', priority: 'strong' }] });
    expect(result.skillPriorities?.selections).toEqual([{ skillId: 'wanted', priority: 'strong' }]);
    expect(result.recommendations[0]!.score.preferenceBonus).toBe(24);
  });
  it('retains an explicit white upgrade hint as a source when the research list hides that alias', () => {
    const snapshot = protocol([...fixed, ['upgrade']]);
    snapshot.skills.push({ ...structuredClone(snapshot.skills.find((row) => row.skillId === 'upgrade')!), skillId: 'wanted' });
    snapshot.skillRelations.push({ skillId: 'upgrade', relatedSkillId: 'wanted', relation: 'lower_skill', evidence: 'test-only-explicit', sourceIds: ['ut'] });
    const result = recommendSupportDecks(snapshot, { ...request, includeUnknown: false, skillPriorities: [chooseRequired('wanted')] });
    expect(result.status).toBe('ready');
    expect(result.recommendations[0]!.skillIds).toContain('wanted');
    expect(result.skillPriorities?.targets[0]?.attained).toBe(true);
  });
  it('uses a verified gold prerequisite as a white target without counting the gold itself', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    snapshot.skills.push({ ...structuredClone(snapshot.skills.find((row) => row.skillId === 'wanted')!), skillId: 'gold', rarity: 2 });
    snapshot.skillRelations.push({ skillId: 'gold', relatedSkillId: 'wanted', relation: 'lower_skill', evidence: 'test-only-explicit', sourceIds: ['ut'] });
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('gold')] });
    expect(result.status).toBe('ready');
    expect(result.skillPriorities?.selections).toEqual([chooseRequired('wanted')]);
    expect(result.recommendations[0]!.skillIds).not.toContain('gold');
  });
  it('allows a direct course-inapplicable selection while keeping its base value and effective-green count zero', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    snapshot.skills.find((row) => row.skillId === 'wanted')!.conditionGroups[0]!.condition = 'rotation==2';
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [{ skillId: 'wanted', priority: 'strong' }] });
    expect(result.recommendations[0]!.skillIds).toContain('wanted');
    expect(result.recommendations[0]!.score).toMatchObject({ coverageValue: 80, preferenceBonus: 24, customizedValue: 104, greenSkillCount: 5 });
    expect(result.recommendations[0]!.greenSkillIds).not.toContain('wanted');
    expect(result.skillPriorities?.targets[0]).toMatchObject({ grade: 'excluded', applicability: 'inapplicable', attained: true });
    expect(result.skillPriorities?.targets[0]?.warnings.length).toBeGreaterThan(0);
  });
  it('keeps an explicitly selected unknown target when the general research list is hidden without certifying its effect', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    snapshot.skills.find((row) => row.skillId === 'wanted')!.conditionGroups[0]!.effects[0]!.type = 999;
    const result = recommendSupportDecks(snapshot, { ...request, includeUnknown: false, skillPriorities: [chooseRequired('wanted')] });
    expect(result.status).toBe('ready');
    expect(result.recommendations[0]!.score.coverageValue).toBe(0);
    expect(result.skillPriorities?.targets[0]).toMatchObject({ grade: 'unverified', attained: true });
  });
  it('treats required as a hard condition and matches an independent constrained combination oracle', () => {
    const sets = [...fixed, ['wanted'], ['broad0', 'broad1', 'broad2', 'broad3']];
    const snapshot = protocol(sets);
    let best = 0;
    // Independent exhaustive choose-six oracle, unrelated to the engine beam.
    for (let omitted = 0; omitted < sets.length; omitted++) {
      const ids = new Set(sets.filter((_, index) => index !== omitted).flat());
      if (ids.has('wanted')) best = Math.max(best, ids.size * 16);
    }
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] });
    expect(result.status).toBe('ready');
    expect(result.recommendations[0]!.score).toMatchObject({ coverageValue: best, preferenceBonus: 0, customizedValue: best });
    for (const deck of result.recommendations) expect(deck.skillIds).toContain('wanted');
    expect(result.skillPriorities?.targets[0]?.attained).toBe(true);
  });
  it('cannot fulfill two requirements through mutually exclusive choices of the same event', () => {
    const snapshot = protocol([['a', 'b'], ...fixed]);
    branches(snapshot, 0, [['a'], ['b']]);
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('a'), chooseRequired('b')] });
    expect(result.status).toBe('required-unfulfilled');
    expect(result.recommendations).toEqual([]);
    expect(result.skillPriorities?.failure?.reason).toBe('mutually-exclusive-events');
  });
  it('can replan a branch when another card supplies the alternative required skill', () => {
    const snapshot = protocol([['a', 'b'], ['a'], ['f0'], ['f1'], ['f2'], ['f3']]);
    branches(snapshot, 0, [['a'], ['b']]);
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('a'), chooseRequired('b')] });
    expect(result.status).toBe('ready');
    expect(result.recommendations[0]!.eventDecisions[0]!.skillIds).toEqual(['b']);
    expect(result.recommendations[0]!.guaranteedSkillIds).toEqual([]);
  });
  it('separates missing release supply from ownership and unverified source failures', () => {
    const snapshot = protocol([...fixed, ['f5'], ['wanted']]);
    snapshot.applications.find((row) => row.entityId === 'test-card-6')!.kr.observedDate = '2030-01-01';
    expect(recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] }).skillPriorities?.failure?.reason).toBe('no-released-source');
    snapshot.applications.find((row) => row.entityId === 'test-card-6')!.kr.observedDate = '2020-01-01';
    const ownedSupports = snapshot.supports.slice(0, 6).map((row) => ({ supportId: row.supportId, limitBreak: 0 }));
    expect(recommendSupportDecks(snapshot, { ...request, ownedOnly: true, allowBorrow: false, ownedSupports, skillPriorities: [chooseRequired('wanted')] }).skillPriorities?.failure?.reason).toBe('ownership-borrow-limit');
    snapshot.supportSkills.filter((row) => row.supportId === 'test-card-6').forEach((row) => { row.acquisition = 'event'; });
    expect(recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] }).skillPriorities?.failure?.reason).toBe('unverified-source');
  });
  it('honours at most one borrow and same-owner restrictions for jointly required skills', () => {
    const snapshot = protocol([...fixed, ['f5'], ['a'], ['b']]);
    const ownedSupports = snapshot.supports.slice(0, 6).map((row) => ({ supportId: row.supportId, limitBreak: 0 }));
    const options = { ...request, ownedOnly: true, allowBorrow: true, ownedSupports };
    const one = recommendSupportDecks(snapshot, { ...options, skillPriorities: [chooseRequired('a')] });
    expect(one.status).toBe('ready');
    expect(one.recommendations[0]!.cards.filter((row) => row.ownership === 'borrowed')).toHaveLength(1);
    expect(recommendSupportDecks(snapshot, { ...options, skillPriorities: [chooseRequired('a'), chooseRequired('b')] }).skillPriorities?.failure?.reason).toBe('ownership-borrow-limit');
    snapshot.supports[7]!.ownerBaseId = snapshot.supports[6]!.ownerBaseId;
    expect(recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('a'), chooseRequired('b')] }).status).toBe('required-unfulfilled');
  });
  it('distinguishes bounded exploration from proven infeasibility, including dropped branch alternatives', () => {
    const snapshot = protocol([['a', 'b'], ...fixed]);
    branches(snapshot, 0, [['a'], ['b']]);
    const capped = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('a'), chooseRequired('b')], search: { eventPlanLimit: 1 } });
    expect(capped.skillPriorities?.failure?.reason).toBe('search-limit');
    expect(capped.search.eventPlansPruned).toBe(true);
    const tiny = recommendSupportDecks(protocol([...fixed, ['a'], ['b']]), { ...request, skillPriorities: [chooseRequired('a')], search: { maxStates: 1 } });
    expect(tiny.status).toBe('required-unfulfilled');
    expect(tiny.skillPriorities?.failure?.reason).toBe('search-limit');
  });
  it('expands beyond the original 96 candidates to keep a low-value required supplier', () => {
    const snapshot = protocol([...Array.from({ length: 120 }, (_, index) => [`broad-${index}`]), ['wanted']]);
    const provider = snapshot.supports[120]!; const oldId = provider.supportId;
    provider.supportId = 'zz-required-provider';
    snapshot.supportSkills.filter((row) => row.supportId === oldId).forEach((row) => { row.supportId = provider.supportId; });
    snapshot.applications.find((row) => row.entityId === oldId)!.entityId = provider.supportId;
    snapshot.skills.find((row) => row.skillId === 'wanted')!.conditionGroups[0]!.condition = 'rotation==2';
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] });
    expect(result.status).toBe('ready');
    expect(result.search.priorityCandidateExpansion?.addedProviderSupportIds).toContain('zz-required-provider');
    expect(result.search.candidateCount).toBeGreaterThan(96);
    expect(result.recommendations[0]!.cards.some((row) => row.supportId === provider.supportId)).toBe(true);
    expect(result.search.globalOptimal).toBe(false);
  });
  it('never adds an unspecified-server route merely to satisfy a preference', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    snapshot.supportSkills.filter((row) => row.skillId === 'wanted').forEach((row) => { row.server = 'source_unspecified'; });
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] });
    expect(result.status).toBe('required-unfulfilled');
    expect(result.recommendations).toEqual([]);
    expect(result.skillPriorities?.failure?.reason).toBe('unverified-source');
  });
  it('recognizes an unverified gold-to-upgrade-to-white chain without inventing a released source', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    const original = snapshot.skills.find((row) => row.skillId === 'wanted')!;
    snapshot.skills.push({ ...structuredClone(original), skillId: 'upgrade' }, { ...structuredClone(original), skillId: 'gold', rarity: 2 });
    snapshot.skillRelations.push(
      { skillId: 'gold', relatedSkillId: 'upgrade', relation: 'lower_skill', evidence: 'test-only-explicit', sourceIds: ['ut'] },
      { skillId: 'upgrade', relatedSkillId: 'wanted', relation: 'lower_skill', evidence: 'test-only-explicit', sourceIds: ['ut'] },
    );
    const raw = snapshot.supportSkills.find((row) => row.skillId === 'wanted')!;
    raw.skillId = 'gold'; raw.server = 'JP';
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] });
    expect(result.status).toBe('required-unfulfilled');
    expect(result.skillPriorities?.failure?.reason).toBe('unverified-source');
  });
  it('does not call a joint unknown event an exclusive-choice impossibility', () => {
    const snapshot = protocol([['x', 'y'], ['y'], ...fixed]);
    snapshot.supports[1]!.ownerBaseId = snapshot.supports[0]!.ownerBaseId;
    snapshot.supportSkills.find((row) => row.supportId === 'test-card-0' && row.skillId === 'y')!.acquisition = 'event';
    // Card 0 has a known x hint and an unresolved y event; card 1 has a y hint
    // but shares the owner. Unknown y could resolve the joint opportunity, so
    // neither mutually-exclusive nor ownership-impossible is proved.
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('x'), chooseRequired('y')] });
    expect(result.status).toBe('required-unfulfilled');
    expect(result.skillPriorities?.failure?.reason).toBe('unverified-source');
    expect(result.recommendations).toEqual([]);
  });
  it('cannot use a preference bonus to restore a known unreleased target', () => {
    const snapshot = protocol([...fixed, ['wanted']]);
    snapshot.applications.push({ ...structuredClone(snapshot.applications[0]!), entityType: 'skill', entityId: 'wanted',
      kr: { ...structuredClone(snapshot.applications[0]!.kr), observedDate: '2030-01-01' } });
    const result = recommendSupportDecks(snapshot, { ...request, skillPriorities: [{ skillId: 'wanted', priority: 'strong' }] });
    expect(result.recommendations[0]!.skillIds).not.toContain('wanted');
    expect(result.recommendations[0]!.score.preferenceBonus).toBe(0);
    expect(result.skillPriorities?.targets[0]).toMatchObject({ attained: false, availability: { state: 'unavailable' } });
  });
  it('keeps the base recommendation and exact skill differences in the personalized comparison', () => {
    const snapshot = protocol([...fixed, ['wanted'], ['b0', 'b1']]);
    const result = recommendPersonalizedSupportDecks(snapshot, { ...request, skillPriorities: [chooseRequired('wanted')] });
    expect(result.base).toEqual(recommendSupportDecks(snapshot, request));
    const before = result.base.recommendations[0]!; const after = result.customized!.recommendations[0]!;
    expect(result.comparison?.gainedSkillIds).toEqual(after.skillIds.filter((id) => !before.skillIds.includes(id)));
    expect(result.comparison?.lostSkillIds).toEqual(before.skillIds.filter((id) => !after.skillIds.includes(id)));
    expect(result.comparison?.baseCoverageDelta).toBe(after.score.coverageValue - before.score.coverageValue);
  });
});
