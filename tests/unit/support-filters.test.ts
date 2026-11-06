import { describe, expect, it } from 'vitest';
import { matchesSupportFilters, normalizeSupportType, supportTypeLabel, type SupportFilterRecord, type SupportListFilters, type SupportReleaseFilter } from '../../src/ui/skills/support-filters';

// Actual canonical ID/name/type/rarity excerpts. Availability below is an
// independent synthetic UI input, not a new KR release evidence claim.
const records: (SupportFilterRecord & { release: Exclude<SupportReleaseFilter, 'all'> })[] = [
  { supportId: '10002', displayName: '사일런스 스즈카 [트레센 학원]', type: 'speed', rarity: 'R', release: 'available' },
  { supportId: '10006', displayName: '골드 쉽 [트레센 학원]', type: 'stamina', rarity: 'R', release: 'available' },
  { supportId: '10005', displayName: '오구리 캡 [트레센 학원]', type: 'power', rarity: 'R', release: 'available' },
  { supportId: '10001', displayName: '스페셜 위크 [트레센 학원]', type: 'guts', rarity: 'R', release: 'available' },
  { supportId: '10028', displayName: '파인 모션 [트레센 학원]', type: 'intelligence', rarity: 'R', release: 'available' },
  { supportId: '20001', displayName: '후지 키세키 [나 참, 어서 와]', type: 'intelligence', rarity: 'SR', release: 'unknown' },
  { supportId: '30010', displayName: '파인 모션 [감사는 손끝까지 담아서]', nameJa: 'ファインモーション', nameEn: 'Fine Motion', type: 'intelligence', rarity: 'SSR', release: 'available' },
  { supportId: '10021', displayName: '하야카와 타즈나 [트레센 학원]', type: 'friend', rarity: 'R', release: 'unavailable' },
  { supportId: '30067', displayName: '옥좌에 모인 자들 [존상친애]', type: 'group', rarity: 'SSR', release: 'available' },
];
const all: SupportListFilters = { query: '', type: 'all', rarity: 'all', release: 'all' };
const selected = (patch: Partial<SupportListFilters>) => records.filter((row) => matchesSupportFilters(row, row.release, { ...all, ...patch })).map((row) => row.supportId);

describe('support list presentation filters', () => {
  it.each([
    ['speed', ['10002']], ['stamina', ['10006']], ['power', ['10005']], ['guts', ['10001']],
    ['intelligence', ['10028', '20001', '30010']], ['friend', ['10021']], ['group', ['30067']],
  ] as const)('keeps the independent %s training category', (type, ids) => { expect(selected({ type })).toEqual(ids); });
  it('intersects type, rarity, name and release rather than widening the candidate set', () => {
    expect(selected({ query: '파인', type: 'intelligence', rarity: 'SSR', release: 'available' })).toEqual(['30010']);
    expect(selected({ query: '파인', type: 'speed', rarity: 'SSR', release: 'available' })).toEqual([]);
    expect(selected({ query: '후지', type: 'intelligence', rarity: 'SR', release: 'available' })).toEqual([]);
    expect(selected({ query: '후지', type: 'intelligence', rarity: 'SR', release: 'unknown' })).toEqual(['20001']);
  });
  it('keeps R, SR and SSR separate for the same training category', () => {
    expect(selected({ type: 'intelligence', rarity: 'R' })).toEqual(['10028']);
    expect(selected({ type: 'intelligence', rarity: 'SR' })).toEqual(['20001']);
    expect(selected({ type: 'intelligence', rarity: 'SSR' })).toEqual(['30010']);
  });
  it('searches supplied human names without indexing canonical IDs', () => {
    for (const query of [' Fine Motion ', 'ファインモーション']) expect(selected({ query })).toEqual(['30010']);
    for (const query of ['30010', '３００１０']) expect(selected({ query })).toEqual([]);
    expect(selected({ query: '파인 모션' })).toEqual(['10028', '30010']);
  });
  it('treats friend and group as different raw categories', () => {
    expect(supportTypeLabel('friend')).toBe('친구'); expect(supportTypeLabel('group')).toBe('그룹');
    expect(selected({ type: 'friend', rarity: 'SSR' })).toEqual([]);
    expect(selected({ type: 'group', rarity: 'SSR' })).toEqual(['30067']);
  });
  it('normalizes existing display aliases while preserving unknown raw labels', () => {
    expect(normalizeSupportType('Wisdom')).toBe('intelligence'); expect(normalizeSupportType('Wit')).toBe('intelligence');
    expect(normalizeSupportType('Pal')).toBe('friend'); expect(normalizeSupportType('Group')).toBe('group');
    expect(supportTypeLabel('unknown-type')).toBe('unknown-type');
  });
  it('resets to all original rows without changing inputs, IDs or availability', () => {
    const original = JSON.stringify(records);
    expect(selected({ query: 'not found', rarity: 'SSR' })).toEqual([]);
    expect(selected(all)).toEqual(records.map((row) => row.supportId));
    expect(JSON.stringify(records)).toBe(original);
  });
});
