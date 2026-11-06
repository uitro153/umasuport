import { useState } from 'react';
import { pedigreeRules as rules, pedigreeSnapshot as snapshot } from '../../data/pedigree-data';
import { createEmptyPedigree, SLOT_KEYS, type Pedigree, type RedFactor, type SlotKey } from '../../domain/pedigree';
import { projectAvailability, resolveEvaluationContext, type EvaluationMode } from '../../engine/availability';
import { calculateAffinity } from '../../engine/affinity';
import { calculateAptitudes, APTITUDE_LABELS } from '../../engine/aptitude';
import { enumerateGrandparentArrangements } from '../../engine/pedigree-optimizer';
import CharacterPicker from './CharacterPicker';
import SlotCard from './SlotCard';
import { SLOT_LABELS } from './labels';

interface Props {
  pedigree: Pedigree;
  onChange: (pedigree: Pedigree) => void;
  mode: EvaluationMode;
  onModeChange: (mode: EvaluationMode) => void;
  eventId: string;
  onEventChange: (eventId: string) => void;
  onShowData: () => void;
  onShowReference?: () => void;
  referenceLoading?: boolean;
  referenceError?: string;
  onSkills?: () => void;
}

export default function PedigreePage({ pedigree, onChange, mode, onModeChange, eventId, onEventChange, onShowData, onShowReference, referenceLoading, referenceError, onSkills }: Props) {
  const [editingSlot, setEditingSlot] = useState<SlotKey | null>(null);
  const [showArrangements, setShowArrangements] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const tournament = snapshot.tournaments.find((event) => event.eventId === eventId);
  const context = resolveEvaluationContext({ mode, tournament, now: new Date() });
  const availabilityFor = (costumeId: string | null) => {
    const costume = snapshot.costumes.find((item) => item.costumeId === costumeId);
    const release = snapshot.releases.find((item) => item.releaseId === costume?.releaseRef);
    return release ? projectAvailability(release, context.cutoffDate) : undefined;
  };
  const unavailableSlots = SLOT_KEYS.filter((key) => pedigree[key].costumeId && !availabilityFor(pedigree[key].costumeId)?.available);
  const calculationPedigree: Pedigree = structuredClone(pedigree);
  unavailableSlots.forEach((key) => { calculationPedigree[key] = { costumeId: null, redFactor: null }; });
  const affinity = calculateAffinity(calculationPedigree, snapshot, rules);
  const aptitudes = calculateAptitudes(calculationPedigree, snapshot, rules);
  const selectedCount = SLOT_KEYS.filter((key) => pedigree[key].costumeId).length;
  const arrangements = selectedCount === 7 && unavailableSlots.length === 0
    ? enumerateGrandparentArrangements(pedigree, snapshot, rules) : [];
  const isFixture = snapshot.kind === 'fixture' || rules.kind === 'fixture';

  function updateSlot(key: SlotKey, costumeId: string | null) {
    onChange({ ...pedigree, [key]: { costumeId, redFactor: costumeId ? pedigree[key].redFactor : null } });
    setAnnouncement(`${SLOT_LABELS[key]} ${costumeId ? '선택을 변경했습니다.' : '선택을 비웠습니다.'}`);
  }
  function setFactor(key: SlotKey, redFactor: RedFactor | null) {
    onChange({ ...pedigree, [key]: { ...pedigree[key], redFactor } });
  }
  function fillExample() {
    const used = new Set<string>();
    const costumes = snapshot.costumes.filter((costume) => {
      if (used.has(costume.baseId) || !availabilityFor(costume.costumeId)?.available) return false;
      used.add(costume.baseId);
      return true;
    });
    const example = createEmptyPedigree();
    SLOT_KEYS.forEach((key, index) => { example[key] = { costumeId: costumes[index]?.costumeId ?? null, redFactor: null }; });
    onChange(example);
    setAnnouncement('가상 예시 7인 계보를 채웠습니다.');
  }
  const renderSlot = (key: SlotKey) => <SlotCard key={key} slotKey={key} slot={pedigree[key]} snapshot={snapshot}
    availability={availabilityFor(pedigree[key].costumeId)} onSelect={() => setEditingSlot(key)} onClear={() => updateSlot(key, null)} onFactorChange={(factor) => setFactor(key, factor)} />;
  const nameAt = (tree: Pedigree, key: SlotKey) => snapshot.costumes.find((item) => item.costumeId === tree[key].costumeId)?.nameKo ?? '미선택';

  return <>
    <header className="site-header"><div className="shell header-content">
      <a className="brand" href="#main"><span className="brand-mark" aria-hidden="true">系</span>인자 설계 연구소</a>
      <div className="header-actions">{onSkills && <button className="btn" onClick={onSkills}>스킬·서포트 분석</button>}{import.meta.env.DEV && <button type="button" className="btn text-btn" onClick={onShowData}>데이터 기준 확인</button>}<span className="phase">계보 설계</span></div>
    </div></header>
    <main id="main" className="shell pedigree-main">
      {isFixture && <div className="fixture-notice" role="note"><strong>가상 fixture · 실게임 검증 전</strong><span>인물·상성표·적성 보정 규칙은 가상입니다. 표시 점수는 개발용 비교값입니다.</span></div>}
      <div className="pedigree-intro"><div><p className="eyebrow">PEDIGREE PLANNER</p><h1>인자 계보 설계</h1><p>7인 계보의 기본 상성과 빨간 인자에 따른 시작 적성을 확인하세요.</p></div>
        <div className="intro-actions">{onShowReference && <button className="btn" disabled={referenceLoading} onClick={onShowReference}>{referenceLoading ? '자료 읽는 중…' : '로컬 준비 데이터 열기'}</button>}{isFixture && <button className="btn" onClick={fillExample}>가상 예시 채우기</button>}<button className="btn" onClick={() => { onChange(createEmptyPedigree()); setShowArrangements(false); setAnnouncement('계보를 비웠습니다.'); }}>계보 비우기</button></div>
      </div>
      {referenceError && <p className="pedigree-data-error" role="alert">{referenceError}</p>}
      <section className="pedigree-context panel" aria-label="계보 데이터 기준">
        <div className="field"><label htmlFor="pedigree-event">선택 대회</label><select id="pedigree-event" value={eventId} onChange={(event) => onEventChange(event.target.value)}>{snapshot.tournaments.map((event) => <option value={event.eventId} key={event.eventId}>{event.nameKo}{event.dateStatus === 'forecast' ? ' · 미래시' : ''}</option>)}</select></div>
        <div className="field"><label htmlFor="pedigree-mode">출시 판단 시점</label><select id="pedigree-mode" value={mode} onChange={(event) => onModeChange(event.target.value as EvaluationMode)}><option value="tournament">선택 대회 시작일 기준</option><option value="current">현재 시점 기준</option></select></div>
        <div className="pedigree-cutoff"><span>한국 · Asia/Seoul</span><strong data-testid="pedigree-cutoff">{context.cutoffDate}</strong>{mode === 'tournament' && tournament?.dateStatus === 'forecast' && <small>예상 대회 · 변동 가능</small>}</div>
      </section>
      {unavailableSlots.length > 0 && <p className="selection-warning" role="alert">기준일에서 제외된 선택: {unavailableSlots.map((key) => SLOT_LABELS[key]).join(', ')}. 선택은 유지되며, 해당 슬롯은 계산에 반영되지 않습니다.</p>}
      <div className="mobile-score" aria-label="모바일 계보 요약"><span>{isFixture ? '가상 기본 상성' : '기본 상성'} <strong>{affinity.total ?? '—'}</strong></span><small>{selectedCount} / 7 선택 · 중상작 이전</small></div>
      <div className="pedigree-workspace">
        <section className="panel tree-panel" aria-labelledby="tree-title">
          <div className="section-heading"><h2 id="tree-title">7인 계보 편집</h2><span className="count">{selectedCount} / 7 선택</span></div>
          <div className="tree-note"><span>새 계보 설계</span><span>슬롯을 누르면 상성순 후보를 확인합니다.</span></div>
          <div className="target-row">{renderSlot('target')}</div><div className="tree-connector" aria-hidden="true"><span /><span /></div>
          <div className="parent-row">{renderSlot('parentA')}{renderSlot('parentB')}</div>
          <div className="grandparent-row">
            <details className="grandparent-branch" open><summary>부모 A의 조부모 <span>2명</span></summary><div className="grandparent-pair">{renderSlot('grandA1')}{renderSlot('grandA2')}</div></details>
            <details className="grandparent-branch" open><summary>부모 B의 조부모 <span>2명</span></summary><div className="grandparent-pair">{renderSlot('grandB1')}{renderSlot('grandB2')}</div></details>
          </div>
          <div className="tree-actions"><p>부모 위치를 고정하고 조부모의 6가지 묶음을 비교합니다.</p><button className="btn primary" disabled={arrangements.length !== 6} onClick={() => setShowArrangements(!showArrangements)}>{showArrangements ? '배치 비교 접기' : '조부모 6배치 비교'}</button></div>
          {showArrangements && arrangements.length === 6 && <section className="arrangement-section" aria-labelledby="arrangement-title"><h3 id="arrangement-title">조부모 배치 6가지</h3><p className="caption">부모·본육성 대상은 유지합니다. 빨간 인자는 조부모와 함께 이동하며, 같은 부모 아래 두 슬롯의 순서는 중복 비교하지 않습니다.</p>
            <ol className="arrangement-list">{arrangements.map((arrangement, index) => <li key={arrangement.arrangementId} data-testid="arrangement-row">
              <div className="arrangement-heading"><strong>배치 {index + 1}</strong>{index === 0 && arrangement.result.status === 'complete' && <span className="validation">최고 상성{arrangements[1]?.result.total === arrangement.result.total ? ' · 동점' : ''}</span>}<b>{arrangement.result.total ?? '—'}</b></div>
              <p>A: {nameAt(arrangement.pedigree, 'grandA1')} / {nameAt(arrangement.pedigree, 'grandA2')}<br />B: {nameAt(arrangement.pedigree, 'grandB1')} / {nameAt(arrangement.pedigree, 'grandB2')}</p>
              {arrangement.result.issues.length > 0 && <p className="candidate-error">{arrangement.result.issues.join(' · ')}</p>}
              <button className="btn" disabled={arrangement.result.status !== 'complete'} onClick={() => { onChange(arrangement.pedigree); setAnnouncement(`배치 ${index + 1}을 설계에 적용했습니다.`); setShowArrangements(false); }}>배치 {index + 1} 적용</button>
            </li>)}</ol>
          </section>}
        </section>
        <aside className="pedigree-sidebar">
          <section className="panel affinity-summary" aria-labelledby="affinity-title"><div className="section-heading"><h2 id="affinity-title">{isFixture ? '가상 기본 상성' : '기본 상성'}</h2><span className="phase">중상작 이전</span></div>
            <div className="affinity-number" data-testid="affinity-total" aria-live="polite">{affinity.total ?? '—'}</div>
            <p className="score-description">{affinity.status === 'complete' ? '7인 선택 완료' : affinity.status === 'partial' ? `선택된 관계 부분합 ${affinity.partialTotal} · 계보 미완성` : '상성 데이터를 확인하세요.'}</p>
            {affinity.issues.length > 0 && <ul className="calculation-issues">{affinity.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
            <details className="affinity-breakdown"><summary>관계별 상성 기여</summary><ul>{affinity.contributions.map((term) => <li key={term.termId}><span>{term.label}</span><b>{term.value ?? '—'}</b></li>)}</ul></details>
          </section>
          <section className="panel aptitude-summary" aria-labelledby="aptitude-title"><div className="section-heading"><h2 id="aptitude-title">본육성 시작 적성</h2><span className="red-label">빨간 인자</span></div>
            {aptitudes.changes.length === 0 ? <p className="empty-aptitudes">본육성 대상을 선택하면 적성이 표시됩니다.</p> : <>
              {aptitudes.status === 'partial' && <p className="caption aptitude-preview">현재 선택된 부모·조부모 인자만 반영합니다.</p>}
              <ul className="aptitude-list">{aptitudes.changes.map((change) => <li key={change.type} className={change.base !== change.result ? 'aptitude-changed' : ''} data-testid={`aptitude-${change.type}`}><span>{APTITUDE_LABELS[change.type]}</span><span>{change.base}<span className="aptitude-arrow"> → </span><strong>{change.result}</strong></span><small>★{change.totalStars}</small></li>)}</ul>
              <p className="caption">부모 2명·조부모 4명의 인자 합산{isFixture ? ' · 가상 보정표' : ''}. 시작 적성은 A까지 보정하며 기존 S는 유지합니다.</p>
            </>}
            {aptitudes.issues.length > 0 && <p className="candidate-error">{aptitudes.issues.join(' · ')}</p>}
          </section>
        </aside>
      </div>
      <p className="screen-reader-status" role="status">{announcement}</p>
    </main>
    {editingSlot && <CharacterPicker slotKey={editingSlot} pedigree={calculationPedigree} snapshot={snapshot} rules={rules} cutoffDate={context.cutoffDate} onClose={() => setEditingSlot(null)} onSelect={(costumeId) => { updateSlot(editingSlot, costumeId); setEditingSlot(null); }} />}
  </>;
}
