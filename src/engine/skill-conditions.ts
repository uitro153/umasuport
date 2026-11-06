export type ConditionMatch = 'applicable' | 'conditional' | 'unverified' | 'inapplicable';
export interface SkillCourseContext {
  courseId: string; distanceM: number; surface: 'turf' | 'dirt' | null;
  trackId?: string | null; rotation?: 1 | 2 | null; season?: number | null;
  weather?: number | null; groundCondition?: number | null; grade?: number | null;
}
export type RunningStyle = 'front' | 'pace' | 'late' | 'end';
export interface ConditionResult { state: ConditionMatch; unknownVariables: string[]; dynamicVariables: string[] }
export type ConditionExpression =
  | { kind: 'constant'; value: true }
  | { kind: 'and'; children: ConditionExpression[] }
  | { kind: 'or'; children: ConditionExpression[] }
  | { kind: 'atom'; variable: string; comparator: string; value: number; expression: string }
  | { kind: 'unknown'; expression: string };
const styleValues: Record<RunningStyle, number> = { front: 1, pace: 2, late: 3, end: 4 };

// These are recognized as race-state requirements only. No activation probability is inferred.
const dynamicVariables = new Set([
  'phase', 'phase_random', 'phase_firsthalf_random', 'phase_laterhalf_random', 'phase_firstquarter_random',
  'phase_firsthalf', 'phase_laterhalf', 'phase_firstquarter', 'phase_corner_random', 'phase_straight_random',
  'distance_rate', 'remain_distance', 'corner', 'corner_random', 'all_corner_random', 'straight_random',
  'is_finalcorner', 'is_finalcorner_random', 'is_finalcorner_laterhalf', 'is_last_straight', 'is_last_straight_onetime',
  'is_lastspurt', 'lastspurt', 'slope', 'up_slope_random', 'down_slope_random', 'order', 'order_rate',
  'is_overtake', 'change_order_onetime', 'accumulatetime', 'blocked_side_continuetime', 'blocked_front_continuetime',
  'distance_diff_top', 'distance_diff_rate', 'distance_diff_top_float', 'bashin_diff_behind', 'bashin_diff_infront',
  'overtake_target_time', 'overtake_target_no_order_up_time', 'infront_near_lane_time', 'behind_near_lane_time',
  'temptation_count', 'popularity', 'near_count', 'is_move_lane', 'change_order_up_end_after', 'is_badstart',
  'is_behind_in', 'compete_fight_count', 'hp_per', 'activate_count_all', 'activate_count_middle', 'activate_count_start',
  'activate_count_heal', 'activate_count_later_half', 'is_activate_any_skill', 'is_activate_heal_skill', 'is_activate_other_skill_detail',
  'is_other_character_activate_advantage_skill', 'is_used_skill_id', 'post_number', 'lane_type', 'is_surrounded',
  'same_skill_horse_count', 'running_style_equal_popularity_one', 'running_style_count', 'base_speed', 'base_stamina',
  'base_power', 'base_guts', 'base_wiz', 'motivation', 'is_temptation', 'blocked_front', 'random_lot_shared',
]);

/** Small declarative parser: @/| are OR, & is AND; static mismatch cannot be erased by unknown terms. */
export function evaluateSkillCondition(expression: string | null, course: SkillCourseContext, runningStyle: RunningStyle): ConditionResult {
  if (!expression?.trim()) return { state: 'applicable', unknownVariables: [], dynamicVariables: [] };
  const unknown = new Set<string>(); const dynamic = new Set<string>();
  const distanceType = course.distanceM <= 1400 ? 1 : course.distanceM <= 1800 ? 2 : course.distanceM <= 2400 ? 3 : 4;
  const staticValues: Record<string, number | null | undefined> = {
    always: 1, running_style: styleValues[runningStyle], course_distance: course.distanceM,
    distance_type: distanceType, ground_type: course.surface === null ? null : course.surface === 'turf' ? 1 : 2,
    rotation: course.rotation, season: course.season, weather: course.weather, ground_condition: course.groundCondition,
    track_id: course.trackId === null || course.trackId === undefined ? null : Number(course.trackId),
    is_basis_distance: course.distanceM % 400 === 0 ? 1 : 0, grade: course.grade,
  };
  function evaluate(node: ConditionExpression): ConditionMatch {
    if (node.kind === 'constant') return 'applicable';
    if (node.kind === 'and') return combineAnd(node.children.map(evaluate));
    if (node.kind === 'or') return combineOr(node.children.map(evaluate));
    if (node.kind === 'unknown') { unknown.add(node.expression || '(empty)'); return 'unverified'; }
    const { variable, comparator, value: right } = node;
    if (Object.hasOwn(staticValues, variable)) {
      const lhs = staticValues[variable];
      if (lhs === null || lhs === undefined || !Number.isFinite(lhs)) { unknown.add(variable); return 'unverified'; }
      const match = comparator === '==' ? lhs === right : comparator === '!=' ? lhs !== right : comparator === '>=' ? lhs >= right : comparator === '<=' ? lhs <= right : comparator === '>' ? lhs > right : lhs < right;
      return match ? 'applicable' : 'inapplicable';
    }
    if (dynamicVariables.has(variable)) { dynamic.add(variable); return 'conditional'; }
    unknown.add(variable); return 'unverified';
  }
  const state = evaluate(parseSkillConditionExpression(expression));
  return { state, unknownVariables: [...unknown], dynamicVariables: [...dynamic] };
}

/** Shared syntax only; neither parsing nor recognizing a variable proves its game effectiveness. */
export function parseSkillConditionExpression(expression: string | null): ConditionExpression {
  if (!expression?.trim()) return { kind: 'constant', value: true };
  let text = expression.trim();
  while (text.startsWith('(') && matchingOuterPair(text)) text = text.slice(1, -1).trim();
  for (const operators of [['@', '|'], ['&']]) {
    const pieces = splitTopLevel(text, operators);
    if (pieces.length > 1) return { kind: operators.includes('@') ? 'or' : 'and', children: pieces.map(parseSkillConditionExpression) };
  }
  const atom = /^([a-z_][a-z_0-9]*)(==|!=|>=|<=|>|<)(-?\d+(?:\.\d+)?)$/.exec(text.replace(/\s+/g, ''));
  return atom ? { kind: 'atom', variable: atom[1]!, comparator: atom[2]!, value: Number(atom[3]), expression: text }
    : { kind: 'unknown', expression: text };
}

export function combineAnd(states: readonly ConditionMatch[]): ConditionMatch {
  if (states.includes('inapplicable')) return 'inapplicable';
  if (states.includes('unverified')) return 'unverified';
  return states.includes('conditional') ? 'conditional' : 'applicable';
}
export function combineOr(states: readonly ConditionMatch[]): ConditionMatch {
  if (states.includes('applicable')) return 'applicable';
  if (states.includes('conditional')) return 'conditional';
  return states.includes('unverified') ? 'unverified' : 'inapplicable';
}
function splitTopLevel(text: string, operators: string[]): string[] {
  const result: string[] = []; let depth = 0; let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (depth === 0 && operators.includes(text[i]!)) {
      result.push(text.slice(start, i));
      if (text[i + 1] === text[i]) i++;
      start = i + 1;
    }
  }
  if (result.length) result.push(text.slice(start));
  return result.length ? result : [text];
}
function matchingOuterPair(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    if (depth === 0 && i < text.length - 1) return false;
    if (depth < 0) return false;
  }
  return depth === 0;
}
