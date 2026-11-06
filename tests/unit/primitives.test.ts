import { describe, expect, it } from 'vitest';
import { assetSchema, dateOnlySchema, idSchema } from '../../src/domain';

const lineEndings = ['\n', '\r', '\r\n', '\u2028', '\u2029'];

describe('strict string boundaries', () => {
  it.each(lineEndings)('rejects a calendar date with a trailing line ending %j', (ending) => {
    expect(dateOnlySchema.safeParse(`2026-11-04${ending}`).success).toBe(false);
  });

  it.each(lineEndings)('rejects an ID with a trailing line ending %j', (ending) => {
    expect(idSchema.safeParse(`character_demo_a${ending}`).success).toBe(false);
  });

  it.each(lineEndings)('rejects an asset path with a trailing line ending %j', (ending) => {
    expect(assetSchema.safeParse({
      assetKey: 'asset_demo_a',
      entityType: 'character',
      entityId: 'character_demo_a',
      path: `/images/fallback/demo.svg${ending}`,
      usageStatus: 'fallback',
      sourceIds: ['source_fixture'],
    }).success).toBe(false);
  });

  it('accepts unchanged valid dates, IDs and local asset paths', () => {
    expect(dateOnlySchema.parse('2026-11-04')).toBe('2026-11-04');
    expect(idSchema.parse('character_demo_a')).toBe('character_demo_a');
    expect(assetSchema.parse({
      assetKey: 'asset_demo_a',
      entityType: 'character',
      entityId: 'character_demo_a',
      path: '/images/fallback/demo.svg',
      usageStatus: 'fallback',
      sourceIds: ['source_fixture'],
    }).path).toBe('/images/fallback/demo.svg');
  });
});
