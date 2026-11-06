import type { ReferenceApplication, ReferenceCostume } from '../../domain/reference';
import type { DeepReadonly } from '../../data/snapshot';
import type { AptitudeKey, PedigreeSlot, RedFactor, SlotKey } from '../../domain/pedigree';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import type { ReferenceAvailability } from '../../engine/reference-availability';
import { SLOT_LABELS } from '../pedigree/labels';
import { releaseLabel, translationLabel } from './reference-labels';
import GameAssetImage from '../assets/GameAssetImage';

interface Props {
  slotKey: SlotKey;
  slot: Readonly<PedigreeSlot>;
  costume?: DeepReadonly<ReferenceCostume>;
  availability: ReferenceAvailability;
  observations?: DeepReadonly<ReferenceApplication['kr']['observations']>;
  onSelect: () => void;
  onClear: () => void;
  onFactor: (factor: RedFactor | null) => void;
  locked?: boolean;
  onInstance?: () => void;
  nodeId?: string;
  testId?: string;
}

export default function ReferenceSlot({ slotKey, slot, costume, availability, observations, onSelect, onClear, onFactor, locked = false, onInstance, nodeId, testId }: Props) {
  const label = SLOT_LABELS[slotKey];
  const evidenceLabels = { 'official-confirmed': '공식 확정', 'secondary-observed': '2차 관측', forecast: '예측', unknown: '미확인' } as const;
  return <article className={`pedigree-slot reference-slot ${slotKey === 'target' ? 'target-slot' : ''}`} data-testid={testId ?? `ref-slot-${slotKey}`}>
    <div className="slot-heading"><span>{label}{locked ? ' · 혈통 고정' : ''}</span>{costume && <button className="clear-slot" disabled={locked} onClick={onClear} aria-label={`${label} 비우기`}>×</button>}</div>
    <button className="character-trigger" disabled={locked} onClick={onSelect} aria-label={`${label} 선택`}>
      <GameAssetImage kind="costume" id={costume?.costumeId} label={costume?.displayName ?? label} />
      <span className="slot-copy"><strong>{costume?.nameKo ?? costume?.nameJa ?? '캐릭터 선택'}</strong><small>{costume ? costume.outfitKo ?? costume.outfitJa : '준비 데이터에서 선택'}</small></span>
    </button>
    {costume && availability.state !== 'available' && <p className={`ref-release ${availability.state}`}>{availability.state === 'unknown' ? '한국 출시 미확인' : '기준일 이후 출시'}</p>}
    {costume && <details className="caption"><summary>출시·명칭 확인 정보</summary><p className="ref-translation">{translationLabel(costume)}</p><p>{releaseLabel(availability)}</p>{observations?.map((row) => <p key={`${row.url}-${row.checkedOn}`}><a href={row.url} target="_blank" rel="noreferrer">{evidenceLabels[row.classification]}</a><br />게시 {row.publishedOn ?? '미확인'} · 출시 {row.releaseDate ?? '미확인'} · 확인 {row.checkedOn}</p>)}</details>}
    {costume && onInstance && <button className="btn p85-instance-action" data-testid={`p85-instance-open-${nodeId}`} onClick={onInstance} aria-label={`${label} 인자 개체 관리`}>개체·혈통</button>}
    {slotKey !== 'target'  && <div className="red-factor-fields">
      <label className="visually-hidden" htmlFor={`ref-factor-${slotKey}`}>{label} 빨간 인자</label>
      <select id={`ref-factor-${slotKey}`} value={slot.redFactor?.type ?? ''} disabled={locked || !costume} onChange={(event) => onFactor(event.target.value ? { type: event.target.value as AptitudeKey, stars: slot.redFactor?.stars ?? 3 } : null)}>
        <option value="">인자 없음</option>{Object.entries(APTITUDE_LABELS).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
      </select>
      <label className="visually-hidden" htmlFor={`ref-stars-${slotKey}`}>{label} 인자 별수</label>
      <select id={`ref-stars-${slotKey}`} value={slot.redFactor?.stars ?? 3} disabled={locked || !costume || !slot.redFactor} onChange={(event) => onFactor(slot.redFactor ? { ...slot.redFactor, stars: Number(event.target.value) as 1 | 2 | 3 } : null)}>
        <option value={1}>★1</option><option value={2}>★2</option><option value={3}>★3</option>
      </select>
    </div>}
  </article>;
}
