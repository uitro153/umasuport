import { describe, expect, it } from 'vitest';
import { classifyLateRecommendation } from '../../src/engine/p5-late-release';

describe('late-release classification protocol (synthetic policy inputs, no invented game data)', () => {
  const base = { available: true, selectedInBase: false, hasAlternative: false, meaningfulIncrement: false,
    rework: { status: 'unverified' as const, evidence: null } };
  it('keeps a selected late card in the base recommendation', () => {
    expect(classifyLateRecommendation({ ...base, selectedInBase: true })).toBe('base-included');
  });
  it('keeps an ordinary replacement when incremental value or rework evidence is missing', () => {
    expect(classifyLateRecommendation({ ...base, hasAlternative: true, meaningfulIncrement: true })).toBe('ordinary-alternative');
    expect(classifyLateRecommendation({ ...base, hasAlternative: true,
      rework: { status: 'documented-high', evidence: 'Protocol test evidence only' } })).toBe('ordinary-alternative');
  });
  it('requires both actual incremental benefit and documented high rework burden for a separate plan', () => {
    expect(classifyLateRecommendation({ ...base, meaningfulIncrement: true,
      rework: { status: 'documented-high', evidence: 'Protocol test evidence only' } })).toBe('separate');
    expect(classifyLateRecommendation({ ...base, meaningfulIncrement: true,
      rework: { status: 'documented-high', evidence: ' ' } })).toBe('review-held');
  });
  it('does not revive a card excluded by release order', () => {
    expect(classifyLateRecommendation({ ...base, available: false, meaningfulIncrement: true,
      rework: { status: 'documented-high', evidence: 'Protocol test evidence only' } })).toBe('not-eligible');
  });
  it('does not create a separate recommendation from proximity or an unclassified queue entry', () => {
    expect(classifyLateRecommendation(base)).toBe('review-held');
  });
});
