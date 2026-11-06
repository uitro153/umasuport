import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { ReferenceSnapshot } from '../../domain/reference';
import { getProtectedNodeIds, type LineagePlan } from '../../domain/lineage';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import GameAssetImage from '../assets/GameAssetImage';
import { createLineageTreeEdges, getLineageTreeGeometry, type LineageTreeNodeBox } from './tree-geometry';
import './unified-tree.css';
import { APTITUDE_KEYS, type AptitudeKey, type RedFactor } from '../../domain/pedigree';
import { chooseInlineFactor } from './inline-factor';

interface Props {
  plan: LineagePlan; snapshot: DeepReadonly<ReferenceSnapshot>; expanded: boolean;
  selectedNodeId: string | null; onSelectNode: (nodeId: string) => void;
  onChooseCharacter?: (nodeId: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  tools?: ReactNode;
  onFactorChange: (nodeId: string, factor: RedFactor | null) => void;
  onLockChange: (nodeId: string, locked: boolean) => void;
}

export default function UnifiedLineageTree({ plan, snapshot, expanded, selectedNodeId, onSelectNode, onChooseCharacter, onExpandedChange, tools, onFactorChange, onLockChange }: Props) {
  const geometry = useMemo(() => getLineageTreeGeometry(plan, expanded), [plan, expanded]);
  const [zoom, setZoom] = useState(1);
  const [measured, setMeasured] = useState<LineageTreeNodeBox[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const centered = useRef(false);
  const previousViewport = useRef<{ width: number; zoom: number } | null>(null);
  const protectedIds = getProtectedNodeIds(plan);
  const costumeMap = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume]));
  const costumeName = (id: string | null) => {
    const costume = costumeMap.get(id ?? '');
    return costume?.nameKo ?? costume?.nameJa ?? '캐릭터 미정';
  };
  // DOM measurements include borders and any responsive styling. Every SVG
  // endpoint is computed in this same world coordinate system after resize.
  useEffect(() => {
    const container = world.current; const scroller = viewport.current;
    if (!container || !scroller) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = container.getBoundingClientRect();
        const nodes = geometry.nodes.map((box) => {
          const element = container.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(box.nodeId)}"]`);
          if (!element) return box;
          const rect = element.getBoundingClientRect();
          const scaleX = bounds.width / geometry.width; const scaleY = bounds.height / geometry.height;
          return { ...box, x: (rect.left - bounds.left) / scaleX, y: (rect.top - bounds.top) / scaleY,
            width: rect.width / scaleX, height: rect.height / scaleY };
        });
        setMeasured((previous) => JSON.stringify(previous) === JSON.stringify(nodes) ? previous : nodes);
        if (!centered.current) { scroller.scrollLeft = Math.max(0, 1280 * zoom - scroller.clientWidth / 2); centered.current = true; }
        else if (previousViewport.current?.zoom === zoom && previousViewport.current.width !== scroller.clientWidth) {
          // Keep the user's current branch in view when a viewport resize or
          // scrollbar changes its width; never recenter unconditionally.
          const center = (scroller.scrollLeft + previousViewport.current.width / 2) / zoom;
          scroller.scrollLeft = center * zoom - scroller.clientWidth / 2;
        }
        previousViewport.current = { width: scroller.clientWidth, zoom };
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container); observer.observe(scroller);
    container.querySelectorAll('[data-tree-node]').forEach((node) => observer.observe(node));
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(frame); };
  }, [geometry, zoom]);
  const measuredCurrent = measured.length === geometry.nodes.length && measured.every((box, index) => box.nodeId === geometry.nodes[index]?.nodeId);
  const edges = createLineageTreeEdges(plan, measuredCurrent ? measured : geometry.nodes);
  function focusNode(id: string) {
    const box = geometry.nodes.find((node) => node.nodeId === id);
    const element = viewport.current;
    if (!box || !element) return;
    element.scrollTo({ left: (box.x + box.width / 2) * zoom - element.clientWidth / 2,
      top: Math.max(0, box.y * zoom - 24), behavior: 'instant' });
  }
  function changeZoom(next: number) {
    const element = viewport.current;
    const center = element ? (element.scrollLeft + element.clientWidth / 2) / zoom : 1280;
    setZoom(next);
    requestAnimationFrame(() => { if (element) element.scrollLeft = center * next - element.clientWidth / 2; });
  }
  return <section className="p86-unified-tree" aria-labelledby="p86-tree-title" data-testid="p86-unified-tree" data-expanded={expanded}>
    <div className="p86-tree-toolbar"><div><p className="eyebrow">나의 인자 계보</p><h2 id="p86-tree-title">{expanded ? '31인 계보 — 수동 적인자 설계' : '7인 계보'}</h2></div>
      <button className="btn" data-testid="p86-toggle-lineage" aria-expanded={expanded} aria-controls="p86-tree-viewport" onClick={() => onExpandedChange(!expanded)}>{expanded ? '7인으로 접기' : '31인으로 펼치기'}</button>
    </div>
    <div className="p86-tree-navigation"><label>확대 <select aria-label="계보 확대" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))}><option value={0.8}>80%</option><option value={1}>100%</option><option value={1.5}>150%</option></select></label>
      <label>분기 이동 <select aria-label="계보 분기 이동" defaultValue="" onChange={(event) => { focusNode(event.target.value); event.currentTarget.value = ''; }}><option value="" disabled>이동할 혈통</option>{geometry.nodes.filter((node) => node.depth <= 2).map((node) => <option key={node.nodeId} value={node.nodeId}>{node.label}</option>)}</select></label>
      <label>노드 찾기 <select aria-label="계보 노드 선택" value={selectedNodeId && geometry.nodes.some((node) => node.nodeId === selectedNodeId) ? selectedNodeId : ''} onChange={(event) => { const id = event.target.value; focusNode(id); if (geometry.nodes.find(node => node.nodeId === id)!.depth <= 2) onSelectNode(id); else { requestAnimationFrame(() => world.current?.querySelector<HTMLSelectElement>(`[data-tree-node="${CSS.escape(id)}"] select`)?.focus({ preventScroll: true })); event.currentTarget.value = ''; } }}><option value="" disabled>이동할 인자</option>{geometry.nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.label} · {node.depth > 2 ? '모브' : costumeName(plan.nodes[node.nodeId]!.costumeId)}</option>)}</select></label>
      {tools && <div className="p871-tree-tools">{tools}</div>}
    </div>
    <p className="p86-tree-help">상위 7인의 초상화로 캐릭터를, 카드 아래 선택창으로 적인자를 바꾸세요. 새 계획은 ★3이며 기존 별수는 유지합니다. 상위 7인의 실제 기록·별수는 노드 찾기의 상세에서 관리합니다.</p>
    {expanded && <p className="p86-tree-help">상위 7인의 캐릭터를 유지하면서 증조·고조 24개 모브 노드의 적인자를 직접 설정할 수 있습니다.</p>}
    <div ref={viewport} id="p86-tree-viewport" className="p86-tree-viewport" data-testid="p86-tree-viewport" tabIndex={0} aria-label="계보 캔버스, 방향키 또는 터치로 이동" onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      const movement = { ArrowLeft: [-120, 0], ArrowRight: [120, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] }[event.key];
      if (movement) { event.preventDefault(); event.currentTarget.scrollBy(movement[0]!, movement[1]!); }
    }}>
      <div className="p86-tree-scroll-area" style={{ width: geometry.width * zoom, height: geometry.height * zoom }}>
        <div ref={world} className="p86-tree-world" data-testid="p86-tree-world" data-zoom={zoom} style={{ width: geometry.width, height: geometry.height, transform: `scale(${zoom})` }}>
          <svg className="p86-tree-lines" width={geometry.width} height={geometry.height} aria-hidden="true" data-testid="p86-tree-lines">
            {edges.map((edge) => <path key={`${edge.childId}:${edge.parentId}`} d={edge.path} data-child-id={edge.childId} data-parent-id={edge.parentId} data-from-x={edge.from.x} data-from-y={edge.from.y} data-to-x={edge.to.x} data-to-y={edge.to.y} />)}
          </svg>
          {geometry.nodes.map((box) => {
            const node = plan.nodes[box.nodeId]!; const isMob = box.depth > 2;
            const costume = isMob ? undefined : costumeMap.get(node.costumeId ?? '');
            const slotKey = box.depth <= 2 ? ['target', 'parentA', 'parentB', 'grandA1', 'grandA2', 'grandB1', 'grandB2'][geometry.nodes.indexOf(box)] : null;
            const label = costume?.nameKo ?? costume?.nameJa ?? '캐릭터 선택';
            const outfit = costume?.outfitKo ?? costume?.outfitJa;
            return <article key={box.nodeId} data-tree-node={box.nodeId} data-depth={box.depth} data-testid={slotKey ? `ref-slot-${slotKey}` : `lineage-node-${box.nodeId}`} className={`p86-tree-node p86-depth-${box.depth}${selectedNodeId === box.nodeId ? ' p86-tree-node-selected' : ''}${protectedIds.has(box.nodeId) ? ' p86-tree-node-locked' : ''}`} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
              {isMob ? <div className="p86-tree-select p873-mob" data-testid="p873-mob">
                <span className="p86-node-role">{box.label}{protectedIds.has(box.nodeId) ? ' · 고정' : ''}</span>
                <strong>모브</strong>
              </div> : <button className="p86-tree-select" data-testid={`p86-edit-${box.nodeId}`} disabled={protectedIds.has(box.nodeId)} aria-label={`${box.label} 캐릭터 선택 · ${label}${outfit ? ` · ${outfit}` : ''}`} onClick={() => (onChooseCharacter ?? onSelectNode)(box.nodeId)}>
                <span className="p86-node-role">{box.label}{protectedIds.has(box.nodeId) ? ' · 고정' : ''}</span>
                <GameAssetImage kind="costume" id={node.costumeId} label={label} />
                <strong title={label}>{label}</strong>{box.depth <= 2 && <small title={outfit}>{outfit ?? '의상 선택'}</small>}
              </button>}
              {box.depth > 0 && <div className="p872-inline-factor">
                <select className={`p86-node-factor${node.redFactor ? ' p86-node-factor-set' : ''}`} data-testid={`p87-factor-${box.nodeId}`} aria-label={`${box.label} 빨간 인자`} disabled={protectedIds.has(box.nodeId) || box.depth <= 2 && !node.costumeId} value={node.redFactor?.type ?? ''} onChange={event => onFactorChange(box.nodeId, chooseInlineFactor(node.redFactor, event.target.value as AptitudeKey | '', node.costumeId !== null))}>
                  <option value="">적인자 선택</option>{APTITUDE_KEYS.map(type => <option key={type} value={type}>{APTITUDE_LABELS[type]} {'★'.repeat(node.costumeId !== null || type === node.redFactor?.type ? node.redFactor?.stars ?? 3 : 3)}</option>)}
                </select>
                <button type="button" className="p872-inline-lock" aria-label={`${box.label} 혈통 고정${node.locked ? ' 해제' : ''}`} aria-pressed={node.locked} disabled={protectedIds.has(box.nodeId) && !node.locked} title="기존 인자와 혈통 고정" onClick={() => onLockChange(box.nodeId, !node.locked)}>{node.locked ? '●' : '○'}</button>
              </div>}
            </article>;
          })}
        </div>
      </div>
    </div>
  </section>;
}
