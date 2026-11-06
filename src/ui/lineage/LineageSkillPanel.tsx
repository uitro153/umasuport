import { matchesNameQuery } from '../name-search';
import { useMemo, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { LineagePlan } from '../../domain/lineage';
import { getLineageSlots, getProtectedNodeIds } from '../../domain/lineage';
import type { LineageSkillState, WhiteFactorRecord } from '../../domain/lineage-skills';
import type { ReferenceSnapshot } from '../../domain/reference';
import type { P3Snapshot } from '../../domain/skill-support';
import { evaluateSkills, type SkillEvaluationRequest } from '../../engine/skill-evaluation';
import { analyzeLineageSkills, classifyWhiteFactor, getLineageSkillPresence, getNodeSkillPriorities,
  removeWhiteFactor, setNodeSkillPriorities, setWhiteInventoryStatus, upsertWhiteFactor } from '../../engine/lineage-skills';
import { MAX_SKILL_PRIORITIES, prioritySkillName, SKILL_PRIORITY_LABELS, type UserSkillPriority } from '../../engine/skill-priorities';
import SkillPrioritySettings from '../skills/SkillPrioritySettings';
import './lineage-skills.css';

export interface LineageSkillPanelProps {
  plan: LineagePlan;
  nodeId: string;
  snapshot: DeepReadonly<P3Snapshot>;
  referenceSnapshot?: DeepReadonly<ReferenceSnapshot> | null;
  state: LineageSkillState;
  onChange: (state: LineageSkillState) => void;
  globalPriorities?: readonly UserSkillPriority[];
  request?: SkillEvaluationRequest | null;
  onRecommend: () => void;
  onClose?: () => void;
  unconfirmedNodeIds?: string[];
}

const GRADE_LABELS = { priority: '우선 확보', useful: '유효 후보', conditional: '조건부 후보', supplementary: '부가 확보', excluded: '비해당', unverified: '평가 미검증' };
const STAGE_LABELS = { final: '최종 본육성 대상', parent: '부모 인자작 대상', grandparent: '조부 인자작 대상', deep: '깊은 조상 기록' };
const INVENTORY_LABELS = { unentered: '정보 미입력', partial: '일부 기록 입력', reviewed: '목록 확인함 · 사용자 확인' };
const ROUTE_LABELS: Record<string, string> = { hint: '일반 힌트', event: '이벤트', 'gold-lower': '금색 하위' };
type NodeView = ReturnType<typeof analyzeLineageSkills>['self'];

/** User notes and target proposals only. This panel never edits the P2 tree or scores. */
export default function LineageSkillPanel(props: LineageSkillPanelProps) {
  const { plan, nodeId, snapshot, state } = props;
  const [query, setQuery] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [message, setMessage] = useState('');
  const [editingLockedNodeId, setEditingLockedNodeId] = useState<string | null>(null);
  const [recordLimit, setRecordLimit] = useState(20);
  const [candidateLimit, setCandidateLimit] = useState(12);
  const analysis = useMemo(() => analyzeLineageSkills(plan, state, nodeId), [plan, state, nodeId]);
  const priorities = useMemo(() => getNodeSkillPriorities(state, plan, nodeId), [state, plan, nodeId]);
  const protectedNode = useMemo(() => getProtectedNodeIds(plan).has(nodeId), [plan, nodeId]);
  const canEdit = !protectedNode || editingLockedNodeId === nodeId;
  const skills = useMemo(() => new Map(snapshot.skills.map((row) => [row.skillId, row])), [snapshot]);
  const classifications = useMemo(() => new Map(snapshot.skills.map((row) => [row.skillId, classifyWhiteFactor(snapshot, row.skillId)])), [snapshot]);
  const costumes = useMemo(() => new Map(props.referenceSnapshot?.costumes.map((row) => [row.costumeId, row]) ?? []), [props.referenceSnapshot]);
  const evaluations = useMemo(() => props.request ? evaluateSkills(snapshot, props.request).rows : [], [snapshot, props.request]);
  const records = useMemo(() => [...analysis.self.owned, ...analysis.self.planned], [analysis.self]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? snapshot.skills.filter(row => matchesNameQuery(query, [row.nameKo, row.nameJa, row.displayName], [row.skillId])) : [];
  }, [snapshot, query]);
  const candidates = useMemo(() => {
    const selected = new Set([...priorities.map((row) => row.skillId), ...records.map((row) => row.skillId)]);
    const normalized = candidateQuery.trim().toLocaleLowerCase();
    return evaluations.filter((row) => {
      const classification = classifications.get(row.skillId)!;
      if (classification.skillId !== row.skillId || classification.status === 'unsupported') return false;
      if (normalized) return matchesNameQuery(candidateQuery, [row.name, skills.get(row.skillId)?.nameJa], [row.skillId]);
      return selected.has(row.skillId) || !['excluded', 'unverified'].includes(row.grade) && row.applicability !== 'inapplicable';
    }).sort((left, right) => Number(selected.has(right.skillId)) - Number(selected.has(left.skillId)));
  }, [evaluations, priorities, records, candidateQuery, classifications, skills]);
  const name = (id: string) => { const row = skills.get(id); return row ? prioritySkillName(row) : '스킬명 확인 필요'; };
  const nodeName = (node: NodeView) => node.depth > 2 ? '모브' : costumes.get(node.costumeId ?? '')?.displayName ?? (node.costumeId ? '의상명 확인 필요' : '캐릭터 미정');

  function commit(action: () => LineageSkillState) {
    try { props.onChange(action()); setMessage(''); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : '백인자 기록을 변경하지 못했습니다.'); }
  }
  function addRecord(skillId: string, status: WhiteFactorRecord['status']) {
    commit(() => upsertWhiteFactor(state, plan, snapshot, nodeId, { skillId, stars: null, status }));
  }
  function updateRecord(record: WhiteFactorRecord, patch: Partial<Pick<WhiteFactorRecord, 'stars' | 'status'>>) {
    commit(() => {
      const nextStatus = patch.status ?? record.status;
      const next = upsertWhiteFactor(state, plan, snapshot, nodeId, { skillId: record.skillId, stars: patch.stars === undefined ? record.stars : patch.stars, status: nextStatus });
      return nextStatus === record.status ? next : removeWhiteFactor(next, plan, nodeId, record.skillId, record.status);
    });
  }
  function updatePriorities(next: UserSkillPriority[]) { commit(() => setNodeSkillPriorities(state, plan, snapshot, nodeId, next)); }
  function propose(skillId: string) {
    if (priorities.some((row) => row.skillId === skillId)) return;
    updatePriorities([...priorities, { skillId, priority: 'preferred' }]);
  }
  function renderNode(node: NodeView) {
    return <li key={node.nodeId} className="p7-generation-node" data-testid={`p7-relative-${node.nodeId}`}>
      <strong>{node.label} · {nodeName(node)}</strong>
      <span>{INVENTORY_LABELS[node.inventoryStatus]}</span>
      {node.inventoryStatus === 'unentered' && <p>백인자 여부를 확인할 정보가 없습니다. 없음으로 판정하지 않습니다.</p>}
      {node.inventoryStatus === 'reviewed' && node.owned.length === 0 && <p>사용자가 확인한 목록에 실제 보유 기록이 없습니다.</p>}
      {node.owned.length > 0 && <p>실제 보유(사용자 기록): {node.owned.map((row) => `${name(row.skillId)} ${row.stars === null ? '별수 미확인' : `★${row.stars}`}`).join(', ')}</p>}
      {node.planned.length > 0 && <p className="p7-planned-text">제작 목표: {node.planned.map((row) => name(row.skillId)).join(', ')} · 아직 확보한 인자가 아닙니다.</p>}
    </li>;
  }

  return <section className="panel p7-lineage-panel" data-testid="p7-lineage-panel" data-node-id={nodeId} aria-label="선택 인자의 백인자와 스킬 목표">
    <div className="p7-panel-heading"><div><p className="eyebrow">백인자 · 제작 목표</p><h2>{analysis.self.label} · 백인자·스킬</h2><p>{STAGE_LABELS[analysis.stage]} · {nodeName(analysis.self)}</p></div>{props.onClose && <button type="button" className="btn" onClick={props.onClose}>상세 닫기</button>}</div>
    <p className="p7-policy-note">실제 보유는 사용자 직접 기록이며 공식 게임 데이터의 자동 인증이 아닙니다. 제작 목표·서포트 수급 기회·계승된 스킬은 서로 구분합니다. 입력하지 않은 백인자는 없음으로 취급하지 않습니다.</p>
    {!!props.unconfirmedNodeIds?.length && <p className="p7-review-note" data-testid="p8-lineage-unconfirmed">조상 연결 미확인 · 기록은 계획상 관계로 비교합니다.</p>}
    {analysis.missingAncestorSlots > 0 && <p className="p7-review-note">이 대상의 부모·조부 중 {analysis.missingAncestorSlots}명은 31인 범위 밖입니다. 전체 혈통이 갖춰졌다고 분석하지 않으며, 서포트 추천은 확인 가능한 정보와 사용자 목표만 사용합니다.</p>}
    {protectedNode && <div className="p7-locked-note"><p>인자·혈통은 잠겨 있습니다. 백인자 기록만 명시적으로 편집할 수 있으며 캐릭터·적인자·부모 연결은 바꾸지 않습니다.</p><label><input type="checkbox" checked={editingLockedNodeId === nodeId} onChange={(event) => setEditingLockedNodeId(event.target.checked ? nodeId : null)} />잠금된 인자의 백인자 기록 편집</label></div>}
    <div className="p7-record-editor">
      <h3>이 소유 노드의 백인자 기록</h3>
      <label className="p7-field">백인자 정보 확인 상태<select data-testid="p7-inventory-status" value={analysis.self.inventoryStatus} disabled={!canEdit} onChange={(event) => commit(() => setWhiteInventoryStatus(state, plan, nodeId, event.target.value as NodeView['inventoryStatus']))}><option value="unentered" disabled={analysis.self.owned.length > 0}>정보 미입력 · 없음이 아님</option><option value="partial" disabled={!analysis.self.costumeId}>일부 기록 입력 · 나머지 미확인</option><option value="reviewed" disabled={!analysis.self.costumeId}>전체 목록 확인 · 기록 밖 스킬은 없음</option></select></label>
      <p className="caption">전체 목록 확인은 사용자가 확인한 목록에 대한 진술입니다. 기록하지 않은 스킬도 있을 수 있다면 일부 기록 입력을 선택하세요.</p>
      <label className="p7-field" htmlFor={`p7-white-search-${nodeId}`}>백인자 스킬명 검색<input id={`p7-white-search-${nodeId}`} data-testid="p7-white-search" type="search" className="skills-search-input" value={query} disabled={!canEdit} onChange={(event) => { setQuery(event.target.value); setRecordLimit(20); }} autoComplete="off" /></label>
      <p className="caption">한국어명이 없으면 일본어 원문과 ID를 표시합니다. 금색은 명시된 일반 하위 관계로만 연결하며, 백인자 자격이 확인되지 않은 자료는 검토 필요로 남깁니다.</p>
      {query.trim() && <ul className="p7-search-results">{matches.slice(0, recordLimit).map((skill) => {
        const classification = classifications.get(skill.skillId)!;
        const target = classification.skillId ? skills.get(classification.skillId) : undefined;
        const owned = records.some((row) => row.skillId === classification.skillId && row.status === 'owned');
        const planned = records.some((row) => row.skillId === classification.skillId && row.status === 'planned');
        const unsupported = !target || classification.status === 'unsupported';
        return <li key={skill.skillId} data-testid={`p7-white-search-result-${skill.skillId}`}><div><strong>{prioritySkillName(skill)}</strong><small>{target && target.skillId !== skill.skillId ? `일반 목표: ${prioritySkillName(target)}` : '일반 백인자 목표 검토'}</small><p className="p7-classification">{classification.status === 'verified' ? '백인자 분류 근거 확인' : unsupported ? '일반 백인자 연결 불가' : '백인자 자격 검토 필요'}</p></div><div className="p7-record-add"><button type="button" className="btn" data-testid={`p7-add-owned-${skill.skillId}`} disabled={!canEdit || unsupported || owned || analysis.self.costumeId === null} onClick={() => addRecord(skill.skillId, 'owned')}>{owned ? '보유 기록됨' : '실제 보유로 기록'}</button><button type="button" className="btn" data-testid={`p7-add-planned-${skill.skillId}`} disabled={!canEdit || unsupported || planned} onClick={() => addRecord(skill.skillId, 'planned')}>{planned ? '제작 목표 기록됨' : '제작 목표로 기록'}</button></div></li>;
      })}</ul>}
      {query.trim() && matches.length === 0 && <p className="caption">기존 데이터에 일치하는 스킬이 없습니다.</p>}
      {matches.length > recordLimit && <button type="button" className="btn" onClick={() => setRecordLimit((value) => value + 20)}>기록 검색 결과 20개 더 보기</button>}
      {!analysis.self.costumeId && <p className="p7-review-note">캐릭터 미정 노드에는 제작 목표만 기록할 수 있습니다. 실제 보유 기록에는 해당 인자 소유 캐릭터를 먼저 선택하세요.</p>}
      <ul className="p7-white-records">{records.map((record) => <li key={`${record.status}:${record.skillId}`} data-testid={`p7-record-${record.skillId}-${record.status}`}>
        <div className="p7-record-title"><strong>{record.nameKo ?? record.nameJa ?? name(record.skillId)}</strong><small>사용자 직접 입력</small><span className={`p7-record-badge ${record.status}`}>{record.status === 'owned' ? '실제 보유 · 사용자 기록' : '제작 목표 · 미확보'}</span></div>
        <div className="p7-record-fields"><label>별수<select aria-label={`${name(record.skillId)} ${record.status === 'owned' ? '실제 보유' : '제작 목표'} 별수`} value={record.stars ?? ''} disabled={!canEdit} onChange={(event) => updateRecord(record, { stars: event.target.value ? Number(event.target.value) as 1 | 2 | 3 : null })}><option value="">미확인</option><option value="1">★1</option><option value="2">★2</option><option value="3">★3</option></select></label><label>상태<select aria-label={`${name(record.skillId)} ${record.status === 'owned' ? '실제 보유' : '제작 목표'} 백인자 기록 상태`} value={record.status} disabled={!canEdit} onChange={(event) => updateRecord(record, { status: event.target.value as WhiteFactorRecord['status'] })}><option value="owned" disabled={!analysis.self.costumeId}>실제 보유(사용자 기록)</option><option value="planned">제작 목표(미확보)</option></select></label><button type="button" className="btn" disabled={!canEdit} aria-label={`${name(record.skillId)} ${record.status === 'owned' ? '실제 보유' : '제작 목표'} 기록 삭제`} onClick={() => commit(() => removeWhiteFactor(state, plan, nodeId, record.skillId, record.status))}>삭제</button></div>
        <p className="p7-classification">{record.classification.status === 'verified' ? '분류 근거 확인' : '백인자 자격 검토 필요'}</p>
      </li>)}</ul>
      {records.length === 0 && <p className="p7-empty">{analysis.self.inventoryStatus === 'reviewed' ? '사용자가 확인한 목록에 기록된 백인자가 없습니다.' : '이 노드에 백인자 기록을 입력하지 않았습니다. 백인자가 없다는 뜻은 아닙니다.'}</p>}
    </div>
    <div className="p7-generation-section"><h3>선택 대상의 실제 부모·조부</h3><p className="caption">아래 연결은 현재 계보의 실제 부모 연결을 따릅니다. 조상의 기록은 계승 가능성을 검토할 근거이며 현재 대상의 획득·백인자 생성이 확정됐다는 뜻이 아닙니다.</p>
      <h4>직접 부모 {analysis.parents.length}명</h4><ul className="p7-generation-list">{analysis.parents.map(renderNode)}</ul>
      <h4>조부모 {analysis.grandparents.length}명</h4><ul className="p7-generation-list">{analysis.grandparents.map(renderNode)}</ul>
      {analysis.deeper.length > 0 && <details className="p7-deeper"><summary>더 깊은 조상 {analysis.deeper.length}명 · 직접 계승으로 합산하지 않음</summary><p className="caption">중간 세대의 육성과 인자 생성을 건너뛰어 선택 대상의 확정 스킬로 취급하지 않습니다.</p><ul className="p7-generation-list">{analysis.deeper.map(renderNode)}</ul></details>}
    </div>
    <div className="p7-priority-section" data-testid="p7-node-priorities"><h3>이 노드의 인자작 우선순위</h3><p className="caption">현재 선택한 인자에만 적용합니다. 다른 노드의 목표나 전역 우선순위를 숨겨진 필수 조건으로 합치지 않습니다. 백인자 기록을 추가해도 아래 목표를 자동으로 설정하지 않습니다.</p>
      {(props.globalPriorities?.length ?? 0) > 0 && <details className="p7-global-priorities"><summary>전역 우선순위 {props.globalPriorities!.length}개 · 현재 노드에 자동 적용 안 함</summary><ul>{props.globalPriorities!.map((row) => <li key={row.skillId}>{name(row.skillId)} · {SKILL_PRIORITY_LABELS[row.priority]}</li>)}</ul></details>}
      <SkillPrioritySettings snapshot={snapshot} request={props.request ?? null} priorities={priorities} onChange={updatePriorities} />
    </div>
    <div className="p7-candidate-section"><h3>대회 스킬과 계보 기록 비교</h3><p className="caption">전체31인 계보의 실제 보유·제작 계획 및 최종 본육성 서포트의 직접 경로를 비교합니다. 이미 기록되거나 본육성에서 수급 가능해도 목표에서 제외하지 않습니다. 추가하려면 직접 선택하세요. 대회·각질은 사용자가 정한 목표 조건이며 이 캐릭터의 실제 육성 각질·습득 스킬을 추정하지 않습니다.</p>
      {!props.request ? <p className="p7-empty">스킬·서포트 화면에서 대회·각질을 선택하면 같은 조건의 후보와 본육성 수급 경로를 확인할 수 있습니다.</p> : <>
        <label className="p7-field">대회 스킬·보유 위치 검색<input type="search" className="skills-search-input" aria-label="대회 스킬·보유 위치 검색" value={candidateQuery} onChange={(event) => { setCandidateQuery(event.target.value); setCandidateLimit(12); }} /></label>
        <ul className="p7-candidate-list">{candidates.slice(0, candidateLimit).map((row) => {
          const presence = getLineageSkillPresence(analysis, row.skillId);
          const selected = priorities.find((priority) => priority.skillId === row.skillId);
          return <li key={row.skillId} data-testid={`p7-skill-presence-${row.skillId}`}><div className="p7-candidate-heading"><div><strong>{name(row.skillId)}</strong><small>{GRADE_LABELS[row.grade]}{row.applicability === 'inapplicable' ? ' · 대회·각질 비해당' : ''}{row.grade === 'unverified' ? ' · 정밀 평가 미검증' : ''}</small></div><button type="button" className="btn" disabled={!!selected || priorities.length >= MAX_SKILL_PRIORITIES} onClick={() => propose(row.skillId)}>{selected ? SKILL_PRIORITY_LABELS[selected.priority] : '이 노드 우선 확보로 추가'}</button></div>
            <p>사용자 보유 위치 {presence.ownedLocations.length}곳{presence.duplicateOwnedCount > 1 ? ` · 여러 위치 보유 ${presence.duplicateOwnedCount}곳` : ''}: {presence.ownedLocations.map((node) => node.label).join(', ') || '입력된 기록에서 확인되지 않음'}</p>
            <p>선택 대상의 직접 부모 {presence.parentOwned.length}곳 · 조부 {presence.grandparentOwned.length}곳 · 더 깊은 조상 {presence.deeperOwned.length}곳. 이 대상의 확정 스킬로 합산하지 않습니다.</p>
            <p className="p7-planned-text">제작 목표 {presence.plannedLocations.length}곳: {presence.plannedLocations.map((node) => node.label).join(', ') || '등록 없음'}</p>
            {presence.unknownNodeIds.length > 0 && <p className="caption">정보 미입력·부분 입력 {presence.unknownNodeIds.length}곳은 미보유로 판정하지 않습니다.</p>}
            {presence.confirmedAbsentNodeIds.length > 0 && <p className="caption">사용자 확인 목록에 없음: {presence.confirmedAbsentNodeIds.map(id => getLineageSlots(plan).find(slot => slot.nodeId === id)?.label ?? '조상').join(', ')}</p>}
            <div className="p7-direct-routes"><strong>최종 본육성 서포트의 직접 수급 경로</strong>{row.routes.length ? <ul>{row.routes.map((route, index) => <li key={`${route.supportId}:${route.kind}:${route.sourceSkillId}:${index}`}>{route.supportName} · {ROUTE_LABELS[route.kind] ?? route.kind}{route.sourceServer ? ` · ${route.sourceServer} 원문` : ''}</li>)}</ul> : <p>현재 최종 본육성 편성에 확인된 직접 경로 없음 · 미완성 편성은 정보 부족일 수 있습니다.</p>}</div>
          </li>;
        })}</ul>
        {candidates.length > candidateLimit && <button type="button" className="btn" onClick={() => setCandidateLimit((value) => value + 12)}>비교 스킬 12개 더 보기</button>}
        {candidates.length === 0 && <p className="p7-empty">현재 검색·대회 조건에 해당하는 기존 일반 목표가 없습니다.</p>}
      </>}
      {priorities.length >= MAX_SKILL_PRIORITIES && <p className="p7-review-note">최대 {MAX_SKILL_PRIORITIES}개를 선택했습니다. 추가 목표를 넣으려면 이 노드의 우선순위를 직접 조정하세요. 기존 필수 목표를 자동 해제하지 않습니다.</p>}
    </div>
    {message && <p role="alert" className="p7-review-note">{message}</p>}
    <div className="p7-recommend-actions"><div><strong>현재 선택한 {analysis.self.label}의 목표 {priorities.length}개</strong><p>선택 노드만 필요할 때 계산합니다. 기본은 현재 한국 수급 기준이며 미래시 설계는 추천 화면에서 명시적으로 선택합니다.</p></div><button type="button" className="btn primary" onClick={props.onRecommend}>선택한 인자의 서포트 추천</button></div>
  </section>;
}
