import { describe, expect, it } from 'vitest';
import { p4Tournaments } from '../../src/data/p4-tournaments';
import { p3TournamentSchema } from '../../src/domain/skill-support';
import { evaluateSkillCondition } from '../../src/engine/skill-conditions';
import { resolveEvaluationContext } from '../../src/engine/availability';

describe('official LoH supplementary case', () => {
  it('preserves the official start, twelve-runner format and Korean date', () => {
    const event = p3TournamentSchema.parse(p4Tournaments[0]);
    expect(event).toMatchObject({ format: 'league-of-heroes', fieldSize: 12, timeOfDay: 'night',
      startAt: '2026-09-12T12:00:00+09:00', courseId: '11103', dateStatus: 'confirmed' });
    if (!event.startAt) throw new Error('Official LoH case needs a start date');
    expect(resolveEvaluationContext({ mode: 'tournament', tournament: { startAt: event.startAt, dateStatus: 'confirmed' }, now: new Date('2026-11-05T00:00:00Z') }).cutoffDate).toBe('2026-09-12');
  });
  it('does not turn random weather and ground into assured green conditions', () => {
    const event = p4Tournaments[0]!;
    expect(event.conditions.weather).toBeNull(); expect(event.conditions.ground).toBeNull();
    const course = { courseId: event.courseId, distanceM: 2000, surface: 'dirt' as const,
      rotation: 1 as const, season: 1, weather: event.conditions.weather, groundCondition: event.conditions.ground };
    expect(evaluateSkillCondition('rotation==1', course, 'pace').state).toBe('applicable');
    expect(evaluateSkillCondition('weather==1', course, 'pace').state).toBe('unverified');
    expect(evaluateSkillCondition('ground_condition==1', course, 'pace').state).toBe('unverified');
  });
});
