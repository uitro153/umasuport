import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ReferenceSnapshot } from '../../domain/reference';
import type { DeepReadonly } from '../../data/snapshot';
import { SLOT_KEYS, createEmptyPedigree, type Pedigree, type RedFactor, type SlotKey } from '../../domain/pedigree';
import { createLineagePlan, getLineageSlots, setLineageLock, updateLineageNode, type LineagePlan } from '../../domain/lineage';
import { dateOnlySchema } from '../../domain/primitives';
import { resolveEvaluationContext } from '../../engine/availability';
import { getReferenceAvailability } from '../../engine/reference-availability';
import { calculateReferencePedigree } from '../../engine/reference-pedigree';
import { enumerateLineageArrangements } from '../../engine/lineage-arrangements';
import { calculateReferenceAptitudes } from '../../engine/reference-aptitude';
import LineageSummary from '../lineage/LineageSummary';
import UnifiedLineageTree from '../lineage/UnifiedLineageTree';
import LineageNodeEditor from '../lineage/LineageNodeEditor';
import ReferencePicker from './ReferencePicker';
import { SLOT_LABELS } from '../pedigree/labels';
import './reference.css';
import { findLineageCharacterIssues, lineageEditIssue } from '../../engine/lineage-validity';
import ActionNotice from '../ActionNotice';
import '../lineage/p87.css';
import type { DataSnapshotIds, WorkspaceInputs } from '../../domain/saved-plan';
import { getUnconfirmedInstanceNodeIds, workspaceFingerprint } from '../../engine/plan-persistence';
import { createLineagePngDocument, downloadPngDocument } from '../plans/png-export';

interface Props {
  snapshot: DeepReadonly<ReferenceSnapshot>;
  pedigree: Pedigree;
  onChange: (value: Pedigree) => void;
  onFixture: () => void;
  onSkills?: () => void;
  plan: LineagePlan;
  onPlanChange: (plan: LineagePlan) => void;
  onNodeInstance?: (nodeId: string) => void;
  instancePanel?: ReactNode;
  onResetSkills?: () => void;
  filters?: WorkspaceInputs['referenceFilters'];
  onFiltersChange?: (value: WorkspaceInputs['referenceFilters']) => void;

  workspaceInputs?: WorkspaceInputs;
  snapshotIds?: DataSnapshotIds;
  planTitle?: string;
}

export default function ReferencePage({ snapshot, pedigree, onChange, onFixture, onSkills, plan, onPlanChange, onNodeInstance, instancePanel, onResetSkills, filters, onFiltersChange, workspaceInputs, snapshotIds, planTitle }: Props) {
  const today = resolveEvaluationContext({ mode: 'current', now: new Date() }).cutoffDate;
  const [localFilters, setLocalFilters] = useState({ dateInput: today, includeUnknown: false, allowForecast: false });
  const currentFilters = filters ?? localFilters;
  const { dateInput, includeUnknown, allowForecast } = currentFilters;
  function updateFilters(patch: Partial<WorkspaceInputs['referenceFilters']>) { const next = { ...currentFilters, ...patch }; if (onFiltersChange) onFiltersChange(next); else setLocalFilters(next); }
  const setDateInput = (value: string) => updateFilters({ dateInput: value });
  const setIncludeUnknown = (value: boolean) => updateFilters({ includeUnknown: value });
  const setAllowForecast = (value: boolean) => updateFilters({ allowForecast: value });
  const [exportMessage, setExportMessage] = useState('');
  // Externally compared public formula; KR measurement remains a source status.
  const allowUnverifiedFormula = true;
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showArrangements, setShowArrangements] = useState(false);
  const [showDeep, setShowDeep] = useState(false);
  const [success, setSuccess] = useState('');
  const dismissSuccess = useCallback(() => setSuccess(''), []);
  const characterIssues = useMemo(() => findLineageCharacterIssues(plan, snapshot), [plan, snapshot]);
  const [storedArrangements, setStoredArrangements] = useState<{ signature: string; rows: ReturnType<typeof enumerateLineageArrangements> } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const validDate = dateOnlySchema.safeParse(dateInput).success;
  const cutoffDate = validDate ? dateInput : today;
  const getCostume = (id: string | null) => snapshot.costumes.find((row) => row.costumeId === id);
  const availabilityFor = (id: string | null) => getReferenceAvailability(snapshot.applications.find((row) => row.entityId === id), cutoffDate, { allowForecast });
  const states = snapshot.costumes.map((row) => availabilityFor(row.costumeId));
  const unknownCount = states.filter((state) => state.state === 'unknown').length;
  const availableCount = states.filter((state) => state.state === 'available').length;
  const unavailableCount = states.filter((state) => state.state === 'unavailable').length;
  const blocked = SLOT_KEYS.filter((key) => pedigree[key].costumeId && (availabilityFor(pedigree[key].costumeId).state === 'unavailable' || (!includeUnknown && availabilityFor(pedigree[key].costumeId).state === 'unknown')));
  const calculationTree = useMemo(() => {
    const tree = structuredClone(pedigree);
    for (const key of SLOT_KEYS) {
      const availability = getReferenceAvailability(snapshot.applications.find((row) => row.entityId === tree[key].costumeId), cutoffDate, { allowForecast });
      if (availability.state === 'unavailable' || (!includeUnknown && availability.state === 'unknown')) tree[key] = { costumeId: null, redFactor: null };
    }
    return tree;
  }, [pedigree, snapshot, cutoffDate, includeUnknown, allowForecast]);
  const result = useMemo(() => {
    const value = calculateReferencePedigree(calculationTree, snapshot, { allowUnverifiedFormula: true });
    return characterIssues.length ? { ...value, status: 'invalid' as const, previewTotal: null, issues: characterIssues.map(issue => issue.message) } : value;
  }, [calculationTree, snapshot, characterIssues]);
  const slots = getLineageSlots(plan);
  const selectedSlot = slots.find((slot) => slot.nodeId === selectedNodeId);
  const pickerSlot = slots.find((slot) => slot.nodeId === editingNodeId);
  const arrangementSignature = JSON.stringify([plan, dateInput, validDate, includeUnknown, allowForecast, snapshot.snapshotId, workspaceInputs ? workspaceFingerprint(workspaceInputs) : null]);
  const arrangements = storedArrangements?.signature === arrangementSignature ? storedArrangements.rows : [];
  const canArrange = validDate && blocked.length === 0 && SLOT_KEYS.every((key) => pedigree[key].costumeId !== null);
  function openNode(nodeId: string) { setAnnouncement(''); setSelectedNodeId(nodeId); onNodeInstance?.(nodeId); }
  function commitNode(action: () => LineagePlan) { try { onPlanChange(action()); setAnnouncement(''); } catch (error: unknown) { setAnnouncement(error instanceof Error ? error.message : '인자를 변경할 수 없습니다.'); } }
  function selectCostume(nodeId: string, costumeId: string | null) {
    const slot = slots.find((row) => row.nodeId === nodeId);
    if (slot?.slotKey) updateSlot(slot.slotKey, costumeId);
  }
  function updateNodeFactor(nodeId: string, redFactor: RedFactor | null) {
    const slot = slots.find((row) => row.nodeId === nodeId);
    if (slot?.slotKey) setFactor(slot.slotKey, redFactor);
    else commitNode(() => updateLineageNode(plan, nodeId, { redFactor }));
  }
  function showArrangementPreview() {
    setSuccess(''); setAnnouncement('');
    if (showArrangements) { setShowArrangements(false); setStoredArrangements(null); return; }
    if (!canArrange) return;
    setStoredArrangements({ signature: arrangementSignature, rows: enumerateLineageArrangements(plan, snapshot) });
    setShowArrangements(true);
  }
  const aptitude = useMemo(() => calculateReferenceAptitudes(calculationTree, snapshot), [calculationTree, snapshot]);
  const unconfirmed = workspaceInputs ? getUnconfirmedInstanceNodeIds(workspaceInputs).filter(id => slots.some(slot => slot.nodeId === id && slot.depth <= 2)) : [];
  const exportSignature = JSON.stringify([workspaceInputs ? workspaceFingerprint(workspaceInputs) : null, snapshotIds, planTitle, snapshot.snapshotId]);
  const liveExportSignature = useRef(exportSignature);
  useEffect(() => {
    liveExportSignature.current = exportSignature;
    return () => { liveExportSignature.current = ''; };
  }, [exportSignature]);
  async function exportLineage(variant: 'seven' | 'full') {
    if (!workspaceInputs || !snapshotIds || !validDate) return;
    try {
      const document = createLineagePngDocument({ title: planTitle ?? '육성 계획', inputs: workspaceInputs, reference: snapshot, snapshotIds,
        affinity: unconfirmed.length ? null : result, aptitudes: unconfirmed.length ? null : aptitude, variant });
      await downloadPngDocument(document, { filename: variant === 'full' ? 'uma-lineage-31.png' : 'uma-lineage-7.png', resultSignature: exportSignature, getCurrentSignature: () => liveExportSignature.current });
      setExportMessage('현재 화면 입력과 결과의 PNG를 만들었습니다.');
    } catch (error: unknown) { setExportMessage(error instanceof Error ? error.message : 'PNG를 만들지 못했습니다.'); }
  }

  function updateSlot(key: SlotKey, costumeId: string | null) {
    try { onChange({ ...pedigree, [key]: { costumeId, redFactor: costumeId ? pedigree[key].redFactor : null } }); setAnnouncement(''); }
    catch (error: unknown) { setAnnouncement(error instanceof Error ? error.message : '캐릭터를 변경할 수 없습니다.'); }
  }
  function setFactor(key: SlotKey, redFactor: RedFactor | null) {
    try { onChange({ ...pedigree, [key]: { ...pedigree[key], redFactor } }); setAnnouncement(''); }
    catch (error: unknown) { setAnnouncement(error instanceof Error ? error.message : '인자를 변경할 수 없습니다.'); }
  }
  function selectionIssue(nodeId: string, costumeId: string) {
    const next = structuredClone(plan); next.nodes[nodeId]!.costumeId = costumeId;
    return lineageEditIssue(plan, next, snapshot);
  }
  function clearLineage() {
    if (!window.confirm('계보와 인자 기록을 비울까요? 저장된 계획 사본은 유지됩니다.')) return;
    try {
      onPlanChange(createLineagePlan(createEmptyPedigree())); onResetSkills?.(); setShowArrangements(false); setStoredArrangements(null); setAnnouncement(''); setSuccess('계보를 비웠습니다.');
    } catch (error: unknown) { setAnnouncement(error instanceof Error ? error.message : '계보를 비우지 못했습니다.'); }
  }
  const nameAt = (tree: Pedigree, key: SlotKey) => getCostume(tree[key].costumeId)?.displayName ?? '미선택';

  return <>
    <header className="site-header"><div className="shell header-content"><a className="brand" href="#main"><span className="brand-mark" aria-hidden="true">系</span>인자 설계 연구소</a><div className="header-actions">{onSkills && <button className="btn" onClick={onSkills}>스킬·서포트 분석</button>}{import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1' && <button className="btn" onClick={onFixture}>가상 검증 화면으로</button>}</div></div></header>
    <main id="main" className="shell reference-main">
      <div className="fixture-notice"><strong>공개 계산식 · 한국 서버 실측 대기</strong></div>
      <div className="pedigree-intro"><div><p className="eyebrow">PEDIGREE · 7 / 31</p><h1>나의 인자 계보</h1><p>부모와 조부를 고르고, 깊은 혈통까지 같은 계보에서 설계하세요.</p></div></div>
      <section className="panel reference-context" aria-label="한국 출시 판단 기준">
        <div className="reference-date"><div className="field"><label htmlFor="reference-date">비교 기준일 · Asia/Seoul</label><input id="reference-date" type="date" value={dateInput} onChange={(event) => setDateInput(event.target.value)} /></div><button className="btn" onClick={() => setDateInput(today)}>현재 날짜</button></div>
        {!validDate && <p role="alert">유효한 기준일을 선택하세요. 현재 날짜로 표시 중입니다.</p>}
        <div className="reference-counts"><span>자료상 가용 <b data-testid="ref-available-count">{availableCount}</b></span><span>한국 출시 미확인 <b data-testid="ref-unknown-count">{unknownCount}</b></span><span>기준일 이후 <b data-testid="ref-unavailable-count">{unavailableCount}</b></span></div>
        <div className="reference-options"><label><input type="checkbox" checked={includeUnknown} onChange={(event) => setIncludeUnknown(event.target.checked)} />한국 출시 미확인도 선택 목록에 표시</label><label><input type="checkbox" checked={allowForecast} onChange={(event) => setAllowForecast(event.target.checked)} />날짜가 있는 미래시 포함</label></div>
<p className="caption">예상 출시는 공식 일정과 구분합니다.</p>
      </section>
      {blocked.length > 0 && <p className="selection-warning" role="alert">현재 기준에서 계산 제외: {blocked.map((key) => SLOT_LABELS[key]).join(', ')}. 선택은 보존합니다.</p>}
      {characterIssues.length > 0 && <div className="p871-lineage-warning" role="alert"><strong>계보 조합을 수정해 주세요.</strong><ul>{characterIssues.map(issue => <li key={issue.key}>{issue.message}</li>)}</ul><p>기존 기록은 유지합니다. 해당 캐릭터를 바꾸거나 선택 해제로 수정할 수 있습니다.</p></div>}
      <LineageSummary affinity={result} aptitudes={aptitude} unconfirmed={unconfirmed.length > 0} invalid={characterIssues.length > 0} />
      <div className="pedigree-workspace p87-seven-workspace">
        <section className="panel tree-panel p86-tree-panel">
          <UnifiedLineageTree plan={plan} snapshot={snapshot} expanded={showDeep} selectedNodeId={selectedNodeId} onSelectNode={openNode} onChooseCharacter={nodeId => { setSelectedNodeId(null); setEditingNodeId(nodeId); }} onFactorChange={updateNodeFactor} onLockChange={(id, locked) => commitNode(() => setLineageLock(plan, id, locked))} onExpandedChange={setShowDeep} tools={<><button className="btn danger" onClick={clearLineage}>계보 비우기</button>{workspaceInputs && <><button className="btn" data-testid="p8-export-lineage-7" disabled={!validDate || characterIssues.length > 0} onClick={() => void exportLineage('seven')}>7인 계보 PNG</button><button className="btn" data-testid="p8-export-lineage-31" disabled={!validDate || characterIssues.length > 0} onClick={() => void exportLineage('full')}>31인 전체 계보 PNG</button></>}</>} />
          <div className="tree-actions"><p>7인 배치는 조부모와 연결된 혈통을 비교합니다.</p><button className="btn primary" disabled={!canArrange} data-testid="p86-arrange-preview" onClick={showArrangementPreview}>{showArrangements ? '배치 비교 접기' : '7인 배치안 보기 · 최대 6가지'}</button></div>
          <ActionNotice message={success} onDismiss={dismissSuccess} />
          {exportMessage && <p role="status">{exportMessage}</p>}
          {!selectedNodeId && announcement && <p role="alert">{announcement}</p>}
          {showArrangements && arrangements.length === 0 && storedArrangements?.signature === arrangementSignature && <p role="alert">동일 캐릭터 부모 제한과 고정 혈통을 만족하는 배치가 없습니다. 캐릭터 선택이나 고정을 확인하세요.</p>}
          {showArrangements && storedArrangements?.signature !== arrangementSignature && <p role="status" data-testid="p86-arrangement-stale">계보 또는 기준일이 바뀌었습니다. 배치안을 다시 만들어 주세요.</p>}
          {showArrangements && arrangements.length > 0 && <section className="arrangement-section"><h3>조부모 최대 6가지 배치</h3><p className="caption">기본 상성순으로 비교합니다. 조부모의 인자와 그 아래 혈통도 함께 이동하며 고정된 혈통은 보존합니다.</p><button className="btn" data-testid="p86-cancel-arrangement" onClick={() => { setStoredArrangements(null); setShowArrangements(false); setSuccess('배치 비교를 취소했습니다.'); }}>배치안 취소</button><ol className="arrangement-list">{arrangements.map((row, index) => <li key={row.arrangementId} data-testid="ref-arrangement"><div className="arrangement-heading"><strong>배치 {index + 1}</strong><b>{row.result.previewTotal ?? '—'}</b></div><p>A: {nameAt(row.pedigree, 'grandA1')} / {nameAt(row.pedigree, 'grandA2')}<br />B: {nameAt(row.pedigree, 'grandB1')} / {nameAt(row.pedigree, 'grandB2')}</p><button className="btn primary" disabled={row.result.status !== 'preview'} onClick={() => { if (storedArrangements?.signature !== arrangementSignature) return; onPlanChange(row.plan); setShowArrangements(false); setStoredArrangements(null); setSuccess('추천 계보를 적용했습니다.'); }}>참고 배치 {index + 1} 적용</button></li>)}</ol></section>}
        </section>

      </div>
      
    </main>
    {selectedNodeId && selectedSlot && <LineageNodeEditor key={selectedNodeId} nodeId={selectedNodeId} plan={plan} snapshot={snapshot} cutoffDate={cutoffDate} allowForecast={allowForecast} onClose={() => setSelectedNodeId(null)} onSelect={() => setEditingNodeId(selectedNodeId)} onClear={() => selectCostume(selectedNodeId, null)} onFactor={(factor) => updateNodeFactor(selectedNodeId, factor)} onLock={(locked) => commitNode(() => setLineageLock(plan, selectedNodeId, locked))} instancePanel={instancePanel} message={announcement} />}
    {editingNodeId && pickerSlot?.slotKey && <ReferencePicker selectionIssue={id => selectionIssue(editingNodeId, id)} slotKey={pickerSlot.slotKey} pedigree={calculationTree} snapshot={snapshot} cutoffDate={cutoffDate} includeUnknown={includeUnknown} allowForecast={allowForecast} allowUnverifiedFormula={allowUnverifiedFormula} onClose={() => setEditingNodeId(null)} onSelect={(id) => { selectCostume(editingNodeId, id); setEditingNodeId(null); }} />}
  </>;
}
