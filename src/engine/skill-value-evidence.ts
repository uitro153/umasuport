import guideCases from '../../data/curated/p4-guide-cases.json';
import type { DeepReadonly } from '../data/snapshot';
import type { P3Skill, P3Snapshot } from '../domain/skill-support';
import { evaluateSkillCondition, parseSkillConditionExpression, type ConditionExpression, type ConditionMatch, type RunningStyle, type SkillCourseContext } from './skill-conditions';

export type SkillConditionClass = 'course-valid' | 'race-order-dependent' | 'window-dependent' | 'course-ineffective-or-low' | 'unverified';
export interface SkillValueEvidence {
  layer: 'qualitative';
  conditionClass: SkillConditionClass;
  dynamicVariables: string[];
  accelerationWindow: {
    status: 'not-acceleration' | 'transition-overlap' | 'outside-transition' | 'unverified';
    reason: string;
    /** Bounds on possible activation locations, not acceleration durations or effective rates. */
    activationRanges: { start: number; end: number }[];
    scope: 'activation-location-only';
  };
  core: { status: 'guide-priority' | 'not-established'; sourceUrls: string[] };
}
type Groups = DeepReadonly<P3Skill['conditionGroups']>;
type CourseRecord = DeepReadonly<P3Snapshot['courses'][number]>;
type Range = { start: number; end: number };
const windowVariables = new Set([
  'phase', 'phase_random', 'phase_firsthalf_random', 'phase_laterhalf_random', 'phase_firstquarter_random',
  'phase_firsthalf', 'phase_laterhalf', 'phase_firstquarter', 'phase_corner_random', 'phase_straight_random',
  'distance_rate', 'remain_distance', 'corner', 'corner_random', 'all_corner_random', 'straight_random',
  'is_finalcorner', 'is_finalcorner_random', 'is_finalcorner_laterhalf', 'is_last_straight', 'is_last_straight_onetime',
  'is_lastspurt', 'lastspurt', 'slope', 'up_slope_random', 'down_slope_random', 'accumulatetime',
]);

/** Keeps course compatibility, race-state dependence and unmeasured timing separate from value. */
export function buildSkillValueEvidence(input: {
  skillId: string; groups: Groups; course: SkillCourseContext; courseRecord?: CourseRecord;
  runningStyle: RunningStyle; cutoffDate: string; applicability: ConditionMatch;
  grade: string; unknownEffect: boolean;
}): SkillValueEvidence {
  const activeGroups = input.groups.filter((group) => evaluateSkillCondition(joinConditions(group), input.course, input.runningStyle).state !== 'inapplicable');
  const dynamicVariables = [...new Set(activeGroups.flatMap((group) => evaluateSkillCondition(joinConditions(group), input.course, input.runningStyle).dynamicVariables))].sort();
  let conditionClass: SkillConditionClass = input.applicability === 'inapplicable' || input.grade === 'excluded' ? 'course-ineffective-or-low'
    : input.applicability === 'unverified' || input.grade === 'unverified' || input.unknownEffect ? 'unverified'
      : dynamicVariables.some((variable) => !windowVariables.has(variable)) ? 'race-order-dependent'
        : dynamicVariables.length ? 'window-dependent' : 'course-valid';
  const accelerationGroups = activeGroups.filter((group) => group.effects.some((effect) => effect.type === 31 && effect.value > 0));
  const accelerationWindow = analyzeAccelerationWindow(accelerationGroups, input.course, input.runningStyle, input.courseRecord);
  // Geometry alone cannot determine when a runner reaches target speed. In particular,
  // an activation after spurt entry is NOT automatically ineffective acceleration.
  if (activeGroups.length && accelerationGroups.length === activeGroups.length
    && accelerationWindow.status !== 'unverified' && !accelerationWindow.activationRanges.length) conditionClass = 'course-ineffective-or-low';
  const sourceUrls = conditionClass === 'unverified' || conditionClass === 'course-ineffective-or-low' ? [] : guidePrioritySources(input);
  return {
    layer: 'qualitative', conditionClass, dynamicVariables, accelerationWindow,
    core: { status: sourceUrls.length ? 'guide-priority' : 'not-established', sourceUrls },
  };
}

function guidePrioritySources(input: { skillId: string; course: SkillCourseContext; runningStyle: RunningStyle; cutoffDate: string }): string[] {
  return [...new Set(guideCases.cases.filter((item) => {
    const date = 'publishedOn' in item.source ? item.source.publishedOn : item.source.updatedOn;
    const conditions = item.conditions;
    return item.server === 'KR' && date !== undefined && date <= input.cutoffDate
      && item.runningStyle === input.runningStyle && conditions.courseId === input.course.courseId
      && conditions.distance === input.course.distanceM && conditions.surface === (input.course.surface === 'turf' ? 1 : input.course.surface === 'dirt' ? 2 : null)
      && conditions.direction === input.course.rotation && conditions.season === input.course.season
      && conditions.weather === input.course.weather && conditions.ground === input.course.groundCondition
      && item.targetSkillIds.includes(input.skillId);
  }).map((item) => item.source.url))];
}

function analyzeAccelerationWindow(groups: Groups, course: SkillCourseContext, style: RunningStyle, source?: CourseRecord): SkillValueEvidence['accelerationWindow'] {
  const base = { scope: 'activation-location-only' as const, activationRanges: [] as Range[] };
  if (!groups.length) return { ...base, status: 'not-acceleration', reason: '양의 가속 효과가 없습니다.' };
  const raw = asRecord(source?.raw);
  // Do not silently attach another course's geometry to a manually entered distance.
  if (!source || source.courseId !== course.courseId || source.distance !== course.distanceM || !raw) return {
    ...base, status: 'unverified', reason: '일치하는 실제 코스 구간 자료가 없어 가속 발동 위치를 검증하지 못했습니다.',
  };
  const geometry: Geometry = {
    length: course.distanceM, phases: numberedRanges(raw.phases, 'id'), corners: numberedRanges(raw.corners, 'number'),
    straights: numberedRanges(raw.straights), finalCornerStart: source.finalCornerStart, finalStraightStart: source.finalStraightStart,
  };
  const windows = groups.map((group) => locationBounds(parseSkillConditionExpression(joinConditions(group)), geometry, course, style));
  const activationRanges = mergeRanges(windows.flatMap((window) => window.ranges));
  if (windows.some((window) => !window.interpreted)) return {
    ...base, activationRanges, status: 'unverified', reason: '일부 발동 위치 조건을 해석하지 못했습니다. 가속 유효율과 마신 이득은 미검증입니다.',
  };
  if (!activationRanges.length) return { ...base, status: 'outside-transition', reason: '실제 코스 구간과 발동 조건이 겹치지 않아 발동 위치가 없습니다.' };
  const spurtEntry = source.lastSpurtStart;
  const overlapsEntry = activationRanges.some((range) => [0, spurtEntry].some((point) => point !== null && range.start <= point && point < range.end));
  return {
    ...base, activationRanges, status: overlapsEntry ? 'transition-overlap' : 'outside-transition',
    reason: overlapsEntry
      ? '발동 가능 구간이 출발 또는 종반 진입점과 겹칩니다. 실제 가속 지속·유효율은 검증하지 않았습니다.'
      : '발동 가능 구간이 출발·종반 진입점 이후입니다. 목표 속도 도달 시점이 없어 무효 가속으로 단정하거나 감점하지 않습니다.',
  };
}
interface Geometry { length: number; phases: (Range & { number?: number })[]; corners: (Range & { number?: number })[]; straights: Range[]; finalCornerStart: number | null; finalStraightStart: number | null }
interface Bounds { ranges: Range[]; interpreted: boolean }
function locationBounds(node: ConditionExpression, geometry: Geometry, course: SkillCourseContext, style: RunningStyle): Bounds {
  const full = [{ start: 0, end: geometry.length }];
  if (node.kind === 'constant') return { ranges: full, interpreted: true };
  if (node.kind === 'unknown') return { ranges: full, interpreted: false };
  if (node.kind === 'and' || node.kind === 'or') {
    const children = node.children.map((child) => locationBounds(child, geometry, course, style));
    return { ranges: node.kind === 'or' ? mergeRanges(children.flatMap((child) => child.ranges))
      : children.reduce((ranges, child) => intersectRanges(ranges, child.ranges), full), interpreted: children.every((child) => child.interpreted) };
  }
  const { variable, comparator, value } = node;
  const condition = evaluateSkillCondition(node.expression, course, style);
  if (condition.state === 'applicable') return { ranges: full, interpreted: true };
  if (condition.state === 'inapplicable') return { ranges: [], interpreted: true };
  if (condition.state === 'unverified') return { ranges: full, interpreted: false };
  if (variable === 'phase' || variable === 'phase_random') return {
    ranges: geometry.phases.filter((range) => compare(range.number, comparator, value)), interpreted: geometry.phases.length > 0,
  };
  if (variable === 'corner') return {
    ranges: [...geometry.corners.filter((range) => compare(range.number, comparator, value)), ...(compare(0, comparator, value) ? geometry.straights : [])],
    interpreted: geometry.corners.length > 0 && geometry.straights.length > 0,
  };
  if (['corner_random', 'all_corner_random'].includes(variable) && comparator === '==' && value === 1) return { ranges: geometry.corners, interpreted: geometry.corners.length > 0 };
  if (variable === 'straight_random' && comparator === '==' && value === 1) return { ranges: geometry.straights, interpreted: geometry.straights.length > 0 };
  if (variable === 'is_finalcorner_random' && comparator === '==' && value === 1 && geometry.finalCornerStart !== null) return {
    ranges: geometry.corners.filter((range) => range.start >= geometry.finalCornerStart!), interpreted: geometry.corners.length > 0,
  };
  // A final-corner flag may continue into the straight in source predicates
  // (e.g. is_finalcorner==1&corner==0). Use an outer bound, not a false exclusion.
  if (variable === 'is_finalcorner' && comparator === '==' && value === 1 && geometry.finalCornerStart !== null) return {
    ranges: [{ start: geometry.finalCornerStart, end: geometry.length }], interpreted: true,
  };
  if (['is_last_straight', 'is_last_straight_onetime'].includes(variable) && comparator === '==' && value === 1 && geometry.finalStraightStart !== null) return {
    ranges: [{ start: geometry.finalStraightStart, end: geometry.length }], interpreted: true,
  };
  if (variable === 'remain_distance' || variable === 'distance_rate') {
    const point = variable === 'remain_distance' ? geometry.length - value : geometry.length * value / 100;
    // Boundary equality can affect a single point; retain a full outer bound
    // rather than falsely claiming a zero-duration equality cannot activate.
    if (comparator === '==' || comparator === '!=') return { ranges: full, interpreted: false };
    const before = variable === 'remain_distance' ? ['>', '>='].includes(comparator) : ['<', '<='].includes(comparator);
    return { ranges: [{ start: before ? 0 : Math.max(0, point), end: before ? Math.min(geometry.length, point) : geometry.length }].filter((range) => range.end > range.start), interpreted: true };
  }
  // Remaining race-state requirements constrain *whether* a skill fires, not its
  // location. Recognizing them does not supply a success probability.
  return { ranges: full, interpreted: !windowVariables.has(variable) };
}
function joinConditions(group: Groups[number]): string | null {
  const terms = [group.precondition, group.condition].filter((value): value is string => Boolean(value));
  return terms.length ? terms.map((value) => `(${value})`).join('&') : null;
}
function numberedRanges(value: unknown, numberKey?: string): (Range & { number?: number })[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    return row && typeof row.start === 'number' && typeof row.end === 'number' && row.end > row.start
      ? [{ start: row.start, end: row.end, ...(numberKey && typeof row[numberKey] === 'number' ? { number: row[numberKey] as number } : {}) }] : [];
  });
}
function compare(left: number | undefined, comparator: string, right: number): boolean {
  return left !== undefined && (comparator === '==' ? left === right : comparator === '!=' ? left !== right : comparator === '>=' ? left >= right : comparator === '<=' ? left <= right : comparator === '>' ? left > right : left < right);
}
function intersectRanges(left: Range[], right: Range[]): Range[] {
  return mergeRanges(left.flatMap((a) => right.map((b) => ({ start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) })).filter((range) => range.start < range.end)));
}
function mergeRanges(input: Range[]): Range[] {
  const result: Range[] = [];
  for (const range of [...input].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push({ start: range.start, end: range.end });
  }
  return result;
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
