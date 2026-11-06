import { describe, expect, it } from 'vitest';
import { evaluateSkillCondition, type SkillCourseContext } from '../../src/engine/skill-conditions';

const course: SkillCourseContext = { courseId: '10502', trackId: '10005', distanceM: 2000, surface: 'turf', rotation: 1, season: 1, weather: 1, groundCondition: 1 };
describe('P3 conservative condition logic (synthetic expressions, not invented game records)', () => {
  it('keeps AND/OR precedence and mixed branches', () => {
    expect(evaluateSkillCondition('distance_type==2&running_style==1@distance_type==3&running_style==2', course, 'pace').state).toBe('applicable');
    expect(evaluateSkillCondition('distance_type==2&running_style==1@distance_type==3&running_style==2', course, 'late').state).toBe('inapplicable');
  });
  it('preserves static exclusion even alongside dynamic or unknown terms', () => {
    expect(evaluateSkillCondition('running_style==1&order_rate<=50', course, 'late').state).toBe('inapplicable');
    expect(evaluateSkillCondition('running_style==1&new_unknown_term==1', course, 'late').state).toBe('inapplicable');
  });
  it('does not turn unsupported conditions or missing weather into confirmed validity', () => {
    const unknown = evaluateSkillCondition('running_style==2&new_condition==3', course, 'pace');
    expect(unknown.state).toBe('unverified'); expect(unknown.unknownVariables).toContain('new_condition');
    expect(evaluateSkillCondition('weather==1', { ...course, weather: null }, 'pace').state).toBe('unverified');
  });
  it('labels race-state predicates conditional without a made-up percentage', () => {
    const match = evaluateSkillCondition('running_style==2&phase_firsthalf_random==2&order_rate<=50', course, 'pace');
    expect(match.state).toBe('conditional'); expect(match.dynamicVariables).toContain('order_rate');
  });
  it('accepts parenthesized OR, multi-character logical separators and signed comparisons safely', () => {
    expect(evaluateSkillCondition('(rotation==1||rotation==2)&&season!=2', course, 'front').state).toBe('applicable');
    expect(evaluateSkillCondition('always==1&base_speed>=1000', course, 'front').state).toBe('conditional');
    expect(evaluateSkillCondition('always==1&(()', course, 'front').state).toBe('unverified');
  });
});
