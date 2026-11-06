import assetIndex from '../../data/assets/p85-index.json';
import type { GameAssetKind, GameAssetVariant, GameAssetRightsStatus, ResolvedGameAsset } from '../domain/game-assets';

type FileDescriptor = readonly [path: string, width: number, height: number, sourceAssetId: string, sourceUrl: string];
export interface CompactGameAssetIndex {
  contract: string;
  schemaVersion: number;
  usageScope: string;
  rightsStatus: GameAssetRightsStatus;
  publicRedistribution: 'not-verified' | 'approved' | 'restricted';
  entries: Record<string, { thumbnail: FileDescriptor | null; art: FileDescriptor | null }>;
}

/** Exact namespace+ID lookup. Pending redistribution does not block the user's
 * requested local reference preview; it remains a separate public-release gate.
 * Missing, restricted, unsafe or other-ID assets never become substitutes. */
export function resolveGameAssetFromIndex(index: CompactGameAssetIndex, kind: GameAssetKind, canonicalId: string, variant: GameAssetVariant = 'thumbnail', baseUrl = '/', allowPendingLocal = false): ResolvedGameAsset | null {
  if (index.contract !== 'uma-presentation-assets' || index.schemaVersion !== 1 || index.usageScope !== 'local-reference'
    || index.rightsStatus === 'restricted' || index.publicRedistribution === 'restricted' || !/^\d+$/.test(canonicalId)) return null;
  if (!allowPendingLocal && (index.rightsStatus !== 'approved' || index.publicRedistribution !== 'approved')) return null;
  const row = index.entries[`${kind}:${canonicalId}`];
  const file = row?.[variant];
  if (!file) return null;
  const [path, width, height, sourceAssetId, sourceUrl] = file;
  const directory = kind === 'costume' ? 'costumes' : variant === 'art' ? 'supports/art' : 'supports/icons';
  if (path !== `game-assets/${directory}/${canonicalId}.png` || width < 1 || height < 1) return null;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return { src: `${base}${path}`, canonicalId, sourceAssetId, mappingStatus: 'mapped', rightsStatus: index.rightsStatus,
    publicRedistribution: index.publicRedistribution, usageScope: 'local-reference', width, height, mimeType: 'image/png', sourceUrl, variant };
}

export function resolveGameAsset(kind: GameAssetKind, canonicalId: string, variant: GameAssetVariant = 'thumbnail'): ResolvedGameAsset | null {
  const allowPendingLocal = import.meta.env.DEV || import.meta.env.VITE_PRIVATE_ASSET_VALIDATION === '1';
  return resolveGameAssetFromIndex(assetIndex as unknown as CompactGameAssetIndex, kind, canonicalId, variant, import.meta.env.BASE_URL, allowPendingLocal);
}
