import { SUPPORT_TYPES, type SupportListFilters as Filters, type SupportRarityFilter, type SupportReleaseFilter, type SupportTypeFilter } from './support-filters';

interface Props {
  idPrefix: string;
  filters: Filters;
  onChange: (filters: Filters) => void;
  releaseLabel?: string;
  allowAllRelease?: boolean;
  onReset: () => void;
}
export default function SupportListFilters({ idPrefix, filters, onChange, releaseLabel = '한국 출시 상태', allowAllRelease = false, onReset }: Props) {
  return <div className="p85-support-filters">
    <label htmlFor={`${idPrefix}-type`}>훈련 타입<select id={`${idPrefix}-type`} value={filters.type} onChange={(event) => onChange({ ...filters, type: event.target.value as SupportTypeFilter })}>{SUPPORT_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    <label htmlFor={`${idPrefix}-rarity`}>레어도<select id={`${idPrefix}-rarity`} value={filters.rarity} onChange={(event) => onChange({ ...filters, rarity: event.target.value as SupportRarityFilter })}>{['all', 'R', 'SR', 'SSR'].map((value) => <option key={value} value={value}>{value === 'all' ? '전체' : value}</option>)}</select></label>
    <label htmlFor={`${idPrefix}-state`}>{releaseLabel}<select id={`${idPrefix}-state`} aria-label={releaseLabel} value={filters.release} onChange={(event) => onChange({ ...filters, release: event.target.value as SupportReleaseFilter })}>
      {allowAllRelease && <option value="all">전체 출시 상태</option>}<option value="available">기준일 가용</option><option value="unknown">출시 미확인 자료 보기</option><option value="unavailable">기준일 이후 자료 보기</option>
    </select></label>
    <button type="button" className="btn p85-filter-reset" onClick={onReset}>필터 초기화</button>
  </div>;
}
