import { describe, expect, it } from 'vitest';
import realSubset from '../golden/p3-engine-real-subset.json';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { evaluateSkills, type SkillEvaluationRequest } from '../../src/engine/skill-evaluation';
import { analyzeSupportDeck, getP3Availability } from '../../src/engine/support-acquisition';

const snapshot = validateP3Snapshot(realSubset);
const request: SkillEvaluationRequest = {
  course: { courseId: '10502', trackId: '10005', distanceM: 2000, surface: 'turf', rotation: 1, season: 1, weather: 1, groundCondition: 1 },
  runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true,
};
const row = (id: string, input: SkillEvaluationRequest = request) => evaluateSkills(snapshot, input).rows.find((skill) => skill.skillId === id)!;
describe('P3 public real-data skill evaluation, not game-accuracy certification', () => {
  it('prioritizes matching low-cost speed/stamina greens over expensive confidence', () => {
    expect(row('200012')).toMatchObject({ applicability: 'applicable', grade: 'priority', cost: 90, totalCost: 90, passiveStats: ['스피드'] });
    expect(row('200042')).toMatchObject({ grade: 'priority', passiveStats: ['스태미나'] });
    expect(row('202652')).toMatchObject({ grade: 'supplementary', costEfficiency: 'expensive' });
    const list = evaluateSkills(snapshot, request).rows;
    expect(list.findIndex((skill) => skill.skillId === '200012')).toBeLessThan(list.findIndex((skill) => skill.skillId === '202652'));
  });
  it('changes season/direction usefulness with the tournament rather than cross-tournament reuse', () => {
    expect(row('200172').grade).toBe('priority'); expect(row('200182').grade).toBe('excluded');
    const summerLeft = { ...request, course: { ...request.course, season: 2, rotation: 2 as const } };
    expect(row('200172', summerLeft).grade).toBe('excluded'); expect(row('200182', summerLeft).grade).toBe('priority');
    expect(row('200012', summerLeft).grade).toBe('excluded'); expect(row('200022', summerLeft).grade).toBe('priority');
  });
  it('preserves style gates and does not declare conditional acceleration a measured core skill', () => {
    expect(row('201902')).toMatchObject({ applicability: 'conditional', grade: 'conditional', core: 'candidate', bashinGain: null, activationRate: null });
    expect(row('201902', { ...request, runningStyle: 'late' })).toMatchObject({ grade: 'excluded', core: 'not-established' });
  });
  it('uses the source lower prerequisite chain, not the displayed incremental Pt as full cost', () => {
    expect(row('200011')).toMatchObject({ cost: 110, totalCost: 200, costEfficiency: 'expensive' });
    expect(row('200014')).toMatchObject({ cost: 130, totalCost: 330, costEfficiency: 'expensive' });
    expect(row('200331')).toMatchObject({ cost: 180, totalCost: 360 });
  });
  it('keeps source-only skills and unknown game conditions explicit', () => {
    expect(row('200012').availability.state).toBe('unknown');
    expect(row('10071').grade).toBe('excluded'); expect(row('900071').grade).toBe('excluded');
    expect(row('102901211').grade).toBe('excluded'); expect(row('200173').grade).toBe('excluded');
    expect(row('201631')).toMatchObject({ applicability: 'conditional', grade: 'conditional' });
    expect(row('200012', { ...request, course: { ...request.course, rotation: null } }).grade).toBe('unverified');
  });
  it('keeps opponent debuffs out of self-penalty exclusion and recognizes current-speed effects', () => {
    expect(row('200851').grade).toBe('unverified');
    expect(row('200851').reasons.join(' ')).toContain('자기 능력 감소로 처리하지');
    expect(row('200173').grade).toBe('excluded');
    expect(row('202552').effectSummary).toContain('현재 속도');
    expect(row('202552').effectSummary).not.toContain('미해석 효과 22');
  });
  it('keeps the effective skill set across preferences and retains already supplied hint targets', () => {
    const deck = [{ supportId: '30028', limitBreak: 4 }];
    const balanced = evaluateSkills(snapshot, { ...request, deck, preference: 'balanced' });
    const skills = evaluateSkills(snapshot, { ...request, deck, preference: 'skills' });
    const stability = evaluateSkills(snapshot, { ...request, deck, preference: 'stability' });
    const ids = (rows: typeof balanced.rows) => rows.filter((skill) => skill.grade !== 'excluded').map((skill) => skill.skillId).sort();
    expect(ids(balanced.rows)).toEqual(ids(skills.rows)); expect(ids(balanced.rows)).toEqual(ids(stability.rows));
    expect(balanced.rows.find((skill) => skill.skillId === '200332')?.routes.map((route) => route.kind)).toEqual(expect.arrayContaining(['hint', 'gold-lower']));
    expect(balanced.rows.find((skill) => skill.skillId === '200332')?.reasons.join(' ')).toContain('추가 힌트');
  });
});

describe('P3 six-card actual support acquisition paths', () => {
  const deck = ['30028', '30016', '30023', '30007', '30009', '30011'].map((supportId) => ({ supportId, limitBreak: 4 }));
  it('distinguishes hint, event and gold-to-lower potential paths with source evidence', () => {
    const analysis = analyzeSupportDeck(snapshot, deck, '2026-11-05');
    expect(analysis).toMatchObject({ selectedCount: 6, complete: true });
    expect(analysis.cards.every((card) => card.accepted)).toBe(true);
    expect(analysis.bySkillId['200331']?.find((route) => route.supportId === '30028')).toMatchObject({ kind: 'event', sourceKind: 'event', hintLevel: null, status: 'potential-route' });
    expect(analysis.bySkillId['200332']?.find((route) => route.kind === 'gold-lower')).toMatchObject({ goldSkillId: '200331', sourceKind: 'event', hintLevel: null });
    expect(analysis.bySkillId['200332']?.find((route) => route.kind === 'gold-lower')?.relationEvidence).toContain('kr-pending');
    expect(analysis.bySkillId['200352']?.map((route) => route.supportId)).toEqual(expect.arrayContaining(['30028', '30016']));
  });
  it('uses the selected limit-break effects for normal hints without applying them to gold events', () => {
    const base = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 0 }], '2026-11-05');
    const full = analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2026-11-05');
    expect(base.bySkillId['200332']?.find((route) => route.kind === 'hint')).toMatchObject({ hintLevel: 1, hintFrequency: 20 });
    expect(full.bySkillId['200332']?.find((route) => route.kind === 'hint')).toMatchObject({ hintLevel: 2, hintFrequency: 30 });
    expect(full.bySkillId['200331']?.[0]?.hintFrequency).toBeNull();
  });
  it('applies the actual secondary KR release boundary and does not borrow its date for the skill', () => {
    expect(getP3Availability(snapshot, 'support', '30028', '2022-07-24')).toMatchObject({ state: 'unavailable', basis: 'secondary-date' });
    expect(analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 4 }], '2022-07-24').routes).toHaveLength(0);
    expect(getP3Availability(snapshot, 'support', '30028', '2022-07-25').state).toBe('available');
    expect(getP3Availability(snapshot, 'skill', '200332', '2026-11-05').state).toBe('unknown');
  });
  it('reports an incomplete deck and rejects duplicate slots or invalid breakthrough levels', () => {
    expect(analyzeSupportDeck(snapshot, deck.slice(0, 3), '2026-11-05').complete).toBe(false);
    expect(() => analyzeSupportDeck(snapshot, [...deck, deck[0]!], '2026-11-05')).toThrow('6장');
    expect(() => analyzeSupportDeck(snapshot, [deck[0]!, deck[0]!], '2026-11-05')).toThrow('중복');
    expect(() => analyzeSupportDeck(snapshot, [{ supportId: '30028', limitBreak: 5 }], '2026-11-05')).toThrow('0～4');
  });
  it('keeps forecast opt-in and official precedence using an explicitly synthetic release overlay', () => {
    const testSnapshot = structuredClone(snapshot);
    const application = testSnapshot.applications.find((value) => value.entityType === 'support' && value.entityId === '30028')!;
    application.kr = {
      confirmedDate: null, observedDate: null, releasedBy: null, forecastDate: '2027-01-15',
      evidence: 'forecast', sourceUrl: 'https://example.invalid/synthetic-date-policy-test', checkedOn: '2026-11-05',
    };
    expect(getP3Availability(testSnapshot, 'support', '30028', '2027-02-01', false).state).toBe('unknown');
    expect(getP3Availability(testSnapshot, 'support', '30028', '2027-02-01', true)).toMatchObject({ state: 'available', basis: 'forecast' });
    expect(analyzeSupportDeck(testSnapshot, [{ supportId: '30028', limitBreak: 4 }], '2027-01-14', true).routes).toHaveLength(0);
    application.kr.confirmedDate = '2027-03-01'; application.kr.evidence = 'official';
    expect(getP3Availability(testSnapshot, 'support', '30028', '2027-02-01', true)).toMatchObject({ state: 'unavailable', basis: 'official-date' });
  });
});
