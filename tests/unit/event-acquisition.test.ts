import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import actual from '../golden/p3-real-ui-subset.json';
import { validateP3Snapshot, type P3Snapshot } from '../../src/domain/skill-support';
import { buildSupportEventModel } from '../../src/engine/event-acquisition';

const real = validateP3Snapshot(actual);
type Event = NonNullable<P3Snapshot['supportEvents']>[number];
const supportId = real.supports[0]!.supportId;
/** Synthetic choices verify combination logic; they are never production records. */
function event(overrides: Partial<Event> = {}): Event {
  return { eventId: 'test-only-choice', supportId, label: '합성 선택지', server: 'KR', sourceIds: ['ut'],
    raw: { selection: 'single' }, choices: [
      { choiceId: 'one', label: 'one', skills: [{ skillId: 'a', hintLevel: 1 }, { skillId: 'b', hintLevel: 1 }], raw: {} },
      { choiceId: 'two', label: 'two', skills: [{ skillId: 'c', hintLevel: 1 }], raw: {} },
    ], ...overrides };
}
function snapshot(events: Event[]): P3Snapshot { return { ...structuredClone(real), supportEvents: events, supportSkills: [] }; }

describe('P4.1 event acquisition alternatives', () => {
  it('preserves simultaneous rewards within one choice but never merges alternatives', () => {
    const model = buildSupportEventModel(snapshot([event()]), supportId);
    expect(model.groups[0]!.status).toBe('modeled');
    expect(model.groups[0]!.options.map((option) => option.skillIds)).toEqual([['a', 'b'], ['c']]);
    expect(model.groups[0]!.options.some((option) => option.skillIds.includes('a') && option.skillIds.includes('c'))).toBe(false);
    expect(model.groups[0]!.options.every((option) => option.assurance === 'possible')).toBe(true);
  });

  it('keeps success and empty failure outcomes without inventing a success probability', () => {
    const model = buildSupportEventModel(snapshot([event({ choices: [
      { choiceId: 'choice-0-branch-0', label: '성공', skills: [{ skillId: 'a', hintLevel: null }],
        raw: { sourceChoice: { results: [] }, sourceBranch: { condition: '성공' } } },
      { choiceId: 'choice-0-branch-1', label: '실패', skills: [],
        raw: { sourceChoice: { results: [] }, sourceBranch: { condition: '실패' } } },
    ] })]), supportId);
    const [success, failure] = model.groups[0]!.options;
    expect(success!.choiceKey).toBe(failure!.choiceKey);
    expect(success).toMatchObject({ outcome: 'success', assurance: 'possible', skillIds: ['a'] });
    expect(failure).toMatchObject({ outcome: 'failure', assurance: 'possible', skillIds: [] });
    expect(JSON.stringify(model)).not.toMatch(/probability|successRate/);
  });

  it('applies explicit scenario restrictions and separates missing scenario context', () => {
    const data = snapshot([event({ raw: { selection: 'single', scenarioId: '2' } })]);
    expect(buildSupportEventModel(data, supportId, { scenarioId: '2' }).groups[0]!.status).toBe('modeled');
    expect(buildSupportEventModel(data, supportId, { scenarioId: '1' }).groups[0]!.status).toBe('scenario-blocked');
    expect(buildSupportEventModel(data, supportId).groups[0]!.status).toBe('unknown-scenario');
  });

  it('holds unrecognized scenario conditions rather than treating them as unrestricted', () => {
    const data = snapshot([event({ raw: { source: { condition: '미확인 시나리오 전용' } } })]);
    expect(buildSupportEventModel(data, supportId, { scenarioId: '2' }).groups[0]!.status).toBe('unknown-scenario');
  });

  it('does not reverse scenario negation into a required scenario', () => {
    for (const condition of ['아오하루에서는 발생하지 않음', 'URA以外']) {
      const data = snapshot([event({ raw: { selection: 'single', source: { condition } } })]);
      expect(buildSupportEventModel(data, supportId, { scenarioId: '2' }).groups[0]!.status).toBe('unknown-scenario');
      expect(buildSupportEventModel(data, supportId, { scenarioId: '1' }).groups[0]!.status).toBe('unknown-scenario');
    }
  });

  it('holds differing scenario branches instead of allowing their reward union in either scenario', () => {
    const cases = [
      event({ raw: { selection: 'single', scenarioIds: ['1', '2'] } }),
      event({ raw: { selection: 'single', source: { condition: 'URA 또는 아오하루' } } }),
      event({ choices: [
        { choiceId: 'one', label: 'URA 전용 보상', skills: [{ skillId: 'a', hintLevel: 1 }], raw: { sourceChoice: {}, sourceBranch: { condition: 'URA' } } },
        { choiceId: 'two', label: '아오하루 전용 보상', skills: [{ skillId: 'b', hintLevel: 1 }], raw: { sourceChoice: {}, sourceBranch: { condition: '아오하루' } } },
      ] }),
      event({ choices: [
        { choiceId: 'one', label: 'URA 전용 보상', skills: [{ skillId: 'a', hintLevel: 1 }], raw: { sourceChoice: {}, sourceBranch: { condition: 'URA' } } },
        { choiceId: 'two', label: '시나리오 미기재 보상', skills: [{ skillId: 'b', hintLevel: 1 }], raw: { sourceChoice: {}, sourceBranch: { condition: '' } } },
      ] }),
      event({ raw: { selection: 'single', scenarioId: null }, choices: [
        { choiceId: 'one', label: 'URA 전용 보상', skills: [{ skillId: 'a', hintLevel: 1 }], raw: { eventCondition: 'URA' } },
        { choiceId: 'two', label: '시나리오 미기재 보상', skills: [{ skillId: 'b', hintLevel: 1 }], raw: {} },
      ] }),
    ];
    for (const source of cases) for (const scenarioId of ['1', '2']) {
      expect(buildSupportEventModel(snapshot([source]), supportId, { scenarioId }).groups[0]!.status).toBe('unknown-scenario');
    }
  });

  it('holds mixed unparsed outcomes and unresolved chain dependencies without splitting prose', () => {
    for (const branch of [
      { condition: '', result: '성공시 a 획득, 실패시 b 획득' },
      { condition: '연속 이벤트', result: 'a 획득, 연속 이벤트 종료' },
      { condition: '첫번째 이벤트에서 아래 선택지 선택시', result: 'a 획득' },
      { condition: '연속 이벤트 1,2번 모두 성공', result: 'a 획득' },
    ]) {
      const data = snapshot([event({ raw: { bucket: 'once' }, choices: [{ choiceId: 'choice-0-branch-0',
        label: '원문 미분리', skills: [{ skillId: 'a', hintLevel: null }, { skillId: 'b', hintLevel: null }],
        raw: { sourceChoice: { result: branch.result }, sourceBranch: branch } }] })]);
      const group = buildSupportEventModel(data, supportId).groups[0]!;
      expect(group.status).toBe('unverified');
      expect(group.options[0]!.skillIds).toEqual(['a', 'b']);
    }
  });

  it('never promotes source-unspecified or common events into KR acquisition evidence', () => {
    for (const server of ['source_unspecified', 'source-unspecified']) {
      const data = snapshot([event({ server, raw: { bucket: 'once' }, choices: [
        { choiceId: 'choice-0-branch-0', label: '참고', skills: [{ skillId: 'held-only', hintLevel: null }],
          raw: { sourceChoice: { result: '참고 보상' }, sourceBranch: { condition: '' } } },
      ] })]);
      const model = buildSupportEventModel(data, supportId);
      expect(model.groups[0]).toMatchObject({ evidence: 'source-unspecified', constraintOnly: true, rankingEligible: false });
      expect(model.unresolvedSkillIds).toEqual([]);
      expect(data.supportSkills).toEqual([]);
    }
    expect(buildSupportEventModel(snapshot([event({ raw: { bucket: 'common', selection: 'single' } })]), supportId).groups[0]!.status).toBe('unverified');
  });

  it('merges only exact game-event identities, detects conflicts, and retains each account', () => {
    const gt = event({ eventId: 'gt-test', server: 'JP', raw: { event: [0, [], 830283003], ownerKind: 'support' } });
    const ts = event({ eventId: 'ts-test', server: 'JP', raw: { id: 'evt_30283_830283003', selection: 'single' } });
    const data = snapshot([gt, ts]);
    expect(buildSupportEventModel(data, supportId, { allowJpReference: true }).groups).toHaveLength(1);
    ts.choices = [{ choiceId: 'new', label: '다른 보상', skills: [{ skillId: 'z', hintLevel: 1 }], raw: {} }];
    data.supportEvents = [gt, ts];
    const model = buildSupportEventModel(data, supportId, { allowJpReference: true });
    expect(model.groups[0]).toMatchObject({ status: 'source-conflict', rankingEligible: false });
    expect(model.groups[0]!.options.some((option) => option.skillIds.includes('z'))).toBe(true);
    expect(model.groups[0]!.options.some((option) => option.skillIds.includes('a') && option.skillIds.includes('z'))).toBe(false);
    data.supportEvents = [event(), event({ eventId: 'same-title-different-id' })];
    expect(buildSupportEventModel(data, supportId).groups).toHaveLength(2);
  });

  it('leaves existing event routes unresolved when no branch evidence exists', () => {
    const data = snapshot([]);
    data.supportSkills.push({ supportId, skillId: 'a', server: 'KR', acquisition: 'event', sourceGroup: null, sourceIds: ['ut'] });
    data.supportSkills.push({ supportId, skillId: 'held', server: 'source_unspecified', acquisition: 'event', sourceGroup: null, sourceIds: ['ut'] });
    expect(buildSupportEventModel(data, supportId).unresolvedSkillIds).toEqual(['a']);
  });

  it('retains an explicit KR guarantee only when the source states it', () => {
    const single = [{ choiceId: 'one', label: '고정 보상', skills: [{ skillId: 'a', hintLevel: null }], raw: {} }];
    const model = buildSupportEventModel(snapshot([event({ raw: { selection: 'auto', guaranteedAcquisition: true }, choices: single })]), supportId);
    expect(model.groups[0]!.options.every((option) => option.assurance === 'guaranteed')).toBe(true);
    const reference = buildSupportEventModel(snapshot([event({ server: 'JP', raw: { selection: 'auto', guaranteedAcquisition: true }, choices: single })]), supportId, { allowJpReference: true });
    expect(reference.groups[0]!.options.every((option) => option.assurance === 'possible')).toBe(true);
    const choices = buildSupportEventModel(snapshot([event({ raw: { selection: 'single', guaranteedAcquisition: true } })]), supportId);
    expect(choices.groups[0]!.options.every((option) => option.assurance === 'possible')).toBe(true);
  });
});

describe.runIf(existsSync('data/local/p3-skill-support.json'))('actual event evidence regression', () => {
  const data = JSON.parse(readFileSync('data/local/p3-skill-support.json', 'utf8')) as P3Snapshot;
  it('holds conflicting Fine Motion 30283 game-event accounts separately', () => {
    const model = buildSupportEventModel(data, '30283', { scenarioId: '11', allowJpReference: true });
    const fine = model.groups.find((group) => group.groupId === '30283:game-830283003')!;
    expect(fine).toMatchObject({ status: 'source-conflict', evidence: 'jp-reference', constraintOnly: true, rankingEligible: false });
    expect(fine.eventIds).toEqual(['gt-30283-830283003', 'ts-evt_30283_830283003']);
    expect(fine.options.map((option) => option.skillIds)).toContainEqual(['202761', '204071']);
    expect(fine.options.map((option) => option.skillIds)).toContainEqual(['204072', '210101', '210262']);
  });

  it('recognizes the known 30108 mutually exclusive condition greens without adding KR paths', () => {
    const before = data.supportSkills.length;
    const model = buildSupportEventModel(data, '30108', { scenarioId: '11', allowJpReference: true });
    const group = model.groups.find((row) => row.eventIds.includes('trainers-30108-once-9da86fae9c253cc6'))!;
    expect(group).toMatchObject({ status: 'modeled', evidence: 'source-unspecified', constraintOnly: true, rankingEligible: false });
    expect(group.options.map((option) => option.skillIds)).toContainEqual(['200042']);
    expect(group.options.map((option) => option.skillIds)).toContainEqual(['200052']);
    expect(group.options.some((option) => option.skillIds.includes('200042') && option.skillIds.includes('200052'))).toBe(false);
    expect(data.supportSkills).toHaveLength(before);
  });

  it('exposes missing group-card event bodies instead of calling their union compatible', () => {
    expect(buildSupportEventModel(data, '30241', { scenarioId: '11', allowJpReference: true }).unresolvedSkillIds).toHaveLength(12);
  });
});
