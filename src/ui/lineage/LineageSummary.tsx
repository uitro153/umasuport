import type { calculateReferencePedigree } from '../../engine/reference-pedigree';
import type { calculateReferenceAptitudes } from '../../engine/reference-aptitude';
import { APTITUDE_LABELS } from '../../engine/aptitude';
import type { AptitudeKey } from '../../domain/pedigree';

interface Props {
  affinity: ReturnType<typeof calculateReferencePedigree>;
  aptitudes: ReturnType<typeof calculateReferenceAptitudes>;
  unconfirmed: boolean;
  invalid?: boolean;
}
const groups: { title: string; keys: AptitudeKey[] }[] = [
  { title: '경기장 적성', keys: ['turf', 'dirt'] },
  { title: '거리 적성', keys: ['sprint', 'mile', 'medium', 'long'] },
  { title: '각질 적성', keys: ['front', 'pace', 'late', 'end'] },
];
export default function LineageSummary({ affinity, aptitudes, unconfirmed, invalid = false }: Props) {
  const partial = aptitudes.status !== 'ready' || unconfirmed || invalid;
  return <section className="p87-lineage-summary" data-testid="p87-lineage-summary" aria-label="상단 상성·시작 적성 요약">
    <div className="panel affinity-summary"><h2>기본 상성</h2><small>공개식</small><strong className="affinity-number" data-testid="ref-total">{affinity.previewTotal ?? '—'}</strong>
      <p>한국 서버 실측 대기{affinity.status === 'incomplete' ? ` · 선택분 부분합 ${affinity.previewContribution}` : ''}{unconfirmed ? ' · 연결 미확인, 계획 참고값' : ''}</p>
      <details className="affinity-breakdown"><summary>상성 세부 점수</summary><ul>{affinity.contributions.map(term => <li key={term.termId}><span>{term.label}</span><b>{term.value ?? '—'}</b></li>)}</ul></details>
    </div>
    <div className="panel p87-starting-aptitudes"><h2>{partial ? '계획상 예상 시작 적성' : '본육성 시작 적성'}</h2><p>{invalid ? '계보 조합을 수정한 뒤 적성을 확인하세요.' : unconfirmed ? '조상 연결 미확인 · 확정된 실물 적성이 아닙니다.' : aptitudes.status === 'partial' ? '선택한 인자 기준의 부분 예상입니다.' : '공개 보정 규칙 · 한국 서버 실측 대기'}</p>
      <div className="p87-aptitude-groups">{groups.map(group => <section key={group.title}><h3>{group.title}</h3><div>{group.keys.map(key => {
        const change = invalid ? undefined : aptitudes.changes.find(row => row.type === key);
        return <span className="p87-aptitude-item" key={key} data-testid={`ref-aptitude-${key}`}><span>{APTITUDE_LABELS[key]}</span><b className={`p87-grade p87-grade-${change?.result ?? 'unknown'}`}>{change?.result ?? '—'}</b></span>;
      })}</div></section>)}</div>
      <details><summary>적성 보정 과정</summary><ul className="p87-aptitude-detail">{aptitudes.changes.map(change => <li key={change.type}>{APTITUDE_LABELS[change.type]} {change.base} → {change.result} · ★{change.totalStars}</li>)}</ul><p>부모·조부 6명의 같은 종류 별수를 합산하며 시작 적성은 A 상한입니다.</p></details>
    </div>
  </section>;
}
