/** A separate evidence layer. Reference captures never become qualitative policy points. */
export interface QuantitativeContext {
  contextId: string;
  server: string;
  courseId: string;
  style: string;
  rankEligible?: boolean;
  reviewStatus?: string;
  sourceUrl?: string;
  sourceSha256?: string;
  patchVersion?: string | null;
  simulatorVersion?: string | null;
  runMethod?: string | null;
  sampleCount?: number | null;
  denominator?: string | null;
  expectedMarginDefinition?: string | null;
  conditions: {
    season?: number | null; weather?: number | null; groundCondition?: number | null;
    stats?: unknown; aptitudes?: unknown; motivation?: unknown;
    runnerCount?: number | null; opponentDistribution?: unknown;
  };
}
export interface QuantitativeRecord {
  evidenceId: string;
  contextId: string;
  skillId: string;
  rankEligible?: boolean;
  reviewStatus?: string;
  reportedExpectedMargin?: number | null;
  reportedActivationRate?: number | null;
  effectiveRate?: number | null;
  activationDefinition?: string | null;
  effectiveRateDefinition?: string | null;
  effectiveRateDenominator?: string | null;
  /** Must be reviewed explicitly; a source rate is never multiplied automatically. */
  expectedMarginIncludesActivation?: boolean;
  listedPrerequisiteCost?: number | null;
  costBasis?: string | null;
  hintLevels?: unknown;
}
export interface QuantitativeTargetContext {
  skillId: string;
  server: 'KR' | 'JP'; courseId: string; style: string;
  patchVersion: string; simulatorVersion: string; runMethod: string;
  sampleCount: number; denominator: string; expectedMarginDefinition: string;
  conditions: {
    season: number; weather: number; groundCondition: number;
    stats: unknown; aptitudes: unknown; motivation: unknown; runnerCount: number; opponentDistribution: unknown;
  };
  costBasis: string; hintLevels: unknown;
}
export type QuantitativeEvidenceDecision = { eligible: false; reasons: string[] } | {
  eligible: true;
  layer: 'validated-quantitative';
  evidenceId: string;
  expectedMargin: number;
  marginPerPoint: number;
  marginPer100Points: number;
  /** Source activation and effective rate remain separate descriptive metrics. */
  reportedActivationRate: number | null;
  effectiveRate: number | null;
  rateApplication: 'already-in-expected-margin-no-remultiplication';
};

/**
 * Explicit review AND a complete exact context match are required. This function
 * is intentionally not called by today's qualitative recommendation objective.
 */
export function getEligibleQuantitativeEvidence(
  record: QuantitativeRecord, context: QuantitativeContext | undefined,
  target: QuantitativeTargetContext, explicitlyApproved = false,
): QuantitativeEvidenceDecision {
  const reasons: string[] = [];
  if (!explicitlyApproved || record.rankEligible !== true || context?.rankEligible !== true
    || record.reviewStatus !== 'verified' || context.reviewStatus !== 'verified') reasons.push('explicit-review-required');
  if (!context || record.contextId !== context.contextId) return { eligible: false, reasons: [...reasons, 'context-identity-mismatch'] };
  if (!nonempty(record.skillId) || record.skillId !== target.skillId) reasons.push('skill-identity-mismatch');
  if (!httpUrl(context.sourceUrl) || !/^[a-f0-9]{64}$/i.test(context.sourceSha256 ?? '')) reasons.push('source-provenance-missing');
  const sourceContext = {
    server: context.server, courseId: context.courseId, style: context.style,
    patchVersion: context.patchVersion, simulatorVersion: context.simulatorVersion, runMethod: context.runMethod,
    sampleCount: context.sampleCount, denominator: context.denominator, expectedMarginDefinition: context.expectedMarginDefinition,
    conditions: context.conditions, costBasis: record.costBasis, hintLevels: record.hintLevels,
  };
  const required = ['server', 'courseId', 'style', 'patchVersion', 'simulatorVersion', 'runMethod', 'sampleCount', 'denominator', 'expectedMarginDefinition', 'costBasis', 'hintLevels'] as const;
  for (const key of required) {
    if (!complete(sourceContext[key]) || !complete(target[key])) reasons.push(`missing-${key}`);
    else if (!equal(sourceContext[key], target[key])) reasons.push(`mismatch-${key}`);
  }
  const conditions = ['season', 'weather', 'groundCondition', 'stats', 'aptitudes', 'motivation', 'runnerCount', 'opponentDistribution'] as const;
  for (const key of conditions) {
    if (!complete(context.conditions[key]) || !complete(target.conditions[key])) reasons.push(`missing-${key}`);
    else if (!equal(context.conditions[key], target.conditions[key])) reasons.push(`mismatch-${key}`);
  }
  if (!positive(context.sampleCount) || !positive(context.conditions.runnerCount)) reasons.push('invalid-sample-or-field-size');
  if (record.expectedMarginIncludesActivation !== true) reasons.push('expected-margin-definition-unreviewed');
  if (!finite(record.reportedExpectedMargin) || !positive(record.listedPrerequisiteCost)) reasons.push('margin-or-prerequisite-cost-missing');
  if (record.reportedActivationRate !== null && record.reportedActivationRate !== undefined
    && (!finite(record.reportedActivationRate) || !nonempty(record.activationDefinition))) reasons.push('activation-metric-unreviewed');
  // r[4] alone is never evidence of useful-window overlap. An effective rate must
  // supply both its separate window criterion and its own denominator.
  if (record.effectiveRate !== null && record.effectiveRate !== undefined
    && (!finite(record.effectiveRate) || !nonempty(record.effectiveRateDefinition) || !nonempty(record.effectiveRateDenominator))) reasons.push('effective-rate-definition-missing');
  if (reasons.length) return { eligible: false, reasons: [...new Set(reasons)] };
  const margin = record.reportedExpectedMargin!; const cost = record.listedPrerequisiteCost!;
  return {
    eligible: true, layer: 'validated-quantitative', evidenceId: record.evidenceId,
    expectedMargin: margin, marginPerPoint: margin / cost, marginPer100Points: 100 * margin / cost,
    reportedActivationRate: record.reportedActivationRate ?? null, effectiveRate: record.effectiveRate ?? null,
    rateApplication: 'already-in-expected-margin-no-remultiplication',
  };
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function httpUrl(value: unknown): boolean {
  if (!nonempty(value)) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function positive(value: unknown): value is number { return finite(value) && value > 0; }
function complete(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return nonempty(value);
  if (Array.isArray(value)) return value.length > 0 && value.every(complete);
  if (typeof value === 'object') return Object.keys(value).length > 0 && Object.values(value).every(complete);
  return typeof value === 'boolean';
}
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => equal(value, right[index]));
  const leftObject = left as Record<string, unknown>; const rightObject = right as Record<string, unknown>;
  const keys = Object.keys(leftObject).sort();
  return keys.length === Object.keys(rightObject).length && keys.every((key) => Object.hasOwn(rightObject, key) && equal(leftObject[key], rightObject[key]));
}
