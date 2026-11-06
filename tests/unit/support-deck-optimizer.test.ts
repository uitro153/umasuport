import { describe, expect, it } from 'vitest';
import actual from '../golden/p3-real-ui-subset.json';
import { validateP3Snapshot, type P3Snapshot } from '../../src/domain/skill-support';
import { inspectSupportLineup, recommendSupportDecks, type P4RecommendationRequest } from '../../src/engine/support-deck-optimizer';

const real = validateP3Snapshot(actual);
const request: P4RecommendationRequest = {
  course: { courseId: '10903', distanceM: 1600, surface: 'turf', trackId: '10009', rotation: 1, season: 1, weather: 1, groundCondition: 1 },
  runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true,
};

/** Explicitly synthetic set-cover examples, never production game records. */
function synthetic(cardSkills: string[][]): P3Snapshot {
  const skillIds = [...new Set(cardSkills.flat())].sort();
  const skillBase = real.skills.find((row) => row.skillId === '200012')!;
  const supportBase = real.supports[0]!;
  const snapshot: P3Snapshot = { ...structuredClone(real),
    snapshotId: 'test-only-p4-set-cover', skills: skillIds.map((id) => ({ ...structuredClone(skillBase), skillId: id,
      displayName: `합성 ${id}`, nameJa: `synthetic-${id}`, nameKo: `합성 ${id}`, cost: 90, rarity: 1,
      conditionGroups: [{ condition: 'always==1', precondition: null, baseTime: -1,
        effects: [{ type: 1, value: 400000, raw: {} }], raw: {} }], raw: { type: ['test-only'] } })),
    supports: cardSkills.map((_, index) => ({ ...structuredClone(supportBase), supportId: `test-card-${index}`,
      displayName: `합성 카드 ${index}`, rarity: 'SSR', ownerBaseId: `test-owner-${index}` })),
    supportSkills: cardSkills.flatMap((ids, index) => ids.map((id) => ({ supportId: `test-card-${index}`, skillId: id,
      server: 'KR', acquisition: 'hint', sourceGroup: 0, sourceIds: ['ut'] }))),
    skillRelations: [], skillRevisions: [], supportEvents: [], supportLimitBreakEffects: [],
    applications: cardSkills.map((_, index) => ({ entityType: 'support', entityId: `test-card-${index}`,
      jpDate: null, patchOverrides: [], kr: { confirmedDate: null, observedDate: '2020-01-01', releasedBy: null, forecastDate: null,
        evidence: 'secondary_page', sourceUrl: 'https://example.invalid/test-only-p4', checkedOn: '2026-11-05' } })),
  };
  return snapshot;
}
const sets = [
  ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'],
  ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], ['f'], ['g'],
];
function oracle(sets: string[][]): number {
  let best = 0;
  const visit = (indices: number[], start: number) => {
    if (indices.length === 6) { best = Math.max(best, new Set(indices.flatMap((id) => sets[id]!)).size); return; }
    for (let index = start; index <= sets.length - (6 - indices.length); index++) visit([...indices, index], index + 1);
  };
  visit([], 0); return best * 16;
}

function branchEvent(snapshot: P3Snapshot, cardIndex: number, options: string[][],
  config: { server?: string; scenarioId?: string; outcomes?: string[] } = {}) {
  const supportId = `test-card-${cardIndex}`;
  snapshot.supportSkills.filter((route) => route.supportId === supportId).forEach((route) => { route.acquisition = 'event'; });
  snapshot.supportEvents!.push({ eventId: `test-only-branches-${cardIndex}`, supportId, label: '합성 배타 보상',
    server: config.server ?? 'KR', sourceIds: ['ut'], raw: { selection: 'single', scenarioId: config.scenarioId },
    choices: options.map((ids, index) => ({ choiceId: `choice-0-branch-${index}`, label: `합성 분기 ${index}`,
      skills: ids.map((skillId) => ({ skillId, hintLevel: 1 })),
      raw: config.outcomes ? { sourceChoice: { results: [] }, sourceBranch: { condition: config.outcomes[index] } } : {} })) });
}

describe('P4 whole-deck coverage search', () => {
  it('keeps source-only race buffs without card paths out of missing white-factor goals', () => {
    const snapshot = synthetic(sets);
    snapshot.skills.push({ ...structuredClone(snapshot.skills[0]!), skillId: 'test-only-race-buff',
      displayName: '합성 경기 전용 효과', cost: null });
    const result = recommendSupportDecks(snapshot, request);
    expect(result.recommendations[0]!.missingImportantSkillIds).not.toContain('test-only-race-buff');
    expect(result.recommendations[0]!.score.coverageValue).toBe(oracle(sets));
  });
  it('matches an independent exhaustive oracle and escapes top-six independent-score duplication', () => {
    const result = recommendSupportDecks(synthetic(sets), request);
    const best = result.recommendations[0]!;
    expect(result.search).toMatchObject({ algorithm: 'exhaustive', globalOptimal: true, optimalWithinCandidatePool: true });
    expect(best.score.coverageValue).toBe(oracle(sets));
    expect(best.skillIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const greedyIndependent = new Set(sets.slice(0, 6).flat()).size * 16;
    expect(best.score.coverageValue).toBeGreaterThan(greedyIndependent);
  });

  it('counts the union once and reports zero marginal skill contribution on redundant cards', () => {
    const best = recommendSupportDecks(synthetic(sets), request).recommendations[0]!;
    expect(best.duplicateSkillIds).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(best.cards.some((card) => card.uniqueSkillIds.length === 0 && card.reasons.join(' ').includes('신규 스킬 가산은 0'))).toBe(true);
    expect(best.score.coverageValue).toBe(112);
    expect(best.cards.reduce((sum, card) => sum + card.skillIds.length * 16, 0)).toBeGreaterThan(112);
  });

  it('enforces same-owner versions while treating missing owner IDs as distinct cards', () => {
    const snapshot = synthetic(sets);
    snapshot.supports[0]!.ownerBaseId = snapshot.supports[6]!.ownerBaseId;
    const result = recommendSupportDecks(snapshot, request);
    for (const deck of result.recommendations) {
      const owners = deck.cards.flatMap((card) => card.ownerBaseId ? [card.ownerBaseId] : []);
      expect(new Set(owners).size).toBe(owners.length);
    }
    for (const row of snapshot.supports) row.ownerBaseId = null;
    expect(recommendSupportDecks(snapshot, request).status).toBe('ready');
  });

  it('preserves owned breakthroughs and permits at most one borrowed card', () => {
    const snapshot = synthetic(sets);
    const ownedSupports = snapshot.supports.slice(0, 5).map((card, index) => ({ supportId: card.supportId, limitBreak: index % 5 }));
    expect(recommendSupportDecks(snapshot, { ...request, ownedSupports, ownedOnly: true, allowBorrow: false }).status).toBe('insufficient-candidates');
    const result = recommendSupportDecks(snapshot, { ...request, ownedSupports, ownedOnly: true, allowBorrow: true });
    const best = result.recommendations[0]!;
    expect(best.cards.filter((card) => card.ownership === 'borrowed')).toHaveLength(1);
    for (const card of best.cards.filter((card) => card.ownership === 'owned')) expect(card.limitBreak).toBe(ownedSupports.find((row) => row.supportId === card.supportId)!.limitBreak);
  });

  it('preserves low-scoring owned feasibility when higher-scoring unowned cards flood the shortlist', () => {
    const snapshot = synthetic([
      ...Array.from({ length: 6 }, (_, index) => [`owned-${index}`]),
      ...Array.from({ length: 24 }, () => Array.from({ length: 12 }, (_, index) => `unowned-${index}`)),
    ]);
    const ownedSupports = snapshot.supports.slice(0, 6).map((card) => ({ supportId: card.supportId, limitBreak: 0 }));
    const withoutBorrow = recommendSupportDecks(snapshot, { ...request, ownedSupports, ownedOnly: true, allowBorrow: false });
    const withBorrow = recommendSupportDecks(snapshot, { ...request, ownedSupports, ownedOnly: true, allowBorrow: true,
      search: { candidateLimit: 20, beamWidth: 20, maxStates: 20_000 } });
    expect(withoutBorrow.status).toBe('ready'); expect(withBorrow.status).toBe('ready');
    expect(withBorrow.recommendations[0]!.cards.filter((card) => card.ownership === 'borrowed')).toHaveLength(1);
    expect(withBorrow.recommendations[0]!.score.coverageValue).toBeGreaterThan(withoutBorrow.recommendations[0]!.score.coverageValue);
  });

  it('returns a skill-data reason rather than a zero-coverage six-card recommendation', () => {
    const snapshot = synthetic(sets.slice(0, 6));
    const noResearch = recommendSupportDecks(snapshot, { ...request, includeUnknown: false });
    expect(noResearch.status).toBe('insufficient-skills');
    expect(noResearch.recommendations).toHaveLength(0);
    expect(noResearch.warnings.join(' ')).toContain('평가 가능한 백인자 목표가 없습니다');
    snapshot.supportSkills = [];
    expect(recommendSupportDecks(snapshot, request).status).toBe('insufficient-skills');
  });

  it('keeps the fixed main-training routes as extra-hint targets', () => {
    const snapshot = synthetic(sets);
    const baseline = recommendSupportDecks(snapshot, request).recommendations[0]!;
    const result = recommendSupportDecks(snapshot, { ...request, deck: [{ supportId: 'test-card-6', limitBreak: 0 }] });
    expect(result.recommendations[0]!.skillIds).toEqual(baseline.skillIds);
    expect(result.recommendations[0]!.skillIds).toContain('f');
  });

  it('retains rare-skill SRs and applies only a soft penalty to extreme SR composition', () => {
    const snapshot = synthetic(sets);
    snapshot.supports[6]!.rarity = 'SR';
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.cards.some((card) => card.supportId === 'test-card-6' && card.rarity === 'SR')).toBe(true);
    for (const card of snapshot.supports) card.rarity = 'SR';
    const extreme = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(extreme.cards).toHaveLength(6);
    expect(extreme.score.extremeSrPenalty).toBeGreaterThan(0);
    expect(extreme.score.coverageValue).toBe(best.score.coverageValue);
  });

  it('prefers more low-cost priority greens when total qualitative coverage ties', () => {
    const snapshot = synthetic([['f0'], ['f1'], ['f2'], ['f3'], ['f4'], ['priority'], ['useful', 'conditional']]);
    snapshot.skills.find((row) => row.skillId === 'useful')!.cost = 120;
    snapshot.skills.find((row) => row.skillId === 'conditional')!.conditionGroups[0]!.condition = 'order<=3';
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.score.coverageValue).toBe(96);
    expect(best.score.prioritySkillCount).toBe(6);
    expect(best.skillIds).toContain('priority');
    expect(best.skillIds).not.toContain('useful');
  });

  it('annotates event-choice unions without inventing routes from reference event ownership', () => {
    const snapshot = synthetic(sets);
    snapshot.supportEvents = [{ eventId: 'test-only-event', supportId: 'test-card-6', label: 'test-only choices', server: 'KR',
      sourceIds: ['ut'], raw: { selection: 'single' }, choices: [
        { choiceId: 'one', label: 'one', skills: [{ skillId: 'a', hintLevel: 1 }], raw: {} },
        { choiceId: 'two', label: 'two', skills: [{ skillId: 'g', hintLevel: 1 }], raw: {} },
      ] }];
    const card = recommendSupportDecks(snapshot, request).recommendations[0]!.cards.find((row) => row.supportId === 'test-card-6')!;
    expect(card.skillIds).toEqual(['f']);
    expect(card.eventConditionNotes.join(' ')).toContain('동시 획득을 보장하지');
  });

  it('records bounds, stays deterministic and separates an exhausted search from infeasibility', () => {
    const snapshot = synthetic(Array.from({ length: 24 }, (_, index) => [`skill-${index}`, `shared-${index % 3}`]));
    const options = { ...request, search: { candidateLimit: 20, beamWidth: 8, maxStates: 3000 } };
    const a = recommendSupportDecks(snapshot, options); const b = recommendSupportDecks(snapshot, options);
    expect(a.recommendations.map((deck) => deck.deckId)).toEqual(b.recommendations.map((deck) => deck.deckId));
    expect(a.search).toEqual(b.search);
    expect(a.search).toMatchObject({ algorithm: 'bounded-beam-and-swap', candidatePoolLimited: true, globalOptimal: false });
    expect(a.search.examinedStates).toBeLessThanOrEqual(3000);
    const tiny = recommendSupportDecks(snapshot, { ...request, search: { maxStates: 1 } });
    expect(tiny.status).toBe('search-limited');
    expect(tiny.search.searchLimitReached).toBe(true);
    expect(tiny.search.examinedStates).toBeLessThanOrEqual(1);
  });

  it('reports exact swap set differences and suppresses cosmetic alternative decks', () => {
    const snapshot = synthetic([['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h']]);
    const result = recommendSupportDecks(snapshot, request); const best = result.recommendations[0]!;
    for (const swap of best.swaps) {
      const nextIds = best.cards.filter((card) => card.supportId !== swap.removeSupportId).map((card) => card.supportId).concat(swap.addSupportId);
      const next = inspectSupportLineup(snapshot, request, nextIds.map((supportId) => ({ supportId, limitBreak: 4 }))).deck!;
      expect(swap.gainedSkillIds).toEqual(next.skillIds.filter((id) => !best.skillIds.includes(id)).sort());
      expect(swap.lostSkillIds).toEqual(best.skillIds.filter((id) => !next.skillIds.includes(id)).sort());
    }
    expect(result.recommendations.length).toBeLessThanOrEqual(2);
    for (const deck of result.recommendations.slice(1)) expect(deck.gainedSkillIds.length + deck.lostSkillIds.length).toBeGreaterThanOrEqual(2);
    const identical = synthetic(Array.from({ length: 8 }, () => ['same']));
    expect(recommendSupportDecks(identical, request).recommendations).toHaveLength(1);
  });

  it('uses JP paths only for an opted-in dated forecast without KR paths', () => {
    const snapshot = synthetic(sets.slice(0, 6));
    const card = snapshot.applications[5]!;
    card.kr.observedDate = null; card.kr.forecastDate = '2027-01-15'; card.kr.evidence = 'forecast';
    snapshot.supportSkills.filter((row) => row.supportId === card.entityId).forEach((row) => { row.server = 'JP'; });
    expect(recommendSupportDecks(snapshot, { ...request, cutoffDate: '2027-01-16', allowForecast: false }).status).toBe('insufficient-candidates');
    const result = recommendSupportDecks(snapshot, { ...request, cutoffDate: '2027-01-16', allowForecast: true });
    expect(result.recommendations[0]!.cards.find((row) => row.supportId === card.entityId)?.acquisitionBasis).toBe('jp-reference-forecast');
    expect(result.warnings.join(' ')).toContain('일본 원자료');
  });

  it('collapses only explicit positive white prerequisites, not arbitrary variants', () => {
    const snapshot = synthetic([['circle'], ['double'], ['x'], ['y'], ['z'], ['q']]);
    snapshot.skillRelations = [{ skillId: 'double', relatedSkillId: 'circle', relation: 'lower_skill', sourceIds: ['ut'], evidence: 'test-only-explicit-prerequisite' }];
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.skillIds).toContain('circle'); expect(best.skillIds).not.toContain('double');
    expect(best.score.coverageValue).toBe(80);
    snapshot.skillRelations[0]!.relation = 'variant';
    expect(recommendSupportDecks(snapshot, request).recommendations[0]!.score.coverageValue).toBe(96);
  });
});

describe('P4 actual record compatibility', () => {
  it('evaluates actual six supports through the same objective while retaining all non-measured fields', () => {
    const supports = ['30028', '30016', '30023', '30007', '30009', '30011'].map((supportId) => ({ supportId, limitBreak: 4 }));
    const before = JSON.stringify(real);
    const inspected = inspectSupportLineup(real, request, supports);
    expect(inspected.status).toBe('ready');
    expect(inspected.deck!.cards).toHaveLength(6);
    expect(inspected.deck!.cards.flatMap((card) => card.routes).some((route) => route.kind === 'gold-lower')).toBe(true);
    expect(inspected.skillEvaluations.every((row) => row.bashinGain === null && row.activationRate === null)).toBe(true);
    expect(JSON.stringify(real)).toBe(before);
  });

  it('rejects invalid ownership or comparison inputs', () => {
    expect(() => inspectSupportLineup(real, request, [])).toThrow('6장');
    expect(() => recommendSupportDecks(real, { ...request, ownedSupports: [{ supportId: 'unknown', limitBreak: 4 }] })).toThrow('ID');
    expect(() => recommendSupportDecks(real, { ...request, ownedSupports: [{ supportId: '30028', limitBreak: 5 }] })).toThrow('0～4');
  });
});

describe('P4.1 compatible event acquisition and priority policy', () => {
  it('rejects the mutually exclusive union trap in the six-card objective', () => {
    const fixed = Array.from({ length: 5 }, (_, card) => Array.from({ length: 8 }, (_, id) => `fixed-${card}-${id}`));
    const snapshot = synthetic([...fixed, ['a', 'b', 'c', 'd', 'e', 'f'], ['h', 'i', 'j', 'k']]);
    branchEvent(snapshot, 5, [['a', 'b', 'c'], ['d', 'e', 'f']]);
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.cards.some((card) => card.supportId === 'test-card-6')).toBe(true);
    expect(best.cards.some((card) => card.supportId === 'test-card-5')).toBe(false);
    expect(best.skillIds).toHaveLength(44);
    const inspection = inspectSupportLineup(snapshot, request, snapshot.supports.slice(0, 6).map((card) => ({ supportId: card.supportId, limitBreak: 4 }))).deck!;
    expect(inspection.potentialSkillIds).toHaveLength(46);
    expect(inspection.compatibleSkillIds).toHaveLength(43);
    expect(inspection.eventDecisions).toHaveLength(1);
  });

  it('reconsiders earlier event choices when a later card already supplies one reward', () => {
    const snapshot = synthetic([['a', 'b'], ['a'], ['fixed-0'], ['fixed-1'], ['fixed-2'], ['fixed-3']]);
    branchEvent(snapshot, 0, [['a'], ['b']]);
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.skillIds).toEqual(['a', 'b', 'fixed-0', 'fixed-1', 'fixed-2', 'fixed-3']);
    expect(best.cards.find((card) => card.supportId === 'test-card-0')!.skillIds).toEqual(['b']);
    expect(best.eventDecisions[0]!.skillIds).toEqual(['b']);
    expect(best.guaranteedSkillIds).toEqual([]);
  });

  it('keeps success and failure as alternatives without inventing probabilities or acquisition guarantees', () => {
    const snapshot = synthetic([['a', 'b'], ['f0'], ['f1'], ['f2'], ['f3'], ['f4']]);
    branchEvent(snapshot, 0, [['a'], ['b']], { outcomes: ['성공', '실패'] });
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.skillIds.filter((id) => ['a', 'b'].includes(id))).toHaveLength(1);
    expect(best.potentialSkillIds.filter((id) => ['a', 'b'].includes(id))).toHaveLength(2);
    expect(best.eventDecisions[0]).toMatchObject({ probability: null, assurance: 'possible' });
    expect(['success', 'failure']).toContain(best.eventDecisions[0]!.outcome);
    expect(best.guaranteedSkillIds).toEqual([]);
  });

  it('requires overlapping event accounts to satisfy every branch constraint', () => {
    const snapshot = synthetic([['a', 'b'], ['f0'], ['f1'], ['f2'], ['f3'], ['f4']]);
    branchEvent(snapshot, 0, [['a'], ['b']]);
    const extra = structuredClone(snapshot.supportEvents![0]!);
    extra.eventId = 'test-only-separate-account';
    extra.choices = [{ choiceId: 'both', label: '별도 출처 보상', skills: [{ skillId: 'a', hintLevel: 1 }, { skillId: 'b', hintLevel: 1 }], raw: {} }];
    snapshot.supportEvents!.push(extra);
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.potentialSkillIds.filter((id) => ['a', 'b'].includes(id))).toHaveLength(2);
    expect(best.skillIds.filter((id) => ['a', 'b'].includes(id))).toHaveLength(1);
    for (const decision of best.eventDecisions) expect(decision.skillIds.every((id) => best.skillIds.includes(id))).toBe(true);
  });

  it('does not bypass a conflicting event account through another reference while preserving a separate normal hint', () => {
    const snapshot = synthetic([['a'], ['f0'], ['f1'], ['f2'], ['f3'], ['f4']]);
    branchEvent(snapshot, 0, [['a']]);
    const first = snapshot.supportEvents![0]!;
    first.raw = { selection: 'single', id: 'evt_0_777' };
    const conflict = structuredClone(first);
    conflict.eventId = 'test-only-conflicting-account'; conflict.choices[0]!.skills = [];
    const reference = structuredClone(first);
    reference.eventId = 'test-only-independent-reference'; reference.raw = { selection: 'single' };
    snapshot.supportEvents!.push(conflict, reference);
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.skillIds).not.toContain('a');
    expect(best.unresolvedEventSkillIds).toContain('a');
    snapshot.supportSkills.push({ ...structuredClone(snapshot.supportSkills[0]!), acquisition: 'hint' });
    expect(recommendSupportDecks(snapshot, request).recommendations[0]!.skillIds).toContain('a');
  });

  it('excludes blocked and unresolved event rewards from scored compatible paths', () => {
    const snapshot = synthetic([['event-only'], ['f0'], ['f1'], ['f2'], ['f3'], ['f4']]);
    const scenarioId = snapshot.scenarios[0]!.scenarioId;
    branchEvent(snapshot, 0, [['event-only']], { scenarioId });
    const selected = recommendSupportDecks(snapshot, { ...request, scenarioId }).recommendations[0]!;
    expect(selected.skillIds).toContain('event-only');
    const blocked = recommendSupportDecks(snapshot, { ...request, scenarioId: 'test-only-other-scenario' }).recommendations[0]!;
    expect(blocked.skillIds).not.toContain('event-only');
    expect(blocked.unresolvedEventSkillIds).toContain('event-only');
    snapshot.supportEvents = [];
    const unknown = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(unknown.potentialSkillIds).toContain('event-only');
    expect(unknown.skillIds).not.toContain('event-only');
  });

  it('uses unspecified-server branches only to constrain existing KR routes', () => {
    const snapshot = synthetic([['a'], ['f0'], ['f1'], ['f2'], ['f3'], ['f4']]);
    branchEvent(snapshot, 0, [['a'], ['unmapped-source-only']], { server: 'source-unspecified' });
    const best = recommendSupportDecks(snapshot, request).recommendations[0]!;
    expect(best.skillIds).toContain('a');
    expect(best.skillIds).not.toContain('unmapped-source-only');
    expect(best.eventDecisions[0]).toMatchObject({ evidence: 'source-unspecified', assurance: 'unknown', probability: null });
    snapshot.supportSkills.filter((route) => route.supportId === 'test-card-0').forEach((route) => { route.server = 'source_unspecified'; });
    expect(recommendSupportDecks(snapshot, request).recommendations[0]!.potentialSkillIds).not.toContain('a');
  });

  it('records bounded branch exploration and withholds exact-optimum certification', () => {
    const snapshot = synthetic([['a', 'b', 'c'], ['f0'], ['f1'], ['f2'], ['f3'], ['f4']]);
    branchEvent(snapshot, 0, [['a'], ['b'], ['c']]);
    const result = recommendSupportDecks(snapshot, { ...request, search: { eventPlanLimit: 1 } });
    expect(result.search).toMatchObject({ eventPlanLimit: 1, eventPlansPruned: true, globalOptimal: false, optimalWithinCandidatePool: false });
    expect(result.recommendations[0]!.skillIds.filter((id) => ['a', 'b', 'c'].includes(id))).toHaveLength(1);
  });

  it('does not let a guide-listed target override substantially larger useful compatible coverage', () => {
    const fixed = Array.from({ length: 5 }, (_, card) => Array.from({ length: 20 }, (_, id) => `fixed-${card}-${id}`));
    const snapshot = synthetic([...fixed, ['201601'], Array.from({ length: 30 }, (_, id) => `broad-${id}`)]);
    for (const skill of snapshot.skills) { skill.cost = 120; skill.conditionGroups = [{ condition: 'order<=3', precondition: null,
      baseTime: 10000, effects: [{ type: 27, value: 1500, raw: {} }], raw: {} }]; }
    const context: P4RecommendationRequest = { ...request,
      course: { courseId: '10906', trackId: '10009', distanceM: 2200, surface: 'turf', rotation: 1, season: 2, weather: 2, groundCondition: 2 },
      cutoffDate: '2026-11-13', scenarioId: '11' };
    const best = recommendSupportDecks(snapshot, context).recommendations[0]!;
    expect(best.skillIds).not.toContain('201601');
    expect(best.score.coreSkillCount).toBe(0);
    expect(best.skillIds).toHaveLength(130);
    expect(best.score.coverageValue).toBe(130 * 6);
    const alternateContext = recommendSupportDecks(snapshot, { ...context, course: { ...context.course, season: 4 } }).recommendations[0]!;
    expect(alternateContext.score.coreSkillCount).toBe(0);
    expect(alternateContext.skillIds).not.toContain('201601');
    expect(alternateContext.skillIds).toHaveLength(130);
  });

  it('uses an exact-context dated guide only as a tie preference without fitting new score weights', () => {
    const fixed = Array.from({ length: 5 }, (_, card) => Array.from({ length: 5 }, (_, id) => `fixed-${card}-${id}`));
    const snapshot = synthetic([...fixed, ['201601'], ['not-listed']]);
    for (const skill of snapshot.skills) { skill.cost = 120; skill.conditionGroups = [{ condition: 'order<=3', precondition: null,
      baseTime: 10000, effects: [{ type: 27, value: 1500, raw: {} }], raw: {} }]; }
    const context: P4RecommendationRequest = { ...request,
      course: { courseId: '10906', trackId: '10009', distanceM: 2200, surface: 'turf', rotation: 1, season: 2, weather: 2, groundCondition: 2 },
      cutoffDate: '2026-11-13', scenarioId: '11' };
    const best = recommendSupportDecks(snapshot, context).recommendations[0]!;
    expect(best.skillIds).toContain('201601');
    expect(best.skillIds).not.toContain('not-listed');
    expect(best.score.coreSkillCount).toBe(1);
    expect(best.score.coverageValue).toBe(26 * 6);
    expect(best.reasons.join(' ')).toContain('동률');
    const beforeGuide = recommendSupportDecks(snapshot, { ...context, cutoffDate: '2026-10-01' });
    expect(beforeGuide.recommendations[0]!.score.coreSkillCount).toBe(0);
  });
});
