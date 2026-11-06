import type { DeepReadonly } from '../../data/snapshot';
import type { P5Tournament } from '../../domain/p5-forecast';

export function p5PeriodLabel(event: DeepReadonly<P5Tournament>): string {
  if (event.expectedDate) return `${event.expectedDate} 예상`;
  if (event.expectedMonth) return `${event.expectedMonth} 월 단위 예상`;
  if (event.expectedWindow) return `${event.expectedWindow.from} ~ ${event.expectedWindow.through} 순서 기반 예상 구간`;
  return '한국 개최 시점 미확인';
}

export function p5AnalysisLevel(event: DeepReadonly<P5Tournament>, asOf: string) {
  const start = event.expectedDate ?? event.expectedWindow?.from ?? event.expectedMonth;
  const end = event.expectedDate ?? event.expectedWindow?.through ?? event.expectedMonth;
  const monthIndex = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  if (!start || !end) return { level: 'reference', label: '기간 미확인 · 참고 추천', explanation: '일본 대회 순서와 코스·출시 환경으로 비교합니다.' };
  const minimum = Math.max(0, monthIndex(start) - monthIndex(asOf));
  const maximum = Math.max(0, monthIndex(end) - monthIndex(asOf));
  const period = minimum === maximum ? `약 ${minimum}개월` : `약 ${minimum}~${maximum}개월`;
  if (maximum <= 2) return { level: 'detailed', label: `${period} · 상세 검토`, explanation: '기존 엔진으로 스킬 유효성·패시브 스킬·수급 경로·이벤트 양립성과 교체·대체 편성을 비교합니다.' };
  if (maximum <= 6) return { level: 'forecast', label: `${period} · 예상 출시 환경 추천`, explanation: '예상 출시 카드와 주요 스킬을 반영합니다. 미검증 정량값은 사용하지 않습니다.' };
  return { level: 'reference', label: `${period} · 참고 추천`, explanation: '일본 대회 순서·코스·예상 출시 환경을 사용합니다. 거리에 따른 스킬 점수 감점은 없습니다.' };
}
