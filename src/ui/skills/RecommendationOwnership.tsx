import { useMemo, useRef, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import { getP3Availability, type MainSupportSelection } from '../../engine/support-acquisition';
import type { P5AvailabilityContext } from '../../engine/p5-availability';
import SupportCardIdentity from './SupportCardIdentity';
import SupportListFilters from './SupportListFilters';
import { matchesSupportFilters, type SupportListFilters as Filters } from './support-filters';
import SupportGalleryTile from './SupportGalleryTile';
import SupportGalleryDetail from './SupportGalleryDetail';

interface Props {
  snapshot: DeepReadonly<P3Snapshot>;
  selections: MainSupportSelection[];
  onChange: (selections: MainSupportSelection[]) => void;
  cutoffDate: string;
  allowForecast: boolean;
  forecast?: P5AvailabilityContext;
}

export default function RecommendationOwnership({ snapshot, selections, onChange, cutoffDate, allowForecast, forecast }: Props) {
  const [filters, setFilters] = useState<Filters>({ query: '', type: 'all', rarity: 'all', release: 'all' });
  const [limit, setLimit] = useState(12);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const candidates = useMemo(() => {
    return snapshot.supports.map((support) => ({ support, availability: getP3Availability(snapshot, 'support', support.supportId, cutoffDate, allowForecast, forecast) }))
      .filter(({ support, availability }) => matchesSupportFilters(support, availability.state, filters));
  }, [snapshot, cutoffDate, allowForecast, forecast, filters]);
  const detail = candidates.find(({ support }) => support.supportId === detailId);
  function updateFilters(next: Filters) { setFilters(next); setLimit(12); setDetailId(null); }
  function toggleSupport(supportId: string) { const selected = selections.some((row) => row.supportId === supportId); onChange(selected ? selections.filter((row) => row.supportId !== supportId) : [...selections, { supportId, limitBreak: 4 }]); }
  function closeDetails() { setDetailId(null); detailTrigger.current?.focus(); }
  return <div className="p4-ownership-editor">
    <p>보유 카드를 등록하면 해당 돌파를 반영합니다. 등록하지 않은 카드는 가상 설계에서 4돌파로 비교합니다.</p>
    {selections.length > 0 && <ul className="p4-owned-list p85-support-owned-list">{selections.map((selection) => {
      const support = snapshot.supports.find((row) => row.supportId === selection.supportId);
      return <li key={selection.supportId}>
        {support ? <SupportCardIdentity support={support} /> : <span><strong>서포트 자료 확인 필요</strong><small>현재 자료에서 확인 필요</small></span>}
        <label><span className="visually-hidden">보유 {selection.supportId} 돌파</span><select aria-label={`보유 ${selection.supportId} 돌파`} value={selection.limitBreak} onChange={(event) => onChange(selections.map((row) => row.supportId === selection.supportId ? { ...row, limitBreak: Number(event.target.value) } : row))}>{[0, 1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}돌파</option>)}</select></label>
        <button className="btn" aria-label={`보유 ${selection.supportId} 해제`} onClick={() => onChange(selections.filter((row) => row.supportId !== selection.supportId))}>해제</button>
      </li>;
    })}</ul>}
    <label htmlFor="p4-ownership-search">보유 카드명 검색<input id="p4-ownership-search" className="skills-search-input" type="search" value={filters.query} onChange={(event) => updateFilters({ ...filters, query: event.target.value })} /></label>
    <SupportListFilters idPrefix="p4-own" releaseLabel="보유 후보 한국 출시 상태" allowAllRelease filters={filters} onChange={updateFilters} onReset={() => updateFilters({ query: '', type: 'all', rarity: 'all', release: 'all' })} />
    <p className="p85-support-results-count" data-testid="p85-ownership-result-count">조건에 맞는 카드 {candidates.length}장 · 목록 필터는 추천 조건을 바꾸지 않습니다.</p>
    {detail && <SupportGalleryDetail support={detail.support} availability={detail.availability} onSelect={() => toggleSupport(detail.support.supportId)} onClose={closeDetails} actionLabel={selections.some((row) => row.supportId === detail.support.supportId) ? '보유 등록 해제' : '보유 카드로 등록'} />}
    <ul className="p4-ownership-candidates p85-support-ownership p86-support-gallery" aria-label="보유 카드 갤러리">{candidates.slice(0, limit).map(({ support, availability }) => {
      const selected = selections.some((row) => row.supportId === support.supportId);
      return <li key={support.supportId} data-support-id={support.supportId}>
        <SupportGalleryTile support={support} selected={selected} onSelect={() => toggleSupport(support.supportId)} testId={`p4-own-${support.supportId}`} actionLabel={selected ? '보유 해제' : '보유 등록'} status={availability.state === 'unknown' ? '출시 미확인' : availability.state === 'unavailable' ? '기준일 이후' : undefined} onDetails={() => { detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDetailId(support.supportId); }} />
      </li>;
    })}</ul>
    {candidates.length === 0 && <p data-testid="p85-ownership-empty">이 조건의 카드가 없습니다. 검색어·훈련 타입·레어도·출시 상태를 확인하세요.</p>}
    {candidates.length > limit && <button className="btn" onClick={() => setLimit((value) => value + 12)}>보유 등록 후보 더 보기</button>}
  </div>;
}
