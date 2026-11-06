import type { P3Application } from '../domain/skill-support';
import type { ReferenceSnapshot } from '../domain/reference';

export const p3ReleaseSources: ReferenceSnapshot['sources'] = [{
  id: 'p3-gametora-kr-support-dates', url: 'https://gametora.com/ko/umamusume/supports',
  repository_commit: null, repository_updated_at: null, data_updated_at: null,
  verified_on: '2026-11-05', coverage: 'Six individually checked Korean support release dates',
  missing: 'Secondary dates; no official Korean release certification or skill patch verification',
  status: 'secondary-individual-pages',
}];

const supportEvidence = [
  ['30028', 'kitasan-black', '2022-07-25'],
  ['30016', 'super-creek', '2022-06-20'],
  ['30023', 'rice-shower', '2022-06-20'],
  ['30007', 'el-condor-pasa', '2022-06-20'],
  ['30009', 'tamamo-cross', '2022-06-20'],
  ['30011', 'ines-fujin', '2022-06-20'],
] as const;

/** Dates are observations from secondary Korean pages, never official dates. */
export function applyP3ReleaseEvidence(applications: P3Application[]): P3Application[] {
  return applications.map((application) => {
    const evidence = application.entityType === 'support'
      ? supportEvidence.find(([id]) => id === application.entityId) : undefined;
    if (!evidence) return application;
    const [id, slug, date] = evidence;
    const sourceUrl = `https://gametora.com/ko/umamusume/supports/${id}-${slug}`;
    return { ...application, kr: {
      ...application.kr, observedDate: application.kr.observedDate ?? date,
      evidence: application.kr.confirmedDate ? application.kr.evidence : 'secondary_page',
      sourceUrl: application.kr.confirmedDate ? application.kr.sourceUrl : sourceUrl,
      checkedOn: '2026-11-05', observations: [...(application.kr.observations ?? []), {
        entityId: id, classification: 'secondary-observed', url: sourceUrl,
        publishedOn: null, releaseDate: date, checkedOn: '2026-11-05',
        note: '한국어 상세 페이지의 출시일 직접 확인. 공식 출처·스킬 개별 출시일·KR 패치 인증으로 승격하지 않음.',
      }],
    } };
  });
}
