import { useMemo, useState } from 'react';
import type { DeepReadonly } from '../../data/snapshot';
import type { P3Snapshot } from '../../domain/skill-support';
import type { LineageSkillAnalysis } from '../../engine/lineage-skills';
import { getLineageSkillPresence } from '../../engine/lineage-skills';
import type { P4DeckRecommendation } from '../../engine/support-deck-optimizer';
import type { SkillAcquisitionRoute } from '../../engine/support-acquisition';
import { buildSupportEventModel } from '../../engine/event-acquisition';
import { resolveCanonicalWhiteSkillId, type UserSkillPriority } from '../../engine/skill-priorities';

interface Props {
  snapshot: DeepReadonly<P3Snapshot>; deck: P4DeckRecommendation; analysis: LineageSkillAnalysis;
  mainRoutes: readonly SkillAcquisitionRoute[]; priorities: readonly UserSkillPriority[]; scenarioId?: string | null;
}
const kinds = { hint: '일반 힌트', event: '이벤트', 'gold-lower': '금색 하위' };
const relations = { self: '자기', parent: '직접 부모', grandparent: '조부모', deeper: '깊은 조상', other: '다른 혈통' };

export default function LineageSupplyComparison({ snapshot, deck, analysis, mainRoutes, priorities, scenarioId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const names = new Map(snapshot.skills.map((skill) => [skill.skillId, skill.displayName]));
    const main = new Map<string, SkillAcquisitionRoute[]>();
    for (const route of mainRoutes) {
      const id = resolveCanonicalWhiteSkillId(snapshot, route.skillId);
      if (id) main.set(id, [...(main.get(id) ?? []), route]);
    }
    const factor = new Map<string, SkillAcquisitionRoute[]>();
    for (const card of deck.cards) {
      const model = buildSupportEventModel(snapshot, card.supportId, { scenarioId: scenarioId ?? undefined, allowJpReference: true });
      const decisions = new Map(card.eventDecisions.map((choice) => [choice.groupId, choice.optionId]));
      for (const route of card.routes) {
        if (!card.skillIds.includes(route.skillId)) continue;
        const groups = model.groups.filter((group) => group.options.some((option) => option.sourceSkillIds.includes(route.sourceSkillId)));
        const compatible = route.sourceKind === 'hint' || groups.length > 0 && groups.every((group) => group.status === 'modeled'
          && group.options.some((option) => option.optionId === decisions.get(group.groupId) && option.sourceSkillIds.includes(route.sourceSkillId)));
        if (compatible) factor.set(route.skillId, [...(factor.get(route.skillId) ?? []), route]);
      }
    }
    const ids = [...new Set([...priorities.map((row) => row.skillId), ...analysis.allNodes.flatMap((node) => [...node.owned, ...node.planned].map((record) => record.skillId)), ...deck.skillIds, ...main.keys()])];
    return ids.map((skillId) => ({ skillId, name: names.get(skillId) ?? skillId, presence: getLineageSkillPresence(analysis, skillId),
      main: main.get(skillId) ?? [], factor: factor.get(skillId) ?? [] }));
  }, [snapshot, deck, analysis, mainRoutes, priorities, scenarioId]);
  const overlap = rows.filter((row) => row.main.length && row.factor.length).length;
  return <section className="p7-supply-comparison p4-detail" data-testid="p7-supply-comparison">
    <h3>기존 백인자와 두 수급 경로 비교</h3>
    <p>최종 본육성 직접 수급 {rows.filter((row) => row.main.length).length}스킬 · 선택 인자작 양립 계획 {deck.skillIds.length}목표 · 양쪽 수급 경로 {overlap}개.</p>
    <p>일반 힌트·이벤트·금색 하위는 수급 경로의 종류입니다. 중복 경로의 수를 안정성 점수나 성공률로 바꾸지 않으며 정해진 평가 정책을 유지합니다. 본육성은 잠재 경로, 인자작은 선택한 양립 계획의 경로를 표시합니다.</p>
    <div className="p7-supply-list">{(expanded ? rows : rows.slice(0, 12)).map((row) => <article key={row.skillId} data-testid={`p7-supply-${row.skillId}`} data-owned-node-ids={row.presence.ownedLocations.map(node => node.nodeId).join(',')}><strong>{row.name}</strong>
      <p>실제 백인자 사용자 기록: {row.presence.ownedLocations.map((node) => `${node.label} (${relations[node.relation]})`).join(', ') || '입력 기록에서 확인되지 않음'} · {row.presence.duplicateOwnedCount}위치</p>
      {row.presence.plannedLocations.length > 0 && <p>제작 목표: {row.presence.plannedLocations.map((node) => node.label).join(', ')} · 아직 보유/계승 완료 아님</p>}
      {row.presence.unknownNodeIds.length > 0 && <p>자기·직접 부모·조부 중 미확인 {row.presence.unknownNodeIds.length}곳 · 미보유 확정 아님</p>}
      <RouteList label="최종 본육성 잠재 경로" routes={row.main} />
      <RouteList label="선택 인자작 양립 경로" routes={row.factor} />
      {new Set(row.factor.map((route) => route.supportId)).size > 1 && <p>인자작 중복 공급 {new Set(row.factor.map((route) => route.supportId)).size}카드 · {Array.from(new Set(row.factor.map((route) => kinds[route.kind]))).join(' / ')}</p>}
    </article>)}</div>
    {rows.length > 12 && <button className="btn" onClick={() => setExpanded((value) => !value)}>{expanded ? '경로 비교 접기' : `전체 ${rows.length}개 스킬 경로 비교`}</button>}
  </section>;
}
function RouteList({ label, routes }: { label: string; routes: SkillAcquisitionRoute[] }) {
  return <details><summary>{label} · {routes.length}개</summary>{routes.length ? <ul>{routes.map((route, index) => <li key={`${route.supportId}:${route.sourceSkillId}:${route.kind}:${index}`} data-support-id={route.supportId} data-source-skill-id={route.sourceSkillId}>{route.supportName} · {kinds[route.kind]} · {route.sourceServer ?? '서버 미확인'}{route.acquisitionBasis === 'jp-reference-forecast' ? ' 일본 미래시 참고' : ''}</li>)}</ul> : <p>입력·선택한 편성에서 확인된 경로 없음</p>}</details>;
}
