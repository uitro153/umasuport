import { useEffect, useRef, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { ReferenceCostume } from '../../domain/reference';
import type { ReferenceAvailability } from '../../engine/reference-availability';
import GameAssetImage from '../assets/GameAssetImage';
import { releaseLabel, translationLabel } from './reference-labels';
import './costume-gallery.css';

export interface CostumeGalleryEntry {
  costume: DeepReadonly<ReferenceCostume>;
  availability: ReferenceAvailability;
  contribution?: number | null;
  selectionIssue?: string;
}

/** The gallery is presentation only; candidates retain the caller's ordering
 * and availability decision. No names are used to resolve game images. */
export default function CostumeGallery({ entries, prefix, onSelect, onReset, selectedId }: {
  entries: CostumeGalleryEntry[];
  prefix: 'ref' | 'lineage';
  onSelect: (id: string | null) => void;
  onReset: () => void;
  selectedId?: string | null;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailPanel = useRef<HTMLElement>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const detail = entries.find((entry) => entry.costume.costumeId === detailId);
  useEffect(() => { if (detailId) { detailPanel.current?.scrollIntoView({ block: 'start' }); detailPanel.current?.focus({ preventScroll: true }); } }, [detailId]);
  function closeDetails() { setDetailId(null); detailTrigger.current?.focus(); }
  return <div className="p86-costume-scroll">
    {detail && <section ref={detailPanel} tabIndex={-1} className="p86-costume-detail" aria-label="선택 후보 상세" data-testid="p86-costume-detail">
      <GameAssetImage kind="costume" id={detail.costume.costumeId} label={detail.costume.displayName} loading="eager" />
      <div><h3>{detail.costume.nameKo ?? detail.costume.nameJa}</h3><p>{detail.costume.outfitKo ?? detail.costume.outfitJa}</p>
        <p>{translationLabel(detail.costume)}</p><p>{releaseLabel(detail.availability)}</p>
      </div><button type="button" className="btn" onClick={closeDetails}>상세 닫기</button>
    </section>}
    <ul className="candidate-list p86-costume-grid" aria-label="의상 갤러리" data-testid="p86-costume-gallery">
      <li className="p86-costume-cell p86-costume-clear"><button type="button" className="p86-costume-choice" onClick={() => onSelect(null)} aria-label="선택한 육성마 해제"><span className="p86-clear-picture" aria-hidden="true">×</span><strong>선택 해제</strong><small>빈 슬롯으로</small></button></li>
      {entries.map(({ costume, availability, contribution, selectionIssue }) => <li key={costume.costumeId} className="p86-costume-cell" data-costume-id={costume.costumeId}>
        <button type="button" className="candidate-button p86-costume-choice" aria-pressed={costume.costumeId === selectedId} disabled={!!selectionIssue} title={selectionIssue} data-testid={`${prefix}-candidate-${costume.costumeId}`} onClick={() => onSelect(costume.costumeId)} aria-label={`${costume.nameKo ?? costume.nameJa} · ${costume.outfitKo ?? costume.outfitJa} 선택`}>
          <GameAssetImage kind="costume" id={costume.costumeId} label={costume.displayName} />
          <span className="candidate-text"><strong>{costume.nameKo ?? costume.nameJa}</strong><small>{costume.outfitKo ?? costume.outfitJa}</small></span>
          {availability.state === 'unknown' && <span className="p86-costume-availability">출시 미확인</span>}
          {selectionIssue ? <small className="p871-invalid-choice">{selectionIssue}</small> : contribution !== undefined && <span className="candidate-score">{contribution === null ? '상성 —' : `상성 +${contribution}`}</span>}
        </button>
        <button type="button" className="p86-costume-info" aria-label={`${costume.displayName} 상세 보기`} aria-expanded={detailId === costume.costumeId} onClick={(event) => { detailTrigger.current = event.currentTarget; setDetailId(detailId === costume.costumeId ? null : costume.costumeId); }} data-testid={`costume-detail-${costume.costumeId}`}>ⓘ</button>
      </li>)}
    </ul>
    {entries.length === 0 && <div className="empty-candidates"><p>조건에 맞는 의상이 없습니다. 검색어와 한국 출시 기준을 확인하세요.</p><button type="button" className="btn" onClick={onReset}>검색 초기화</button></div>}
  </div>;
}
