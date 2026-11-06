import type { DeepReadonly } from '../../data/snapshot';
import type { P5Tournament } from '../../domain/p5-forecast';
import { p5AnalysisLevel, p5PeriodLabel } from './p5-tournament-labels';

export default function P5TournamentInfo({ event, asOf, enabled, current }: { event: DeepReadonly<P5Tournament>; asOf: string; enabled: boolean; current: boolean }) {
  const analysis = p5AnalysisLevel(event, asOf);
  const boundary = event.rangeMembership?.startsWith('boundary-') ?? false;
  return <section className="panel p5-tournament-info" aria-label="미래시 대회 근거" data-testid="p5-tournament-info">
    <div className="section-heading"><h2>{p5PeriodLabel(event)}</h2><span className="phase">미래시</span></div>
    <p>{event.format === 'league-of-heroes' ? 'LoH' : '챔피언스 미팅'} · 한국 공식 일정 미확정 · 일본 원본 {event.jpEventId} ({event.jpStartAt?.slice(0, 10) ?? '일본 일자 미확인'})</p>
    <p data-testid="p5-availability-basis">{current ? '현재 시점: 기존 한국 출시 근거와 한국 기준일로 비교합니다. 미래시 포함 설정도 기존 한국 날짜 정책을 따릅니다.' : <>{enabled ? '예상 가용성: 일본 콘텐츠 출시일과 일본 원본 대회일의 선후관계로 판정합니다.' : '미래시 제외: 확인된 한국 출시 정보만 사용합니다.'} 한국 예상일·예상 월은 일정 표시용이며 출시 순서를 뒤집는 비교값으로 쓰지 않습니다.</>}</p>
    <p><strong>{analysis.label}</strong> · {analysis.explanation}</p>
    {event.expectedWindow && !event.expectedMonth && <p>표시 구간은 이웃 대회 사이의 순서 가정이며 공지된 행사 기간이 아닙니다.</p>}
    {event.expectedMonth && <p>정확한 한국 개최일은 미정입니다. 월초·월말을 임의 개최일로 사용하지 않습니다.</p>}
    {event.format === 'league-of-heroes' && <p>날씨·주로 상태는 랜덤으로 유지합니다. 임의의 맑음·양호 조건으로 고정하지 않습니다.</p>}
    {boundary && <p className="skills-missing-note" data-testid="p5-boundary-note">2027년 11월 LoH는 조사 종료일 2027-11-04 이후 개최될 수 있는 경계 후보입니다.</p>}
    {event.specialRulesStatus && <p>일본 특수 규칙과 한국 적용은 미확인입니다. 확인되지 않은 규칙 효과는 계산에 추가하지 않습니다.</p>}
  </section>;
}
