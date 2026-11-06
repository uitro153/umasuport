import type { DeepReadonly } from '../../data/snapshot';
import type { ReferenceCostume } from '../../domain/reference';
import type { RedFactor, AptitudeKey } from '../../domain/pedigree';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import GameAssetImage from '../assets/GameAssetImage';

interface Props {
  nodeId: string;
  label: string;
  costume?: DeepReadonly<ReferenceCostume>;
  factor: Readonly<RedFactor> | null;
  locked: boolean;
  protectedByAncestor: boolean;
  onSelect: () => void;
  onClear: () => void;
  onFactor: (factor: RedFactor | null) => void;
  onLock: (locked: boolean) => void;
  onInstance?: () => void;
  testId?: string;
}

export default function LineageNodeCard(props: Props) {
  const disabled = props.locked || props.protectedByAncestor;
  return <article className={`lineage-node-card ${disabled ? 'lineage-node-fixed' : ''}`} data-testid={props.testId ?? `lineage-node-${props.nodeId}`}>
    <div className="lineage-node-heading"><strong>{props.label}</strong>{props.costume && <button className="clear-slot" disabled={disabled} aria-label={`${props.label} 캐릭터 비우기`} onClick={props.onClear}>×</button>}</div>
    <button className="lineage-character-button" disabled={disabled} onClick={props.onSelect} aria-label={`${props.label} 캐릭터 선택`}>
      <GameAssetImage kind="costume" id={props.costume?.costumeId} label={props.costume?.displayName ?? props.label} />
      <span className="lineage-character-copy"><strong>{props.costume?.nameKo ?? props.costume?.nameJa ?? '캐릭터 미정'}</strong><small>{props.costume ? props.costume.outfitKo ?? props.costume.outfitJa : '새 인자 계획'}</small></span>
    </button>
    <div className="red-factor-fields">
      <label className="visually-hidden" htmlFor={`lineage-factor-${props.nodeId}`}>{props.label} 빨간 인자</label>
      <select id={`lineage-factor-${props.nodeId}`} disabled={disabled} value={props.factor?.type ?? ''} onChange={(event) => props.onFactor(event.target.value ? { type: event.target.value as AptitudeKey, stars: props.factor?.stars ?? 3 } : null)}>
        <option value="">인자 없음</option>{Object.entries(APTITUDE_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
      <label className="visually-hidden" htmlFor={`lineage-stars-${props.nodeId}`}>{props.label} 인자 별수</label>
      <select id={`lineage-stars-${props.nodeId}`} disabled={disabled || !props.factor} value={props.factor?.stars ?? 3} onChange={(event) => props.onFactor(props.factor ? { ...props.factor, stars: Number(event.target.value) as 1 | 2 | 3 } : null)}>
        <option value={1}>★1</option><option value={2}>★2</option><option value={3}>★3</option>
      </select>
    </div>
    <label className="lineage-lock"><input type="checkbox" checked={props.locked} disabled={props.protectedByAncestor} onChange={(event) => props.onLock(event.target.checked)} />현재 인자·혈통 고정</label>
    {props.costume && props.onInstance && <button className="btn p85-instance-action" data-testid={`p85-instance-open-${props.nodeId}`} onClick={props.onInstance} aria-label={`${props.label} 인자 개체 관리`}>개체·혈통</button>}
    {props.protectedByAncestor && <span className="lineage-protected-note">아래 세대의 고정 혈통에 포함</span>}
  </article>;
}
