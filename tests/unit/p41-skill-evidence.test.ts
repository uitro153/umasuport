import { describe, expect, it } from 'vitest';
import base from '../golden/p3-engine-real-subset.json';
import extract from '../golden/p41-evaluation-real-extract.json';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { evaluateSkills, type SkillEvaluationRequest } from '../../src/engine/skill-evaluation';
import { buildSkillValueEvidence } from '../../src/engine/skill-value-evidence';

const skills = new Map([...base.skills, ...extract.skills].map((skill) => [skill.skillId, skill]));
const snapshot = validateP3Snapshot({ ...base, skills: [...skills.values()],
  sources: [...new Map([...base.sources, ...extract.sources].map((source) => [source.id, source])).values()],
  courses: [...base.courses.filter((course) => course.courseId !== extract.course.courseId), extract.course],
  skillRevisions: [...base.skillRevisions.filter((row) => !extract.skills.some((skill) => skill.skillId === row.skillId)), ...extract.skillRevisions],
});
const request: SkillEvaluationRequest = {
  course: { courseId: '10906', trackId: '10009', distanceM: 2200, surface: 'turf', rotation: 1, season: 2, weather: 2, groundCondition: 2 },
  runningStyle: 'pace', cutoffDate: '2026-11-13', includeUnknown: true, allowForecast: true,
};
const rows = evaluateSkills(snapshot, request).rows;
const row = (id: string) => rows.find((value) => value.skillId === id)!;

describe('P4.1 qualitative evidence classes, using captured real skill and Hanshin geometry records', () => {
  it('retains cheap speed and valid stamina greens as course-valid priorities', () => {
    for (const id of ['200012', '200182', '200052', '200142']) expect(row(id)).toMatchObject({
      grade: 'priority', conditionClass: 'course-valid', costEfficiency: 'good',
      valueEvidence: { layer: 'qualitative', core: { status: 'guide-priority' } },
    });
    expect(row('202652')).toMatchObject({ grade: 'supplementary', costEfficiency: 'expensive' });
  });
  it('separates course-compatible timing from opponent order and race-state requirements', () => {
    for (const id of ['201102', '201112', '201312', '201322']) expect(row(id)).toMatchObject({ grade: 'conditional', conditionClass: 'window-dependent' });
    expect(row('201661')).toMatchObject({ grade: 'conditional', conditionClass: 'race-order-dependent' });
    expect(row('201601')).toMatchObject({ grade: 'conditional', conditionClass: 'race-order-dependent', bashinGain: null, activationRate: null });
    expect(row('201661').valueEvidence.dynamicVariables).toContain('behind_near_lane_time');
  });
  it('uses the existing Korean guide only in an exact matching course/style context', () => {
    expect(row('201312').valueEvidence.core.sourceUrls).toEqual(['https://swallow91.tistory.com/594']);
    const changed = evaluateSkills(snapshot, { ...request, course: { ...request.course, weather: 1 } });
    expect(changed.rows.find((value) => value.skillId === '201312')?.valueEvidence.core.status).toBe('not-established');
    const earlier = evaluateSkills(snapshot, { ...request, cutoffDate: '2026-10-16' });
    expect(earlier.rows.find((value) => value.skillId === '201312')?.valueEvidence.core.status).toBe('not-established');
    expect(evaluateSkills(snapshot, { ...request, runningStyle: 'late' }).rows.find((value) => value.skillId === '201312')?.conditionClass).toBe('course-ineffective-or-low');
  });
  it('bounds a real final-corner acceleration by actual course phases and remaining distance without declaring it useless', () => {
    const value = row('202712');
    expect(value.valueEvidence.accelerationWindow).toMatchObject({
      scope: 'activation-location-only', status: 'outside-transition', activationRanges: [{ start: 1550, end: 1600 }],
    });
    expect(value.conditionClass).toBe('race-order-dependent');
    expect(value.valueEvidence.accelerationWindow.reason).toContain('무효 가속으로 단정하거나 감점하지');
    expect(value.bashinGain).toBeNull();
  });
  it('does not attach source geometry to a different manual distance or invent an effectiveness rate', () => {
    const value = evaluateSkills(snapshot, { ...request, course: { ...request.course, distanceM: 2300 } }).rows.find((skill) => skill.skillId === '202712')!;
    expect(value.valueEvidence.accelerationWindow.status).toBe('unverified');
    expect(value.activationRate).toBeNull();
  });
  it('finds a provably empty activation intersection in an explicitly synthetic predicate test', () => {
    const actual = snapshot.skills.find((skill) => skill.skillId === '202712')!;
    const value = buildSkillValueEvidence({ skillId: actual.skillId,
      groups: [{ ...actual.conditionGroups[0]!, condition: 'phase==1&is_last_straight==1' }],
      course: request.course, courseRecord: extract.course, runningStyle: 'pace', cutoffDate: request.cutoffDate,
      applicability: 'conditional', grade: 'conditional', unknownEffect: false,
    });
    expect(value.conditionClass).toBe('course-ineffective-or-low');
    expect(value.accelerationWindow.activationRanges).toEqual([]);
  });
});
