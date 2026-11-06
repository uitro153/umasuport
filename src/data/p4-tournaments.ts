import evidence from '../../data/curated/p4-loh-evidence.json';
import type { P3Tournament } from '../domain/skill-support';
import type { ReferenceSnapshot } from '../domain/reference';

export const p4TournamentSources: ReferenceSnapshot['sources'] = [{
  id: 'p4-kr-loh-official', url: 'https://kakaogames.oqupie.com/portals/1576/articles/65213',
  repository_commit: null, repository_updated_at: null, data_updated_at: null,
  verified_on: '2026-11-05', coverage: 'One KR September 2026 LoH schedule and race conditions',
  missing: 'Complete LoH chronology and exact original page update timestamp',
  status: 'official-event-notice-with-official-channel-year-context',
}];

/** A dated official LoH case; random weather/ground stay unknown to skill evaluation. */
export const p4Tournaments: P3Tournament[] = evidence.events.map((event) => ({
  eventId: event.eventId, name: '2026년 9월 LoH · 오이 더트 2000m',
  server: 'KR', format: 'league-of-heroes', fieldSize: event.entrants, timeOfDay: 'night',
  startAt: event.startAt, dateStatus: 'confirmed', courseId: event.courseId,
  conditions: { ...event.conditions, surface: 2, direction: 1, weather: null, ground: null },
  sourceIds: ['p4-kr-loh-official'], sourceUrl: event.sourceUrl,
  evidence: `${event.evidence}; ${event.yearEvidence}; 날씨·주로 랜덤, 12인 순위 조건은 별도 검증 필요`,
  checkedOn: evidence.checkedOn,
}));
