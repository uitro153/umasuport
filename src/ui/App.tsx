import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEmptyPedigree } from '../domain/pedigree';
import { extractPedigree, updateLineageFromPedigree, type LineagePlan } from '../domain/lineage';
import { createEmptyLineageSkills, type LineageSkillState } from '../domain/lineage-skills';
import { createDefaultWorkspace, reconcileWorkspaceLineage, synchronizeFactorInstances, workspaceFingerprint, type PlanDataRegistry } from '../engine/plan-persistence';
import type { SavedPlan, SavedResultSnapshot, WorkspaceInputs } from '../domain/saved-plan';
import type { UserSkillPriority } from '../engine/skill-priorities';
import type { SkillEvaluationRequest } from '../engine/skill-evaluation';
import LineageSkillPanel from './lineage/LineageSkillPanel';
import FactorInstanceEditor from './plans/FactorInstanceEditor';
import PlanManager from './plans/PlanManager';
import PlanComparison from './plans/PlanComparison';
import { pedigreeSnapshot } from '../data/pedigree-data';
import { loadLocalReference } from '../data/local-reference';
import { loadLocalSkillSupport } from '../data/local-skill-support';
import { loadLocalP5Forecast } from '../data/local-p5-forecast';
import { mergeP5Tournaments, type P5Snapshot } from '../domain/p5-forecast';
import type { P3Snapshot } from '../domain/skill-support';
import type { ReferenceSnapshot } from '../domain/reference';
import type { DeepReadonly } from '../data/snapshot';
import { resolveEvaluationContext, type EvaluationMode } from '../engine/availability';
import DataDiagnostics from './DataDiagnostics';
import PedigreePage from './pedigree/PedigreePage';
import ReferencePage from './reference/ReferencePage';
import packageInfo from '../../package.json';
import { lineageEditIssue } from '../engine/lineage-validity';
import ThemeToggle from './ThemeToggle';
import SiteFooter from './SiteFooter';
import './pedigree/pedigree.css';

const SkillAnalysisPage = lazy(() => import('./skills/SkillAnalysisPage'));
const today = () => resolveEvaluationContext({ mode: 'current', now: new Date() }).cutoffDate;
function initializeSkillDefaults(inputs: WorkspaceInputs, snapshot: DeepReadonly<P3Snapshot>): WorkspaceInputs {
  if (inputs.skillSettings.eventId && inputs.skillSettings.scenarioId) return inputs;
  const defaults = createDefaultWorkspace(snapshot, today()).skillSettings;
  return { ...inputs, skillSettings: { ...inputs.skillSettings,
    eventId: inputs.skillSettings.eventId || defaults.eventId, scenarioId: inputs.skillSettings.scenarioId || defaults.scenarioId } };
}

export default function App() {
  const [initialView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'data' && import.meta.env.DEV ? 'data' : requested === 'skills' && import.meta.env.DEV ? 'skills-loading' : requested === 'fixture' || !import.meta.env.DEV ? 'pedigree' : 'loading';
  });
  const [view, setView] = useState(initialView);
  const [pedigree, setPedigree] = useState(createEmptyPedigree);
  const [mode, setMode] = useState<EvaluationMode>('tournament');
  const [eventId, setEventId] = useState(pedigreeSnapshot.tournaments[0]?.eventId ?? '');
  const [workspace, setWorkspace] = useState(() => createDefaultWorkspace(undefined, today()));
  const [epoch, setEpoch] = useState(0);
  const epochRef = useRef(0);
  const [reference, setReference] = useState<DeepReadonly<ReferenceSnapshot> | null>(null);
  const [nodePanelOpen, setNodePanelOpen] = useState(false);
  const [instanceNodeId, setInstanceNodeId] = useState<string | null>(null);
  const [nodeRunToken, setNodeRunToken] = useState(0);
  const [runNodeId, setRunNodeId] = useState<string | null>(null);
  const [skillContext, setSkillContext] = useState<SkillEvaluationRequest | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [skills, setSkills] = useState<DeepReadonly<P3Snapshot> | null>(null);
  const [skillsError, setSkillsError] = useState('');
  const [p5, setP5] = useState<DeepReadonly<P5Snapshot> | null>(null);
  const [p5Ready, setP5Ready] = useState(false);
  const acceptP5 = useCallback((value: DeepReadonly<P5Snapshot> | null) => { setP5(value); setP5Ready(true); }, []);
  const [sourcesReady, setSourcesReady] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState('');
  const [activePlan, setActivePlan] = useState<SavedPlan | null>(null);
  const [comparison, setComparison] = useState<[SavedPlan, SavedPlan] | null>(null);
  const [currentResultSnapshot, setCurrentResultSnapshot] = useState<SavedResultSnapshot | undefined>();
  const initialSkillDefaults = useMemo(() => skills ? createDefaultWorkspace(skills, today()).skillSettings : undefined, [skills]);
  const receiveResultSnapshot = useCallback((value: SavedResultSnapshot | undefined) => {
    if (epoch === epochRef.current) setCurrentResultSnapshot(value);
  }, [epoch]);
  const { referencePlan, whiteFactors, selectedNodeId, globalPriorities } = workspace;
  const snapshotIds = useMemo(() => ({ reference: reference?.snapshotId ?? null, p3: skills?.snapshotId ?? null, p5: p5?.snapshotId ?? null }), [reference, skills, p5]);
  const registry = useMemo<PlanDataRegistry | null>(() => reference && skills && sourcesReady ? {
    costumeIds: reference.costumes.map(item => item.costumeId), skillIds: skills.skills.map(item => item.skillId),
    supportIds: skills.supports.map(item => item.supportId), scenarioIds: skills.scenarios.map(item => item.scenarioId),
    eventIds: p5 ? mergeP5Tournaments(skills, p5).map(item => item.eventId) : skills.tournaments.map(item => item.eventId), skillData: skills,
  } : null, [reference, skills, p5, sourcesReady]);

  useEffect(() => {
    if (initialView !== 'loading' && initialView !== 'skills-loading') return;
    let active = true;
    if (initialView === 'skills-loading') {
      void loadLocalSkillSupport().then(snapshot => {
        if (active) { setSkills(snapshot); setWorkspace(previous => initializeSkillDefaults(previous, snapshot)); setView(previous => previous === 'skills-loading' ? 'skills' : previous); }
      }).catch((error: unknown) => {
        if (active) { setSkillsError(error instanceof Error ? error.message : 'P3 자료를 불러올 수 없습니다.'); setView(previous => previous === 'skills-loading' ? 'pedigree' : previous); }
      });
    } else {
      void loadLocalReference().then(snapshot => { if (active) { setReference(snapshot); setView(previous => previous === 'loading' ? 'reference' : previous); } })
        .catch(() => { if (active) { setReferenceError('로컬 자료를 불러올 수 없어 가상 검증 화면을 표시합니다.'); setView(previous => previous === 'loading' ? 'pedigree' : previous); } });
    }
    return () => { active = false; };
  }, [initialView]);

  async function openReference() {
    if (reference) { setView('reference'); return; }
    setReferenceLoading(true); setReferenceError('');
    try { setReference(await loadLocalReference()); setView('reference'); }
    catch (error: unknown) { setReferenceError(error instanceof Error ? error.message : '로컬 자료를 불러올 수 없습니다.'); }
    finally { setReferenceLoading(false); }
  }
  async function openSkills() {
    setSkillsError('');
    if (skills) { setView('skills'); return; }
    setView('skills-loading');
    try { const snapshot = await loadLocalSkillSupport(); setSkills(snapshot); setWorkspace(previous => initializeSkillDefaults(previous, snapshot)); setView(previous => previous === 'skills-loading' ? 'skills' : previous); }
    catch (error: unknown) { setSkillsError(error instanceof Error ? error.message : 'P3 자료를 불러올 수 없습니다.'); setView(previous => previous === 'skills-loading' ? reference ? 'reference' : 'pedigree' : previous); }
  }
  async function openPlans() {
    setView('plans');
    if (sourcesReady || sourcesLoading) return;
    setSourcesLoading(true); setSourcesError('');
    try {
      const [ref, source] = await Promise.all([reference ?? loadLocalReference(), skills ?? loadLocalSkillSupport()]);
      setReference(ref); setSkills(source); setWorkspace(previous => initializeSkillDefaults(previous, source));
      acceptP5(p5Ready ? p5 : await loadLocalP5Forecast(source)); setSourcesReady(true);
    } catch (error: unknown) { setSourcesError(error instanceof Error ? error.message : '게임 ID 대조 자료를 확인하지 못했습니다. JSON 백업과 로컬 목록은 계속 사용할 수 있습니다.'); }
    finally { setSourcesLoading(false); }
  }
  function changeReferencePlan(next: LineagePlan) {
    const issue = reference && lineageEditIssue(referencePlan, next, reference);
    if (issue) throw new Error(issue);
    // Validate synchronously so the initiating editor can show a useful error.
    // Throwing inside React's deferred state updater would tear down the page.
    const reconciled = reconcileWorkspaceLineage(workspace, next);
    setWorkspace(reconciled);
  }
  function setWhiteFactors(next: LineageSkillState) { setWorkspace(previous => ({ ...previous, whiteFactors: next, factorInstances: synchronizeFactorInstances(previous.referencePlan, next, previous.factorInstances) })); }
  function setSelectedNodeId(nodeId: string | null) { setWorkspace(previous => ({ ...previous, selectedNodeId: nodeId })); setNodePanelOpen(nodeId !== null); }
  function setGlobalPriorities(priorities: UserSkillPriority[]) { setWorkspace(previous => ({ ...previous, globalPriorities: priorities })); }
  function recommendForNode() { setRunNodeId(selectedNodeId); setNodeRunToken(value => value + 1); setView('skills'); }
  function restorePlan(plan: SavedPlan) {
    // Validation and preview precede this one atomic input replacement.
    epochRef.current += 1;
    setWorkspace(structuredClone(plan.inputs)); setEpoch(epochRef.current);
    setNodeRunToken(0); setRunNodeId(null); setNodePanelOpen(false); setInstanceNodeId(null); setSkillContext(null); setCurrentResultSnapshot(undefined);
    setComparison(null); setView('plans');
  }
  const title = activePlan?.name ?? '작업 중인 육성 계획';
  return <>
    <nav className="shell p8-navigation" aria-label="육성 계획 관리"><button className="btn" onClick={() => void openPlans()}>저장·복원·비교</button><span>{title}</span><ThemeToggle /></nav>
    {skillsError && <div className="shell"><p role="alert">{skillsError}</p></div>}
    {(view === 'loading' || view === 'skills-loading') && <main className="shell"><p role="status">계산 데이터를 불러오는 중입니다.</p></main>}
    <div hidden={view !== 'plans'} className="shell p8-workspace">
      <div className="p8-plan-navigation"><button className="btn" onClick={() => void openReference()}>계보 화면으로</button><button className="btn" onClick={() => void openSkills()}>스킬·서포트 화면으로</button></div>
      {sourcesLoading && <p role="status">현재 게임 ID·버전을 대조할 자료를 불러오는 중입니다.</p>}
      {sourcesError && <p role="alert">{sourcesError} 저장·파일 백업은 브라우저에서 수행하며 외부 서버에 전송하지 않습니다.</p>}
      <div hidden={sourcesLoading}><PlanManager currentInputs={workspace} initialSkillDefaults={initialSkillDefaults} appVersion={packageInfo.version} snapshotIds={snapshotIds} registry={registry} onRestore={restorePlan}
        presentationLabels={{ costumes: Object.fromEntries(reference?.costumes.map(row => [row.costumeId, row.displayName]) ?? []), events: Object.fromEntries((skills ? p5 ? mergeP5Tournaments(skills, p5) : skills.tournaments : []).map(row => [row.eventId, row.name])), scenarios: Object.fromEntries(skills?.scenarios.map(row => [row.scenarioId, row.displayName]) ?? []) }}
        onActivePlanChange={setActivePlan} onCompare={(left, right) => setComparison([left, right])} currentResultSnapshot={currentResultSnapshot?.inputSignature === workspaceFingerprint(workspace) ? currentResultSnapshot : undefined} /></div>
      {comparison && reference && skills && <PlanComparison key={comparison[0].planId + ':' + comparison[0].updatedAt + ':' + comparison[1].planId + ':' + comparison[1].updatedAt} left={comparison[0]} right={comparison[1]} snapshot={skills} reference={reference} p5={p5} onClose={() => setComparison(null)} />}
    </div>
    {skills && <div hidden={view !== 'skills'}><Suspense fallback={<main className="shell"><p role="status">스킬 평가 화면을 불러오는 중입니다.</p></main>}><SkillAnalysisPage key={epoch} snapshot={skills} onPedigree={() => void openReference()}
      forecastPack={p5Ready ? p5 : undefined} onForecastPack={acceptP5}
      settings={workspace.skillSettings} onSettingsChange={value => setWorkspace(previous => ({ ...previous, skillSettings: value }))}
      supportSettings={workspace.supportSettings} onSupportSettingsChange={value => setWorkspace(previous => ({ ...previous, supportSettings: value }))}
      workspaceInputs={workspace} snapshotIds={snapshotIds} planTitle={title} onResultSnapshot={receiveResultSnapshot}
      nodeEditor={view === 'skills' && nodePanelOpen && selectedNodeId ? <><FactorInstanceEditor key={`instance:${selectedNodeId}`} inputs={workspace} nodeId={selectedNodeId} costumeName={reference?.costumes.find(row => row.costumeId === referencePlan.nodes[selectedNodeId]?.costumeId)?.displayName} onChange={setWorkspace} />
        <LineageSkillPanel key={`skills:${selectedNodeId}`} plan={referencePlan} nodeId={selectedNodeId} snapshot={skills} referenceSnapshot={reference} state={whiteFactors} onChange={setWhiteFactors} globalPriorities={globalPriorities} request={skillContext} onRecommend={recommendForNode} onClose={() => setNodePanelOpen(false)}
          unconfirmedNodeIds={Object.entries(workspace.factorInstances).filter(([, value]) => value.bloodlineStatus === 'unconfirmed').map(([id]) => id)} /></> : null}
      lineage={{ plan: referencePlan, reference, whiteFactors, selectedNodeId, onSelectNode: setSelectedNodeId, onWhiteFactorsChange: setWhiteFactors, globalPriorities, onGlobalPrioritiesChange: setGlobalPriorities, runToken: nodeRunToken, runNodeId, onAnalysisRequest: setSkillContext, onRunNode: recommendForNode,
        unconfirmedNodeIds: Object.entries(workspace.factorInstances).filter(([, value]) => value.bloodlineStatus === 'unconfirmed').map(([id]) => id),
        onEditNode: () => setNodePanelOpen(true) }} /></Suspense></div>}
    {view === 'reference' && reference && <ReferencePage key={epoch} snapshot={reference} pedigree={extractPedigree(referencePlan)} onChange={next => changeReferencePlan(updateLineageFromPedigree(referencePlan, next))}
      plan={referencePlan} onPlanChange={changeReferencePlan} onFixture={() => setView('pedigree')} onSkills={openSkills} onNodeInstance={setInstanceNodeId}
      filters={workspace.referenceFilters} onFiltersChange={value => setWorkspace(previous => ({ ...previous, referenceFilters: value }))}
      workspaceInputs={workspace} snapshotIds={snapshotIds} planTitle={title}
      onResetSkills={() => { setWorkspace(previous => ({ ...previous, whiteFactors: createEmptyLineageSkills(), factorInstances: Object.values(previous.referencePlan.nodes).some(node => node.costumeId !== null) ? previous.factorInstances : {}, selectedNodeId: null })); setNodePanelOpen(false); setInstanceNodeId(null); }}
      instancePanel={instanceNodeId ? <div data-testid="p85-lineage-instance-details"><FactorInstanceEditor key={`reference-instance:${instanceNodeId}`} inputs={workspace} nodeId={instanceNodeId} costumeName={reference.costumes.find(row => row.costumeId === referencePlan.nodes[instanceNodeId]?.costumeId)?.displayName} onChange={setWorkspace} /></div> : null} />}
    {import.meta.env.DEV && view === 'data' && <DataDiagnostics onShowPedigree={() => setView(reference ? 'reference' : 'pedigree')} />}
    {view === 'pedigree' && <PedigreePage pedigree={pedigree} onChange={setPedigree} mode={mode} onModeChange={setMode} eventId={eventId} onEventChange={setEventId} onShowData={() => setView('data')}
      onShowReference={import.meta.env.DEV ? openReference : undefined} referenceLoading={referenceLoading} referenceError={referenceError} onSkills={import.meta.env.DEV ? openSkills : undefined} />}
    <SiteFooter />
  </>;
}
