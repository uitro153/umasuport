import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getEligibleQuantitativeEvidence, type QuantitativeContext, type QuantitativeRecord, type QuantitativeTargetContext } from '../../src/engine/quantitative-evidence';

// A deliberately synthetic review protocol, not a claim of measured game data.
const target: QuantitativeTargetContext = {
  skillId: '200012', server: 'KR', courseId: '10906', style: 'pace',
  patchVersion: 'synthetic-patch', simulatorVersion: 'synthetic-version', runMethod: 'synthetic-independent-seeded-samples',
  sampleCount: 100, denominator: 'all-synthetic-runs', expectedMarginDefinition: 'paired-total-margin-over-all-runs',
  conditions: { season: 2, weather: 2, groundCondition: 2,
    stats: { speed: 1000, stamina: 1000 }, aptitudes: { surface: 'A', distance: 'A', style: 'A' }, motivation: 0,
    runnerCount: 9, opponentDistribution: { fixtureId: 'synthetic-opponent-profile' } },
  costBasis: 'source-listed-prerequisites-no-hint-discount', hintLevels: { all: 0 },
};
const context: QuantitativeContext = {
  contextId: 'synthetic-reviewed-context', server: target.server, courseId: target.courseId, style: target.style,
  patchVersion: target.patchVersion, simulatorVersion: target.simulatorVersion, runMethod: target.runMethod,
  sampleCount: target.sampleCount, denominator: target.denominator, expectedMarginDefinition: target.expectedMarginDefinition,
  conditions: structuredClone(target.conditions), rankEligible: true, reviewStatus: 'verified',
  sourceUrl: 'https://example.invalid/synthetic-evidence-protocol-test', sourceSha256: 'a'.repeat(64),
};
const record: QuantitativeRecord = {
  evidenceId: 'synthetic-evidence', contextId: context.contextId, skillId: target.skillId,
  rankEligible: true, reviewStatus: 'verified', reportedExpectedMargin: 2.4,
  reportedActivationRate: 80, activationDefinition: 'activation-count / all-runs in percent',
  effectiveRate: 50, effectiveRateDefinition: 'activation intersects independently-defined useful window', effectiveRateDenominator: 'all-runs in percent',
  expectedMarginIncludesActivation: true, listedPrerequisiteCost: 100,
  costBasis: target.costBasis, hintLevels: target.hintLevels,
};
const captured = JSON.parse(readFileSync('data/normalized/quantitative/utools-10906-2026-11-05.json', 'utf8')) as {
  contexts: QuantitativeContext[]; records: QuantitativeRecord[];
};

describe('P4.1 separate and exact-context quantitative evidence gate', () => {
  it('keeps all 1,993 actual U-tools captures ineligible for current Korean ranking', () => {
    expect(captured.records).toHaveLength(1993);
    const contexts = new Map(captured.contexts.map((row) => [row.contextId, row]));
    expect(captured.records.filter((row) => getEligibleQuantitativeEvidence(row, contexts.get(row.contextId), { ...target, skillId: row.skillId }, true).eligible)).toHaveLength(0);
    expect(captured.records.every((row) => row.rankEligible === false)).toBe(true);
    expect(captured.contexts.every((row) => row.server === 'JP' && row.rankEligible === false)).toBe(true);
  });
  it('requires explicit approval independently of complete synthetic context data', () => {
    expect(getEligibleQuantitativeEvidence(record, context, target)).toMatchObject({ eligible: false, reasons: ['explicit-review-required'] });
    expect(getEligibleQuantitativeEvidence(record, context, target, true).eligible).toBe(true);
  });
  it.each(['server', 'courseId', 'style', 'patchVersion', 'simulatorVersion', 'runMethod', 'sampleCount', 'denominator', 'expectedMarginDefinition'] as const)('rejects a different %s despite a verified label', (key) => {
    const changed = { ...context, [key]: key === 'sampleCount' ? 101 : 'different-context' };
    expect(getEligibleQuantitativeEvidence(record, changed, target, true)).toMatchObject({ eligible: false, reasons: expect.arrayContaining([`mismatch-${key}`]) });
  });
  it.each(['season', 'weather', 'groundCondition', 'stats', 'aptitudes', 'motivation', 'runnerCount', 'opponentDistribution'] as const)('requires exact and complete %s', (key) => {
    const missing = { ...context, conditions: { ...context.conditions, [key]: null } };
    expect(getEligibleQuantitativeEvidence(record, missing, target, true)).toMatchObject({ eligible: false, reasons: expect.arrayContaining([`missing-${key}`]) });
    const changed = { ...context, conditions: { ...context.conditions, [key]: typeof context.conditions[key] === 'number' ? 42 : { changed: true } } };
    expect(getEligibleQuantitativeEvidence(record, changed, target, true)).toMatchObject({ eligible: false, reasons: expect.arrayContaining([`mismatch-${key}`]) });
  });
  it('keeps canonical skill identity, source provenance, cost basis and hint levels exact', () => {
    expect(getEligibleQuantitativeEvidence({ ...record, skillId: '200022' }, context, target, true)).toMatchObject({ eligible: false, reasons: ['skill-identity-mismatch'] });
    expect(getEligibleQuantitativeEvidence(record, { ...context, sourceSha256: 'not-a-hash' }, target, true).eligible).toBe(false);
    expect(getEligibleQuantitativeEvidence(record, { ...context, sourceUrl: 'file:///private/example' }, target, true).eligible).toBe(false);
    expect(getEligibleQuantitativeEvidence({ ...record, costBasis: 'hint-discounted' }, context, target, true)).toMatchObject({ eligible: false, reasons: ['mismatch-costBasis'] });
    expect(getEligibleQuantitativeEvidence({ ...record, hintLevels: { all: 1 } }, context, target, true)).toMatchObject({ eligible: false, reasons: ['mismatch-hintLevels'] });
  });
  it('does not equate activation with effectiveness or multiply an expected margin by either rate again', () => {
    expect(getEligibleQuantitativeEvidence(record, context, target, true)).toMatchObject({
      eligible: true, layer: 'validated-quantitative', expectedMargin: 2.4, marginPerPoint: 0.024, marginPer100Points: 2.4,
      reportedActivationRate: 80, effectiveRate: 50, rateApplication: 'already-in-expected-margin-no-remultiplication',
    });
    expect(getEligibleQuantitativeEvidence({ ...record, effectiveRateDefinition: null }, context, target, true)).toMatchObject({ eligible: false, reasons: ['effective-rate-definition-missing'] });
    expect(getEligibleQuantitativeEvidence({ ...record, effectiveRate: null, effectiveRateDefinition: null }, context, target, true)).toMatchObject({ eligible: true, effectiveRate: null });
    expect(getEligibleQuantitativeEvidence({ ...record, expectedMarginIncludesActivation: false }, context, target, true).eligible).toBe(false);
  });
});
