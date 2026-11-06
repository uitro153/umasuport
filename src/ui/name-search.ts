const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
/** UI search indexes human names only. IDs remain internal linkage keys. */
export function matchesNameQuery(query: string, names: readonly (string | null | undefined)[], internalIds: readonly string[] = []): boolean {
  const key = normalize(query);
  if (!key) return true;
  if (internalIds.some(id => normalize(id) === key)) return false;
  return names.some(name => typeof name === 'string' && !internalIds.includes(name) && normalize(name).includes(key));
}
