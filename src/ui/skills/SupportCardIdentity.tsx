import type { DeepReadonly } from '../../data/snapshot';
import type { P3Support } from '../../domain/skill-support';
import GameAssetImage from '../assets/GameAssetImage';
import { supportTypeLabel, type SupportFilterRecord } from './support-filters';
import './p85-support.css';

export interface SupportCardIdentityProps {
  support: SupportFilterRecord & { name?: string };
  source?: DeepReadonly<P3Support>;
  heading?: 'strong' | 'h4';
  /** Kept for caller compatibility; canonical IDs are available via technical
   * details/JSON and data-support-id, never the default identity caption. */
  showId?: boolean;
  className?: string;
}
/** All images use the exact card ID; translated names are never asset keys. */
export default function SupportCardIdentity({ support, source, heading = 'strong', className = '' }: SupportCardIdentityProps) {
  const name = support.displayName ?? support.name ?? source?.displayName ?? '서포트 자료 확인 필요';
  const record = source ?? support;
  const ownerName = record.nameKo ?? record.nameJa ?? record.nameEn;
  const Heading = heading;
  const Wrapper = heading === 'h4' ? 'div' : 'span';
  return <Wrapper className={`p85-support-identity ${className}`} data-support-id={support.supportId}>
    <GameAssetImage kind="support" id={support.supportId} label={name} className="p85-support-art" />
    <span className="p85-support-copy"><Heading>{name}</Heading>{ownerName && ownerName !== name && <small>{ownerName}</small>}</span>
    <span className="p85-support-badges"><span data-support-type={support.type}>{supportTypeLabel(support.type)}</span><span className={`p85-rarity p85-rarity-${support.rarity.toLocaleLowerCase()}`} data-support-rarity={support.rarity}>{support.rarity}</span></span>
  </Wrapper>;
}
export { SupportCardIdentity };
