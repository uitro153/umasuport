import type { P4DeckRecommendation, P4SearchMetadata, P6PersonalizedRecommendationResult } from '../../engine/support-deck-optimizer';
import { SKILL_PRIORITY_LABELS, type UserSkillPriority } from '../../engine/skill-priorities';

interface Props {
  result: P6PersonalizedRecommendationResult;
  priorities: readonly UserSkillPriority[];
  names: Map<string, string>;
}

export default function PriorityRecommendationComparison({ result, priorities, names }: Props) {
  const base = result.base.recommendations[0];
  const customized = result.customized?.recommendations[0];
  const comparison = result.comparison;
  const targetName = (id: string) => names.get(id) ?? id;
  return <section className="p6-comparison" aria-label="기본 추천과 사용자 맞춤 추천 비교" data-testid="p6-comparison">
    <h3>기본 추천과 사용자 맞춤 추천</h3>
    <p>기본 정성 점수와 사용자 선호를 분리해 비교합니다. 사용자 선호는 별도 정책값이며 마신 이득이 아닙니다. 필수 확보는 백인자 생성·계승 성공을 보장하지 않습니다.</p>
    <table className="p6-score-table"><thead><tr><th scope="col">비교 항목</th><th scope="col">기본 추천</th><th scope="col">사용자 맞춤</th></tr></thead><tbody>
      <tr><th scope="row">기본 정성 점수</th><td data-testid="p6-base-score">{base?.score.coverageValue ?? '미발견'}</td><td data-testid="p6-custom-base-score">{customized?.score.coverageValue ?? '미발견'}</td></tr>
      <tr><th scope="row">사용자 선호 보너스</th><td>0</td><td data-testid="p6-preference-bonus">{customized?.score.preferenceBonus ?? (customized ? 0 : '—')}</td></tr>
      <tr><th scope="row">맞춤 평가 점수</th><td>{base?.score.coverageValue ?? '미발견'}</td><td data-testid="p6-custom-score">{customized?.score.customizedValue ?? customized?.score.coverageValue ?? '미발견'}</td></tr>
      <tr><th scope="row">유효 패시브 스킬</th><td>{base?.greenSkillIds.length ?? '—'}</td><td>{customized?.greenSkillIds.length ?? '—'}</td></tr>
      <tr><th scope="row">양립 가능한 일반 목표</th><td>{base?.compatibleSkillIds.length ?? '—'}</td><td>{customized?.compatibleSkillIds.length ?? '—'}</td></tr>
      <tr><th scope="row">탐색 범위</th><td data-testid="p6-base-search"><SearchScope search={result.base.search} /></td><td data-testid="p6-custom-search">{result.customized ? <SearchScope search={result.customized.search} /> : '—'}</td></tr>
    </tbody></table>
    {comparison && comparison.baseCoverageDelta < 0 && <p className="p6-opportunity-cost" role="status" data-testid="p6-base-loss">맞춤 추천의 기본 정성 점수가 {Math.abs(comparison.baseCoverageDelta)}점 낮습니다. 이 손실을 사용자 선호 보너스와 구분해 비교하세요.</p>}
    {comparison?.sameLineup && <p data-testid="p6-same-lineup">기본·맞춤 추천의 카드 6장이 같습니다. 별도의 편성을 억지로 만들지 않았습니다. 이벤트 계획의 차이는 아래에서 확인할 수 있습니다.</p>}
    <div className="p6-lineup-comparison"><Lineup label="기본 추천 6장" deck={base} /><Lineup label="사용자 맞춤 6장" deck={customized} /></div>
    <h4>지정 스킬의 수급 기회</h4>
    <ul className="p6-target-status">{priorities.map((selection) => {
      const target = result.customized?.skillPriorities?.targets.find((row) => row.skillId === selection.skillId);
      const providers = customized?.cards.filter((card) => card.skillIds.includes(selection.skillId)) ?? [];
      return <li key={selection.skillId} data-testid={`p6-target-${selection.skillId}`}>
        <strong>{targetName(selection.skillId)} · {SKILL_PRIORITY_LABELS[selection.priority]}</strong>
        <p>기본 {base?.skillIds.includes(selection.skillId) ? '기회 있음' : '계획에 없음'} · 맞춤 {customized?.skillIds.includes(selection.skillId) ? '기회 있음' : '충족 미확인'}</p>
        {providers.length > 0 && <p>선택한 양립 계획의 공급 카드: {providers.map((card) => card.name).join(', ')}. 카드 상세에서 힌트·이벤트·금색 하위 경로와 선택 분기를 확인하세요.</p>}
        {target?.warnings.map((warning) => <p className="p6-target-warning" key={warning}>{warning}</p>)}
        {result.customized?.skillEvaluations.find((row) => row.skillId === selection.skillId)?.routes.length ? <p>본육성 편성에서도 별도 수급 경로가 있습니다. 인자작 지정 목표는 유지했습니다.</p> : null}
      </li>;
    })}</ul>
    {comparison && <div className="p6-skill-difference" data-testid="p6-skill-difference">
      <div><h4>새로 얻는 스킬 {comparison.gainedSkillIds.length}개</h4><Names ids={comparison.gainedSkillIds} names={names} /></div>
      <div><h4>잃는 스킬 {comparison.lostSkillIds.length}개</h4><Names ids={comparison.lostSkillIds} names={names} /></div>
      <div className="p6-core-loss"><h4>공략 참고 주요 목표 손실 {comparison.lostCoreSkillIds.length}개</h4><Names ids={comparison.lostCoreSkillIds} names={names} /></div>
    </div>}
  </section>;
}

function SearchScope({ search }: { search: P4SearchMetadata }) {
  return <details><summary>{search.globalOptimal ? '현재 가용 후보 전체 비교' : '제한된 탐색 범위의 추천안'}</summary><span>후보 {search.candidateCount}장 · 최대 {search.maxStates.toLocaleString()}상태 · 빔 {search.beamWidth} · 이벤트 계획 {search.eventPlanLimit}개</span><br />
    <span>{search.globalOptimal ? '현재 가용 후보 전체에서 정성 목표 최적' : search.optimalWithinCandidatePool ? '선별한 후보군 안에서만 최적' : '탐색한 범위의 추천안 · 전역 최적 보장 없음'}{search.searchLimitReached ? ' · 탐색 한도 도달' : ''}{search.eventPlansPruned ? ' · 이벤트 대안 일부 제한' : ''}</span></details>;
}

function Lineup({ label, deck }: { label: string; deck: P4DeckRecommendation | undefined }) {
  return <div><h4>{label}</h4>{deck ? <ol>{deck.cards.map((card) => <li key={card.supportId} data-support-id={card.supportId}>{card.name}<small>{card.limitBreak}돌파</small></li>)}</ol> : <p>현재 조건을 만족하는 편성을 발견하지 못했습니다.</p>}</div>;
}
function Names({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  return ids.length ? <div className="p4-skill-tags">{ids.map((id) => <span key={id}>{names.get(id) ?? id}</span>)}</div> : <p>없음</p>;
}
