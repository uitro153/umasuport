import { describe, expect, it } from 'vitest';
import { resolveGameAsset, resolveGameAssetFromIndex, type CompactGameAssetIndex } from '../../src/data/game-assets';
import { pngInfo } from '../../scripts/assets/image-files';

const fixture: CompactGameAssetIndex = { contract: 'uma-presentation-assets', schemaVersion: 1, usageScope: 'local-reference', rightsStatus: 'pending', publicRedistribution: 'not-verified', entries: {
  'costume:100101': { thumbnail: ['game-assets/costumes/100101.png', 128, 128, 'original:100101', 'https://example.com/100101.png'], art: null },
  'support:100101': { thumbnail: ['game-assets/supports/icons/100101.png', 128, 128, 'support:100101', 'https://example.com/support-100101.png'], art: null },
} };
describe('exact canonical image identity and local/public rights separation', () => {
  it('keeps costume and support namespaces separate even for an equal numeric ID', () => {
    expect(resolveGameAssetFromIndex(fixture, 'costume', '100101', 'thumbnail', '/', true)?.src).toBe('/game-assets/costumes/100101.png');
    expect(resolveGameAssetFromIndex(fixture, 'support', '100101', 'thumbnail', '/', true)?.src).toBe('/game-assets/supports/icons/100101.png');
  });
  it('uses the hosting base path without turning a sibling deployment into root URLs', () => {
    expect(resolveGameAssetFromIndex(fixture, 'costume', '100101', 'thumbnail', '/uma/tool/', true)?.src).toBe('/uma/tool/game-assets/costumes/100101.png');
  });
  it('never substitutes an unknown or similar costume/card ID and never invents art', () => {
    expect(resolveGameAssetFromIndex(fixture, 'costume', '100102', 'thumbnail', '/', true)).toBeNull();
    expect(resolveGameAssetFromIndex(fixture, 'costume', '0100101', 'thumbnail', '/', true)).toBeNull();
    expect(resolveGameAssetFromIndex(fixture, 'costume', '../100101', 'thumbnail', '/', true)).toBeNull();
    expect(resolveGameAssetFromIndex(fixture, 'costume', '100101', 'art', '/', true)).toBeNull();
  });
  it('retains pending rights for an authorized local preview and blocks explicit restrictions', () => {
    expect(resolveGameAssetFromIndex(fixture, 'costume', '100101', 'thumbnail', '/', true)).toMatchObject({ rightsStatus: 'pending', publicRedistribution: 'not-verified', usageScope: 'local-reference' });
    expect(resolveGameAssetFromIndex({ ...fixture, rightsStatus: 'restricted' }, 'costume', '100101', 'thumbnail', '/', true)).toBeNull();
    expect(resolveGameAssetFromIndex({ ...fixture, publicRedistribution: 'restricted' }, 'costume', '100101', 'thumbnail', '/', true)).toBeNull();
  });
  it('does not expose unapproved local images to the normal production resolver', () => {
    expect(resolveGameAssetFromIndex(fixture, 'costume', '100101')).toBeNull();
    expect(resolveGameAssetFromIndex({ ...fixture, rightsStatus: 'approved', publicRedistribution: 'approved' }, 'costume', '100101')?.src).toBe('/game-assets/costumes/100101.png');
  });
  it('rejects wrong-identity or external paths in an otherwise matching index row', () => {
    for (const path of ['game-assets/costumes/100102.png', 'https://example.com/100101.png', '../100101.png']) {
      const broken = structuredClone(fixture); const original = broken.entries['costume:100101']!.thumbnail!;
      broken.entries['costume:100101']!.thumbnail = [path, original[1], original[2], original[3], original[4]];
      expect(resolveGameAssetFromIndex(broken, 'costume', '100101', 'thumbnail', '/', true)).toBeNull();
    }
  });
  it('resolves actual imported multi-outfit and support rarity examples to distinct files', () => {
    const a = resolveGameAsset('costume', '102401'); const b = resolveGameAsset('costume', '102402');
    expect(a?.canonicalId).toBe('102401'); expect(b?.canonicalId).toBe('102402'); expect(a?.src).not.toBe(b?.src);
    const cards = ['10001', '20043', '30001', '30025'].map((id) => resolveGameAsset('support', id, 'art'));
    expect(cards.every((row) => row?.width === 300 && row?.height === 400)).toBe(true);
    expect(new Set(cards.map((row) => row?.src)).size).toBe(4);
  });
  it('does not trust extensions when PNG headers are broken', () => {
    expect(() => pngInfo(Buffer.from('not an image'))).toThrow('Invalid PNG');
  });
});
