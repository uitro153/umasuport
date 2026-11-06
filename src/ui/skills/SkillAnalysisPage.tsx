import { matchesNameQuery } from '../name-search';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import { resolveEvaluationContext } from '../../engine/availability';
import { evaluateSkills, type SkillEvaluationRequest } from '../../engine/skill-evaluation';
import { getP3Availability } from '../../engine/support-acquisition';
import { getLineageSlots } from '../../domain/lineage';
import { analyzeLineageSkills, buildLineageRecommendationRequest, getNodeSkillPriorities, setNodeSkillPriorities } from '../../engine/lineage-skills';
import type { LineageSkillsIntegration } from './lineage-context';
import type { ReferenceAvailability } from '../../engine/reference-availability';
import SupportRecommendations from './SupportRecommendations';
import './skills.css';
import { eventServerLabel, translationLabel } from './evidence-labels';
import { loadLocalP5Forecast } from '../../data/local-p5-forecast';
import { mergeP5Tournaments, type P5Snapshot } from '../../domain/p5-forecast';
import { buildP5AvailabilityContext } from '../../engine/p5-availability';
import P5TournamentInfo from './P5TournamentInfo';
import { buildTournamentOptions, representativeScenario } from './tournament-options';
import SupportPicker from './SupportPicker';
import SupportCardIdentity from './SupportCardIdentity';
import GameAssetImage from '../assets/GameAssetImage';
import type { DataSnapshotIds, SavedResultSnapshot, WorkspaceInputs } from '../../domain/saved-plan';
import { createDefaultWorkspace, workspaceFingerprint } from '../../engine/plan-persistence';

interface Props { snapshot: DeepReadonly<P3Snapshot>; onPedigree: () => void; lineage?: LineageSkillsIntegration;
  settings?: WorkspaceInputs['skillSettings']; onSettingsChange?: (value: WorkspaceInputs['skillSettings']) => void;
  supportSettings?: WorkspaceInputs['supportSettings']; onSupportSettingsChange?: (value: WorkspaceInputs['supportSettings']) => void;
  workspaceInputs?: WorkspaceInputs; snapshotIds?: DataSnapshotIds; planTitle?: string;
  onResultSnapshot?: (value: SavedResultSnapshot | undefined) => void;
  forecastPack?: DeepReadonly<P5Snapshot> | null; onForecastPack?: (value: DeepReadonly<P5Snapshot> | null) => void;
  nodeEditor?: ReactNode;
}
interface DeckSlot { supportId: string | null; limitBreak: number }
type Style = 'front' | 'pace' | 'late' | 'end';
type Preference = 'balanced' | 'skills' | 'stability';
type EvaluationRow = ReturnType<typeof evaluateSkills>['rows'][number];
const STYLES: Record<Style, string> = { front: '도주', pace: '선행', late: '선입', end: '추입' };
const VENUES: Record<string,string> = { '札幌':'삿포로','函館':'하코다테','福島':'후쿠시마','新潟':'니이가타','東京':'도쿄','中山':'나카야마','中京':'주쿄','京都':'교토','阪神':'한신','小倉':'고쿠라','大井':'오이','川崎':'가와사키','船橋':'후나바시','盛岡':'모리오카','ロンシャン':'롱샹' };
const GRADE_LABELS = { priority: '우선 확보', useful: '유효 후보', conditional: '조건부 후보', supplementary: '부가 확보', excluded: '비해당', unverified: '평가 미검증' };
const APPLICABILITY_LABELS = { applicable: '조건 일치', conditional: '전개 조건 있음', unverified: '조건 해석 미검증', inapplicable: '대회·각질 비해당' };
const EFFICIENCY_LABELS = { good: '가성비 우대', standard: '표준 비용', expensive: '고비용', unknown: '비용 미확인' };
const CONDITION_CLASS_LABELS = { 'course-valid': '대회 조건상 유효', 'race-order-dependent': '순위·전개·능력치 의존', 'window-dependent': '발동 구간 검토', 'course-ineffective-or-low': '코스 비해당·효율 보류', unverified: '효과·조건 미검증' };
const BASIS_LABELS = { 'official-date': '공식 출시일', 'secondary-date': '2차 자료 날짜', 'released-by-observation': '해당일까지 출시 관측', forecast: '미래시 · 변동 가능', 'insufficient-evidence': '한국 출시 미확인', 'jp-release-order': '일본 출시 순서 기반 예상', 'jp-route-order': '일본 대회 전 수급처 기반 예상' };

function availabilityLabel(value: ReferenceAvailability): string {
  if (value.basis === 'jp-route-order') return '일본 대회 전 수급처 있음 · 최초 출시일·한국 패치 미확인';
  if (value.basis === 'jp-release-order') return value.state === 'available'
    ? `일본 대회 이전 출시 · 가용 예상${value.effectiveDate ? ` (JP ${value.effectiveDate})` : ''}`
    : value.state === 'unavailable' ? `일본 대회 이후 출시 · 추천 제외${value.effectiveDate ? ` (JP ${value.effectiveDate})` : ''}` : '일본 출시 순서 확인 필요';
  if (value.state === 'unknown') return '한국 출시 미확인 · 가용 판정 보류';
  if (value.state === 'unavailable') return `기준일 이후 · ${value.effectiveDate ?? ''}`;
  if (value.evidence.includes('inference')) return '한국 카드 수급 목록의 간접 근거 · 스킬 출시일 미확인';
  return `${BASIS_LABELS[value.basis]}${value.effectiveDate ? ` · ${value.effectiveDate}` : ''}`;
}

export default function SkillAnalysisPage({ snapshot, onPedigree, lineage, settings, onSettingsChange, supportSettings, onSupportSettingsChange, workspaceInputs, snapshotIds, planTitle, onResultSnapshot, forecastPack, onForecastPack, nodeEditor }: Props) {
  const [localSettings, setLocalSettings] = useState(() => createDefaultWorkspace(snapshot, resolveEvaluationContext({ mode: 'current', now: new Date() }).cutoffDate).skillSettings);
  const currentSettings = settings ?? localSettings;
  const { eventId, runningStyle, scenarioId, preference, mode, allowForecast, includeUnknown, deck, nodeModes } = currentSettings;
  function updateSettings(patch: Partial<WorkspaceInputs['skillSettings']>) { const next = { ...currentSettings, ...patch }; if (onSettingsChange) onSettingsChange(next); else setLocalSettings(next); }
  const setEventId = (value: string) => updateSettings({ eventId: value });
  const setRunningStyle = (value: Style) => updateSettings({ runningStyle: value });
  const setScenarioId = (value: string) => updateSettings({ scenarioId: value });
  const setPreference = (value: Preference) => updateSettings({ preference: value });
  const setMode = (value: 'tournament' | 'current') => updateSettings({ mode: value });
  const setAllowForecast = (value: boolean) => updateSettings({ allowForecast: value });
  const setIncludeUnknown = (value: boolean) => updateSettings({ includeUnknown: value });
  const setDeck = (value: DeckSlot[] | ((previous: DeckSlot[]) => DeckSlot[])) => updateSettings({ deck: typeof value === 'function' ? value(deck) : value });
  const setNodeModes = (value: Record<string, 'current' | 'forecast'> | ((previous: Record<string, 'current' | 'forecast'>) => Record<string, 'current' | 'forecast'>)) => updateSettings({ nodeModes: typeof value === 'function' ? value(nodeModes) : value });
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [listView, setListView] = useState('candidates');
  const [limit, setLimit] = useState(30);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [p5State, setP5State] = useState<{ snapshotId: string; pack: DeepReadonly<P5Snapshot> | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    void loadLocalP5Forecast(snapshot).then((pack) => {
      if (active) { setP5State({ snapshotId: snapshot.snapshotId, pack, error: null }); onForecastPack?.(pack); }
    }).catch((error: unknown) => {
      if (active) setP5State({ snapshotId: snapshot.snapshotId, pack: null, error: error instanceof Error ? error.message : 'P5 자료 확인 실패' });
    });
    return () => { active = false; };
  }, [snapshot, onForecastPack]);
  const p5 = forecastPack !== undefined ? forecastPack : p5State?.snapshotId === snapshot.snapshotId ? p5State.pack : null;
  const tournaments = useMemo(() => p5 ? mergeP5Tournaments(snapshot, p5) : snapshot.tournaments.map((event) => ({ ...event, forecast: null })), [snapshot, p5]);
  const tournament = tournaments.find((row) => row.eventId === eventId);
  const p5Event = tournament?.forecast ?? null;
  const forecast = useMemo(() => mode === 'tournament' && p5 && p5Event && tournament?.dateStatus !== 'confirmed'
    ? buildP5AvailabilityContext(snapshot, p5, eventId) ?? undefined : undefined, [mode, p5, p5Event, tournament?.dateStatus, snapshot, eventId]);
  const today = resolveEvaluationContext({ mode: 'current', now: new Date() }).cutoffDate;
  const tournamentOptions = useMemo(() => buildTournamentOptions(snapshot, p5, tournaments, today), [snapshot, p5, tournaments, today]);
  const selectedPastEvent = tournamentOptions.find((option) => option.event.eventId === eventId && option.past);
  const representative = useMemo(() => tournament ? representativeScenario(snapshot, p5, tournament) : null, [snapshot, p5, tournament]);
  const dateKnown = mode === 'current' || !!tournament?.startAt || !!forecast?.jpEventDate;
  // For a month-only forecast this is only a reference for legacy source review.
  // All availability decisions receive the JP context; this is no invented event day.
  const cutoffDate = forecast ? forecast.krExpectedDate ?? forecast.asOf : mode === 'current' || !tournament?.startAt ? today : resolveEvaluationContext({
    mode: 'tournament', now: new Date(), tournament: { startAt: tournament.startAt, dateStatus: tournament.dateStatus === 'forecast' ? 'forecast' : 'confirmed' },
  }).cutoffDate;
  const scenarioAvailability = scenarioId ? getP3Availability(snapshot, 'scenario', scenarioId, cutoffDate, allowForecast, forecast) : null;
  const selectedScenarioId = !forecast || scenarioAvailability?.state === 'available' ? scenarioId
    : snapshot.scenarios.find((scenario) => getP3Availability(snapshot, 'scenario', scenario.scenarioId, cutoffDate, allowForecast, forecast).state === 'available')?.scenarioId ?? '';
  const course = snapshot.courses.find((row) => row.courseId === tournament?.courseId);
  const analysisRequest = useMemo<SkillEvaluationRequest | null>(() => tournament && dateKnown ? {
    course: {
      courseId: tournament.courseId, distanceM: tournament.conditions.distance,
      surface: tournament.conditions.surface === 1 ? 'turf' : 'dirt',
      trackId: snapshot.courses.find((row) => row.courseId === tournament.courseId)?.trackId ?? null,
      rotation: tournament.conditions.direction, season: tournament.conditions.season,
      weather: tournament.conditions.weather, groundCondition: tournament.conditions.ground,
    }, runningStyle, cutoffDate, allowForecast, includeUnknown, preference, scenarioId: selectedScenarioId || null, forecast,
    deck: deck.filter((row): row is { supportId: string; limitBreak: number } => row.supportId !== null),
  } : null, [snapshot, tournament, dateKnown, runningStyle, cutoffDate, allowForecast, includeUnknown, preference, selectedScenarioId, forecast, deck]);
  const analysis = useMemo(() => analysisRequest ? evaluateSkills(snapshot, analysisRequest) : null, [snapshot, analysisRequest]);
  const publishAnalysis = lineage?.onAnalysisRequest;
  useEffect(() => { publishAnalysis?.(analysisRequest); }, [publishAnalysis, analysisRequest]);
  const nodeId = lineage?.selectedNodeId ?? null;
  const lineagePlan = lineage?.plan;
  const whiteFactors = lineage?.whiteFactors;
  const nodeMode = nodeId ? nodeModes[nodeId] ?? 'current' : 'current';
  const nodeForecast = useMemo(() => p5 && p5Event ? buildP5AvailabilityContext(snapshot, p5, eventId) ?? undefined : undefined, [snapshot, p5, p5Event, eventId]);
  const nodeAnalysis = useMemo(() => lineagePlan && whiteFactors && nodeId ? analyzeLineageSkills(lineagePlan, whiteFactors, nodeId) : null, [lineagePlan, whiteFactors, nodeId]);
  const nodeRecommendation = useMemo(() => {
    if (!lineagePlan || !whiteFactors || !nodeId || !tournament) return { request: null, error: '' };
    const base = analysisRequest ?? { course: { courseId: tournament.courseId, trackId: course?.trackId ?? null,
      distanceM: tournament.conditions.distance, surface: tournament.conditions.surface === 1 ? 'turf' as const : 'dirt' as const,
      rotation: tournament.conditions.direction, season: tournament.conditions.season, weather: tournament.conditions.weather, groundCondition: tournament.conditions.ground },
      runningStyle, cutoffDate: today, includeUnknown, preference, scenarioId: selectedScenarioId || null,
      deck: deck.flatMap((slot) => slot.supportId ? [{ supportId: slot.supportId, limitBreak: slot.limitBreak }] : []) };
    try { return { request: buildLineageRecommendationRequest(snapshot, { ...base, forecast: nodeForecast, cutoffDate: nodeForecast?.krExpectedDate ?? today }, {
      plan: lineagePlan, state: whiteFactors, nodeId, mode: nodeMode, today, includeGlobal: false,
    }), error: '' }; }
    catch (error: unknown) { return { request: null, error: error instanceof Error ? error.message : '이 인자작 시점의 수급 환경을 확인하지 못했습니다.' }; }
  }, [snapshot, lineagePlan, whiteFactors, nodeId, nodeMode, tournament, analysisRequest, course, today, runningStyle, includeUnknown, preference, selectedScenarioId, deck, nodeForecast]);
  const recommendationRequest = nodeId ? nodeRecommendation.request : analysisRequest;
  // The final-training deck keeps its own time context. A parent's current
  // factor run must neither borrow that deck nor silently re-date its routes.
  const mainTrainingRoutes = analysis?.deckAnalysis.routes ?? [];
  const nodePriorities = useMemo(() => lineagePlan && whiteFactors && nodeId ? getNodeSkillPriorities(whiteFactors, lineagePlan, nodeId) : [], [whiteFactors, lineagePlan, nodeId]);
  const selectedNode = nodeId && lineage ? lineage.plan.nodes[nodeId] : null;
  const selectedIsMob = !!(lineage && getLineageSlots(lineage.plan).some(slot => slot.nodeId === nodeId && slot.depth > 2));
  const selectedName = selectedIsMob ? '모브' : selectedNode?.costumeId ? lineage?.reference?.costumes.find((item) => item.costumeId === selectedNode.costumeId)?.displayName ?? '의상명 확인 필요' : '캐릭터 미정';
  const supportCounts = useMemo(() => {
    const counts = { available: 0, unavailable: 0, unknown: 0 };
    for (const support of snapshot.supports) counts[getP3Availability(snapshot, 'support', support.supportId, cutoffDate, allowForecast, forecast).state]++;
    return counts;
  }, [snapshot, cutoffDate, allowForecast, forecast]);
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (analysis?.rows ?? []).filter((row) => {
      if (normalized && !matchesNameQuery(query, [row.name, snapshot.skills.find(skill => skill.skillId === row.skillId)?.nameJa], [row.skillId])) return false;
      if (listView === 'candidates') return row.grade !== 'excluded' && row.applicability !== 'inapplicable';
      if (listView === 'green') return row.isGreen && row.grade !== 'excluded' && row.applicability !== 'inapplicable';
      if (listView === 'routes') return row.routes.length > 0 && row.grade !== 'excluded' && row.applicability !== 'inapplicable';
      if (listView === 'unverified') return row.applicability === 'unverified';
      if (listView === 'inapplicable') return row.grade === 'excluded' || row.applicability === 'inapplicable';
      return true;
    });
  }, [analysis, listView, query, snapshot.skills]);
  const selectedCount = deck.filter((row) => row.supportId).length;
  const season = ['미확인', '봄', '여름', '가을', '겨울'][tournament?.conditions.season ?? 0] ?? '기타 계절';

  function updateSlot(index: number, patch: Partial<DeckSlot>) {
    setDeck((previous) => previous.map((row, position) => position === index ? { ...row, ...patch } : row));
  }

  return <>
    <header className="site-header"><div className="shell header-content"><a className="brand" href="#skills-main"><span className="brand-mark" aria-hidden="true">系</span>인자 설계 연구소</a><button className="btn" onClick={onPedigree}>계보 설계로</button></div></header>
    <main id="skills-main" className="shell skills-main">
      
      <div className="skills-intro"><p className="eyebrow">스킬 · 인자작</p><h1>대회별 스킬 평가</h1><p>선택한 대회·각질에서 여러 주자에게 공통으로 유효한 백인자 후보와 인자작 편성을 비교합니다.</p></div>
      <section className="panel skills-context" aria-label="대회별 스킬 평가 조건">
        <label htmlFor="skills-event">대회<select id="skills-event" value={eventId} onChange={(event) => { setEventId(event.target.value); setLimit(30); }}>
          {tournaments.length === 0 && <option value="">확인된 대회 자료 없음</option>}
          <optgroup label="예정 챔미·LoH">{tournamentOptions.filter((option) => !option.past).map((option) => <option key={option.event.eventId} value={option.event.eventId}>{option.label}</option>)}</optgroup>
          {showPastEvents && <optgroup label="지난 대회">{tournamentOptions.filter((option) => option.past).map((option) => <option key={option.event.eventId} value={option.event.eventId}>{option.label}</option>)}</optgroup>}
          {!showPastEvents && selectedPastEvent && <optgroup label="저장 계획의 지난 대회"><option value={selectedPastEvent.event.eventId}>{selectedPastEvent.label}</option></optgroup>}
        </select></label>
        <label htmlFor="skills-style">각질<select id="skills-style" value={runningStyle} onChange={(event) => { setRunningStyle(event.target.value as Style); setLimit(30); }}>{Object.entries(STYLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label htmlFor="skills-scenario">인자작 시나리오<select id="skills-scenario" value={selectedScenarioId} onChange={(event) => setScenarioId(event.target.value)}>{snapshot.scenarios.map((scenario) => {
          const availability = getP3Availability(snapshot, 'scenario', scenario.scenarioId, cutoffDate, allowForecast, forecast);
          return <option key={scenario.scenarioId} value={scenario.scenarioId} disabled={availability.state === 'unavailable' || !!forecast && availability.state === 'unknown'}>{scenario.displayName}{availability.state === 'unknown' ? ' · 출시 순서 미확인' : availability.state === 'unavailable' ? ' · 대회 시점 제외' : availability.basis === 'jp-release-order' ? ' · 일본 순서상 가용 예상' : availability.basis === 'forecast' ? ' · 미래시' : ''}</option>;
        })}</select></label>
        <label htmlFor="skills-preference">추천 성향<select id="skills-preference" value={preference} onChange={(event) => setPreference(event.target.value as Preference)}><option value="balanced">균형 우선</option><option value="skills">스킬 수급 우선</option><option value="stability">육성 안정성 우선</option></select></label>
        <div className="skills-context-note"><div className="skills-date-options"><label className="skills-mode-label" htmlFor="skills-mode">출시 판단 기준<select id="skills-mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="tournament">대회 시작 시점</option><option value="current">현재 시점</option></select></label><label><input type="checkbox" checked={allowForecast} onChange={(event) => setAllowForecast(event.target.checked)} />날짜가 있는 미래시 포함</label></div><p>{forecast ? '일본 원본 대회 기준' : '기준일'} <strong data-testid="skills-cutoff">{forecast ? `JP ${forecast.jpEventDate ?? '일자 미확인'}` : dateKnown ? cutoffDate : '대회 일정 미확인'}</strong><br />{forecast ? 'JP 출시 ↔ JP 대회 · 한국 예상일과 구분' : mode === 'current' ? 'Asia/Seoul · 현재 기준일 이후 출시 제외' : 'Asia/Seoul · 대회 시작 이후 출시 제외'}</p></div>
      </section>
      <div className="skills-date-options p85-tournament-history"><label><input type="checkbox" data-testid="p85-show-past-events" checked={showPastEvents} onChange={(event) => setShowPastEvents(event.target.checked)} />지난 대회 목록 포함</label><span>목록의 대표 시나리오{representative ? ` (${representative.label})` : ''}는 아래 실제 인자작 시나리오 설정과 별개입니다.</span></div>
      {selectedPastEvent && <p className="caption" data-testid="p85-restored-past-event">지난 대회의 선택 ID와 저장 설정을 유지합니다. 다른 대회를 선택하면 기본 목록에서는 숨깁니다.</p>}
      {p5State?.error && <p className="skills-missing-note" role="alert">{p5State.error} 기존 대회는 계속 사용할 수 있습니다.</p>}
      {p5Event && <P5TournamentInfo event={p5Event} asOf={p5?.asOf ?? today} enabled={mode === 'tournament' && allowForecast} current={mode === 'current'} />}
      {forecast && scenarioId !== selectedScenarioId && <p className="caption">이 대회에서 확인할 수 없는 시나리오는 사용할 수 있는 시나리오로 전환했습니다.</p>}
      {tournament && <div className="skills-course" aria-label="선택 대회 조건">{tournament.format && <span>{tournament.format === 'league-of-heroes' ? '리그 오브 히어로스' : '챔피언스 미팅'}</span>}{tournament.fieldSize && <span>{tournament.fieldSize}인 레이스</span>}<span>{VENUES[course?.venue??'']??course?.venue??tournament.courseId}</span><span>{tournament.conditions.surface === 1 ? '잔디' : '더트'} {tournament.conditions.distance}m</span><span>{tournament.conditions.direction === 1 ? '시계방향' : '반시계방향'}</span><span>{season}</span><span>{({ 1: '맑음', 2: '흐림', 3: '비', 4: '눈' } as Record<number, string>)[tournament.conditions.weather ?? 0] ?? '날씨 미확인'}</span><span>{({ 1: '양호', 2: '다습', 3: '포화', 4: '불량' } as Record<number, string>)[tournament.conditions.ground ?? 0] ?? '마장 상태 미확인'}</span>{tournament.timeOfDay && <span>{tournament.timeOfDay === 'night' ? '밤' : '낮'}</span>}<span>{tournament.dateStatus === 'forecast' ? '예상 대회 · 변동 가능' : tournament.dateStatus === 'secondary' ? '2차 자료 일정' : tournament.dateStatus === 'unknown' ? '한국 적용 조건 확인 필요' : '공식 대회 조건'}</span></div>}
      {!dateKnown && <p className="skills-missing-note" role="alert">대회 시작일 근거가 없어 해당 시점의 출시를 판정할 수 없습니다. 현재 시점 기준으로 검토할 수 있습니다.</p>}
      <section className="panel skills-deck-panel" aria-label="본육성 서포트 편성"><div className="section-heading"><h2>본육성 서포트 6장</h2><span className="count" data-testid="skills-deck-count">{selectedCount} / 6 선택</span></div><p className="caption">본육성에서 얻을 수 있는 힌트·이벤트·레어 하위 경로를 분석합니다. 이미 수급 가능한 스킬도 추가 힌트 가치가 있어 후보로 유지합니다.</p>
        <div className="skills-deck">{deck.map((slot, index) => {
          const support = snapshot.supports.find((row) => row.supportId === slot.supportId);
          const availability = support ? getP3Availability(snapshot, 'support', support.supportId, cutoffDate, allowForecast, forecast) : null;
          return <div className="skills-support-slot" key={index} data-testid={`skills-deck-slot-${index}`}><div className="skills-support-slot-heading"><span>서포트 {index + 1}</span>{support && <button aria-label={`서포트 ${index + 1} 비우기`} onClick={() => updateSlot(index, { supportId: null })}>×</button>}</div><button className="skills-support-pick" onClick={() => setEditing(index)} aria-label={`서포트 ${index + 1} 선택`}>{support ? <SupportCardIdentity support={support} /> : <><span className="skills-support-placeholder" aria-hidden="true">+</span><strong>카드 선택</strong><small>카드명으로 검색</small></>}</button><label htmlFor={`skills-lb-${index}`} className="visually-hidden">서포트 {index + 1} 돌파</label><select id={`skills-lb-${index}`} disabled={!support} value={slot.limitBreak} onChange={(event) => updateSlot(index, { limitBreak: Number(event.target.value) })}>{Array.from({ length: 5 }, (_, value) => <option key={value} value={value}>{value === 4 ? '4돌파 · 완전 돌파' : `${value}돌파`}</option>)}</select>{availability && <p className={`skills-slot-state ${availability.state}`}>{availability.state === 'available' ? ['jp-release-order', 'forecast'].includes(availability.basis) ? '미래시 예상' : '자료상 가용' : availability.state === 'unknown' ? '한국 출시 미확인' : '기준일 이후 · 이용 불가'}</p>}</div>;
        })}</div>
        {selectedCount < 6 && (
          <p className="skills-warning-inline" role="status">
            <span aria-hidden="true">⚠</span>
            <span>
              편성이 미완성입니다. 선택한 카드의 경로만 분석하며
              전체 본육성 수급 정보는 부족합니다.
            </span>
          </p>
        )}
        {analysis?.deckAnalysis.warnings.filter((warning) => !warning.startsWith('본육성 서포트 6장이 미완성')).map((warning) => <p className={warning.startsWith('기준일 가용성') ? 'skills-missing-note' : 'caption'} key={warning}>{warning}</p>)}
      </section>
      {lineage && <section className="panel p7-node-context" data-testid="p7-recommendation-context" data-node-id={nodeId ?? 'global'} data-mode={nodeId ? nodeMode : 'global'}>
        <div className="section-heading"><h2>인자작 계획</h2><span className="phase">보유 기록 · 제작 목표</span></div>
        <div className="p7-context-controls"><label>추천 범위<select data-testid="p7-recommendation-scope" value={nodeId ? 'node' : 'global'} onChange={(event) => lineage.onSelectNode(event.target.value === 'global' ? null : nodeId)}><option value="global">전역 우선순위</option><option value="node" disabled={!nodeId}>선택 계보 노드 · 노드 목표만 적용</option></select></label>
          <label>육성 대상 노드<select data-testid="p7-node-select" value={nodeId ?? ''} onChange={(event) => lineage.onSelectNode(event.target.value || null)}><option value="">일반 추천 사용</option>{[{ label: '부모·조부 인자작', depths: [1, 2] }, { label: '본육성·모브 기록', depths: [0, 3, 4] }].map((group) => <optgroup key={group.label} label={group.label}>{getLineageSlots(lineage.plan).filter((slot) => group.depths.includes(slot.depth)).map((slot) => { const costumeId = lineage.plan.nodes[slot.nodeId]!.costumeId; return <option key={slot.nodeId} value={slot.nodeId}>{slot.label} · {slot.depth > 2 ? '모브' : lineage.reference?.costumes.find((costume) => costume.costumeId === costumeId)?.displayName ?? '인물 미정'}</option>; })}</optgroup>)}</select></label>
          {nodeId && <label>인자작 수급 시점<select data-testid="p7-acquisition-mode" value={nodeMode} onChange={(event) => setNodeModes((previous) => ({ ...previous, [nodeId]: event.target.value as 'current' | 'forecast' }))}><option value="current">현재 한국 서버에서 인자작</option><option value="forecast">미래시 설계 · 일본 대회 출시 순서</option></select></label>}</div>
        {nodeId && nodeAnalysis ? <><div className="p85-node-heading">{!selectedIsMob && <GameAssetImage kind="costume" id={selectedNode?.costumeId} label={selectedName} />}<div><h3>{nodeAnalysis.self.label} · {selectedName}</h3><p>선택한 인자 개체의 기록과 제작 목표를 관리합니다.</p></div></div><p>선택한 인자의 목표 대회·각질을 기준으로 비교합니다. 이 캐릭터의 실제 육성 각질을 가정하지 않습니다.</p>
          {!!lineage.unconfirmedNodeIds?.length && <p className="p8-warning" data-testid="p8-skills-bloodline-warning">조상 연결 미확인 · 기록은 계획상 관계로 비교합니다.</p>}
          <p>직접 부모: {nodeAnalysis.parents.map((item) => item.label).join(', ') || '31인 범위 밖'}<br />조부모: {nodeAnalysis.grandparents.map((item) => item.label).join(', ') || '31인 범위 밖'}</p>
          <p>{nodeMode === 'current' ? `현재 한국 ${today} 기준 · 미래 콘텐츠 제외` : `명시적 미래시 설계 · JP ${nodeForecast?.jpEventDate ?? '기준 미확인'} · 한국 적용 미인증`}. 노드 목표 {nodePriorities.length}개만 적용하며 전역 목표 {lineage.globalPriorities.length}개는 별도로 보존합니다.</p>
          <p>실제 백인자: 자기 {nodeAnalysis.self.owned.length}개 · 직접 부모 {nodeAnalysis.parents.reduce((sum, item) => sum + item.owned.length, 0)}개 · 조부모 {nodeAnalysis.grandparents.reduce((sum, item) => sum + item.owned.length, 0)}개. 사용자 기록이며 계승·백인자 생성 완료를 뜻하지 않습니다. 미입력·일부 입력 {nodeAnalysis.unknownNodeIds.length}노드.</p>
          {nodeAnalysis.missingAncestorSlots > 0 && <p>상위 {nodeAnalysis.missingAncestorSlots}슬롯은31인 계보 밖이라 확인할 수 없습니다. 추가 조상을 가정하지 않는 일반 스킬 수급 추천만 제공합니다.</p>}
          <p>최종 본육성 덱의 {mainTrainingRoutes.length}개 잠재 경로는 상단 본육성 기준({forecast ? `JP ${forecast.jpEventDate}` : cutoffDate})의 별도 비교 정보입니다. {nodeAnalysis.depth > 0 ? '이 덱을 부모·조부 인자작용 덱으로 사용하지 않습니다.' : '본육성 경로가 있어도 인자작 목표를 자동 삭제하지 않습니다.'} 기록·목표 편집과 추천은 선택한 노드에만 적용됩니다.</p>
          {nodeRecommendation.error && <p role="alert">{nodeRecommendation.error}</p>}
          <div className="p7-context-actions"><button className="btn" onClick={lineage.onEditNode}>선택 인자의 백인자 편집</button><button className="btn primary" disabled={!recommendationRequest} onClick={lineage.onRunNode}>선택한 인자의 서포트 추천</button></div>
          {nodeEditor && <div className="p85-planning-editor" data-testid="p85-node-editor">{nodeEditor}</div>}
        </> : <p>전역 목표를 위한 추천입니다. 계보 보유 정보로 점수나 목표를 자동 변경하지 않습니다. 노드를 선택하면 별도의 노드 목표와 현재 인자작 기준으로 전환합니다.</p>}
      </section>}
      <SupportRecommendations snapshot={snapshot} request={recommendationRequest} contextKey={JSON.stringify([workspaceInputs ? workspaceFingerprint(workspaceInputs) : null, nodeId ? [eventId, nodeId, nodeMode, lineage?.plan, lineage?.whiteFactors] : [eventId, mode]])} p5={p5} eventId={eventId}
        hidePriorityEditor={!!nodeId && !!nodeEditor}
        priorities={lineage ? nodeId ? nodePriorities : lineage.globalPriorities : undefined}
        onPrioritiesChange={lineage ? (next) => { if (nodeId) lineage.onWhiteFactorsChange(setNodeSkillPriorities(lineage.whiteFactors, lineage.plan, snapshot, nodeId, next)); else lineage.onGlobalPrioritiesChange(next); } : undefined}
        manualOnly={!!nodeId} runToken={nodeId && nodeId === lineage?.runNodeId ? lineage?.runToken : 0} mainTrainingRoutes={nodeId ? mainTrainingRoutes : undefined} lineageAnalysis={nodeAnalysis ?? undefined}
        supportSettings={supportSettings} onSupportSettingsChange={onSupportSettingsChange} workspaceInputs={workspaceInputs} snapshotIds={snapshotIds} planTitle={planTitle}
        onResultSnapshot={onResultSnapshot} eventLabel={tournamentOptions.find(option => option.event.eventId === eventId)?.label ?? tournament?.name} scopeLabel={nodeId ? `${nodeAnalysis?.self.label ?? '계보'} · ${nodeMode === 'current' ? '현재 한국 인자작' : '미래시 설계'}` : '전역 목표 추천'} />
      <div className="skills-content"><section className="panel skills-results" aria-label="스킬 평가 결과"><div className="section-heading"><div><h2>스킬 후보</h2><p className="skills-results-intro">{STYLES[runningStyle]} 공통 유효성 · 마신·발동률 수치 미확인</p></div><span className="count" data-testid="skills-result-count">{rows.length}개</span></div>
        <div className="skills-results-controls"><div className="field"><label htmlFor="skills-search">스킬명 검색</label><input id="skills-search" className="skills-search-input" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30); }} /></div><div className="field"><label htmlFor="skills-list-view">결과 보기</label><select id="skills-list-view" value={listView} onChange={(event) => { setListView(event.target.value); setLimit(30); }}><option value="candidates">유효·조건부·미검증 후보</option><option value="green">패시브 스킬</option><option value="routes">본육성 수급 경로 있음</option><option value="unverified">조건 해석 미검증</option><option value="inapplicable">비대상·비해당</option><option value="all">전체</option></select></div></div>
        <p className="skills-results-intro">전제 포함 Pt는 출처 기반 상하위 관계의 참고 합계이며 한국 적용 검증 대기입니다. 힌트 할인은 반영하지 않습니다.</p>
        <label className="skills-date-options"><input type="checkbox" checked={includeUnknown} onChange={(event) => { setIncludeUnknown(event.target.checked); setLimit(30); }} />한국 출시 미확인 스킬 연구 검토 포함</label>
        {includeUnknown && (
          <p className="skills-warning-inline" role="note">
            <span aria-hidden="true">⚠</span>
            <span>
              미확인 스킬은 평가 검토용입니다.
              한국 서버에서 사용 가능하다고 판정하지 않습니다.
            </span>
          </p>
        )}
        <ul className="skills-list">{rows.slice(0, limit).map((row) => <SkillRow key={row.skillId} row={row} snapshot={snapshot} />)}</ul>
        {rows.length === 0 && <p className="skills-empty">현재 조건에 표시할 스킬이 없습니다. 대회·각질·검색어와 한국 출시 확인 상태를 확인하세요.</p>}
        {rows.length > limit && <button className="btn skills-load-more" onClick={() => setLimit((value) => value + 30)}>스킬 30개 더 보기 ({Math.min(limit, rows.length)} / {rows.length})</button>}
      </section><aside className="skills-sidebar">
        <section className="panel"><h2>평가 기준</h2><ul><li>해당 대회·각질의 여러 주자에게 공통 유효한 조건을 우선합니다.</li><li>발동 조건이 맞는 저비용 스피드·스태미나 패시브 스킬을 우대합니다.</li><li>시계방향·계절 스피드 패시브 스킬을 우선하고 고비용 패시브는 부가 확보로 봅니다.</li><li>가속기 중복 추정으로 유효한 백인자 후보를 감점하지 않습니다.</li></ul><p>성향은 같은 유효 스킬 집합에서 수급·편성 구성의 우선순위를 조정합니다.</p></section>
        {p5 && p5.skillEvidence.some((row) => row.eventId === eventId && row.runningStyle === runningStyle) && <details className="panel" data-testid="p5-skill-evidence"><summary>추가 공략 참고 · 정량 미인증</summary><p>공략 의견은 참고 근거입니다. 절대 우선 제약이나 검증된 마신 점수로 승격하지 않습니다.</p>{p5.skillEvidence.filter((row) => row.eventId === eventId && row.runningStyle === runningStyle).map((row, index) => <div key={`${row.skillId}:${index}`}><strong>{snapshot.skills.find((skill) => skill.skillId === row.skillId)?.displayName ?? row.skillId}</strong><p>{row.sourceServer} 자료 · 한국 패치 일치 미검증 · 마신·유효율 미인증</p>{row.sources.map((source, sourceIndex) => <p key={`${source.url}:${sourceIndex}`}><a href={source.url} target="_blank" rel="noreferrer">공략 원문</a> · 확인 {source.checkedOn}{typeof source.updatedOn === 'string' ? ` · 갱신 ${source.updatedOn}` : ''}</p>)}</div>)}</details>}
        <section className="panel"><h2>자료와 출시 상태</h2><div className="skills-stat-row"><div><span>실제 스킬</span><b>{snapshot.skills.length}</b></div><div><span>실제 서포트</span><b>{snapshot.supports.length}</b></div></div><p data-testid="skills-support-availability">서포트 가용 {supportCounts.available} · 기준일 이후 {supportCounts.unavailable} · 미확인 {supportCounts.unknown}</p><p>일본·Global 출시일은 한국 출시일로 대신하지 않습니다. 출처 번역과 공식 한국어 명칭 확인도 구별합니다.</p>{analysis?.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>
        {(snapshot.scenarioSkillRoutes?.length ?? 0) > 0 && <section className="panel"><h2>시나리오 별도 수급</h2><p>선택 시나리오의 원본 획득 경로입니다. 링크·선택지·성공 조건과 한국 적용을 추가 확인해야 하며, 카드의 확정 수급으로 합산하지 않습니다.</p><ul>{snapshot.scenarioSkillRoutes?.filter(r=>r.scenarioId===selectedScenarioId).map(r=><li key={r.skillId}>{snapshot.skills.find(s=>s.skillId===r.skillId)?.displayName??r.skillId} · {r.label}</li>)}</ul></section>}
        {(snapshot.supportEvents?.length ?? 0) > 0 && <details className="panel"><summary>선택 카드의 이벤트 선택지 · 출처별 참고</summary><p>원본 보상에서 직접 연결한 선택지입니다. 분기·성공·패치 차이와 한국 적용은 미검증입니다. 서버 미확인 자료는 신규 한국 수급으로 합산하지 않습니다. 최대 60건 표시합니다.</p>{snapshot.supportEvents?.filter(e=>deck.some(s=>s.supportId===e.supportId)).slice(0,60).map(e=><div key={e.eventId}><strong>{e.label}</strong><p>{eventServerLabel(e.server)} · 획득 보장 아님</p>{e.choices.map(c=><p key={c.choiceId}>{c.label}: {c.skills.map(s=>`${snapshot.skills.find(x=>x.skillId===s.skillId)?.displayName??s.skillId}${s.hintLevel===null?'':` Lv${s.hintLevel}`}`).join(', ')||'직접 연결된 스킬 보상 없음'}</p>)}</div>)}</details>}
      </aside></div>
      
    </main>
    {editing !== null && <SupportPicker snapshot={snapshot} cutoffDate={cutoffDate} allowForecast={allowForecast} forecast={forecast} slot={editing} selectedIds={deck.flatMap((row) => row.supportId ? [row.supportId] : [])} currentId={deck[editing]?.supportId ?? null} onClose={() => setEditing(null)} onSelect={(id) => { updateSlot(editing, { supportId: id }); setEditing(null); }} />}
  </>;
}

function SkillRow({ row, snapshot }: { row: EvaluationRow; snapshot: DeepReadonly<P3Snapshot> }) {
  const skill = snapshot.skills.find((value) => value.skillId === row.skillId);
  return <li data-testid={`skill-result-${row.skillId}`}><div className="skills-row-heading"><div><h3>{row.name}</h3><small>{translationLabel(skill?.translationStatus ?? '', !!skill?.nameKo)}</small></div><span className={`skills-grade ${row.grade}`}>{GRADE_LABELS[row.grade]}</span></div>
    <div className="skills-badges"><span className={row.isGreen ? 'green' : ''}>{row.isGreen ? '패시브 스킬' : row.rarity === 2 ? '레어 스킬' : '일반·기타 스킬'}</span><span>{APPLICABILITY_LABELS[row.applicability]}</span><span>{CONDITION_CLASS_LABELS[row.conditionClass]}</span><span>{row.cost === null ? '스킬Pt 미확인' : `표시 ${row.cost} Pt`}</span><span>{row.totalCost === null ? '전제 포함 비용 미확인' : `전제 포함 ${row.totalCost} Pt`}</span><span>{EFFICIENCY_LABELS[row.costEfficiency]}</span>{row.valueEvidence.core.status === 'guide-priority' ? <span>동일 대회 공략의 주요 목표</span> : row.core === 'candidate' && <span>가속 구간 검토 후보</span>}</div>
    <p className="skills-description">{skill?.descriptionKo ?? skill?.descriptionJa ?? skill?.descriptionEn ?? row.effectSummary}</p>
    <ul className="skills-reasons">{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    {row.valueEvidence.accelerationWindow.status !== 'not-acceleration' && <p className="skills-route">{row.valueEvidence.accelerationWindow.reason} 발동 위치 검토이며 실제 가속 지속·마신 이득의 실측값은 아닙니다.</p>}
    {row.valueEvidence.core.sourceUrls.map((url) => <p className="skills-route" key={url}><a href={url} target="_blank" rel="noreferrer">동일 조건 공략의 핵심 목표 근거</a></p>)}
    <p className={`skills-slot-state ${row.availability.state}`}>{availabilityLabel(row.availability)}</p>
    {row.routes.length > 0 ? <div>{row.routes.slice(0, 5).map((route, index) => <p className="skills-route" key={`${route.supportId}:${route.sourceSkillId}:${route.kind}:${index}`}><strong>{route.kind === 'hint' ? '일반 힌트' : route.kind === 'event' ? '이벤트' : '레어 → 하위'}</strong> · {route.supportName} · {route.limitBreak}돌파{route.kind === 'gold-lower' ? ` · 레어의 ${route.sourceKind === 'event' ? '이벤트' : '일반 힌트'} 경로 · ${snapshot.skills.find((value) => value.skillId === route.goldSkillId)?.displayName ?? route.goldSkillId ?? route.sourceSkillId}` : ''}{route.hintLevel === null ? ' · 힌트Lv 미확인' : ` · 힌트Lv 효과 ${route.hintLevel}`}<br />획득 가능 경로 · 확정 수급 아님</p>)}{row.routes.length > 5 && <p className="skills-route">외 {row.routes.length - 5}개 경로</p>}<p className="skills-route">이미 수급 가능해도 추가 힌트 후보로 유지합니다.</p></div> : <p className="skills-route">선택한 본육성 서포트에서 확인된 경로 없음</p>}
    <details className="skills-row-details"><summary>조건·효과 확인</summary><p>{row.conditionSummary}</p><p>{row.effectSummary}</p><p>마신 이득·발동률 미확인 · 한국 적용 검토 필요</p></details>
  </li>;
}

