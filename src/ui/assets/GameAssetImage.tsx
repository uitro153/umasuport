import { useState } from 'react';
import { resolveGameAsset } from '../../data/game-assets';
import './game-assets.css';

interface Props {
  kind: 'costume' | 'support';
  id: string | null | undefined;
  label: string;
  variant?: 'thumbnail' | 'art';
  className?: string;
  loading?: 'lazy' | 'eager';
}

/** Canonical ID only. A missing or failed image never borrows another outfit. */
export default function GameAssetImage({ kind, id, label, variant = 'thumbnail', className = '', loading = 'lazy' }: Props) {
  const asset = id ? resolveGameAsset(kind, id, variant) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const available = asset && failedSrc !== asset.src;
  const alt = `${label} · ${kind === 'costume' ? '의상' : '서포트 카드'} 이미지`;
  return <span className={`game-asset game-asset-${kind} ${className}`} data-testid={`game-asset-${kind}-${id ?? 'empty'}`} data-asset-kind={kind} data-asset-id={id ?? ''} data-canonical-id={id ?? ''} data-asset-status={available ? 'ready' : id ? 'missing' : 'empty'}>
    {available ? <img key={`${kind}:${id}:${asset.src}`} src={asset.src} alt={alt} loading={loading} decoding="async"
      data-asset-kind={kind} data-asset-id={id ?? ''} data-source-asset-id={asset.sourceAssetId} onError={() => setFailedSrc(asset.src)} />
      : <span className="game-asset-fallback" role="img" aria-label={id ? `${alt} · 이미지 없음` : '선택된 이미지 없음'}><span aria-hidden="true">{id ? '이미지 없음' : '+'}</span></span>}
  </span>;
}
