import { useEffect, useRef } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Support } from '../../domain/skill-support';
import type { ReferenceAvailability } from '../../engine/reference-availability';
import GameAssetImage from '../assets/GameAssetImage';
import SupportCardIdentity from './SupportCardIdentity';
import { translationLabel } from './evidence-labels';

function supportAvailabilityText(value: ReferenceAvailability): string {
  if (value.basis === 'jp-release-order') return value.state === 'available' ? `일본 대회 이전 출시 · 가용 예상${value.effectiveDate ? ` (JP ${value.effectiveDate})` : ''}` : value.state === 'unavailable' ? `일본 대회 이후 출시 · 추천 제외${value.effectiveDate ? ` (JP ${value.effectiveDate})` : ''}` : '일본 출시 순서 확인 필요';
  if (value.state === 'unknown') return '한국 출시 미확인 · 가용 판정 보류';
  if (value.state === 'unavailable') return `기준일 이후 · ${value.effectiveDate ?? ''}`;
  const label = value.basis === 'official-date' ? '공식 출시일' : value.basis === 'secondary-date' ? '2차 자료 날짜' : value.basis === 'forecast' ? '미래시 · 변동 가능' : value.basis === 'released-by-observation' ? '해당일까지 출시 관측' : '출시 근거 확인 필요';
  return `${label}${value.effectiveDate ? ` · ${value.effectiveDate}` : ''}`;
}

export default function SupportGalleryDetail({ support, availability, onSelect, onClose, disabled, actionLabel = '이 카드 선택' }: {
  support: DeepReadonly<P3Support>;
  availability: ReferenceAvailability;
  onSelect: () => void;
  onClose: () => void;
  disabled?: boolean;
  actionLabel?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.scrollIntoView({ block: 'start' }); panel.current?.focus({ preventScroll: true }); }, [support.supportId]);
  return <section className="p86-support-detail" ref={panel} tabIndex={-1} aria-label="서포트 카드 상세" data-testid="p86-support-detail" data-support-id={support.supportId}>
    <GameAssetImage kind="support" id={support.supportId} label={support.displayName} variant="art" loading="eager" />
    <div><SupportCardIdentity support={support} />
      <p>{availability.state === 'available' ? availability.basis === 'jp-release-order' || availability.basis === 'forecast' ? '미래시 가용 예상' : '현재 설정에서 선택 가능' : availability.state === 'unknown' ? '한국 출시 미확인' : '기준일 이후 출시'}</p>
      <div className="p86-support-detail-actions"><button type="button" className="btn primary" disabled={disabled} onClick={onSelect}>{actionLabel}</button><button type="button" className="btn" onClick={onClose}>상세 닫기</button></div>
      <p>{translationLabel(support.translationStatus, !!support.nameKo)}</p><p>{supportAvailabilityText(availability)}</p>
    </div>
  </section>;
}
