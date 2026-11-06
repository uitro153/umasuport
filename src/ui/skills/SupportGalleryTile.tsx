import GameAssetImage from '../assets/GameAssetImage';
import SupportTypeIcon from './SupportTypeIcon';
import { supportTypeLabel, type SupportFilterRecord } from './support-filters';

export default function SupportGalleryTile({ support, selected, disabled, status, onSelect, onDetails, testId, actionLabel = '선택' }: {
  support: SupportFilterRecord;
  selected?: boolean;
  disabled?: boolean;
  status?: string;
  onSelect: () => void;
  onDetails: () => void;
  testId: string;
  actionLabel?: string;
}) {
  const name = support.displayName ?? support.nameKo ?? support.nameJa ?? '서포트 카드';
  return <>
    <button type="button" className={`p86-support-icon-choice p86-card-rarity-${support.rarity.toLowerCase()}`} data-testid={testId} aria-label={`${name} · ${supportTypeLabel(support.type)} · ${support.rarity} ${actionLabel}`} aria-pressed={!!selected} disabled={disabled} onClick={onSelect} title={`${name} · ${supportTypeLabel(support.type)} · ${support.rarity}`}>
      <GameAssetImage kind="support" id={support.supportId} label={name} />
      <span className="p86-support-fallback-name">{name}</span>
      <SupportTypeIcon type={support.type} />
      <span className="visually-hidden">{name}</span>
      {selected && <span className="p86-support-selected" aria-label="선택됨">✓</span>}
      {status && <span className="p86-support-status">{status}</span>}
    </button>
    <div className="p86-support-cell-footer"><span className={`p86-gallery-rarity p85-rarity-${support.rarity.toLowerCase()}`} data-support-rarity={support.rarity}>{support.rarity}</span><button type="button" className="p86-support-info" aria-label={`${name} 상세 보기`} onClick={onDetails}>상세</button></div>
  </>;
}
