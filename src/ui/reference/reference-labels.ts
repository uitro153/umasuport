import type { ReferenceCostume } from '../../domain/reference';
import type { DeepReadonly } from '../../data/snapshot';
import type { ReferenceAvailability } from '../../engine/reference-availability';

export function releaseLabel(availability: ReferenceAvailability): string {
  if (availability.state === 'unknown') return '한국 출시 미확인';
  const basis = {
    'official-date': '공식 날짜', 'secondary-date': '2차 자료 날짜',
    'released-by-observation': '해당일까지 출시 관측', forecast: '미래시',
    'insufficient-evidence': '근거 부족',
    'jp-release-order': '일본 대회 출시 순서 기반 예상',
    'jp-route-order': '일본 대회 전 수급처 기반 예상',
  }[availability.basis];
  return `${basis}${availability.effectiveDate ? ` ${availability.effectiveDate}` : ''}${availability.state === 'unavailable' ? ' · 기준일 이후' : ''}`;
}

export function translationLabel(costume: DeepReadonly<ReferenceCostume>): string {
  if (costume.displayLanguage === 'ja') return '일본어 대체 표시';
  if (costume.displayLanguage === 'mixed') return '한·일 혼합 표시 · 번역 미확인';
  return costume.translationStatus === 'official_verified' ? '한국어 명칭 확인' : '출처 번역 · 공식명칭 미확인';
}
