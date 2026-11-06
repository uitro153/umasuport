/** P8.5 presentation assets are separate from game and saved-plan contracts. */
export type GameAssetKind = 'costume' | 'support';
export type GameAssetVariant = 'thumbnail' | 'art';
export type GameAssetRightsStatus = 'pending' | 'approved' | 'restricted';
export interface GameAssetFile {
  path: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: 'image/png';
  sha256: string;
  sourceUrl: string;
  sourceAssetId: string;
  sourceId: 'user-provided-uma-tools' | 'gametora-media';
}
export interface GameAssetEntry {
  kind: GameAssetKind;
  canonicalId: string;
  mappingStatus: 'mapped' | 'missing' | 'invalid';
  rightsStatus: GameAssetRightsStatus;
  usageScope: 'local-reference';
  publicRedistribution: 'not-verified' | 'approved' | 'restricted';
  thumbnail: GameAssetFile | null;
  art: GameAssetFile | null;
  errors: string[];
}
export interface GameAssetManifest {
  contract: 'uma-presentation-assets';
  schemaVersion: 1;
  checkedOn: string;
  sources: { id: string; url: string; rightsStatus: GameAssetRightsStatus; note: string }[];
  entries: GameAssetEntry[];
}
export interface ResolvedGameAsset {
  src: string;
  canonicalId: string;
  sourceAssetId: string;
  mappingStatus: 'mapped';
  rightsStatus: GameAssetRightsStatus;
  publicRedistribution: 'not-verified' | 'approved';
  usageScope: 'local-reference';
  width: number;
  height: number;
  mimeType: 'image/png';
  sourceUrl: string;
  variant: GameAssetVariant;
}
