import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import type { P5Snapshot, P5TournamentChoice } from '../../domain/p5-forecast';
import { buildP5AvailabilityContext } from '../../engine/p5-availability';
import { getP3Availability } from '../../engine/support-acquisition';
import periods from '../../data/tournament-display-periods.json';

const VENUES: Record<string, string> = { '札幌': '삿포로', '函館': '하코다테', '福島': '후쿠시마', '新潟': '니이가타', '東京': '도쿄', '中山': '나카야마', '中京': '주쿄', '京都': '교토', '阪神': '한신', '小倉': '고쿠라', '大井': '오이', '川崎': '가와사키', '船橋': '후나바시', '盛岡': '모리오카', 'ロンシャン': '롱샹' };
const SHORT_SCENARIOS: Record<string, string> = { '1': 'URA', '2': '아오하루', '3': '그랜드 라이브', '4': '클라이맥스', '5': '그랜드 마스터즈', '6': "L'Arc", '7': 'U.A.F.', '8': '대풍식제', '9': '메카', '10': 'The Twinkle Legends', '11': '무인도', '12': 'ゆこま温泉郷', '13': 'Beyond Dreams', '14': 'トレセン軒', '15': '午式駿大祭' };

export function tournamentPeriodEnd(event: DeepReadonly<P5TournamentChoice>): string | null {
  // Predicted dates are not proof that a KR tournament ended. Preserve them.
  if (event.dateStatus === 'forecast' || event.dateStatus === 'unknown' || event.forecast) return null;
  const row = periods.periods.find((item) => item.eventId === event.eventId);
  if (!row || !event.startAt) return null;
  const startOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(event.startAt));
  // If an official/current schedule moved, an older source range is no longer
  // evidence that this event has ended. Keep the choice until rechecked.
  if (row.startOn !== startOn) return null;
  return row?.endOn ?? null;
}

export function isPastTournament(event: DeepReadonly<P5TournamentChoice>, today: string): boolean {
  const end = tournamentPeriodEnd(event);
  return end !== null && end < today;
}

function scenarioLabel(scenario: DeepReadonly<P3Snapshot>['scenarios'][number]): string {
  const proposed = SHORT_SCENARIOS[scenario.scenarioId];
  const sourceNames = [scenario.displayName, scenario.nameKo, scenario.nameJa, scenario.nameEn].filter(Boolean).join(' ');
  return proposed && sourceNames.includes(proposed) ? proposed : scenario.displayName;
}

/** A display representative, independent of the user's actual scenario selector. */
export function representativeScenario(snapshot: DeepReadonly<P3Snapshot>, p5: DeepReadonly<P5Snapshot> | null, event: DeepReadonly<P5TournamentChoice>) {
  const forecast = p5 && event.forecast && event.dateStatus !== 'confirmed' ? buildP5AvailabilityContext(snapshot, p5, event.eventId) ?? undefined : undefined;
  const cutoffDate = forecast?.krExpectedDate ?? forecast?.asOf ?? event.startAt?.slice(0, 10);
  if (!cutoffDate) return { scenarioId: null, label: '시나리오 확인 필요', basis: 'unknown' };
  const available = snapshot.scenarios.map((scenario) => ({ scenario, availability: getP3Availability(snapshot, 'scenario', scenario.scenarioId, cutoffDate, !!forecast, forecast) }))
    .filter((row) => row.availability.state === 'available')
    .sort((a, b) => (b.scenario.jpDate ?? '').localeCompare(a.scenario.jpDate ?? '') || a.scenario.scenarioId.localeCompare(b.scenario.scenarioId));
  const latest = available[0];
  return latest ? { scenarioId: latest.scenario.scenarioId, label: scenarioLabel(latest.scenario), basis: latest.availability.basis }
    : { scenarioId: null, label: '시나리오 확인 필요', basis: 'unknown' };
}

export function tournamentChoiceLabel(snapshot: DeepReadonly<P3Snapshot>, p5: DeepReadonly<P5Snapshot> | null, event: DeepReadonly<P5TournamentChoice>): string {
  const distance = event.conditions.distance;
  const category = distance <= 1400 ? '단거리' : distance <= 1800 ? '마일' : distance <= 2400 ? '중거리' : '장거리';
  const course = snapshot.courses.find((row) => row.courseId === event.courseId);
  const venue = VENUES[course?.venue ?? ''] ?? course?.venue ?? '경기장 확인 필요';
  return `[${representativeScenario(snapshot, p5, event).label}] [${event.format === 'league-of-heroes' ? 'LoH' : '챔미'}] [${category} ${distance}m] ${venue}`;
}

export function buildTournamentOptions(snapshot: DeepReadonly<P3Snapshot>, p5: DeepReadonly<P5Snapshot> | null, events: readonly DeepReadonly<P5TournamentChoice>[], today: string) {
  const labels = events.map((event) => tournamentChoiceLabel(snapshot, p5, event));
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return events.map((event, index) => {
    const label = labels[index]!;
    const sequence = (seen.get(label) ?? 0) + 1; seen.set(label, sequence);
    return { event, past: isPastTournament(event, today), label: (counts.get(label) ?? 0) > 1 ? `${label} · ${sequence}` : label };
  });
}
