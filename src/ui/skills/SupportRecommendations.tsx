import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import type { SkillEvaluation, SkillEvaluationRequest } from '../../engine/skill-evaluation';
import type { MainSupportSelection, SkillAcquisitionRoute } from '../../engine/support-acquisition';
import type { P4CardRecommendation, P4DeckRecommendation, P4RecommendationRequest, P6PersonalizedRecommendationResult } from '../../engine/support-deck-optimizer';
import { resolveEvaluationContext } from '../../engine/availability';
import type { RecommendationWorkerMessage, RecommendationWorkerResponse } from './recommendations.worker';
import RecommendationOwnership from './RecommendationOwnership';
import type { P5Snapshot } from '../../domain/p5-forecast';
import { analyzeP5LateReleases } from '../../engine/p5-late-release';
import { SKILL_PRIORITY_LABELS, type UserSkillPriority } from '../../engine/skill-priorities';
import SkillPrioritySettings from './SkillPrioritySettings';
import PriorityRecommendationComparison from './PriorityRecommendationComparison';
import LineageSupplyComparison from './LineageSupplyComparison';
import type { LineageSkillAnalysis } from '../../engine/lineage-skills';
import type { DataSnapshotIds, SavedResultSnapshot, WorkspaceInputs } from '../../domain/saved-plan';
import { workspaceFingerprint } from '../../engine/plan-persistence';
import { getCompatiblePlanRoutes } from '../../engine/plan-comparison';
import { createSupportPngDocument, downloadPngDocument } from '../plans/png-export';
import SupportCardIdentity from './SupportCardIdentity';
import GameAssetImage from '../assets/GameAssetImage';
import './recommendations.css';

interface Props { snapshot: DeepReadonly<P3Snapshot>; request: SkillEvaluationRequest | null; contextKey: string; p5?: DeepReadonly<P5Snapshot> | null; eventId?: string;
  priorities?: UserSkillPriority[]; onPrioritiesChange?: (next: UserSkillPriority[]) => void;
  manualOnly?: boolean; runToken?: number;
  mainTrainingRoutes?: readonly SkillAcquisitionRoute[]; lineageAnalysis?: LineageSkillAnalysis;
  supportSettings?: WorkspaceInputs['supportSettings']; onSupportSettingsChange?: (value: WorkspaceInputs['supportSettings']) => void;
  workspaceInputs?: WorkspaceInputs; snapshotIds?: DataSnapshotIds; planTitle?: string;
  onResultSnapshot?: (value: SavedResultSnapshot | undefined) => void; eventLabel?: string; scopeLabel?: string;
  hidePriorityEditor?: boolean;
}
type Run = { signature: string; state: 'running' | 'error'; message?: string }
  | { signature: string; state: 'ready'; result: P6PersonalizedRecommendationResult };

export default function SupportRecommendations({ snapshot, request, contextKey, p5, eventId, priorities, onPrioritiesChange, manualOnly = false, runToken = 0, mainTrainingRoutes, lineageAnalysis, supportSettings, onSupportSettingsChange, workspaceInputs, snapshotIds, planTitle, onResultSnapshot, eventLabel, scopeLabel, hidePriorityEditor = false }: Props) {
  const [localSupportSettings, setLocalSupportSettings] = useState<WorkspaceInputs['supportSettings']>({ ownedSupports: [], ownedOnly: false, allowBorrow: true });
  const currentSupportSettings = supportSettings ?? localSupportSettings;
  const { ownedSupports, ownedOnly, allowBorrow } = currentSupportSettings;
  function updateSupportSettings(patch: Partial<WorkspaceInputs['supportSettings']>) { const next = { ...currentSupportSettings, ...patch }; if (onSupportSettingsChange) onSupportSettingsChange(next); else setLocalSupportSettings(next); }
  const setOwnedSupports = (value: MainSupportSelection[]) => updateSupportSettings({ ownedSupports: value });
  const setOwnedOnly = (value: boolean) => updateSupportSettings({ ownedOnly: value });
  const setAllowBorrow = (value: boolean) => updateSupportSettings({ allowBorrow: value });
  const [localPriorities, setSkillPriorities] = useState<UserSkillPriority[]>([]);
  const skillPriorities = priorities ?? localPriorities;
  const [priorityRevision, setPriorityRevision] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const worker = useRef<Worker | null>(null);
  const workerSnapshot = useRef('');
  const currentRunSignature = useRef('');
  const workerRunning = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumedRunToken = useRef(0);
  const recommendationRequest = useMemo<P4RecommendationRequest | null>(() => request ? {
    ...request, ownedSupports, ownedOnly, allowBorrow, skillPriorities: skillPriorities.length ? skillPriorities : undefined,
  } : null, [request, ownedSupports, ownedOnly, allowBorrow, skillPriorities]);
  const signature = JSON.stringify([snapshot.snapshotId, contextKey, recommendationRequest]);
  const isCurrent = run?.signature === signature;
  const isBusy = isCurrent && run?.state === 'running';
  const personalized = isCurrent && run?.state === 'ready' ? run.result : null;
  const result = personalized?.customized ?? personalized?.base ?? null;
  const [exportMessage, setExportMessage] = useState('');
  const currentDeck = result?.recommendations[0];
  const exportSignature = JSON.stringify([signature, snapshotIds, planTitle]);
  const liveExportSignature = useRef(exportSignature);
  useEffect(() => {
    liveExportSignature.current = exportSignature;
    return () => { liveExportSignature.current = ''; };
  }, [exportSignature]);
  const verifiedExportRoutes = useMemo(() => currentDeck ? getCompatiblePlanRoutes(snapshot, currentDeck, request?.scenarioId) : [], [snapshot, currentDeck, request?.scenarioId]);
  useEffect(() => {
    if (!onResultSnapshot) return;
    if (!workspaceInputs || !snapshotIds || !currentDeck) { onResultSnapshot(undefined); return; }
    onResultSnapshot({ inputSignature: workspaceFingerprint(workspaceInputs), calculatedAt: new Date().toISOString(), snapshotIds,
      cards: currentDeck.cards.map(({ supportId, limitBreak, ownership }) => ({ supportId, limitBreak, ownership })),
      score: { coverageValue: currentDeck.score.coverageValue, preferenceBonus: currentDeck.score.preferenceBonus ?? 0, customizedValue: currentDeck.score.customizedValue ?? currentDeck.score.coverageValue },
      skillIds: currentDeck.skillIds, greenSkillIds: currentDeck.greenSkillIds, eventDecisions: currentDeck.eventDecisions });
  }, [onResultSnapshot, workspaceInputs, snapshotIds, currentDeck]);
  const evaluations = useMemo(() => new Map((result?.skillEvaluations ?? []).map((row) => [row.skillId, row])), [result]);
  const names = useMemo(() => new Map(snapshot.skills.map((row) => [row.skillId, row.displayName])), [snapshot]);
  const lateReleases = useMemo(() => p5 && recommendationRequest && result
    ? analyzeP5LateReleases(snapshot, p5, recommendationRequest, result) : [], [snapshot, p5, recommendationRequest, result]);

  const startCalculation = useCallback((requestToRun: P4RecommendationRequest, runSignature: string) => {
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
    if (workerRunning.current && currentRunSignature.current === runSignature) return;
    // A new input can interrupt the previous worker; completed workers cache the
    // existing immutable source pack so later requests avoid another large clone.
    if (workerRunning.current || workerSnapshot.current !== snapshot.snapshotId) { worker.current?.terminate(); worker.current = null; }
    currentRunSignature.current = runSignature;
    workerRunning.current = true;
    setRun({ state: 'running', signature: runSignature });
    try {
      if (!worker.current) {
        const created = new Worker(new URL('./recommendations.worker.ts', import.meta.url), { type: 'module' });
        created.onmessage = (event: MessageEvent<RecommendationWorkerResponse>) => {
          const message = event.data;
          if (worker.current !== created || message.signature !== currentRunSignature.current) return;
          workerRunning.current = false;
          setRun(message.type === 'result'
            ? { state: 'ready', signature: message.signature, result: message.result }
            : { state: 'error', signature: message.signature, message: message.message });
        };
        created.onerror = () => {
          if (worker.current !== created) return;
          workerRunning.current = false;
          setRun({ state: 'error', signature: currentRunSignature.current, message: '추천 계산을 시작하지 못했습니다. 다시 시도해 주세요.' });
          created.terminate(); worker.current = null;
        };
        worker.current = created;
        workerSnapshot.current = snapshot.snapshotId;
        const initialize: RecommendationWorkerMessage = { type: 'init', snapshot };
        created.postMessage(initialize);
      }
      const message: RecommendationWorkerMessage = { type: 'recommend', signature: runSignature, request: requestToRun };
      worker.current.postMessage(message);
    } catch (error: unknown) {
      worker.current?.terminate(); worker.current = null;
      workerRunning.current = false;
      setRun({ state: 'error', signature: runSignature, message: error instanceof Error ? error.message : '편성 추천을 계산하지 못했습니다.' });
    }
  }, [snapshot]);

  useEffect(() => () => { worker.current?.terminate(); if (autoTimer.current) clearTimeout(autoTimer.current); }, []);
  useEffect(() => {
    if (workerRunning.current && currentRunSignature.current !== signature) {
      worker.current?.terminate(); worker.current = null; workerRunning.current = false;
    }
  }, [signature]);
  useEffect(() => {
    if (manualOnly || priorityRevision === 0 || !recommendationRequest) return;
    const timer = setTimeout(() => startCalculation(recommendationRequest, signature), 300);
    autoTimer.current = timer;
    return () => { clearTimeout(timer); };
  }, [manualOnly, priorityRevision, recommendationRequest, signature, startCalculation]);
  useEffect(() => {
    if (!manualOnly || !runToken || consumedRunToken.current === runToken) return;
    consumedRunToken.current = runToken;
    if (!recommendationRequest) return;
    const timer = setTimeout(() => startCalculation(recommendationRequest, signature), 0);
    return () => { clearTimeout(timer); };
  }, [manualOnly, runToken, recommendationRequest, signature, startCalculation]);
  function calculate() { if (recommendationRequest) startCalculation(recommendationRequest, signature); }
  function updatePriorities(next: UserSkillPriority[]) { if (onPrioritiesChange) onPrioritiesChange(next); else setSkillPriorities(next); setPriorityRevision((value) => value + 1); }
  async function exportSupport() {
    if (!result || !currentDeck || !recommendationRequest || !snapshotIds) return;
    try {
      const document = createSupportPngDocument({ title: planTitle ?? '육성 계획', snapshot, request: recommendationRequest, result, deck: currentDeck,
        eventLabel: eventLabel ?? eventId ?? recommendationRequest.course.courseId ?? '대회', scenarioLabel: snapshot.scenarios.find(item => item.scenarioId === recommendationRequest.scenarioId)?.displayName ?? '시나리오 미정',
        priorities: skillPriorities, scopeLabel: scopeLabel ?? '전역 목표 추천', snapshotIds, comparison: personalized?.comparison, verifiedRoutes: verifiedExportRoutes });
      await downloadPngDocument(document, { filename: 'uma-support-6.png', resultSignature: exportSignature, getCurrentSignature: () => liveExportSignature.current });
      setExportMessage('현재 양립 계획과 추천 6장의 PNG를 만들었습니다.');
    } catch (error: unknown) { setExportMessage(error instanceof Error ? error.message : '추천 PNG를 만들지 못했습니다.'); }
  }

  return <section className="panel p4-recommendations" aria-label="인자작 서포트 추천" data-testid="p4-recommendations">
    <div className="section-heading"><h2>인자작 서포트 6장 추천</h2><span className="phase">수급 비교</span></div>
    <p className="p4-intro">위 대회·각질·시나리오·성향으로 인자작 편성을 비교합니다. 같은 이벤트의 배타 보상을 함께 더하지 않고 양립 가능한 경로를 선택합니다. 힌트·이벤트 발생과 성공은 보장하지 않습니다.</p>
    <div className="p4-controls"><label><input type="checkbox" checked={ownedOnly} onChange={(event) => setOwnedOnly(event.target.checked)} />보유 카드로 추천 범위 제한</label><label><input type="checkbox" checked={allowBorrow} disabled={!ownedOnly} onChange={(event) => setAllowBorrow(event.target.checked)} />미보유 카드 1장 대여 허용</label></div>
    <details className="p4-ownership"><summary>보유 카드·돌파 등록 (선택) · {ownedSupports.length}장</summary><RecommendationOwnership snapshot={snapshot} selections={ownedSupports} onChange={setOwnedSupports} cutoffDate={request?.cutoffDate ?? resolveEvaluationContext({ mode: 'current', now: new Date() }).cutoffDate} allowForecast={request?.allowForecast ?? false} forecast={request?.forecast} /></details>
    <div className="p4-run">
      <button
        className="p4-recommend-button"
        data-busy={isBusy}
        disabled={!recommendationRequest || isBusy}
        onClick={calculate}
      >
        {isBusy ? '편성 비교 중…' : '인자작 편성 추천'}
      </button>
      <p>
        {ownedOnly
          ? `보유 ${ownedSupports.length}장${allowBorrow ? ' + 대여 최대 1장' : '만 사용'}`
          : '전체 가용 카드 · 미등록 카드는 4돌파 가상 설계'}
      </p>
    </div>
    {!hidePriorityEditor && <div className="p86-global-priorities"><h3>{manualOnly ? '선택 인자의 핵심 스킬' : '전역 핵심 스킬·우선순위'}</h3><SkillPrioritySettings snapshot={snapshot} request={request} priorities={skillPriorities} onChange={updatePriorities} onRecalculate={calculate} isBusy={isBusy} /></div>}
    {isBusy && <p className="p4-message" role="status">카드 조합의 신규 스킬과 중복을 비교하고 있습니다.</p>}
    {run && !isCurrent && <p className="p4-stale" role="status">조건이 바뀌었습니다. 현재 조건으로 편성을 다시 추천하세요.</p>}
    {isCurrent && run?.state === 'error' && <p className="p4-message" role="alert">{run.message}</p>}
    {!recommendationRequest && <p className="p4-message">대회 시작일을 확인하거나 현재 시점 기준을 선택하면 추천할 수 있습니다.</p>}
    {result?.status === 'insufficient-candidates' && <p className="p4-message" role="status">출시·보유 조건에 맞는 서로 다른 서포트 6장이 부족합니다. 보유 범위나 대여 허용을 확인하세요.</p>}
    {result?.status === 'insufficient-skills' && <p className="p4-message" role="status">{result.warnings.at(-1) ?? '현재 출시·검증 조건에서 평가 가능한 스킬 수급 경로가 없습니다.'}</p>}
    {result?.status === 'search-limited' && <p className="p4-message" role="status">현재 탐색 한도에서 6장 편성을 완성하지 못했습니다. 불가능한 조합이라고 판정한 것은 아닙니다.</p>}
    {result?.status === 'required-unfulfilled' && <p className="p4-message" role="status" data-testid="p6-required-failure" data-reason={result.skillPriorities?.failure?.reason}>{result.skillPriorities?.failure?.message ?? '현재 조건에서 필수 스킬을 모두 포함하는 편성을 확인하지 못했습니다.'}</p>}
    {personalized?.customized && <>
      <PriorityRecommendationComparison result={personalized} priorities={skillPriorities} names={names} />
      {personalized.base.recommendations[0] && <details className="p4-detail" data-testid="p6-base-details"><summary>기본 추천 6장의 수급 경로와 이벤트 계획</summary><DeckResult snapshot={snapshot} deck={personalized.base.recommendations[0]} names={names} evaluations={new Map(personalized.base.skillEvaluations.map((row) => [row.skillId, row]))} title="기본 추천 편성" testId="p6-base-deck" /></details>}
    </>}
    {result?.recommendations[0] && <>
      <section className="p86-result-context" data-testid="p86-result-context" aria-label="이번 추천에 적용한 조건"><h3>이번 추천에 적용한 조건</h3><p>{eventLabel ?? '선택 대회'} · {request ? ({ front: '도주', pace: '선행', late: '선입', end: '추입' } as const)[request.runningStyle] : ''} · {snapshot.scenarios.find(item => item.scenarioId === request?.scenarioId)?.displayName ?? '시나리오 미정'}</p><p>{scopeLabel ?? '전역 목표 추천'} · {ownedOnly ? `보유 ${ownedSupports.length}장${allowBorrow ? ' + 대여 1장 허용' : '만 사용'}` : '전체 가용 카드 · 보유 미등록은 가상 4돌파'}</p><p>{skillPriorities.length ? skillPriorities.map(goal => `${names.get(goal.skillId) ?? '스킬명 미확인'}: ${SKILL_PRIORITY_LABELS[goal.priority]}`).join(' · ') : '사용자 지정 목표 없음 · 기본 추천'}</p></section>
      <DeckResult snapshot={snapshot} deck={result.recommendations[0]} names={names} evaluations={evaluations} primary />
      {snapshotIds && <div className="p8-export-actions"><button className="btn" data-testid="p8-export-support" onClick={() => void exportSupport()}>현재 서포트 6장 PNG</button>{exportMessage && <p role="status">{exportMessage}</p>}</div>}
      {lineageAnalysis && mainTrainingRoutes && <LineageSupplyComparison key={signature} snapshot={snapshot} deck={result.recommendations[0]} analysis={lineageAnalysis} mainRoutes={mainTrainingRoutes} priorities={skillPriorities} scenarioId={request?.scenarioId} />}
      {result.recommendations.slice(1).map((deck) => <details className="p4-alternative" key={deck.deckId} data-testid="p4-alternative"><summary>스킬 구성이 다른 대체 편성</summary><SkillComparison gained={deck.gainedSkillIds} lost={deck.lostSkillIds} names={names} evaluations={evaluations} /><DeckResult snapshot={snapshot} deck={deck} names={names} evaluations={evaluations} /></details>)}
      {result.recommendations.length === 1 && <p className="p4-search-meta">탐색 범위에서 확보 스킬이 유의미하게 다른 대체 편성은 찾지 못했습니다.</p>}
      <p className="p4-search-meta">공개 조건·Pt에 따른 정성 추천입니다. 양립 가능은 획득 보장이 아닙니다. U-tools 참고 자료는 한국 적용 검증 전이므로 정량 점수에 사용하지 않습니다.</p>
      {p5 && request?.forecast && <details className="p4-detail" data-testid="p5-late-release">
        <summary>대회 직전 출시 검토 {lateReleases.length}건 · 별도 추천 0건</summary>
        <p>약 14일은 검토 기준입니다. 예측 날짜 차이는 실제 준비 기간이나 획득 성공률이 아닙니다. 추가 이득과 부모·조부 인자 재제작 부담을 모두 확인해야 별도 추천할 수 있습니다.</p>
        {lateReleases.length === 0 && <p>이 대회의 전달 자료에 직전 출시 검토 후보가 없습니다.</p>}
        <ul className="p4-replacements">{lateReleases.map((row) => <li key={`${row.entityType}:${row.entityId}`} data-testid={`p5-late-${row.entityType}-${row.entityId}`}>
          <strong>{row.name} · {row.classification === 'base-included' ? '기본 추천 반영' : row.classification === 'ordinary-alternative' ? '일반 교체·대체 후보' : row.classification === 'not-eligible' ? '예상 가용성 제외·보류' : '검토 보류'}</strong>
          <p>한국 출시 예측 {row.displayReleaseDate}{row.displayDays !== null ? ` · 대회 예측일과 ${row.displayDays}일 차이` : row.displayDayRange ? ` · 월 내 예측 날짜 차이 ${row.displayDayRange.minimum}~${row.displayDayRange.maximum}일` : ''}</p>
          <p>{row.reason}</p>
          {row.uniqueContributionSkillIds.length > 0 && <><h4>이 편성에서 이 카드만 제공하는 목표</h4><SkillTags ids={row.uniqueContributionSkillIds} names={names} evaluations={evaluations} /></>}
          {(row.gainedSkillIds.length > 0 || row.lostSkillIds.length > 0) && <SkillComparison gained={row.gainedSkillIds} lost={row.lostSkillIds} names={names} evaluations={evaluations} />}
        </li>)}</ul>
        <p>이번 자료에는 큰 재제작 부담을 입증한 기록이 없어 별도 추천을 생성하지 않았습니다.</p>
      </details>}
    </>}
    {result && <p className="caption" data-testid="p87-search-scope">탐색한 후보군의 추천안 · 전역 최적 보장 없음. 미검증 정량값은 점수에 사용하지 않습니다.</p>}
  </section>;
}

interface ResultProps {
  snapshot: DeepReadonly<P3Snapshot>; deck: P4DeckRecommendation; names: Map<string, string>; evaluations: Map<string, SkillEvaluation>; primary?: boolean; title?: string; testId?: string;
}
function DeckResult({ snapshot, deck, names, evaluations, primary = false, title, testId }: ResultProps) {
  return <div className="p4-result" data-testid={testId ?? (primary ? 'p4-primary-result' : 'p4-alternative-result')}>
    <div className="p4-result-heading"><div><h3>{title ?? (primary ? '추천 인자작 편성' : '대체 인자작 편성')}</h3><p>{deck.reasons.join(' ')}</p></div><span className="count">{deck.cards.length}장</span></div>
    <div className="p4-metrics"><span>양립 가능한 목표 <b>{deck.compatibleSkillIds.length}</b></span><span>패시브 스킬 <b>{deck.greenSkillIds.length}</b></span><span>핵심 목표 <b>{deck.score.coreSkillCount}</b></span><span>우선 확보 <b>{deck.score.prioritySkillCount}</b></span><span>중복 스킬 <b>{deck.duplicateSkillIds.length}</b></span></div>
    <div className="p6-score-metrics"><span>기본 정성 <b>{deck.score.coverageValue}</b></span><span>사용자 선호 <b>+{deck.score.preferenceBonus ?? 0}</b></span><span>맞춤 평가 <b>{deck.score.customizedValue ?? deck.score.coverageValue}</b></span></div>
    <div className="p4-cards">{deck.cards.map((card) => <RecommendationCard key={card.supportId} snapshot={snapshot} card={card} names={names} evaluations={evaluations} />)}</div>
    <details className="p4-detail"><summary>양립 가능한 일반 목표 {deck.compatibleSkillIds.length}개</summary><p>선택한 이벤트 분기와 일반 힌트가 함께 존재할 수 있는 경로입니다. 모든 힌트 발생·이벤트 성공을 보장한 수치는 아닙니다. 사용자가 직접 지정한 비해당·미검증 목표는 객관적 유효 스킬로 승격하지 않습니다.</p><SkillTags ids={deck.compatibleSkillIds} names={names} evaluations={evaluations} /></details>
    <details className="p4-detail"><summary>잠재 경로·미확인 이벤트 구분</summary><p>배타 분기와 검증 보류 경로를 모두 합친 잠재 목표는 {deck.potentialSkillIds.length}개입니다. 이를 양립 점수에 모두 합산하지 않습니다.</p><h4>이벤트 양립성 미확인 {deck.unresolvedEventSkillIds.length}개</h4><p>일부 이벤트 경로를 확인하지 못한 목표입니다. 같은 스킬의 별도 힌트 경로가 확인되면 해당 경로는 계속 평가합니다.</p><SkillTags ids={deck.unresolvedEventSkillIds} names={names} evaluations={evaluations} /><h4>이번 계획에 함께 넣지 않은 잠재 목표</h4><SkillTags ids={deck.potentialSkillIds.filter((id) => !deck.compatibleSkillIds.includes(id))} names={names} evaluations={evaluations} /></details>
    <details className="p4-detail"><summary>패시브 스킬 {deck.greenSkillIds.length}개 · 우대 이유</summary><p>대회 조건에 맞는 저비용 스피드·스태미나 패시브 스킬을 우대했습니다. 고비용·추가 조건 패시브는 별도 평가합니다.</p><SkillTags ids={deck.greenSkillIds} names={names} evaluations={evaluations} /></details>
    <details className="p4-detail"><summary>중복되는 스킬 {deck.duplicateSkillIds.length}개</summary><p>여러 카드가 같은 스킬을 주는 경로입니다. 신규 스킬처럼 거듭 합산하지 않으며 추가 힌트의 가치는 남깁니다.</p><SkillTags ids={deck.duplicateSkillIds} names={names} evaluations={evaluations} /></details>
    <details className="p4-detail"><summary>확보하지 못한 주요 스킬 {deck.missingImportantSkillIds.length}개</summary><p>우선 확보·유효·핵심 가속 검토 후보 중 편성에서 빠진 스킬입니다. 교체 시 얻는 스킬과 잃는 스킬을 함께 비교하세요.</p><p>우선 확보 누락 {deck.missingPrioritySkillIds.length}개</p><SkillTags ids={deck.missingImportantSkillIds} names={names} evaluations={evaluations} showPriority /></details>
    {deck.swaps.length > 0 && <details className="p4-detail" data-testid="p4-swaps"><summary>교체 카드 후보와 전후 차이 {deck.swaps.length}개</summary><ul className="p4-replacements">{deck.swaps.map((swap) => <li key={`${swap.removeSupportId}:${swap.addSupportId}`}><strong>{deck.cards.find((card) => card.supportId === swap.removeSupportId)?.name ?? swap.removeSupportId} → {swap.addSupportName}</strong><p>{swap.reasons.join(' ')}</p><SkillComparison gained={swap.gainedSkillIds} lost={swap.lostSkillIds} names={names} evaluations={evaluations} /></li>)}</ul></details>}
  </div>;
}

function RecommendationCard({ snapshot, card, names, evaluations }: { snapshot: DeepReadonly<P3Snapshot>; card: P4CardRecommendation; names: Map<string, string>; evaluations: Map<string, SkillEvaluation> }) {
  const ownership = card.ownership === 'owned' ? '보유' : card.ownership === 'borrowed' ? '대여' : '가상 설계';
  return <article className="p4-card" data-testid={`p4-card-${card.supportId}`}>
    <SupportCardIdentity support={card} source={snapshot.supports.find((support) => support.supportId === card.supportId)} heading="h4" />
    <p className="p4-card-meta">{card.limitBreak}돌파 · {ownership}{card.availability.basis === 'jp-release-order' ? ' · 일본 순서상 가용 예상' : card.availability.basis === 'forecast' ? ' · 미래시' : ''}{card.acquisitionBasis === 'jp-reference-forecast' ? ' · JP 수급 참고' : ''}</p>
    <ul className="p4-card-reasons">{card.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    <p className="p4-card-meta">이 카드만 제공하는 양립 목표 {card.uniqueSkillIds.length}개</p><SkillTags ids={card.uniqueSkillIds} names={names} evaluations={evaluations} limit={4} />
    <details className="p4-detail p85-support-illustration"><summary>카드 일러스트</summary><GameAssetImage kind="support" id={card.supportId} label={card.name} variant="art" /></details>
    {card.eventDecisions.length > 0 && <details className="p4-detail p41-event-plan" data-testid="p41-event-plan"><summary>계산에 선택한 이벤트 분기 {card.eventDecisions.length}개</summary><p>각 이벤트에서 선택한 하나의 경로입니다. 성공·실패 확률은 미확인이며 임의로 부여하지 않습니다.</p>{card.eventDecisions.map((decision) => <div key={decision.groupId}><h4>{decision.label}</h4><p>{decision.outcome === 'success' ? '성공 분기 가정' : decision.outcome === 'failure' ? '실패 분기 가정' : '선택지 경로'} · {decision.evidence === 'kr-source' ? '한국 경로 근거' : decision.evidence === 'jp-reference' ? '일본 참고 제약 · 한국 적용 미검증' : '서버 미확인 자료의 제약 참고'} · 획득 보장 아님</p><SkillTags ids={decision.skillIds} names={names} evaluations={evaluations} /></div>)}</details>}
    {card.unresolvedEventSkillIds.length > 0 && <p className="p4-card-meta">목표 {card.unresolvedEventSkillIds.length}개의 일부 이벤트 경로는 분기·조건 미확인으로 보류했습니다. 별도 힌트 경로는 유지합니다.</p>}
    <details className="p4-detail"><summary>자료에 기록된 잠재 수급 경로 {card.routes.length}개</summary><p>선택하지 않은 분기와 검증 보류 경로도 포함합니다. 실제 점수에는 위의 양립 가능한 목표만 반영했습니다.</p><RouteList routes={card.routes} names={names} />{card.eventConditionNotes.length > 0 && <details className="p4-detail"><summary>이벤트 수급 조건 확인</summary>{card.eventConditionNotes.map((note) => <p key={note}>{note}</p>)}</details>}</details>
  </article>;
}

function SkillComparison({ gained, lost, names, evaluations }: { gained: string[]; lost: string[]; names: Map<string, string>; evaluations: Map<string, SkillEvaluation> }) {
  return <div className="p4-comparison"><div><h4>새로 얻는 스킬 {gained.length}개</h4><SkillTags ids={gained} names={names} evaluations={evaluations} /></div><div><h4>잃는 스킬 {lost.length}개</h4><SkillTags ids={lost} names={names} evaluations={evaluations} /></div></div>;
}

function SkillTags({ ids, names, evaluations, limit = Number.POSITIVE_INFINITY, showPriority = false }: { ids: string[]; names: Map<string, string>; evaluations: Map<string, SkillEvaluation>; limit?: number; showPriority?: boolean }) {
  if (!ids.length) return <p className="p4-card-meta">없음</p>;
  return <div className="p4-skill-tags">{ids.slice(0, limit).map((id) => {
    const row = evaluations.get(id);
    const condition = row ? ({ 'course-valid': '대회 조건에 유효', 'race-order-dependent': '순위·전개·능력치 조건 의존', 'window-dependent': '발동 구간에 따라 효율 차이', 'course-ineffective-or-low': '코스 비해당 또는 효율 검토 필요', unverified: '효과·조건 미검증' } as const)[row.conditionClass] : '';
    return <span key={id} className={row?.isGreen ? 'green' : ''} title={condition}>{names.get(id) ?? id}{showPriority && row?.valueEvidence.core.status === 'guide-priority' ? ' · 공략 핵심' : showPriority && row?.grade === 'priority' ? ' · 우선 확보' : ''}</span>;
  })}{ids.length > limit && <span>외 {ids.length - limit}개</span>}</div>;
}

function RouteList({ routes, names }: { routes: SkillAcquisitionRoute[]; names: Map<string, string> }) {
  const [limit, setLimit] = useState(12);
  return <><ul className="p4-route-list">{routes.slice(0, limit).map((route, index) => <li key={`${route.supportId}:${route.skillId}:${route.sourceSkillId}:${route.kind}:${route.sourceKind}:${index}`}><strong>{names.get(route.skillId) ?? route.skillId}</strong> · {route.kind === 'hint' ? '일반 힌트' : route.kind === 'event' ? '이벤트' : '금색 → 하위'}{route.sourceServer === 'JP' ? ' · JP 수급 참고' : ''}<small>{route.kind === 'gold-lower' ? `${names.get(route.goldSkillId ?? '') ?? route.goldSkillId}의 ${route.sourceKind === 'event' ? '이벤트' : '힌트'} 경로` : route.kind === 'hint' && route.hintLevel !== null ? `힌트Lv 효과 ${route.hintLevel}` : '이벤트 조건 확인 필요'}</small></li>)}</ul>{routes.length > limit && <button className="btn" onClick={() => setLimit((value) => value + 12)}>수급 경로 더 보기</button>}</>;
}
