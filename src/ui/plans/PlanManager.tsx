import { useEffect, useRef, useState } from 'react';
import type { DataSnapshotIds, SavedPlan, WorkspaceInputs } from '../../domain/saved-plan';
import { getLineageSlots } from '../../domain/lineage';
import {
  createPlanRepository, createSavedPlan, duplicateSavedPlan, exportSavedPlan, MAX_IMPORT_BYTES,
  previewSavedPlanImport, updateSavedPlan, workspaceFingerprint,
  type PlanDataRegistry, type RestorePreview,
} from '../../engine/plan-persistence';
import './plans.css';

export interface PlanManagerProps {
  currentInputs: WorkspaceInputs;
  initialSkillDefaults?: Pick<WorkspaceInputs['skillSettings'], 'eventId' | 'scenarioId'>;
  appVersion: string;
  snapshotIds: DataSnapshotIds;
  registry: PlanDataRegistry | null;
  onRestore: (plan: SavedPlan) => void | Promise<void>;
  onCompare?: (left: SavedPlan, right: SavedPlan) => void;
  onActivePlanChange?: (plan: SavedPlan | null) => void;
  currentResultSnapshot?: SavedPlan['resultSnapshot'];
  presentationLabels?: { costumes: Record<string, string>; events: Record<string, string>; scenarios: Record<string, string> };
}

type Repository = ReturnType<typeof createPlanRepository>;
type StorageState = { repository: Repository | null; plans: SavedPlan[]; lastPlanId: string | null; error: string };
type PreviewState = { result: RestorePreview; source: 'saved' | 'import'; collisionResolved: boolean };
type Confirmation = { kind: 'overwrite' | 'import-overwrite' | 'delete'; plan: SavedPlan };
type NameDialog = { kind: 'save-as' | 'rename' | 'duplicate'; plan: SavedPlan | null; value: string };

function errorMessage(error: unknown) { return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'; }
// The selected detail panel is restored, but opening another panel is viewing,
// rather than editing a breeding plan. Full fingerprints still guard results.
function editableFingerprint(inputs: WorkspaceInputs) { return workspaceFingerprint({ ...inputs, selectedNodeId: null }); }
function openStorage(): StorageState {
  try {
    const repository = createPlanRepository(window.localStorage);
    return { repository, ...repository.read(), error: '' };
  } catch (error: unknown) {
    return { repository: null, plans: [], lastPlanId: null, error: errorMessage(error) };
  }
}
function downloadJson(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  const safeName = [...name].map((char) => char.charCodeAt(0) < 32 ? '_' : char).join('').replace(/[\\/:*?"<>|]/g, '_');
  link.download = `${safeName.slice(0, 100) || 'uma-plan'}.json`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function planSummary(plan: SavedPlan, labels?: PlanManagerProps['presentationLabels']) {
  const inputs = plan.inputs;
  const nodes = Object.values(inputs.referencePlan.nodes);
  const records = Object.values(inputs.whiteFactors.nodes).flatMap((node) => node.records);
  const instances = Object.values(inputs.factorInstances);
  const selectedInstances = instances.filter((instance) => instance.ownerCostumeId !== null);
  const costumeId = inputs.referencePlan.nodes[inputs.referencePlan.rootId]?.costumeId;
  return <><dl className="p8-plan-summary">
    <div><dt>계획</dt><dd>{plan.name}</dd></div>
    <div><dt>본육성 대상</dt><dd>{costumeId ? labels?.costumes[costumeId] ?? '캐릭터·의상 선택됨' : '미선택'}</dd></div>
    <div><dt>계보 입력</dt><dd>캐릭터 {getLineageSlots(inputs.referencePlan).filter(slot => slot.depth <= 2 && inputs.referencePlan.nodes[slot.nodeId]!.costumeId).length} / 7명 · 모브 24칸 · 적인자 {nodes.filter((node) => node.redFactor).length}개 · 잠금 {nodes.filter((node) => node.locked).length}개</dd></div>
    <div><dt>백인자</dt><dd>실제 보유 {records.filter((row) => row.status === 'owned').length}개 · 제작 목표 {records.filter((row) => row.status === 'planned').length}개</dd></div>
    <div><dt>인자 개체</dt><dd>{selectedInstances.length}개 · 혈통 재확인 {selectedInstances.filter((row) => row.bloodlineStatus === 'unconfirmed').length}개{instances.length > selectedInstances.length ? ` · 선택 해제 이력 ${instances.length - selectedInstances.length}개` : ''}</dd></div>
    <div><dt>대회 · 각질 · 시나리오</dt><dd>{labels?.events[inputs.skillSettings.eventId] ?? '대회명 확인 필요'} · {({ front: '도주', pace: '선행', late: '선입', end: '추입' })[inputs.skillSettings.runningStyle]} · {labels?.scenarios[inputs.skillSettings.scenarioId] ?? '시나리오 미정'}</dd></div>
    <div><dt>서포트 입력</dt><dd>본육성 {inputs.skillSettings.deck.filter((row) => row.supportId).length} / 6장 · 보유 {inputs.supportSettings.ownedSupports.length}장 · 대여 {inputs.supportSettings.allowBorrow ? '허용' : '금지'}</dd></div>
    <div><dt>수정일</dt><dd>{new Date(plan.updatedAt).toLocaleString('ko-KR')}</dd></div>
  </dl></>;
}

/** Manual, local-only persistence. Neither previews nor failed operations replace working inputs. */
export default function PlanManager(props: PlanManagerProps) {
  const [storage, setStorage] = useState(openStorage);
  const [selectedId, setSelectedId] = useState(() => storage.lastPlanId ?? storage.plans[0]?.planId ?? '');
  const [activePlan, setActivePlan] = useState<SavedPlan | null>(null);
  const [initialInputs] = useState(() => structuredClone(props.currentInputs));
  const [baseline, setBaseline] = useState(() => editableFingerprint(props.currentInputs));
  const [name, setName] = useState('새 육성 계획');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [busy, setBusy] = useState(false);
  const importSequence = useRef(0);
  const dialogElement = useRef<HTMLDivElement>(null);
  const fingerprint = workspaceFingerprint(props.currentInputs);
  // Initial P3 IDs arrive asynchronously. Only the known source defaults fill
  // initially empty IDs; a user's subsequently selected IDs never rewrite this
  // baseline. All other first-save edits remain visible as unsaved inputs.
  const initialBaseline = editableFingerprint({ ...initialInputs, skillSettings: { ...initialInputs.skillSettings,
    eventId: initialInputs.skillSettings.eventId || props.initialSkillDefaults?.eventId || '',
    scenarioId: initialInputs.skillSettings.scenarioId || props.initialSkillDefaults?.scenarioId || '',
  } });
  const dirty = editableFingerprint(props.currentInputs) !== (activePlan ? baseline : initialBaseline);
  const currentResult = props.currentResultSnapshot?.inputSignature === fingerprint
    && (['reference', 'p3', 'p5'] as const).every((kind) => props.currentResultSnapshot?.snapshotIds[kind] === props.snapshotIds[kind])
    ? props.currentResultSnapshot : undefined;
  const selectedPlan = storage.plans.find((plan) => plan.planId === selectedId) ?? null;
  const storedActive = activePlan ? storage.plans.find((plan) => plan.planId === activePlan.planId) ?? null : null;
  const collision = preview?.source === 'import' && preview.result.plan && !preview.collisionResolved
    ? storage.plans.find((plan) => plan.planId === preview.result.plan?.planId) : null;
  const dialogOpen = confirmation !== null || nameDialog !== null;

  useEffect(() => {
    if (!dialogOpen) return;
    dialogElement.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    dialogElement.current?.querySelector<HTMLInputElement | HTMLButtonElement>('input, button')?.focus({ preventScroll: true });
  }, [dialogOpen]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function fail(cause: unknown) { setError(errorMessage(cause)); setMessage(''); }
  function refresh(repository: Repository, selection?: string) {
    const next = repository.read();
    setStorage({ repository, ...next, error: '' });
    if (selection !== undefined) setSelectedId(selection);
    else if (!next.plans.some((plan) => plan.planId === selectedId)) setSelectedId(next.lastPlanId ?? next.plans[0]?.planId ?? '');
  }
  function repository() {
    if (!storage.repository) throw new Error('브라우저 저장소에 접근할 수 없습니다. 현재 입력은 JSON으로 내보낼 수 있습니다.');
    return storage.repository;
  }
  function setActive(plan: SavedPlan) {
    setActivePlan(plan); setName(plan.name); setBaseline(editableFingerprint(plan.inputs));
    props.onActivePlanChange?.(plan);
  }
  function makeCurrent(planName: string) {
    return createSavedPlan(props.currentInputs, { name: planName, appVersion: props.appVersion, snapshotIds: props.snapshotIds }, { resultSnapshot: currentResult });
  }
  function validateForStorage(plan: SavedPlan) {
    if (!props.registry) throw new Error('게임 ID 대조 자료를 준비한 뒤 저장할 수 있습니다. 지금 입력은 JSON으로 백업할 수 있습니다.');
    const checked = previewSavedPlanImport(exportSavedPlan(plan), props.registry, props.snapshotIds);
    if (!checked.canApply) throw new Error(`복원 가능한 계획인지 확인하지 못해 저장하지 않았습니다. ${checked.issues.filter((issue) => issue.blocking).slice(0, 3).map((issue) => `${issue.message} (${issue.path})`).join(' / ')} 현재 입력은 JSON으로 백업할 수 있습니다.`);
    return plan;
  }
  function saveNew(planName: string) {
    try {
      const plan = validateForStorage(makeCurrent(planName));
      const store = repository(); store.save(plan); refresh(store, plan.planId);
      setActive(plan); setError(''); setMessage('현재 입력을 새 계획으로 저장했습니다.');
      setNameDialog(null);
    } catch (cause: unknown) { fail(cause); }
  }
  function prepareOverwrite() {
    if (!storedActive) return;
    try {
      setConfirmation({ kind: 'overwrite', plan: validateForStorage(updateSavedPlan(storedActive, props.currentInputs, { appVersion: props.appVersion, snapshotIds: props.snapshotIds, resultSnapshot: currentResult ?? null })) });
      setError('');
    } catch (cause: unknown) { fail(cause); }
  }
  function confirmAction() {
    if (!confirmation) return;
    try {
      const store = repository();
      if (confirmation.kind === 'delete') {
        store.remove(confirmation.plan.planId); refresh(store);
        if (activePlan?.planId === confirmation.plan.planId) { setActivePlan(null); props.onActivePlanChange?.(null); }
        if (preview?.result.plan?.planId === confirmation.plan.planId) setPreview(null);
        setMessage('저장 계획을 삭제했습니다. 현재 작업 입력은 유지됩니다.');
      } else {
        store.save(confirmation.plan, { overwrite: true }); refresh(store, confirmation.plan.planId);
        if (confirmation.kind === 'overwrite') {
          setActive(confirmation.plan); setMessage('확인한 현재 입력으로 계획을 덮어썼습니다.');
        } else {
          setPreview((previous) => previous ? { ...previous, collisionResolved: true } : previous);
          setMessage('가져온 계획으로 저장본을 덮어썼습니다. 현재 작업에는 아직 적용하지 않았습니다.');
        }
      }
      setConfirmation(null); setError('');
    } catch (cause: unknown) { fail(cause); }
  }
  function submitNameDialog() {
    if (!nameDialog) return;
    if (nameDialog.kind === 'save-as') { saveNew(nameDialog.value); return; }
    if (!nameDialog.plan) return;
    try {
      const store = repository();
      if (nameDialog.kind === 'rename') {
        store.rename(nameDialog.plan.planId, nameDialog.value); refresh(store);
        if (activePlan?.planId === nameDialog.plan.planId) {
          const renamed = { ...activePlan, name: nameDialog.value.trim() };
          setActivePlan(renamed); setName(renamed.name); props.onActivePlanChange?.(renamed);
        }
        setMessage('계획 이름을 변경했습니다. 입력 내용은 유지됩니다.');
      } else {
        const copy = validateForStorage(duplicateSavedPlan(nameDialog.plan, nameDialog.value));
        store.save(copy); refresh(store, copy.planId);
        setMessage('저장 계획을 독립된 사본으로 복제했습니다. 현재 작업에는 적용하지 않았습니다.');
      }
      setNameDialog(null); setError('');
    } catch (cause: unknown) { fail(cause); }
  }
  function previewPlan(plan: SavedPlan, source: PreviewState['source']) {
    if (!props.registry) { fail(new Error('게임 ID 대조 자료를 불러온 뒤 복원할 수 있습니다.')); return; }
    const result = previewSavedPlanImport(exportSavedPlan(plan), props.registry, props.snapshotIds);
    setPreview({ result, source, collisionResolved: source === 'saved' }); setError(''); setMessage('검증 결과를 확인한 뒤 적용해 주세요. 현재 입력은 유지됩니다.');
  }
  async function importFile(file: File) {
    const sequence = ++importSequence.current;
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(`계획 파일은 ${MAX_IMPORT_BYTES / 1024 / 1024}MB 이하여야 합니다.`);
      if (!props.registry) throw new Error('게임 ID 대조 자료를 불러온 뒤 가져올 수 있습니다.');
      const raw = await file.text();
      if (sequence !== importSequence.current) return;
      const result = previewSavedPlanImport(raw, props.registry, props.snapshotIds);
      setPreview({ result, source: 'import', collisionResolved: false });
      setMessage(result.canApply ? '파일을 검증했습니다. 아직 현재 작업에 적용하지 않았습니다.' : '파일에 확인할 문제가 있습니다. 현재 작업은 유지됩니다.');
    } catch (cause: unknown) { if (sequence === importSequence.current) fail(cause); }
    finally { if (sequence === importSequence.current) setBusy(false); }
  }
  function cloneImported() {
    const plan = preview?.result.plan;
    if (!plan || !props.registry) return;
    try {
      const clone = duplicateSavedPlan(plan, `${plan.name} (가져온 사본)`);
      setPreview({ source: 'import', collisionResolved: true, result: previewSavedPlanImport(exportSavedPlan(clone), props.registry, props.snapshotIds) });
      setMessage('새 계획 ID로 복제했습니다. 같은 실물 인자의 개체 ID는 유지합니다.'); setError('');
    } catch (cause: unknown) { fail(cause); }
  }
  function storeImported() {
    const plan = preview?.result.plan;
    if (!plan || !preview.result.canApply || collision) return;
    try {
      const store = repository(); store.save(plan); refresh(store, plan.planId);
      setPreview({ ...preview, source: 'saved', collisionResolved: true });
      setMessage('파일의 계획을 저장했습니다. 현재 작업에는 아직 적용하지 않았습니다.'); setError('');
    } catch (cause: unknown) { fail(cause); }
  }
  async function applyRestore() {
    if (!preview?.result.plan || !preview.result.canApply || collision || !props.registry) return;
    // Revalidate immediately before the only callback that can replace working inputs.
    const verified = previewSavedPlanImport(exportSavedPlan(preview.result.plan), props.registry, props.snapshotIds);
    if (!verified.canApply || !verified.plan) { setPreview({ ...preview, result: verified }); return; }
    setBusy(true);
    try {
      if (storage.repository && storage.plans.some((plan) => plan.planId === verified.plan!.planId)) {
        storage.repository.setLastPlan(verified.plan.planId);
        refresh(storage.repository, verified.plan.planId);
      }
      await props.onRestore(verified.plan);
      setActive(verified.plan); setPreview(null); setError('');
      setMessage('검증된 입력을 함께 복원했습니다. 이전 추천 결과는 무효화하며 현재 데이터로 다시 계산합니다.');
    } catch (cause: unknown) { fail(cause); }
    finally { setBusy(false); }
  }
  function exportCurrent() {
    try {
      const plan = activePlan ? updateSavedPlan(activePlan, props.currentInputs, { name, appVersion: props.appVersion, snapshotIds: props.snapshotIds, resultSnapshot: currentResult ?? null }) : makeCurrent(name);
      downloadJson(exportSavedPlan(plan), plan.name);
      setError(''); setMessage('현재 입력의 JSON 다운로드를 요청했습니다. 브라우저의 다운로드 목록에서 파일을 확인할 수 있습니다.');
    } catch (cause: unknown) { fail(cause); }
  }
  function compare() {
    const left = storage.plans.find((plan) => plan.planId === leftId);
    const right = storage.plans.find((plan) => plan.planId === rightId);
    if (!left || !right || left.planId === right.planId || !props.registry || !props.onCompare) return;
    const leftPreview = previewSavedPlanImport(exportSavedPlan(left), props.registry, props.snapshotIds);
    const rightPreview = previewSavedPlanImport(exportSavedPlan(right), props.registry, props.snapshotIds);
    if (!leftPreview.canApply || !rightPreview.canApply) { fail(new Error('비교할 계획의 ID 또는 참조에 확인할 문제가 있습니다. 각 계획의 복원 요약에서 검증 결과를 확인해 주세요.')); return; }
    props.onCompare(left, right); setError('');
  }

  return <section className="panel p8-plan-manager" data-testid="p8-plan-manager" aria-label="육성 계획 저장과 복원">
    <div className="p8-plan-heading"><div><p className="eyebrow">나의 육성 계획</p><h2>육성 계획 저장·복원</h2></div><span data-testid="p8-dirty-status" className={dirty ? 'p8-unsaved' : 'p8-save-state'}>{dirty ? '미저장 변경 있음' : storedActive ? '저장한 입력과 같음' : activePlan ? '파일에서 복원 · 브라우저 미저장' : '저장 전 계획'}</span></div>
    <p className="p8-plan-note">이 브라우저에 수동 저장합니다. JSON 파일은 다른 브라우저에서도 가져올 수 있으며 외부 서버로 보내지 않습니다.</p>
    {activePlan && <p className="p8-active-plan" data-testid="p8-active-plan">현재 작업: <strong>{activePlan.name}</strong></p>}
    {storage.error && <div className="p8-plan-error" role="alert"><p>저장 목록을 읽지 못했습니다: {storage.error}</p><p>현재 입력은 JSON 파일로 백업할 수 있습니다.</p><button type="button" className="btn" data-testid="p8-retry-storage" onClick={() => { const next = openStorage(); setStorage(next); if (!next.error) { setSelectedId(next.lastPlanId ?? next.plans[0]?.planId ?? ''); setError(''); } }}>저장소 다시 확인</button></div>}
    {error && <p className="p8-plan-error" role="alert" data-testid="p8-plan-error">{error}</p>}
    {message && <p className="p8-plan-message" role="status" data-testid="p8-plan-message">{message}</p>}
    <div className="p8-save-controls"><label>현재 계획 이름<input data-testid="p8-plan-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="p8-plan-actions">
      <button type="button" className="btn btn-primary" data-testid="p8-save-new" disabled={busy} onClick={() => saveNew(name)}>새 계획 저장</button>
      <button type="button" className="btn" data-testid="p8-save-overwrite" disabled={busy || !storedActive} onClick={prepareOverwrite}>현재 저장본 덮어쓰기</button>
      <button type="button" className="btn" data-testid="p8-save-as" disabled={busy} onClick={() => setNameDialog({ kind: 'save-as', plan: null, value: `${name} (사본)` })}>다른 이름으로 저장</button>
      <button type="button" className="btn" data-testid="p8-export-json" disabled={busy} onClick={exportCurrent}>현재 입력 JSON 내보내기</button>
    </div></div>
    <div className="p8-saved-list"><h3>저장된 계획 {storage.plans.length}개</h3><label>저장 계획 선택<select data-testid="p8-plan-select" value={selectedPlan?.planId ?? ''} onChange={(event) => setSelectedId(event.target.value)}><option value="">계획을 선택하세요</option>{storage.plans.map((plan) => <option key={plan.planId} value={plan.planId}>{plan.name} · {new Date(plan.updatedAt).toLocaleDateString('ko-KR')}</option>)}</select></label>
      {storage.lastPlanId && storage.plans.some((plan) => plan.planId === storage.lastPlanId) && <button type="button" className="btn p8-last-plan" data-testid="p8-last-plan-preview" disabled={busy || !props.registry} onClick={() => previewPlan(storage.plans.find((plan) => plan.planId === storage.lastPlanId)!, 'saved')}>마지막 계획 복원 요약</button>}
      {selectedPlan && <><div className="p8-selected-summary">{planSummary(selectedPlan, props.presentationLabels)}</div><div className="p8-plan-actions">
        <button type="button" className="btn btn-primary" data-testid="p8-load-preview" disabled={busy || !props.registry} onClick={() => previewPlan(selectedPlan, 'saved')}>불러오기 요약</button>
        <button type="button" className="btn" data-testid="p8-rename-plan" disabled={busy} onClick={() => setNameDialog({ kind: 'rename', plan: selectedPlan, value: selectedPlan.name })}>이름 변경</button>
        <button type="button" className="btn" data-testid="p8-clone-plan" disabled={busy} onClick={() => setNameDialog({ kind: 'duplicate', plan: selectedPlan, value: `${selectedPlan.name} (사본)` })}>저장 계획 복제</button>
        <button type="button" className="btn" data-testid="p8-export-saved-json" disabled={busy} onClick={() => { try { downloadJson(exportSavedPlan(selectedPlan), selectedPlan.name); setMessage('선택한 저장 계획의 JSON 다운로드를 요청했습니다.'); setError(''); } catch (cause: unknown) { fail(cause); } }}>저장본 JSON</button>
        <button type="button" className="btn p8-danger-button" data-testid="p8-delete-plan" disabled={busy} onClick={() => setConfirmation({ kind: 'delete', plan: selectedPlan })}>삭제</button>
      </div></>}
    </div>
    <div className="p8-import-controls"><label>계획 JSON 가져오기<input type="file" accept=".json,application/json" data-testid="p8-import-json" disabled={busy || !props.registry} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} /></label><p>최대 {MAX_IMPORT_BYTES / 1024 / 1024}MB · 파일을 검사한 뒤 요약과 적용 버튼을 표시합니다.</p>{!props.registry && <p role="status">게임 ID 대조 자료를 준비하고 있습니다. JSON 백업은 사용할 수 있습니다.</p>}</div>
    {preview && <div className="p8-restore-preview" data-testid="p8-restore-preview"><h3>{preview.source === 'import' ? '가져온 파일 검증' : '저장 계획 복원 요약'}</h3>
      {preview.result.plan && planSummary(preview.result.plan, props.presentationLabels)}
      {preview.result.snapshotChanges.length > 0 && <div className="p8-plan-note" data-testid="p8-snapshot-change"><p>저장 당시와 게임 데이터 버전이 다릅니다. 저장한 입력은 보존하며 현재 데이터와 규칙으로 다시 계산합니다.</p></div>}
      {preview.result.issues.length > 0 && <ul className="p8-validation-issues" data-testid="p8-validation-issues">{preview.result.issues.map((issue, index) => <li key={`${issue.code}-${issue.path}-${index}`} className={issue.blocking ? 'p8-blocking-issue' : ''}><strong>{issue.blocking ? '복원 차단' : '확인'}: {issue.message}</strong></li>)}</ul>}
      {!preview.result.canApply && <p className="p8-plan-error">검증을 통과하지 못해 적용할 수 없습니다. 현재 작업은 유지됩니다.</p>}
      {collision && <div className="p8-collision" data-testid="p8-plan-id-collision"><p>같은 계획 ID의 저장본이 있습니다. 새 계획 복제 또는 기존 저장본 덮어쓰기를 선택해 주세요.</p><div className="p8-plan-actions"><button type="button" className="btn" data-testid="p8-import-clone" disabled={!preview.result.canApply} onClick={cloneImported}>새 계획으로 복제</button><button type="button" className="btn p8-danger-button" data-testid="p8-import-overwrite" disabled={!preview.result.canApply || !storage.repository} onClick={() => setConfirmation({ kind: 'import-overwrite', plan: preview.result.plan! })}>기존 ID 덮어쓰기</button></div></div>}
      <p className="p8-restore-warning">적용하면 현재 작업 입력 전체를 이 계획으로 바꿉니다.{dirty ? ' 미저장 변경 사항이 있습니다.' : ''} 현재 입력을 보관하려면 먼저 저장하거나 JSON으로 내보내 주세요.</p>
      <div className="p8-plan-actions"><button type="button" className="btn btn-primary" data-testid="p8-apply-restore" disabled={busy || !preview.result.canApply || !!collision} onClick={() => void applyRestore()}>확인 · 현재 작업에 함께 적용</button>
        {preview.source === 'import' && <button type="button" className="btn" data-testid="p8-save-import" disabled={busy || !preview.result.canApply || !!collision || !storage.repository} onClick={storeImported}>가져온 계획 저장</button>}
        <button type="button" className="btn" data-testid="p8-export-import-backup" onClick={() => downloadJson(preview.result.rawBackup, '가져온-원본-백업')}>원본 JSON 보관</button><button type="button" className="btn" data-testid="p8-cancel-restore" disabled={busy} onClick={() => setPreview(null)}>닫기 · 현재 작업 유지</button></div>
    </div>}
    {props.onCompare && <div className="p8-compare-selector"><h3>저장 계획 비교</h3><div><label>왼쪽 계획<select data-testid="p8-compare-left" value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="">선택하세요</option>{storage.plans.map((plan) => <option key={plan.planId} value={plan.planId}>{plan.name}</option>)}</select></label><label>오른쪽 계획<select data-testid="p8-compare-right" value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="">선택하세요</option>{storage.plans.map((plan) => <option key={plan.planId} value={plan.planId}>{plan.name}</option>)}</select></label><button type="button" className="btn" data-testid="p8-compare-plans" disabled={busy || !props.registry || !leftId || !rightId || leftId === rightId} onClick={compare}>두 계획 비교</button></div><p>현재 데이터로 다시 계산합니다. 서로 다른 대회 조건의 점수는 참고 비교로 구분합니다.</p></div>}
    {nameDialog && <div ref={dialogElement} className="p8-action-dialog" role="dialog" aria-label={nameDialog.kind === 'rename' ? '계획 이름 변경' : nameDialog.kind === 'duplicate' ? '저장 계획 복제' : '다른 이름으로 저장'}><h3>{nameDialog.kind === 'rename' ? '계획 이름 변경' : nameDialog.kind === 'duplicate' ? '저장 계획 복제' : '다른 이름으로 저장'}</h3><label>계획 이름<input data-testid="p8-action-name" value={nameDialog.value} maxLength={120} onChange={(event) => setNameDialog({ ...nameDialog, value: event.target.value })} /></label><div className="p8-plan-actions"><button type="button" className="btn btn-primary" data-testid="p8-confirm-name" onClick={submitNameDialog}>확인</button><button type="button" className="btn" onClick={() => setNameDialog(null)}>취소</button></div></div>}
    {confirmation && <div ref={dialogElement} className="p8-action-dialog" role="alertdialog" aria-label={confirmation.kind === 'delete' ? '저장 계획 삭제 확인' : '계획 덮어쓰기 확인'}><h3>{confirmation.kind === 'delete' ? '저장 계획을 삭제할까요?' : '저장 계획을 덮어쓸까요?'}</h3><p><strong>{confirmation.plan.name}</strong></p><p>{confirmation.kind === 'delete' ? '브라우저의 저장본을 삭제합니다. 현재 작업 입력은 유지되며 삭제한 저장본은 되돌릴 수 없습니다.' : '선택한 저장본을 확인한 입력으로 교체합니다. 이전 저장본을 보관하려면 취소 후 JSON을 내려받거나 복제해 주세요.'}</p><div className="p8-plan-actions"><button type="button" className="btn p8-danger-button" data-testid="p8-confirm-action" onClick={confirmAction}>{confirmation.kind === 'delete' ? '확인 · 삭제' : '확인 · 덮어쓰기'}</button><button type="button" className="btn" data-testid="p8-cancel-action" onClick={() => setConfirmation(null)}>취소</button></div></div>}
  </section>;
}
