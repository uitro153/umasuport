import { useEffect, useMemo, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { SavedPlan } from '../../domain/saved-plan';
import type { ReferenceSnapshot } from '../../domain/reference';
import type { P3Snapshot } from '../../domain/skill-support';
import type { P5Snapshot } from '../../domain/p5-forecast';
import { getLineageSlots } from '../../domain/lineage';
import { buildSavedPlanRecommendationRequest, compareFreshSupportDecks, compareRecommendationContexts, compareSavedPlanInputs, evaluateSavedPlanLineage, firstCurrentDeck, getCompatiblePlanRoutes, type evaluateSavedSupportLineup } from '../../engine/plan-comparison';
import SupportCardIdentity from '../skills/SupportCardIdentity';
import type { P4CardRecommendation, P6PersonalizedRecommendationResult } from '../../engine/support-deck-optimizer';
import type { PlanComparisonWorkerMessage, PlanComparisonWorkerResponse } from './plan-comparison.worker';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import './plan-comparison.css';

interface Props {
  left: SavedPlan; right: SavedPlan; snapshot: DeepReadonly<P3Snapshot>;
  reference: DeepReadonly<ReferenceSnapshot>; p5?: DeepReadonly<P5Snapshot> | null;
  onClose?: () => void;
}
type SideResult = { current: P6PersonalizedRecommendationResult; savedLineup: ReturnType<typeof evaluateSavedSupportLineup> };
interface FreshState { signature: string; left?: SideResult; right?: SideResult; error?: string }
const changedLabels = { position: '계보 위치', costume: '의상', instance: '실제 인자 개체', bloodline: '혈통 연결·확인', 'red-factor': '빨간 인자', lock: '고정', 'white-factors': '보유·제작 백인자', 'node-priorities': '노드 목표' };

/** Each pair is recalculated in an isolated worker; stored scores are never inputs. */
export default function PlanComparison({ left, right, snapshot, reference, p5 = null, onClose }: Props) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const currentSnapshots = useMemo(() => ({ reference: reference.snapshotId, p3: snapshot.snapshotId, p5: p5?.snapshotId ?? null }), [reference.snapshotId, snapshot.snapshotId, p5?.snapshotId]);
  const preparation = useMemo(() => {
    try {
      return { differences: compareSavedPlanInputs(left, right, currentSnapshots),
        lineage: [evaluateSavedPlanLineage(left, reference), evaluateSavedPlanLineage(right, reference)],
        requests: [buildSavedPlanRecommendationRequest(left, snapshot, p5, today), buildSavedPlanRecommendationRequest(right, snapshot, p5, today)], error: null };
    } catch (error: unknown) { return { differences: null, lineage: [], requests: [], error: error instanceof Error ? error.message : '저장 계획을 비교하지 못했습니다.' }; }
  }, [left, right, snapshot, reference, p5, today, currentSnapshots]);
  const signature = JSON.stringify([currentSnapshots, today, left.planId, right.planId, left.inputs, right.inputs, left.resultSnapshot?.cards, right.resultSnapshot?.cards]);
  const [state, setState] = useState<FreshState | null>(null);
  useEffect(() => {
    if (preparation.error || preparation.requests.length !== 2) return;
    const worker = new Worker(new URL('./plan-comparison.worker.ts', import.meta.url), { type: 'module' });
    let active = true;
    worker.onmessage = (event: MessageEvent<PlanComparisonWorkerResponse>) => {
      if (!active) return;
      const message = event.data;
      const side = message.signature === `${signature}:left` ? 'left' : message.signature === `${signature}:right` ? 'right' : null;
      if (!side) return;
      if (message.type === 'error') { setState({ signature, error: message.message }); worker.terminate(); return; }
      setState((previous) => ({ ...(previous?.signature === signature ? previous : {}), signature, [side]: { current: message.result, savedLineup: message.savedLineup } }));
    };
    worker.onerror = () => { if (active) setState({ signature, error: '비교 계산 Worker가 중단되었습니다. 입력은 보존되어 있습니다.' }); };
    worker.postMessage({ type: 'init', snapshot } satisfies PlanComparisonWorkerMessage);
    for (const [index, side] of ['left', 'right'].entries()) worker.postMessage({ type: 'compare', signature: `${signature}:${side}`, request: preparation.requests[index]!, saved: index === 0 ? left : right } satisfies PlanComparisonWorkerMessage);
    return () => { active = false; worker.terminate(); };
  }, [snapshot, signature, preparation, left, right]);
  const current = state?.signature === signature ? state : null;
  const before = current?.left ? firstCurrentDeck(current.left.current) : null;
  const after = current?.right ? firstCurrentDeck(current.right.current) : null;
  const contexts = preparation.requests.length === 2 ? compareRecommendationContexts(preparation.requests[0]!, preparation.requests[1]!) : null;
  const leftRoutes = before?.deck ? getCompatiblePlanRoutes(snapshot, before.deck, preparation.requests[0]?.scenarioId) : [];
  const rightRoutes = after?.deck ? getCompatiblePlanRoutes(snapshot, after.deck, preparation.requests[1]?.scenarioId) : [];
  const deckDiff = before?.deck && after?.deck ? compareFreshSupportDecks(before.deck, after.deck, { left: leftRoutes, right: rightRoutes }) : null;
  const savedLeft = current?.left?.savedLineup.inspection?.deck;
  const savedRight = current?.right?.savedLineup.inspection?.deck;
  const savedDeckDiff = savedLeft && savedRight ? compareFreshSupportDecks(savedLeft, savedRight, {
    left: getCompatiblePlanRoutes(snapshot, savedLeft, preparation.requests[0]?.scenarioId), right: getCompatiblePlanRoutes(snapshot, savedRight, preparation.requests[1]?.scenarioId),
  }) : null;
  const skillName = (id: string) => snapshot.skills.find((row) => row.skillId === id)?.displayName ?? '스킬 확인 필요';
  const listSkills = (ids: readonly string[]) => ids.length ? ids.map(skillName).join(' · ') : '없음';
  const costumeName = (id: string | null | undefined) => id ? reference.costumes.find((row) => row.costumeId === id)?.displayName ?? '의상 확인 필요' : '캐릭터·의상 미선택';
  function savedNodeDetails(saved: SavedPlan, nodeId: string) {
    const node = saved.inputs.referencePlan.nodes[nodeId];
    if (!node) return <p>이 계획에 해당 소유 노드가 없습니다.</p>;
    const instance = saved.inputs.factorInstances[nodeId]; const white = saved.inputs.whiteFactors.nodes[nodeId];
    const goals = saved.inputs.whiteFactors.nodePriorities[nodeId]?.priorities ?? [];
    const slots = getLineageSlots(saved.inputs.referencePlan);
    const ownerName = (id: string) => slots.find(slot => slot.nodeId === id)!.depth > 2 ? '모브' : costumeName(saved.inputs.referencePlan.nodes[id]?.costumeId);
    return <dl className="plan-node-values">
      <dt>소유 의상</dt><dd>{ownerName(nodeId)}</dd>
      <dt>인자 개체</dt><dd>{instance ? <>{instance.bloodlineStatus === 'confirmed' ? '혈통 사용자 확인' : '혈통 재확인 필요'}</> : '인자 개체 미등록 · 신규 계획'}</dd>
      <dt>부모 연결</dt><dd>{node.parentIds ? node.parentIds.map(ownerName).join(' / ') : '31인 범위 밖'}</dd>
      <dt>빨간 인자·고정</dt><dd>{node.redFactor ? `${APTITUDE_LABELS[node.redFactor.type]} ${'★'.repeat(node.redFactor.stars)} (${node.redFactor.stars}성)` : '빨간 인자 미입력'} · {node.locked ? '현재 인자·혈통 고정' : '고정 안 함'}</dd>
      <dt>백인자 입력</dt><dd>{white?.inventoryStatus === 'reviewed' ? '사용자가 목록 확인' : white?.inventoryStatus === 'partial' ? '일부 입력' : '미입력·미보유 확정 아님'}{white?.records.length ? <ul>{white.records.map((record) => <li key={`${record.skillId}:${record.status}`}>{skillName(record.skillId)} · {record.status === 'owned' ? '실제 보유 사용자 기록' : '제작 목표 · 미확보'} · {record.stars === null ? '별수 미확인' : '★'.repeat(record.stars)} · {record.classification.status === 'verified' ? '분류 확인' : '인자 자격 검토 필요'}</li>)}</ul> : <p>기록된 백인자 없음</p>}</dd>
      <dt>노드 스킬 우선순위</dt><dd>{goals.length ? goals.map((goal) => `${skillName(goal.skillId)} · ${goal.priority === 'required' ? '필수 확보' : goal.priority === 'strong' ? '강력 우대' : '우선 확보'}`).join(' / ') : '지정 없음'}</dd>
    </dl>;
  }
  return <section className="panel plan-comparison" aria-label="저장 계획 비교" data-testid="plan-comparison">
    <div className="plan-comparison-heading"><div><p className="eyebrow">현재 데이터로 다시 계산</p><h2>{left.name} ↔ {right.name}</h2></div>{onClose && <button className="btn" onClick={onClose}>비교 닫기</button>}</div>
    <p>저장 당시 점수와 스킬 합집합을 계산 입력으로 사용하지 않습니다. 양립 가능한 이벤트 선택지를 현재 규칙으로 다시 평가합니다.</p>
    {preparation.error ? <p role="alert">비교 보류: {preparation.error}</p> : <>
      <p className="plan-comparison-context" data-testid="plan-comparison-context">{contexts?.sameConditions ? '동일 계산 조건 비교' : '서로 다른 조건의 참고 비교 · 점수로 우열을 판정하지 않습니다.'}{!contexts?.sameUserGoals && ' 사용자 목표가 달라 사용자 보너스·맞춤 총점은 직접 우열 비교하지 않습니다.'}</p>
      {!contexts?.sameConditions && <p className="caption">다른 조건: {contexts?.differentConditions.join(', ')}</p>}
      {preparation.differences!.snapshotChanges.length > 0 && <details className="caption"><summary>저장 당시와 현재의 자료 버전 차이</summary><p>{preparation.differences!.snapshotChanges.map((row) => `${row.side === 'left' ? 'A' : 'B'} ${row.key}: ${row.saved ?? '미기록'} → ${row.current ?? '미확인'}`).join(' · ')}</p></details>}
      <div className="plan-comparison-columns">{[left, right].map((saved, index) => {
        const lineage = preparation.lineage[index]!; const evaluated = index === 0 ? before : after;
        const savedLineup = index === 0 ? current?.left?.savedLineup : current?.right?.savedLineup;
        return <article key={`${index}:${saved.planId}`} className="plan-comparison-side"><h3>{index === 0 ? 'A' : 'B'}. {saved.name}</h3>
          <p>{(p5?.tournaments.find(item => item.eventId === saved.inputs.skillSettings.eventId)?.name ?? snapshot.tournaments.find(item => item.eventId === saved.inputs.skillSettings.eventId)?.name) ?? '대회명 확인 필요'} · {({ front: '도주', pace: '선행', late: '선입', end: '추입' })[saved.inputs.skillSettings.runningStyle]} · {snapshot.scenarios.find(item => item.scenarioId === saved.inputs.skillSettings.scenarioId)?.displayName ?? '시나리오 미정'} · {saved.inputs.selectedNodeId ? getLineageSlots(saved.inputs.referencePlan).find(slot => slot.nodeId === saved.inputs.selectedNodeId)?.label ?? '선택 인자' : '전역 추천'}</p>
          <h4>본육성·부모·조부 구성</h4><ul className="plan-seven-inputs">{getLineageSlots(saved.inputs.referencePlan).filter((slot) => slot.depth <= 2).map((slot) => <li key={slot.nodeId}><strong>{slot.label}</strong> · {costumeName(saved.inputs.referencePlan.nodes[slot.nodeId]!.costumeId)}</li>)}</ul>
          <p>적성 목표: 계보에서 설정한 조부 인자의 생성 적성을 비교합니다.</p>
          <p>전역 사용자 목표: {saved.inputs.globalPriorities.length ? saved.inputs.globalPriorities.map((goal) => `${skillName(goal.skillId)} · ${goal.priority === 'required' ? '필수 확보' : goal.priority === 'strong' ? '강력 우대' : '우선 확보'}`).join(' / ') : '지정 없음'}</p>
          {lineage.blocked ? <p role="status">{lineage.issues.join(' ')}</p> : <><p>기본 상성: {lineage.affinity?.previewTotal ?? '계산 대기'} · 공개 식 / KR 실측 대기</p><p>{lineage.aptitudes?.changes.map((row) => `${APTITUDE_LABELS[row.type]} ${row.base}→${row.result}`).join(' · ')}</p><p>31인 적성 조건: {lineage.lineage?.hardSatisfied ? '현재 조건 충족' : '미충족·미선택 확인'}</p></>}
          {saved.resultSnapshot && <p className="caption">저장 당시 참고값: 정성 {saved.resultSnapshot.score.coverageValue} · 현재 결과와 구별합니다.</p>}
          {savedLineup?.available && <details><summary>저장 당시 6장 자체를 현재 규칙으로 재평가</summary>{savedLineup.issues.length ? <p>편성 부적격: {savedLineup.issues.join(' · ')}</p> : savedLineup.inspection?.deck ? <><p>현재 정성 {savedLineup.inspection.deck.score.coverageValue} + 사용자 {savedLineup.inspection.deck.score.preferenceBonus ?? 0} = {savedLineup.inspection.deck.score.customizedValue ?? savedLineup.inspection.deck.score.coverageValue} · 양립 {savedLineup.inspection.deck.compatibleSkillIds.length} · 패시브 스킬 {savedLineup.inspection.deck.greenSkillIds.length}</p><ComparisonSupportCards cards={savedLineup.inspection.deck.cards} snapshot={snapshot} /><p>현재 양립 목표 전체: {listSkills(savedLineup.inspection.deck.compatibleSkillIds)}</p>{savedLineup.inspection.skillPriorities?.targets.map((target) => <p key={target.skillId}>{skillName(target.skillId)} · {target.priority === 'required' ? '필수 확보' : target.priority === 'strong' ? '강력 우대' : '우선 확보'} · {target.attained ? '수급 기회 충족' : '미충족'}</p>)}<ul>{savedLineup.inspection.deck.eventDecisions.map((decision) => <li key={`${decision.supportId}:${decision.groupId}`}>{decision.label} · {decision.outcome === 'success' ? '성공 분기 가정' : decision.outcome === 'failure' ? '실패 분기 가정' : '선택지 경로'} · 획득 보장 아님 · {listSkills(decision.skillIds)}</li>)}</ul></> : <p>현재 조건에서 저장 6장 편성이 성립하지 않습니다. {savedLineup.inspection?.status}</p>}</details>}
          {!evaluated ? <p role="status">현재 데이터 추천 계산 중…</p> : <><p data-testid={`plan-comparison-score-${index}`}>정성 {evaluated.deck?.score.coverageValue ?? '—'} + 사용자 {evaluated.deck?.score.preferenceBonus ?? 0} = 맞춤 {evaluated.deck?.score.customizedValue ?? evaluated.deck?.score.coverageValue ?? '—'}</p>
            <p>{evaluated.result.status === 'ready' ? '계산 완료' : '계산 상태 확인 필요'} · {evaluated.deck?.compatibleSkillIds.length ?? 0}개 양립 목표 · 패시브 스킬 {evaluated.deck?.greenSkillIds.length ?? 0}개</p>
            {evaluated.result.skillPriorities?.targets.map((target) => <p key={target.skillId}>{skillName(target.skillId)} · {target.priority === 'required' ? '필수 확보' : target.priority === 'strong' ? '강력 우대' : '우선 확보'} · {target.attained ? '수급 기회 충족' : '미충족'}</p>)}
            {evaluated.deck && <ComparisonSupportCards cards={evaluated.deck.cards} snapshot={snapshot} />}
            {evaluated.deck && <details><summary>양립 이벤트 계획·수급 경로 전체</summary><ul>{evaluated.deck.eventDecisions.map((decision) => <li key={`${decision.supportId}:${decision.groupId}`}>[{decision.supportId}] {decision.label} / 선택 {decision.optionId} / {decision.assurance} / {decision.outcome} · {listSkills(decision.skillIds)}{decision.condition ? ` · ${decision.condition}` : ''}</li>)}</ul><ul>{(index === 0 ? leftRoutes : rightRoutes).map((route, routeIndex) => <li key={`${route.supportId}:${routeIndex}`}>[{route.supportId}] {skillName(route.skillId)} ← {route.kind} / 원 스킬 {route.sourceSkillId} / {route.sourceServer ?? '서버 미확인'}</li>)}</ul><p>미확인 이벤트: {listSkills(evaluated.deck.unresolvedEventSkillIds)}</p><p>중복 목표: {listSkills(evaluated.deck.duplicateSkillIds)}</p><p>놓친 주요 목표: {listSkills(evaluated.deck.missingImportantSkillIds)}</p></details>}
            <p className="caption">{evaluated.result.search.globalOptimal ? '해당 탐색 조건에서 전역 최적 확인' : '제한된 후보·탐색 범위의 최선 발견안'} · 이벤트 계획 제한 {evaluated.result.search.eventPlanLimit}{evaluated.result.search.eventPlansPruned ? ' (가지치기 발생)' : ''}</p>
          </>}
        </article>;
      })}</div>
      {current?.error && <p role="alert">비교 계산 실패: {current.error}</p>}
      {deckDiff && <div data-testid="plan-comparison-skill-difference"><h3>A → B 전체 차집합</h3><p>새로 확보: {listSkills(deckDiff.gainedSkillIds)}</p><p>잃는 스킬: {listSkills(deckDiff.lostSkillIds)}</p><p>패시브 스킬 추가: {listSkills(deckDiff.gainedGreenSkillIds)}</p><p>패시브 스킬 감소: {listSkills(deckDiff.lostGreenSkillIds)}</p><p>이벤트 계획 {deckDiff.eventPlansChanged ? '변경' : '동일'} · 수급 경로 추가 {deckDiff.gainedRoutes.length}개 / 감소 {deckDiff.lostRoutes.length}개</p></div>}
      {savedDeckDiff && <details data-testid="plan-comparison-saved-lineup-difference"><summary>저장된 6장 A → B의 현재 규칙 전체 차집합</summary><p>새로 확보: {listSkills(savedDeckDiff.gainedSkillIds)}</p><p>잃는 스킬: {listSkills(savedDeckDiff.lostSkillIds)}</p><p>패시브 스킬 추가: {listSkills(savedDeckDiff.gainedGreenSkillIds)}</p><p>패시브 스킬 감소: {listSkills(savedDeckDiff.lostGreenSkillIds)}</p><p>이벤트 계획 {savedDeckDiff.eventPlansChanged ? '변경' : '동일'} · 경로 추가 {savedDeckDiff.gainedRoutes.length} / 감소 {savedDeckDiff.lostRoutes.length}</p></details>}
      <details data-testid="plan-comparison-node-differences"><summary>31인 계보·입력 차이 ({preparation.differences!.nodes.length}개 노드)</summary>{preparation.differences!.nodes.map((node) => <details className="plan-node-difference" key={node.nodeId} data-testid={`plan-comparison-node-${node.nodeId}`}><summary>{node.leftLabel ?? '없음'} → {node.rightLabel ?? '없음'}: {node.changed.map((key) => changedLabels[key]).join(', ')}</summary><div className="plan-comparison-columns"><article><h4>A. {left.name}</h4>{savedNodeDetails(left, node.nodeId)}</article><article><h4>B. {right.name}</h4>{savedNodeDetails(right, node.nodeId)}</article></div></details>)}<p>설정 차이: {preparation.differences!.changedSettings.join(', ') || '없음'}</p></details>
    </>}
    <p className="caption">정성 점수 차이는 실제 육성 성능 향상이나 마신 이득을 뜻하지 않습니다. 이벤트 수급 기회는 획득 보장이 아닙니다.</p>
  </section>;
}

function ComparisonSupportCards({ cards, snapshot }: { cards: readonly P4CardRecommendation[]; snapshot: DeepReadonly<P3Snapshot> }) {
  return <ul className="p85-support-comparison-list">{cards.map((card) => <li key={card.supportId}>
    <SupportCardIdentity support={card} source={snapshot.supports.find((support) => support.supportId === card.supportId)} />
    <p className="p85-support-comparison-meta">{card.limitBreak}돌파 · {card.ownership === 'owned' ? '보유' : card.ownership === 'borrowed' ? '대여' : '보유 미등록'} · {card.acquisitionBasis === 'jp-reference-forecast' ? '일본 수급 참고' : '한국 경로 근거'}</p>
  </li>)}</ul>;
}
