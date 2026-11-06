import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import type { P5AvailabilityContext } from '../../engine/p5-availability';
import { getP3Availability } from '../../engine/support-acquisition';
import SupportListFilters from './SupportListFilters';
import { matchesSupportFilters, type SupportListFilters as Filters } from './support-filters';
import SupportGalleryTile from './SupportGalleryTile';
import SupportGalleryDetail from './SupportGalleryDetail';
import './p85-support.css';

export interface SupportPickerProps {
  snapshot: DeepReadonly<P3Snapshot>; cutoffDate: string; allowForecast: boolean; slot: number;
  selectedIds: string[]; currentId: string | null; onSelect: (id: string) => void; onClose: () => void; forecast?: P5AvailabilityContext;
}
export default function SupportPicker({ snapshot, cutoffDate, allowForecast, slot, selectedIds, currentId, onSelect, onClose, forecast }: SupportPickerProps) {
  const [filters, setFilters] = useState<Filters>({ query: '', type: 'all', rarity: 'all', release: 'available' });
  const [limit, setLimit] = useState(40);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement; const element = dialog.current;
    element?.showModal(); input.current?.focus();
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const candidates = useMemo(() => snapshot.supports.map((support) => ({ support, availability: getP3Availability(snapshot, 'support', support.supportId, cutoffDate, allowForecast, forecast) })).filter(({ support, availability }) => matchesSupportFilters(support, availability.state, filters)), [snapshot, cutoffDate, allowForecast, forecast, filters]);
  const detail = candidates.find(({ support }) => support.supportId === detailId);
  function updateFilters(next: Filters) { setFilters(next); setLimit(40); setDetailId(null); }
  function closeDetails() { setDetailId(null); detailTrigger.current?.focus(); }
  return <dialog ref={dialog} className="character-picker p85-support-picker p86-support-picker" aria-labelledby="support-picker-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="picker-header"><div><p className="eyebrow">본육성 편성</p><h2 id="support-picker-title">서포트 {slot + 1} 선택</h2></div><button className="btn" onClick={onClose}>닫기</button></div>
    <div className="picker-search"><label htmlFor="support-search">서포트 카드명 검색</label><input ref={input} id="support-search" type="search" value={filters.query} onChange={(event) => updateFilters({ ...filters, query: event.target.value })} autoComplete="off" /></div>
    <SupportListFilters idPrefix="support" filters={filters} onChange={updateFilters} onReset={() => updateFilters({ query: '', type: 'all', rarity: 'all', release: 'available' })} />
    <p className="support-picker-stats" data-testid="p85-support-result-count">현재 조건 · {candidates.length}장 · 이미지를 눌러 선택, 상세에서 카드명 확인</p>
    {filters.release !== 'available' && <p className="support-picker-unknown">{filters.release === 'unknown' ? '한국 출시 근거가 부족한 자료입니다. 미출시로 단정하지 않으며 가용 카드로 선택하지 않습니다.' : '기준일 이후 출시 자료입니다. 편성 선택에서 제외합니다.'}</p>}
    <div className="p86-support-gallery-scroll">
    {detail && <SupportGalleryDetail support={detail.support} availability={detail.availability} onSelect={() => onSelect(detail.support.supportId)} disabled={detail.availability.state !== 'available' || (selectedIds.includes(detail.support.supportId) && currentId !== detail.support.supportId)} onClose={closeDetails} />}
    <ul className="candidate-list support-picker-list p86-support-gallery" aria-label="서포트 카드 갤러리" data-testid="p86-support-gallery">{candidates.slice(0, limit).map(({ support, availability }) => {
      const duplicate = selectedIds.includes(support.supportId) && currentId !== support.supportId;
      return <li key={support.supportId} data-support-id={support.supportId}>
        <SupportGalleryTile support={support} selected={currentId === support.supportId} disabled={availability.state !== 'available' || duplicate} onSelect={() => onSelect(support.supportId)} testId={`support-candidate-${support.supportId}`} status={duplicate ? '편성 중' : availability.state === 'unknown' ? '출시 미확인' : availability.state === 'unavailable' ? '기준일 이후' : undefined} onDetails={() => { detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDetailId(support.supportId); }} />
      </li>;
    })}</ul>
    {candidates.length === 0 && <p className="empty-candidates" data-testid="p85-support-empty">이 조건의 카드가 없습니다. 검색어·훈련 타입·레어도·출시 상태를 확인하세요.</p>}
    {candidates.length > limit && <button className="btn skills-load-more" onClick={() => setLimit((value) => value + 40)}>카드 40장 더 보기 ({Math.min(limit, candidates.length)} / {candidates.length})</button>}
    </div>
  </dialog>;
}
