import type { DeepReadonly } from '../data/snapshot';
import type { P3Snapshot } from '../domain/skill-support';
import { getReferenceAvailability, type ReferenceAvailability } from './reference-availability';
import { getP5Availability, type P5AvailabilityContext } from './p5-availability';

export interface MainSupportSelection { supportId: string; limitBreak: number }
export interface SkillAcquisitionRoute {
  supportId: string; supportName: string; skillId: string; sourceSkillId: string;
  kind: 'hint' | 'event' | 'gold-lower'; sourceKind: 'hint' | 'event';
  goldSkillId: string | null; limitBreak: number; hintLevel: number | null; hintFrequency: number | null;
  availability: ReferenceAvailability; status: 'potential-route';
  relationEvidence: string | null; sourceIds: string[];
  /** Set for P5 without relabelling a Japanese source as a Korean route. */
  sourceServer?: 'KR' | 'JP';
  acquisitionBasis?: 'kr-source' | 'jp-reference-forecast';
}
export interface DeckCardAnalysis {
  supportId: string; limitBreak: number; name: string; availability: ReferenceAvailability;
  accepted: boolean; reasons: string[];
}
export interface DeckAnalysis {
  selectedCount: number; complete: boolean; cards: DeckCardAnalysis[];
  routes: SkillAcquisitionRoute[]; bySkillId: Record<string, SkillAcquisitionRoute[]>; warnings: string[];
}

/** Reuse the P1 KR evidence/date policy; the adapter changes no evidence values. */
export function getP3Availability(
  snapshot: DeepReadonly<P3Snapshot>, entityType: 'support' | 'scenario' | 'skill',
  entityId: string, cutoffDate: string, allowForecast = false, forecast?: DeepReadonly<P5AvailabilityContext>,
): ReferenceAvailability {
  if (forecast) return getP5Availability(snapshot, entityType, entityId, forecast, allowForecast);
  const row = snapshot.applications.find((application) => application.entityType === entityType && application.entityId === entityId);
  return getReferenceAvailability(row ? { ...row, entityType: 'costume' } : undefined, cutoffDate, { allowForecast });
}

/** Potential hint/event paths, never a promise that an event completes or its hint occurs. */
export function analyzeSupportDeck(
  snapshot: DeepReadonly<P3Snapshot>, selections: readonly MainSupportSelection[],
  cutoffDate: string, allowForecast = false, forecast?: DeepReadonly<P5AvailabilityContext>,
): DeckAnalysis {
  if (selections.length > 6) throw new RangeError('본육성 서포트는 최대 6장입니다.');
  const seen = new Set<string>();
  const result: DeckAnalysis = { selectedCount: selections.length, complete: selections.length === 6, cards: [], routes: [], bySkillId: {}, warnings: [] };
  const skillMap = new Map(snapshot.skills.map((skill) => [skill.skillId, skill]));
  for (const selection of selections) {
    if (!Number.isInteger(selection.limitBreak) || selection.limitBreak < 0 || selection.limitBreak > 4) throw new RangeError('돌파는 0～4입니다.');
    if (seen.has(selection.supportId)) throw new RangeError('동일 서포트 카드를 중복 선택할 수 없습니다.');
    seen.add(selection.supportId);
    const support = snapshot.supports.find((row) => row.supportId === selection.supportId);
    const availability = getP3Availability(snapshot, 'support', selection.supportId, cutoffDate, allowForecast, forecast);
    const accepted = support !== undefined && availability.state === 'available';
    const reasons: string[] = [];
    if (!support) reasons.push('서포트 데이터가 없습니다.');
    else if (availability.state === 'unknown') reasons.push('한국 출시 근거가 없어 이 카드의 수급 경로는 계산에서 제외합니다.');
    else if (!accepted) reasons.push('선택 기준일 이후 출시 카드입니다.');
    result.cards.push({ ...selection, name: support?.displayName ?? selection.supportId, availability, accepted, reasons });
    if (!accepted || !support) continue;
    const effects = snapshot.supportLimitBreakEffects.filter((row) => row.supportId === support.supportId && row.limitBreak === selection.limitBreak);
    const hintLevel = effects.find((row) => row.effectId === 17)?.value ?? null;
    const hintFrequency = effects.find((row) => row.effectId === 18)?.value ?? null;
    // Already observed KR cards retain their KR paths. For a JP-order future
    // card, use only the recorded JP paths and preserve that source identity.
    // This does not apply future JP balance-patch paths to every older KR card.
    const sourceServer = forecast && availability.basis === 'jp-release-order' ? 'JP' : 'KR';
    for (const link of snapshot.supportSkills.filter((row) => row.supportId === support.supportId && row.server === sourceServer && ['hint', 'event'].includes(row.acquisition))) {
      // A pre-existing lower skill cannot bypass an after-event gold source.
      // Unknown skill first-release dates remain unknown, not invented dates.
      if (forecast && getP3Availability(snapshot, 'skill', link.skillId, cutoffDate, allowForecast, forecast).state === 'unavailable') continue;
      const sourceKind = link.acquisition as 'hint' | 'event';
      const base: SkillAcquisitionRoute = {
        supportId: support.supportId, supportName: support.displayName, skillId: link.skillId, sourceSkillId: link.skillId,
        kind: sourceKind, sourceKind, goldSkillId: null, limitBreak: selection.limitBreak,
        hintLevel: sourceKind === 'hint' ? hintLevel : null,
        hintFrequency: sourceKind === 'hint' ? hintFrequency : null,
        availability, status: 'potential-route', relationEvidence: null, sourceIds: [...link.sourceIds],
        ...(forecast ? { sourceServer, acquisitionBasis: sourceServer === 'JP' ? 'jp-reference-forecast' as const : 'kr-source' as const } : {}),
      };
      addRoute(result, base);
      if (skillMap.get(link.skillId)?.rarity !== 2) continue;
      const queue = [{ id: link.skillId, evidence: [] as string[], sources: [] as string[] }];
      const visited = new Set([link.skillId]);
      while (queue.length) {
        const current = queue.shift()!;
        for (const lower of snapshot.skillRelations.filter((row) => row.relation === 'lower_skill' && row.skillId === current.id)) {
          if (visited.has(lower.relatedSkillId)) continue;
          visited.add(lower.relatedSkillId);
          if (forecast && getP3Availability(snapshot, 'skill', lower.relatedSkillId, cutoffDate, allowForecast, forecast).state === 'unavailable') continue;
          const evidence = [...current.evidence, lower.evidence];
          const sources = [...new Set([...current.sources, ...lower.sourceIds])];
          if (skillMap.get(lower.relatedSkillId)?.rarity === 1) addRoute(result, {
            ...base, skillId: lower.relatedSkillId, kind: 'gold-lower', goldSkillId: link.skillId,
            // A gold-event path does not inherit a normal-training hint's level/frequency.
            hintLevel: null, hintFrequency: null, relationEvidence: evidence.join(' → '),
            sourceIds: [...new Set([...base.sourceIds, ...sources])],
          });
          queue.push({ id: lower.relatedSkillId, evidence, sources });
        }
      }
    }
  }
  for (const route of result.routes) (result.bySkillId[route.skillId] ??= []).push(route);
  result.complete = result.complete && result.cards.every((card) => card.accepted);
  if (!result.complete) result.warnings.push('본육성 서포트 6장이 미완성입니다. 현재 선택한 카드의 경로만 분석합니다.');
  if (result.cards.some((card) => !card.accepted)) result.warnings.push('기준일 가용성을 확인하지 못한 선택 카드는 수급 분석에서 제외했습니다.');
  result.warnings.push('힌트·이벤트·금색 하위 경로는 획득 가능 경로이며 확정 수급이나 이벤트 완주율이 아닙니다.');
  return result;
}

function addRoute(result: DeckAnalysis, route: SkillAcquisitionRoute) {
  if (!result.routes.some((row) => row.supportId === route.supportId && row.skillId === route.skillId && row.sourceSkillId === route.sourceSkillId && row.kind === route.kind)) result.routes.push(route);
}
