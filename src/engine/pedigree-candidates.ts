import { type P1Rules, type Pedigree, type SlotKey } from '../domain/pedigree';
import type { DeepReadonly, PinnedSnapshot } from '../data/snapshot';
import { dateOnlySchema } from '../domain';
import { calculateAffinity, compareAffinityResults, type AffinityResult } from './affinity';
import { projectAvailability, type Availability } from './availability';

export interface PedigreeCandidate {
  costumeId: string;
  result: AffinityResult;
  availability: Availability;
}

const normalizeSearch = (value: string): string => value.normalize('NFKC').toLocaleLowerCase('ko-KR').trim();

/** Available costumes only; unchanged selections remain the caller's responsibility. */
export function rankPedigreeCandidates(
  pedigree: DeepReadonly<Pedigree>,
  slotKey: SlotKey,
  snapshot: PinnedSnapshot,
  rules: DeepReadonly<P1Rules>,
  cutoffDate: string,
  query = '',
): PedigreeCandidate[] {
  const cutoff = dateOnlySchema.parse(cutoffDate);
  const search = normalizeSearch(query);
  const characters = new Map(snapshot.characters.map((character) => [character.baseId, character]));
  const releases = new Map(snapshot.releases.map((release) => [release.releaseId, release]));
  const names = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume.nameKo]));
  const candidates: PedigreeCandidate[] = [];
  for (const costume of snapshot.costumes) {
    const character = characters.get(costume.baseId);
    const release = releases.get(costume.releaseRef);
    if (!release) continue;
    const availability = projectAvailability(release, cutoff);
    if (!availability.available) continue;
    const searchFields = [costume.nameKo, character?.nameKo ?? '', character?.nameJa ?? '', ...(character?.aliases ?? [])];
    if (search !== '' && !searchFields.some((field) => normalizeSearch(field).includes(search))) continue;
    const candidate = {
      ...pedigree,
      [slotKey]: { ...pedigree[slotKey], costumeId: costume.costumeId },
    };
    candidates.push({ costumeId: costume.costumeId, result: calculateAffinity(candidate, snapshot, rules), availability });
  }
  return candidates.sort((a, b) => compareAffinityResults(a.result, b.result)
    || names.get(a.costumeId)!.localeCompare(names.get(b.costumeId)!, 'ko')
    || (a.costumeId < b.costumeId ? -1 : a.costumeId > b.costumeId ? 1 : 0));
}
