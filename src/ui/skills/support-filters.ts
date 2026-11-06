/** Presentation filters only. They never change availability or recommendation requests. */
import { matchesNameQuery } from '../name-search';
export const SUPPORT_TYPES = [
  ['all', '전체'], ['speed', '스피드'], ['stamina', '스태미나'], ['power', '파워'],
  ['guts', '근성'], ['intelligence', '지능'], ['friend', '친구'], ['group', '그룹'],
] as const;
export type SupportTypeFilter = typeof SUPPORT_TYPES[number][0];
export type SupportRarityFilter = 'all' | 'R' | 'SR' | 'SSR';
export type SupportReleaseFilter = 'all' | 'available' | 'unknown' | 'unavailable';
export interface SupportListFilters {
  query: string;
  type: SupportTypeFilter;
  rarity: SupportRarityFilter;
  release: SupportReleaseFilter;
}
export interface SupportFilterRecord {
  supportId: string;
  type: string;
  rarity: string;
  displayName?: string;
  nameKo?: string | null;
  nameJa?: string | null;
  nameEn?: string | null;
}
const aliases: Readonly<Record<string, string>> = { wisdom: 'intelligence', wit: 'intelligence', pal: 'friend' };
export function normalizeSupportType(type: string): string {
  const value = type.toLocaleLowerCase();
  return aliases[value] ?? value;
}
export function supportTypeLabel(type: string): string {
  return SUPPORT_TYPES.find(([key]) => key === normalizeSupportType(type))?.[1] ?? type;
}
export function matchesSupportFilters(support: SupportFilterRecord, release: Exclude<SupportReleaseFilter, 'all'>, filters: SupportListFilters): boolean {
  if (filters.type !== 'all' && normalizeSupportType(support.type) !== filters.type) return false;
  if (filters.rarity !== 'all' && support.rarity !== filters.rarity) return false;
  if (filters.release !== 'all' && release !== filters.release) return false;
  return matchesNameQuery(filters.query, [support.displayName, support.nameKo, support.nameJa, support.nameEn], [support.supportId]);
}
