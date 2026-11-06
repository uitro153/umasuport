import type { DeepReadonly } from '../data/snapshot';
import type { P5Snapshot } from '../domain/p5-forecast';
import type { P3Application, P3Snapshot } from '../domain/skill-support';
import { dateOnlySchema } from '../domain/primitives';
import type { ReferenceAvailability } from './reference-availability';

export type P5ContentType = 'support' | 'scenario' | 'skill' | 'costume';
export interface P5ReleaseOverride {
  entityType: P5ContentType; entityId: string; jpDate: string | null;
  krConfirmedDate: string | null; krForecastDate: string | null;
  sourceUrl: string | null; checkedOn: string | null;
}
/** Serializable evidence only. KR predicted dates never become JP cutoffs. */
export interface P5AvailabilityContext {
  kind: 'jp-event-order'; asOf: string; eventId: string; jpEventId: string;
  jpEventDate: string | null; krExpectedDate: string | null;
  krExpectedWindow: { from: string; through: string } | null;
  releaseOverrides: P5ReleaseOverride[];
}

export function buildP5AvailabilityContext(
  snapshot: DeepReadonly<Pick<P3Snapshot, 'snapshotId'>>,
  pack: DeepReadonly<Pick<P5Snapshot, 'baseSnapshotId' | 'asOf' | 'tournaments' | 'releases'>>, eventId: string,
): P5AvailabilityContext | null {
  if (pack.baseSnapshotId !== snapshot.snapshotId) throw new Error('P5 증분의 기준 P3 스냅샷이 일치하지 않습니다.');
  const event = pack.tournaments.find((row) => row.eventId === eventId);
  if (!event) return null;
  return {
    kind: 'jp-event-order', asOf: pack.asOf, eventId, jpEventId: event.jpEventId,
    jpEventDate: event.jpStartAt ? new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(event.jpStartAt)) : null,
    krExpectedDate: event.expectedDate,
    krExpectedWindow: event.expectedWindow ? { from: event.expectedWindow.from, through: event.expectedWindow.through } : null,
    releaseOverrides: pack.releases.map((row) => ({
      entityType: row.entityType, entityId: row.entityId, jpDate: row.jpDate,
      krConfirmedDate: row.krConfirmedDate, krForecastDate: row.krForecastDate,
      sourceUrl: row.sources[0]?.url ?? null, checkedOn: row.sources[0]?.checkedOn ?? null,
    })),
  };
}

/** The same comparator is available for costume audit rows without altering P3. */
export function getP5Availability(
  snapshot: DeepReadonly<P3Snapshot>, entityType: P5ContentType, entityId: string,
  forecast: DeepReadonly<P5AvailabilityContext>, allowForecast = false,
): ReferenceAvailability {
  const application = snapshot.applications.find((row) => row.entityType === entityType && row.entityId === entityId);
  const override = forecast.releaseOverrides.find((row) => row.entityType === entityType && row.entityId === entityId);
  const sourceIds = entityType === 'support' ? snapshot.supports.find((row) => row.supportId === entityId)?.sourceIds
    : entityType === 'skill' ? snapshot.skills.find((row) => row.skillId === entityId)?.sourceIds
      : entityType === 'scenario' ? snapshot.scenarios.find((row) => row.scenarioId === entityId)?.sourceIds : undefined;
  const jpSourceUrl = sourceIds?.map((id) => snapshot.sources.find((source) => source.id === id)?.url).find(Boolean) ?? null;
  const direct = resolveP5ReleaseAvailability(application, override, forecast, allowForecast, jpSourceUrl);
  if (entityType !== 'skill' || !allowForecast || direct.state !== 'unknown' || direct.timeline !== 'JP') return direct;
  const witness = skillSupplyWitnesses(snapshot, forecast).get(entityId);
  if (!witness) return direct;
  return { ...direct, state: 'available', basis: 'jp-route-order', effectiveDate: null,
    sourceUrl: witness.sourceUrl,
    evidence: `대응 일본 대회 전 출시된 서포트 ${witness.supportId}에 기록된 ${witness.sourceSkillId} 수급 경로입니다. 스킬 최초 출시일·한국 출시·동일 패치 인증은 아닙니다.` };
}

interface SupplyWitness { supportId: string; sourceSkillId: string; sourceUrl: string | null }
// Production snapshots are immutable and each request has one serializable
// context. Cache the whole source graph once rather than rescanning it per skill.
const supplyCache = new WeakMap<object, WeakMap<object, Map<string, SupplyWitness>>>();
function skillSupplyWitnesses(snapshot: DeepReadonly<P3Snapshot>, forecast: DeepReadonly<P5AvailabilityContext>): Map<string, SupplyWitness> {
  let byContext = supplyCache.get(snapshot);
  if (!byContext) { byContext = new WeakMap(); supplyCache.set(snapshot, byContext); }
  const cached = byContext.get(forecast); if (cached) return cached;
  const result = new Map<string, SupplyWitness>();
  // Publish an empty graph before building; the builder below never recursively
  // asks the skill resolver for witnesses.
  byContext.set(forecast, result);
  const applications = new Map(snapshot.applications.map((row) => [`${row.entityType}:${row.entityId}`, row]));
  const overrides = new Map(forecast.releaseOverrides.map((row) => [`${row.entityType}:${row.entityId}`, row]));
  const resolve = (type: 'support' | 'skill', id: string) => resolveP5ReleaseAvailability(
    applications.get(`${type}:${id}`), overrides.get(`${type}:${id}`), forecast, true,
  );
  const futureProviders = new Set(snapshot.supports.filter((support) => {
    const availability = resolve('support', support.supportId);
    return availability.state === 'available' && availability.basis === 'jp-release-order';
  }).map((support) => support.supportId));
  const skills = new Map(snapshot.skills.map((row) => [row.skillId, row]));
  const lower = new Map(snapshot.skillRelations.filter((row) => row.relation === 'lower_skill')
    .map((row) => [row.skillId, row.relatedSkillId]));
  for (const route of snapshot.supportSkills) {
    if (route.server !== 'JP' || !futureProviders.has(route.supportId) || !['hint', 'event'].includes(route.acquisition)
      || resolve('skill', route.skillId).state === 'unavailable') continue;
    const sourceUrl = route.sourceIds.map((id) => snapshot.sources.find((source) => source.id === id)?.url).find(Boolean) ?? null;
    const witness = { supportId: route.supportId, sourceSkillId: route.skillId, sourceUrl };
    if (resolve('skill', route.skillId).state === 'unknown' && !result.has(route.skillId)) result.set(route.skillId, witness);
    if (skills.get(route.skillId)?.rarity !== 2) continue;
    const seen = new Set([route.skillId]); let next = lower.get(route.skillId);
    while (next && !seen.has(next)) {
      seen.add(next);
      const availability = resolve('skill', next);
      if (availability.state === 'unavailable') break;
      if (availability.state === 'unknown' && skills.get(next)?.rarity === 1 && !result.has(next)) result.set(next, witness);
      next = lower.get(next);
    }
  }
  return result;
}

const officialEvidence = new Set(['official', 'official_notice', 'official_confirmation']);

/**
 * Existing official KR evidence wins. Already observed KR releases are available
 * at a future event; otherwise compare JP release with the corresponding JP event.
 * A future-dated secondary observation is not an observed release as of today.
 */
export function resolveP5ReleaseAvailability(
  application: DeepReadonly<Pick<P3Application, 'jpDate' | 'kr'>> | undefined,
  override: DeepReadonly<P5ReleaseOverride> | undefined,
  forecast: DeepReadonly<P5AvailabilityContext>, allowForecast = false, jpSourceUrl: string | null = null,
): ReferenceAvailability {
  const asOf = dateOnlySchema.parse(forecast.asOf);
  const jpEventDate = forecast.jpEventDate === null ? null : dateOnlySchema.parse(forecast.jpEventDate);
  const krDate = forecast.krExpectedDate === null ? null : dateOnlySchema.parse(forecast.krExpectedDate);
  const window = forecast.krExpectedWindow;
  if (window) { dateOnlySchema.parse(window.from); dateOnlySchema.parse(window.through); }
  const kr = application?.kr;
  const krDisplayDate = override?.krForecastDate ?? kr?.forecastDate ?? (kr?.observedDate && kr.observedDate > asOf ? kr.observedDate : null);
  const base = {
    sourceUrl: kr?.sourceUrl ?? override?.sourceUrl ?? null,
    checkedOn: kr?.checkedOn ?? override?.checkedOn ?? null,
    effectiveDate: null, krDisplayDate, jpEventDate,
  };
  if (kr?.confirmedDate !== null && kr?.confirmedDate !== undefined) {
    if (!officialEvidence.has(kr.evidence) || !kr.sourceUrl || !kr.checkedOn) return {
      ...base, state: 'unknown', basis: 'insufficient-evidence', timeline: 'KR', evidence: '공식 한국 출시 필드의 출처 검증이 부족합니다.',
    };
    const date = dateOnlySchema.parse(kr.confirmedDate);
    return { ...base, effectiveDate: date, timeline: 'KR', basis: 'official-date',
      state: compareKrRelease(date, asOf, krDate, window), evidence: kr.evidence };
  }
  for (const [date, basis] of [[kr?.observedDate, 'secondary-date'], [kr?.releasedBy, 'released-by-observation']] as const) {
    if (date && dateOnlySchema.parse(date) <= asOf) return {
      ...base, effectiveDate: date, timeline: 'KR', basis, state: compareKrRelease(date, asOf, krDate, window), evidence: kr?.evidence ?? 'none',
    };
  }
  const jpDate = application?.jpDate ?? override?.jpDate ?? null;
  if (jpDate !== null) dateOnlySchema.parse(jpDate);
  const jpBase = { ...base, effectiveDate: jpDate, timeline: 'JP' as const,
    sourceUrl: jpSourceUrl ?? override?.sourceUrl ?? base.sourceUrl };
  if (jpDate === null || jpEventDate === null) return {
    ...jpBase, state: 'unknown', basis: 'insufficient-evidence', evidence: '일본 출시일 또는 대응 일본 대회일의 선후관계를 확인하지 못했습니다.',
  };
  if (jpDate > jpEventDate) return {
    ...jpBase, state: 'unavailable', basis: 'jp-release-order', evidence: '일본 원본 대회 이후 출시된 콘텐츠입니다. 한국 예상 날짜와 섞어 판정하지 않습니다.',
  };
  if (!allowForecast) return {
    ...jpBase, state: 'unknown', basis: 'insufficient-evidence', evidence: '일본 대회 이전 출시 자료가 있으나 미래시 포함이 꺼져 있습니다. 한국 출시 확정으로 처리하지 않습니다.',
  };
  return { ...jpBase, state: 'available', basis: 'jp-release-order',
    evidence: '일본 출시일이 대응 일본 대회일 이전 또는 같은 날입니다. 한국 대회 사용 가능 예상이며 한국 패치 인증은 아닙니다.' };
}

function compareKrRelease(date: string, asOf: string, krDate: string | null, window: DeepReadonly<{ from: string; through: string }> | null): ReferenceAvailability['state'] {
  if (krDate) return date <= krDate ? 'available' : 'unavailable';
  if (window) return date <= window.from ? 'available' : date > window.through ? 'unavailable' : 'unknown';
  return date <= asOf ? 'available' : 'unknown';
}
