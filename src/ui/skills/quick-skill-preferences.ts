export const QUICK_SKILLS_KEY = 'uma-user-quick-skills-v1';
const legacyDefaults = ['201601', '200452', '201262', '201332', '200432'];
export function parseQuickSkills(raw: string | null): string[] | null {
  if (raw === null || raw.length > 16000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || ![1, 2].includes(Number(value.version)) || !('skillIds' in value) || !Array.isArray(value.skillIds) || value.skillIds.length > 100) return null;
    if (value.version !== 1 && value.version !== 2) return null;
    if (value.version === 2 && (!('userEdited' in value) || typeof value.userEdited !== 'boolean')) return null;
    if (!value.skillIds.every((id: unknown) => typeof id === 'string' && /^\d{1,30}$/.test(id))) return null;
    return [...new Set(value.skillIds as string[])];
  } catch { return null; }
}
export function serializeQuickSkills(ids: readonly string[]): string {
  const raw = JSON.stringify({ version: 2, skillIds: [...new Set(ids)], userEdited: true });
  if (!parseQuickSkills(raw)) throw new Error('빠른 선택 목록을 저장할 수 없습니다.');
  return raw;
}

/** Only the exact unmarked legacy default/order is cleared. User edits always win. */
export function migrateQuickSkills(raw: string | null): { ids: string[] | null; writeBack: string | null } {
  const ids = parseQuickSkills(raw);
  if (ids === null || raw === null) return { ids: null, writeBack: null };
  const record = JSON.parse(raw) as { version: number; skillIds: string[]; userEdited?: boolean; edited?: boolean };
  if (record.version === 2) return { ids, writeBack: null };
  const oldAutomatic = record.userEdited !== true && record.edited !== true && JSON.stringify(record.skillIds) === JSON.stringify(legacyDefaults);
  const next = oldAutomatic ? [] : ids;
  return { ids: next, writeBack: JSON.stringify({ version: 2, skillIds: next, userEdited: !oldAutomatic, legacyDefaultsReviewed: true }) };
}

export function readQuickSkills(storage: Pick<Storage, 'getItem' | 'setItem'>): string[] | null {
  const result = migrateQuickSkills(storage.getItem(QUICK_SKILLS_KEY));
  if (result.writeBack) { try { storage.setItem(QUICK_SKILLS_KEY, result.writeBack); } catch { /* Preserve the safe in-memory result if storage is unavailable. */ } }
  return result.ids;
}
