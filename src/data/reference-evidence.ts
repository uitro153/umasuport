import type { ReferenceSnapshot } from '../domain/reference';
import { validateReferenceSnapshot } from '../domain/reference';

export interface ReleaseObservation {
  entityId: string;
  classification: 'official-confirmed' | 'secondary-observed' | 'forecast' | 'unknown';
  url: string;
  publishedOn: string | null;
  releaseDate: string | null;
  checkedOn: string;
  note: string;
}
const official = 'https://www.kakaogamescorp.com/news/press/detail/1280';
const inven = 'https://www.inven.co.kr/webzine/news/?news=274505&site=uma';
export const RELEASE_OBSERVATIONS: readonly ReleaseObservation[] = [
  ...['100302', '101302'].flatMap((entityId): ReleaseObservation[] => [
    { entityId, classification: 'official-confirmed', url: official, publishedOn: '2022-07-25', releaseDate: '2022-07-25', checkedOn: '2026-11-05', note: 'Publisher explicitly reports both named outfits added on the 25th; not inferred from article date.' },
    { entityId, classification: 'secondary-observed', url: inven, publishedOn: '2022-07-25', releaseDate: '2022-07-25', checkedOn: '2026-11-05', note: 'Inven 14:50 report names both outfits and July 25 pickup. Kitasan in same article is a support, not a trainee.' },
  ]),
  { entityId: '100302', classification: 'secondary-observed', url: 'https://m.namu.moe/w/토카이%20테이오(우마무스메%20프리티%20더비)/인게임%20정보', publishedOn: null, releaseDate: '2022-07-25', checkedOn: '2026-11-05', note: 'Namu mirror outfit section KR date; page revision/publication date unknown. Cross-checked against publisher; not counted as independent game measurement.' },
];

/** Additive local overlay; never rewrites the supplied staging/KO/KR files. */
export function applyReferenceReleaseEvidence(input: ReferenceSnapshot): ReferenceSnapshot {
  const snapshot = structuredClone(input);
  for (const row of snapshot.applications) {
    const observations = RELEASE_OBSERVATIONS.filter((observation) => observation.entityId === row.entityId);
    const confirmed = observations.find((observation) => observation.classification === 'official-confirmed');
    if (!confirmed) continue;
    if (row.kr.confirmedDate !== null && row.kr.confirmedDate !== confirmed.releaseDate) throw new Error(`Conflicting official release date: ${row.entityId}`);
    row.kr = { ...row.kr, confirmedDate: confirmed.releaseDate, evidence: 'official_confirmation', sourceUrl: confirmed.url, checkedOn: confirmed.checkedOn,
      observations: [...(row.kr.observations ?? []), ...observations.filter((observation) => !(row.kr.observations ?? []).some((old) => old.url === observation.url && old.checkedOn === observation.checkedOn))] };
  }
  snapshot.snapshotId = snapshot.snapshotId.endsWith('-kr-evidence-v1') ? snapshot.snapshotId : `${snapshot.snapshotId}-kr-evidence-v1`;
  return validateReferenceSnapshot(snapshot);
}
