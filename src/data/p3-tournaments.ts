import type { P3Tournament } from '../domain/skill-support';
import type { ReferenceSnapshot } from '../domain/reference';

export const p3TournamentSources: ReferenceSnapshot['sources'] = [{
  id: 'p3-kakao-tournaments', url: 'https://pf.kakao.com/_DzxjIb/posts',
  repository_commit: null, repository_updated_at: null, data_updated_at: null,
  verified_on: '2026-11-05', coverage: 'KR CM 36/37/38 schedule and fixed race conditions',
  missing: 'Not a complete Korean tournament calendar', status: 'official-notice-transcription',
}, {
  id: 'p3-gametora-cm', url: 'https://gametora.com/umamusume/events/champions-meeting?cm=39',
  repository_commit: null, repository_updated_at: null, data_updated_at: null,
  verified_on: '2026-11-05', coverage: 'CM 39 race conditions; Korean start date unavailable',
  missing: 'No Korean schedule; do not extrapolate from JP date', status: 'secondary-reference-kr-schedule-unknown',
}];

// Only directly observed schedules are dated. No fixed JP-to-KR offset is used.
export const p3Tournaments: P3Tournament[] = [{
  eventId: 'kr-cm-38', name: '2026년 10월 CLASSIC · 도쿄 2400m',
  startAt: '2026-10-10T12:00:00+09:00', dateStatus: 'confirmed', courseId: '10606',
  conditions: { distance: 2400, surface: 1, direction: 2, season: 1, weather: 1, ground: 1 },
  sourceIds: ['p3-kakao-tournaments'], sourceUrl: 'https://pf.kakao.com/_DzxjIb/posts',
  evidence: '공식 채널의 라운드1 10월10일12시와 도쿄·잔디2400·좌·봄·맑음·양호를 전사. 2026년 게시 목록 문맥 확인.',
  checkedOn: '2026-11-05',
}, {
  eventId: 'kr-cm-37', name: '2026년 8월 LONG · 교토 3200m',
  startAt: '2026-08-12T12:00:00+09:00', dateStatus: 'confirmed', courseId: '10811',
  conditions: { distance: 3200, surface: 1, direction: 1, season: 1, weather: 1, ground: 1 },
  sourceIds: ['p3-kakao-tournaments'], sourceUrl: 'https://pf.kakao.com/_DzxjIb/posts',
  evidence: '공식 채널의 라운드1 8월12일12시와 교토·잔디3200·우·봄·맑음·양호를 전사.',
  checkedOn: '2026-11-05',
}, {
  eventId: 'kr-cm-36', name: '2026년 7월 MILE · 한신 1600m',
  startAt: '2026-07-14T12:00:00+09:00', dateStatus: 'confirmed', courseId: '10903',
  conditions: { distance: 1600, surface: 1, direction: 1, season: 1, weather: 1, ground: 1 },
  sourceIds: ['p3-kakao-tournaments'], sourceUrl: 'https://pf.kakao.com/_DzxjIb/posts',
  evidence: '공식 채널의 라운드1 7월14일12시와 한신·잔디1600·우·봄·맑음·양호를 전사.',
  checkedOn: '2026-11-05',
}, {
  eventId: 'kr-cm-39-undated', name: 'CM39 CLASSIC · 한국 일정 미확인',
  startAt: null, dateStatus: 'unknown', courseId: '10906',
  conditions: { distance: 2200, surface: 1, direction: 1, season: 2, weather: 2, ground: 2 },
  sourceIds: ['p3-gametora-cm'], sourceUrl: 'https://gametora.com/umamusume/events/champions-meeting?cm=39',
  evidence: 'GameTora CM39 조건. 한국 개최 일정·동일 조건 적용 미확인. 일본 날짜를 한국 날짜로 대체하지 않음.',
  checkedOn: '2026-11-05',
}];
