import type { PinnedSnapshot } from '../../data/snapshot';
import type { AptitudeKey, PedigreeSlot, RedFactor, SlotKey } from '../../domain/pedigree';
import type { Availability } from '../../engine/availability';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import { SLOT_LABELS } from './labels';

interface Props {
  slotKey: SlotKey;
  slot: Readonly<PedigreeSlot>;
  snapshot: PinnedSnapshot;
  availability?: Availability;
  onSelect: () => void;
  onClear: () => void;
  onFactorChange: (factor: RedFactor | null) => void;
}

export default function SlotCard({ slotKey, slot, snapshot, availability, onSelect, onClear, onFactorChange }: Props) {
  const costume = snapshot.costumes.find((item) => item.costumeId === slot.costumeId);
  const character = snapshot.characters.find((item) => item.baseId === costume?.baseId);
  const label = SLOT_LABELS[slotKey];
  const shortName = character?.nameKo.replace(/^\[가상\]\s*/, '') ?? '선택하기';
  const costumeLabel = costume?.nameKo.startsWith(`${character?.nameKo} · `)
    ? costume.nameKo.slice(`${character?.nameKo} · `.length) : costume?.nameKo;
  return (
    <article className={`pedigree-slot ${slotKey === 'target' ? 'target-slot' : ''}`} data-testid={`slot-${slotKey}`}>
      <div className="slot-heading"><span>{label}</span>{costume && <button type="button" className="clear-slot" aria-label={`${label} 비우기`} onClick={onClear}>×</button>}</div>
      <button type="button" className="character-trigger" onClick={onSelect} aria-label={`${label} 선택`}>
        <span className={`portrait ${costume ? 'is-selected' : ''}`} aria-hidden="true">{costume ? shortName.slice(-1) : '+'}</span>
        <span className="slot-copy"><strong>{costume ? character?.nameKo : '캐릭터 선택'}</strong><small>{costumeLabel ?? '이름 · 별칭으로 검색'}</small></span>
      </button>
      {costume && <div className="slot-aptitudes"><span>잔디 {costume.aptitudes.turf}</span><span>더트 {costume.aptitudes.dirt}</span></div>}
      {costume && availability?.basis === 'forecast' && availability.available && <span className="slot-forecast">미래시 · 변동 가능</span>}
      {costume && availability && !availability.available && <span className="slot-unavailable">기준일 제외 · 계산 미반영</span>}
      {slotKey !== 'target' && <div className="red-factor-fields">
        <label htmlFor={`factor-${slotKey}`} className="visually-hidden">{label} 빨간 인자</label>
        <select id={`factor-${slotKey}`} value={slot.redFactor?.type ?? ''} disabled={!costume}
          onChange={(event) => onFactorChange(event.target.value ? { type: event.target.value as AptitudeKey, stars: slot.redFactor?.stars ?? 3 } : null)}>
          <option value="">인자 없음</option>
          {(Object.entries(APTITUDE_LABELS) as [AptitudeKey, string][]).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
        </select>
        <label htmlFor={`stars-${slotKey}`} className="visually-hidden">{label} 인자 별수</label>
        <select id={`stars-${slotKey}`} value={slot.redFactor?.stars ?? 3} disabled={!costume || !slot.redFactor}
          onChange={(event) => onFactorChange(slot.redFactor ? { ...slot.redFactor, stars: Number(event.target.value) as 1 | 2 | 3 } : null)}>
          <option value={1}>★1</option><option value={2}>★2</option><option value={3}>★3</option>
        </select>
      </div>}
    </article>
  );
}
