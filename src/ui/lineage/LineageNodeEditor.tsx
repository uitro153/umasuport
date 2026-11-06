import { useEffect, useRef, type ReactNode } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { ReferenceSnapshot } from '../../domain/reference';
import { getLineageSlots, getProtectedNodeIds, type LineagePlan } from '../../domain/lineage';
import type { AptitudeKey, RedFactor } from '../../domain/pedigree';
import { APTITUDE_LABELS } from '../../engine/aptitude';

interface Props {
  nodeId: string; plan: LineagePlan; snapshot: DeepReadonly<ReferenceSnapshot>;
  cutoffDate: string; allowForecast: boolean; onClose: () => void;
  onSelect: () => void; onClear: () => void; onFactor: (factor: RedFactor | null) => void;
  onLock: (locked: boolean) => void; instancePanel?: ReactNode; message?: string;
}
export default function LineageNodeEditor(props: Props) {
  const panel = useRef<HTMLElement>(null);
  const slots = getLineageSlots(props.plan);
  const slot = slots.find((item) => item.nodeId === props.nodeId)!;
  const node = props.plan.nodes[props.nodeId]!;
  const protectedIds = getProtectedNodeIds(props.plan);
  let younger = slot.parentNodeId; let inheritedLock = false;
  while (younger) { if (props.plan.nodes[younger]?.locked) inheritedLock = true; younger = slots.find((item) => item.nodeId === younger)?.parentNodeId; }
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true }); panel.current?.scrollIntoView({ block: 'nearest' });
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <section ref={panel} tabIndex={-1} className="panel p86-node-editor p872-record-editor" aria-labelledby="p86-node-editor-title" data-testid="p86-node-editor" data-node-id={props.nodeId}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); props.onClose(); } }}>
    <header className="p86-node-editor-header"><h2 id="p86-node-editor-title">{slot.label} · 인자 상세 기록</h2><button className="btn" onClick={props.onClose}>편집 닫기</button></header>
    <div data-testid="p86-node-fields" className="p87-factor-fields">
      {slot.depth > 0 && <div className="red-factor-fields"><label>인자 종류<select id={slot.slotKey ? `ref-factor-${slot.slotKey}` : `lineage-factor-${props.nodeId}`} aria-label={`${slot.label} 빨간 인자`} disabled={protectedIds.has(props.nodeId) || slot.depth <= 2 && !node.costumeId} value={node.redFactor?.type ?? ''} onChange={event => props.onFactor(event.target.value ? { type: event.target.value as AptitudeKey, stars: node.redFactor?.stars ?? 3 } : null)}><option value="">인자 없음</option>{Object.entries(APTITUDE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>별 개수<select id={slot.slotKey ? `ref-stars-${slot.slotKey}` : `lineage-stars-${props.nodeId}`} aria-label={`${slot.label} 인자 별수`} disabled={protectedIds.has(props.nodeId) || !node.redFactor} value={node.redFactor?.stars ?? 3} onChange={event => props.onFactor(node.redFactor ? { ...node.redFactor, stars: Number(event.target.value) as 1 | 2 | 3 } : null)}>{[1, 2, 3].map(stars => <option key={stars} value={stars}>★{stars}</option>)}</select></label></div>}
      <label className="lineage-lock"><input type="checkbox" checked={node.locked} disabled={inheritedLock} onChange={event => props.onLock(event.target.checked)} />현재 인자·혈통 고정</label>
      {inheritedLock && <p>아래 세대에서 고정된 혈통입니다. 해당 고정을 먼저 해제하세요.</p>}
      {slot.depth <= 2 && <div className="p87-factor-secondary"><button className="btn lineage-character-button" disabled={protectedIds.has(props.nodeId)} aria-label={`${slot.label} 선택`} onClick={props.onSelect}>캐릭터 선택</button><button className="btn" disabled={!node.costumeId || protectedIds.has(props.nodeId)} aria-label={`${slot.label} 비우기`} onClick={props.onClear}>캐릭터 비우기</button></div>}
    </div>
    {props.message && <p className="selection-warning" role="alert">{props.message}</p>}
    {props.instancePanel && <details className="p87-record-tools"><summary>인자 기록 관리</summary>{props.instancePanel}</details>}
  </section>;
}
