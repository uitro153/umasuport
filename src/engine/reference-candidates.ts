import type { DeepReadonly } from '../data/snapshot';
import type { Pedigree, SlotKey } from '../domain/pedigree';
import type { ReferenceSnapshot } from '../domain/reference';
import { dateOnlySchema } from '../domain/primitives';
import { getReferenceAvailability, type ReferenceAvailability, type ReferenceAvailabilityOptions } from './reference-availability';
import { calculateReferencePedigree, compareReferencePedigreeResults, type ReferenceEvaluationOptions, type ReferencePedigreeResult } from './reference-pedigree';

export interface ReferenceCandidateOptions extends ReferenceAvailabilityOptions, ReferenceEvaluationOptions {
  query?: string;
  includeUnknown?: boolean;
}

export interface ReferenceCandidate {
  costumeId: string;
  result: ReferencePedigreeResult;
  availability: ReferenceAvailability;
}

const normalize = (text: string): string => text.normalize('NFKC').toLocaleLowerCase('ko-KR').trim();

export function rankReferenceCandidates(
  pedigree: DeepReadonly<Pedigree>,
  slotKey: SlotKey,
  snapshot: DeepReadonly<ReferenceSnapshot>,
  cutoffDate: string,
  options: ReferenceCandidateOptions = {},
): ReferenceCandidate[] {
  const cutoff = dateOnlySchema.parse(cutoffDate);
  const query = normalize(options.query ?? '');
  const characters = new Map(snapshot.characters.map((character) => [character.baseId, character]));
  const applications = new Map(snapshot.applications.map((application) => [application.entityId, application]));
  const names = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume.displayName]));
  const result: ReferenceCandidate[] = [];
  for (const costume of snapshot.costumes) {
    const availability = getReferenceAvailability(applications.get(costume.costumeId), cutoff, options);
    if (availability.state === 'unavailable' || (availability.state === 'unknown' && !options.includeUnknown)) continue;
    const character = characters.get(costume.baseId);
    const searchFields = [costume.costumeId, costume.baseId, costume.displayName, costume.nameKo, costume.nameJa, costume.outfitKo, costume.outfitJa, ...costume.aliases,
      character?.displayName, character?.nameJa, character?.nameKo, ...(character?.aliases ?? [])];
    if (query && !searchFields.some((field) => typeof field === 'string' && normalize(field).includes(query))) continue;
    const proposed = { ...pedigree, [slotKey]: { ...pedigree[slotKey], costumeId: costume.costumeId } };
    result.push({ costumeId: costume.costumeId, result: calculateReferencePedigree(proposed, snapshot, options), availability });
  }
  return result.sort((a, b) => (options.allowUnverifiedFormula ? compareReferencePedigreeResults(a.result, b.result) : 0)
    || names.get(a.costumeId)!.localeCompare(names.get(b.costumeId)!, 'ko') || a.costumeId.localeCompare(b.costumeId));
}
