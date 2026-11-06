import { useEffect, useId, useMemo, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import { evaluateSkills, type SkillEvaluationRequest } from '../../engine/skill-evaluation';
import { MAX_SKILL_PRIORITIES, normalizeSkillPriorities, prioritySkillName,
  resolvePriorityTarget, SKILL_PRIORITY_BONUSES, SKILL_PRIORITY_LABELS, skillPriorityWarnings,
  type SkillPriorityLevel, type UserSkillPriority } from '../../engine/skill-priorities';
import './skill-priorities.css';
import { matchesNameQuery } from '../name-search';
import { QUICK_SKILLS_KEY, readQuickSkills, serializeQuickSkills } from './quick-skill-preferences';

interface Props {
  snapshot: DeepReadonly<P3Snapshot>; request: SkillEvaluationRequest | null;
  priorities: UserSkillPriority[]; onChange: (priorities: UserSkillPriority[]) => void;
  onRecalculate?: () => void; onReturnToDefault?: () => void; isBusy?: boolean;
}

export default function SkillPrioritySettings({ snapshot, request, priorities, onChange,
  onRecalculate, onReturnToDefault, isBusy = false }: Props) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const [limit, setLimit] = useState(20);
  const skills = useMemo(() => new Map(snapshot.skills.map((row) => [row.skillId, row])), [snapshot]);
  const selected = useMemo(() => new Set(priorities.map((row) => row.skillId)), [priorities]);
  const [quickIds, setQuickIds] = useState<string[] | null>(() => { try { return readQuickSkills(localStorage); } catch { return null; } });
  const [quickMessage, setQuickMessage] = useState('');
  useEffect(() => {
    const read = () => { try { setQuickIds(readQuickSkills(localStorage)); } catch { /* Keep this session's choices when storage is unavailable. */ } };
    window.addEventListener('storage', read); window.addEventListener('uma-quick-skills-changed', read);
    return () => { window.removeEventListener('storage', read); window.removeEventListener('uma-quick-skills-changed', read); };
  }, []);
  const quick = (quickIds ?? []).filter(id => skills.has(id) && resolvePriorityTarget(snapshot, id).skillId === id).map(skillId => ({ skillId, label: prioritySkillName(skills.get(skillId)!) }));
  function saveQuick(ids: string[]) {
    setQuickIds(ids);
    try { localStorage.setItem(QUICK_SKILLS_KEY, serializeQuickSkills(ids)); window.dispatchEvent(new Event('uma-quick-skills-changed')); setQuickMessage('빠른 선택 목록을 저장했습니다.'); }
    catch { setQuickMessage('이 브라우저에 저장하지 못했습니다. 이번 화면의 목록은 유지합니다.'); }
  }
  // Include unknown rows for a warning, never to elevate their objective grade.
  const evaluations = useMemo(() => new Map((request ? evaluateSkills(snapshot, { ...request, includeUnknown: true }).rows : [])
    .map((row) => [row.skillId, row])), [snapshot, request]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return snapshot.skills.filter(row => matchesNameQuery(query, [row.nameKo, row.nameJa, row.displayName], [row.skillId]));
  }, [snapshot, query]);
  const atLimit = priorities.length >= MAX_SKILL_PRIORITIES;

  function add(skillId: string) {
    if (selected.has(skillId) || atLimit) return;
    onChange(normalizeSkillPriorities(snapshot, [...priorities, { skillId, priority: 'preferred' }]));
  }

  return <details className="p6-priority-settings" data-testid="p6-priority-settings" open>
    <summary>스킬 우선순위 설정 · <span data-testid="p6-priority-count">{priorities.length} / {MAX_SKILL_PRIORITIES}</span></summary>
    <p>원하는 일반 백인자 목표를 최대 {MAX_SKILL_PRIORITIES}개 지정합니다. 선택하지 않으면 기존 기본 추천을 사용합니다. 보너스는 사용자 선호 정책값이며 마신 이득이 아닙니다.</p>
    <p className="p6-priority-retention">대회·각질을 변경해도 선택은 유지합니다. 새 조건에 맞지 않는 스킬은 아래에 주의 상태를 표시합니다.</p>
    {quick.length > 0 && <div className="p6-priority-quick" aria-label="빠른 스킬 선택"><span>빠른 선택</span>{quick.map((item) => <button type="button" className="btn" key={item.skillId}
      data-testid={`p6-quick-${item.skillId}`} aria-label={`빠른 선택 ${item.label}`} disabled={atLimit || selected.has(item.skillId)} onClick={() => add(item.skillId)}>{item.label}{selected.has(item.skillId) ? ' · 선택됨' : ''}</button>)}</div>}
    <details className="p87-quick-manager" data-testid="p87-quick-manager"><summary>빠른 선택 목록 편집</summary><p>목록은 개인 환경설정입니다. 삭제해도 이미 지정한 목표는 유지됩니다. 아래 검색 결과에서 추가하세요.</p>
      <ol>{quick.map((item, index) => <li key={item.skillId}><span>{item.label}</span><div><button className="btn" disabled={index === 0} aria-label={`${item.label} 빠른 선택 위로`} onClick={() => { const ids = quick.map(row => row.skillId); [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!]; saveQuick(ids); }}>↑</button><button className="btn" disabled={index === quick.length - 1} aria-label={`${item.label} 빠른 선택 아래로`} onClick={() => { const ids = quick.map(row => row.skillId); [ids[index + 1], ids[index]] = [ids[index]!, ids[index + 1]!]; saveQuick(ids); }}>↓</button><button className="btn" aria-label={`${item.label} 빠른 선택 삭제`} onClick={() => saveQuick(quick.filter(row => row.skillId !== item.skillId).map(row => row.skillId))}>삭제</button></div></li>)}</ol>
    </details>{quickMessage && <p role="status">{quickMessage}</p>}
    {quick.length === 0 && <p data-testid="p872-quick-empty">빠른 선택에 사용할 스킬을 직접 추가해 주세요.</p>}
    <label className="p6-priority-search" htmlFor={searchId}>우선순위 스킬명 검색<input className="skills-search-input" id={searchId} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} autoComplete="off" /></label>
    <p className="p6-priority-search-note">한국어 이름이 없으면 일본어 이름을 표시합니다. 동명 스킬은 조건·효과를 확인해 구분하며, 금색은 명시된 일반 하위 목표가 있을 때만 연결합니다.</p>
    {query.trim() && <ul className="p6-priority-results" aria-label="우선순위 스킬 검색 결과">{matches.slice(0, limit).map((skill) => {
      const resolution = resolvePriorityTarget(snapshot, skill.skillId);
      const target = resolution.skillId ? skills.get(resolution.skillId) : undefined;
      const alreadySelected = resolution.skillId !== null && selected.has(resolution.skillId);
      const warnings = target ? skillPriorityWarnings(evaluations.get(target.skillId)) : [];
      return <li key={skill.skillId}><button type="button" data-testid={`p6-skill-${skill.skillId}`} disabled={!target || atLimit || alreadySelected}
        onClick={() => { if (target) add(target.skillId); }}><span><strong>{prioritySkillName(skill)}</strong><small>{skill.rarity === 2 ? '금색 검색 결과' : skill.rarity === 1 ? '일반 스킬' : '일반 백인자 대상 아님'}</small>
        {target && target.skillId !== skill.skillId && <small>일반 목표: {prioritySkillName(target)}</small>}
        {!target && <small className="p6-priority-warning">{resolution.message}</small>}
        {target && warnings[0] && <small className="p6-priority-warning">주의: {warnings[0]}</small>}</span><b>{alreadySelected ? '선택됨' : target ? '선택' : '연결 보류'}</b></button>{target && <button className="btn" data-testid={`p87-quick-add-${skill.skillId}`} disabled={quick.length >= 100 || quick.some(item => item.skillId === target.skillId)} onClick={() => saveQuick([...quick.map(item => item.skillId), target.skillId])}>{quick.some(item => item.skillId === target.skillId) ? '빠른 선택에 있음' : '빠른 선택에 추가'}</button>}</li>;
    })}</ul>}
    {query.trim() && matches.length === 0 && <p>일치하는 기존 스킬이 없습니다.</p>}
    {matches.length > limit && <button type="button" className="btn" onClick={() => setLimit((value) => value + 20)}>검색 결과 20개 더 보기</button>}
    {atLimit && <p className="p6-priority-warning" role="status">최대 {MAX_SKILL_PRIORITIES}개를 선택했습니다. 다른 목표를 추가하려면 선택한 스킬을 삭제하세요.</p>}
    {priorities.length === 0 ? <p className="p6-priority-empty">지정한 스킬 없음 · 기본 추천과 동일하게 계산합니다.</p> : <ul className="p6-priority-selected" aria-label="선택한 스킬 우선순위">{priorities.map((choice) => {
      const skill = skills.get(choice.skillId);
      const name = skill ? prioritySkillName(skill) : choice.skillId;
      const warnings = skillPriorityWarnings(evaluations.get(choice.skillId));
      return <li key={choice.skillId} data-testid={`p6-selected-${choice.skillId}`}><div className="p6-priority-selected-heading"><span><strong>{name}</strong></span>
        <label><span className="visually-hidden">{name} 우선순위</span><select aria-label={`${name} 우선순위`} value={choice.priority} onChange={(event) => onChange(priorities.map((row) => row.skillId === choice.skillId ? { ...row, priority: event.target.value as SkillPriorityLevel } : row))}>
          <option value="preferred">{SKILL_PRIORITY_LABELS.preferred} (+{SKILL_PRIORITY_BONUSES.preferred})</option><option value="strong">{SKILL_PRIORITY_LABELS.strong} (+{SKILL_PRIORITY_BONUSES.strong})</option><option value="required">{SKILL_PRIORITY_LABELS.required} (편성 조건)</option>
        </select></label><button type="button" className="btn" aria-label={`${name} 우선순위 삭제`} onClick={() => onChange(priorities.filter((row) => row.skillId !== choice.skillId))}>삭제</button></div>
        {warnings.length > 0 && <ul className="p6-priority-warnings">{warnings.map((warning) => <li key={warning}>주의: {warning}</li>)}</ul>}
      </li>;
    })}</ul>}
    <p>필수 확보는 같은 편성·양립 가능한 이벤트 계획에 수급 기회가 있어야 한다는 조건입니다. 실제 백인자 생성·계승 성공이나 이벤트 완주를 보장하지 않습니다.</p>
    <div className="p6-priority-actions"><button type="button" className="btn" disabled={priorities.length === 0} onClick={() => onChange([])}>전체 선택 초기화</button>
      <button type="button" className="btn" disabled={priorities.length === 0} onClick={() => { if (onReturnToDefault) onReturnToDefault(); else onChange([]); }}>기본 추천으로 돌아가기</button>
      {onRecalculate && <button type="button" className="btn primary" disabled={!request || isBusy} onClick={onRecalculate}>{isBusy ? '추천 계산 중…' : '우선순위 적용 후 추천'}</button>}
    </div>
  </details>;
}
