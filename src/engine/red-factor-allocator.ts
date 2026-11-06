import type { DeepReadonly } from '../data/snapshot';
import {
  getLineageSlotMap, getLineageSlots, getProtectedNodeIds, validateLineagePlan,
  type LineageConstraints, type LineagePlan,
} from '../domain/lineage';
import { APTITUDE_KEYS, type AptitudeKey, type RedFactor } from '../domain/pedigree';
import type { AptitudeGrade } from '../domain/primitives';
import type { ReferenceSnapshot } from '../domain/reference';
import { evaluateLineage, requiredStars } from './lineage-evaluation';
import { APTITUDE_LABELS } from './aptitude';

export type AllocationStatus = 'feasible' | 'infeasible' | 'incomplete' | 'search-limited';
export type AllocationEvaluation = ReturnType<typeof evaluateLineage>;

export interface RedFactorChange {
  nodeId: string;
  before: RedFactor | null;
  after: RedFactor | null;
}

export interface AllocationResult {
  status: AllocationStatus;
  plan: LineagePlan | null;
  before: AllocationEvaluation;
  after: AllocationEvaluation | null;
  changes: RedFactorChange[];
  reasons: string[];
  examinedStates: number;
}

export interface AllocationOptions {
  /** Exhaustion is reported separately from mathematical infeasibility. */
  maxSearchStates?: number;
}

interface BlockCandidate {
  factors: Map<string, RedFactor | null>;
  geneLevel: 0 | 6 | 12;
  parentContribution: number;
  totalStars: number;
  concentration: number;
  changedNodes: number;
  signature: string;
}

interface ParentGroup {
  parentId: string;
  grandIds: readonly [string, string];
  requiredType: AptitudeKey | null;
  requiredGreatStars: number;
}

interface SelectedPair {
  blocks: readonly [BlockCandidate, BlockCandidate];
  twelveCount: number;
  totalStars: number;
  concentration: number;
  changedNodes: number;
  signature: string;
}

class SearchLimitReached extends Error {}

const sameFactor = (a: DeepReadonly<RedFactor> | null, b: DeepReadonly<RedFactor> | null): boolean =>
  a === null ? b === null : b !== null && a.type === b.type && a.stars === b.stars;

function cloneFactor(factor: DeepReadonly<RedFactor> | null): RedFactor | null {
  return factor === null ? null : { ...factor };
}

function compareBlock(a: BlockCandidate, b: BlockCandidate): number {
  return a.totalStars - b.totalStars || b.concentration - a.concentration
    || a.changedNodes - b.changedNodes || a.signature.localeCompare(b.signature);
}

function comparePair(a: SelectedPair, b: SelectedPair): number {
  return b.twelveCount - a.twelveCount || a.totalStars - b.totalStars
    || b.concentration - a.concentration || a.changedNodes - b.changedNodes
    || a.signature.localeCompare(b.signature);
}

/**
 * Allocate only the 24 planned great/great-great factors. Character identity,
 * factor ownership and all parent links remain unchanged. Each grandparent's
 * six contributing nodes are disjoint, but the two great nodes also contribute
 * to its parent; parent constraints are therefore joined before choosing a plan.
 *
 * The search is exact within these fixed identities and six-node blocks: it
 * enumerates the required star totals and every 1..3-star placement that can
 * satisfy them. Its resource limit never becomes an 'impossible' conclusion.
 */
export function allocateRedFactors(
  input: DeepReadonly<LineagePlan>,
  snapshot: DeepReadonly<ReferenceSnapshot>,
  constraints: DeepReadonly<LineageConstraints>,
  options: AllocationOptions = {},
): AllocationResult {
  const before = evaluateLineage(input, snapshot, constraints);
  const limit = options.maxSearchStates ?? 1_000_000;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('maxSearchStates must be a positive integer');
  let examinedStates = 0;
  const tick = () => { if (++examinedStates > limit) throw new SearchLimitReached(); };
  const failed = (status: AllocationStatus, reasons: string[]): AllocationResult => ({
    status, plan: null, before, after: null, changes: [], reasons: [...new Set(reasons)], examinedStates,
  });
  if (before.status === 'invalid') return failed('incomplete', before.issues);

  let plan: LineagePlan;
  try { plan = validateLineagePlan(input); }
  catch { return failed('incomplete', ['31인 계보 연결이 유효하지 않아 자동 배분할 수 없습니다.']); }
  const map = getLineageSlotMap(plan);
  const labels = new Map(getLineageSlots(plan).map((slot) => [slot.nodeId, slot.label]));
  const protectedIds = getProtectedNodeIds(plan);
  const costumes = new Map(snapshot.costumes.map((costume) => [costume.costumeId, costume]));
  const parentGroups: ParentGroup[] = [];
  const preliminaryReasons: string[] = [];
  let incomplete = false;

  for (const parentKey of ['parentA', 'parentB'] as const) {
    const parent = plan.nodes[map[parentKey]]!;
    if (parent.parentIds === null) return failed('incomplete', ['부모와 조부모의 연결이 없습니다.']);
    let requiredType: AptitudeKey | null = null;
    let requiredGreatStars = 0;
    if (constraints.preserveParentFactorTargets !== false && parent.redFactor !== null) {
      requiredType = parent.redFactor.type;
      const costume = costumes.get(parent.costumeId ?? '');
      if (!costume) {
        incomplete = true;
        preliminaryReasons.push(`${parentKey === 'parentA' ? '부모 A' : '부모 B'}의 인자 목표 적성을 계산하려면 캐릭터를 선택하세요.`);
      } else {
        const required = requiredStars(costume.aptitudes[requiredType], 'A');
        if (required === null) preliminaryReasons.push(`${parentKey === 'parentA' ? '부모 A' : '부모 B'}의 ${APTITUDE_LABELS[requiredType]} 적성은 공개 초기 보정 상한으로 A에 도달할 수 없습니다.`);
        else {
          const directStars = parent.parentIds.reduce((sum, grandId) => {
            const factor = plan.nodes[grandId]!.redFactor;
            return sum + (factor?.type === requiredType ? factor.stars : 0);
          }, 0);
          requiredGreatStars = Math.max(0, required - directStars);
        }
      }
    }
    parentGroups.push({ parentId: parent.nodeId, grandIds: parent.parentIds, requiredType, requiredGreatStars });
  }
  if (preliminaryReasons.length) return failed(incomplete ? 'incomplete' : 'infeasible', preliminaryReasons);

  const blockRequirements = new Map<string, Partial<Record<AptitudeKey, number>>>();
  for (const group of parentGroups) for (const grandId of group.grandIds) {
    const grand = plan.nodes[grandId]!;
    const goal = constraints.grandparentGoals[grandId] ?? { targetFactorType: grand.redFactor?.type ?? null, rotationRequirements: {}, geneType: null };
    const requirements: Partial<Record<AptitudeKey, number>> = {};
    const grades: Partial<Record<AptitudeKey, AptitudeGrade>> = { ...(goal?.rotationRequirements ?? {}) };
    if (goal?.targetFactorType) grades[goal.targetFactorType] = 'A';
    const costume = costumes.get(grand.costumeId ?? '');
    if (Object.keys(grades).length && !costume) {
      incomplete = true;
      preliminaryReasons.push(`${labels.get(grandId)}의 목표 적성을 계산하려면 캐릭터를 선택하세요.`);
    }
    if (costume) for (const [rawType, grade] of Object.entries(grades)) {
      const type = rawType as AptitudeKey;
      const stars = requiredStars(costume.aptitudes[type], grade!);
      if (stars === null) preliminaryReasons.push(`${labels.get(grandId)}: ${APTITUDE_LABELS[type]} ${costume.aptitudes[type]} → ${grade}는 최대 4단계 초기 보정으로 충족할 수 없습니다.`);
      else if (stars > 0) requirements[type] = stars;
    }
    blockRequirements.set(grandId, requirements);
  }
  if (preliminaryReasons.length) return failed(incomplete ? 'incomplete' : 'infeasible', preliminaryReasons);

  /** Exact block search, retaining the best placement for every parent/gene state. */
  function blockCandidates(grandId: string, parentType: AptitudeKey | null, parentNeedsStars: boolean): BlockCandidate[] {
    const grand = plan.nodes[grandId]!;
    const direct = grand.parentIds!;
    const branches = direct.map((id) => [id, ...plan.nodes[id]!.parentIds!]);
    const nodeIds = branches.flat();
    const fixedIds = nodeIds.filter((id) => protectedIds.has(id));
    const freeIds = nodeIds.filter((id) => !protectedIds.has(id));
    const requirements = blockRequirements.get(grandId)!;
    const geneType = constraints.grandparentGoals[grandId]?.geneType ?? null;
    const fixedStars: Partial<Record<AptitudeKey, number>> = {};
    for (const id of fixedIds) {
      const factor = plan.nodes[id]!.redFactor;
      if (factor) fixedStars[factor.type] = (fixedStars[factor.type] ?? 0) + factor.stars;
    }

    function candidateFor(factors: Map<string, RedFactor | null>): BlockCandidate {
      const geneTotal = geneType ? nodeIds.reduce((sum, id) => sum + (factors.get(id)?.type === geneType ? factors.get(id)!.stars : 0), 0) : 0;
      const geneLevel = geneType === null ? 0 : geneTotal >= 12 ? 12 : geneTotal >= 6 ? 6 : 0;
      const parentContribution = parentType === null ? 0 : direct.reduce((sum, id) => sum + (factors.get(id)?.type === parentType ? factors.get(id)!.stars : 0), 0);
      const totalStars = nodeIds.reduce((sum, id) => sum + (factors.get(id)?.stars ?? 0), 0);
      // All same-type stars in one side are reusable together; this is not probability.
      const concentration = APTITUDE_KEYS.reduce((score, type) => score + Math.max(...branches.map((branch) => branch.reduce((sum, id) => sum + (factors.get(id)?.type === type ? factors.get(id)!.stars : 0), 0))), 0);
      const changedNodes = nodeIds.filter((id) => !sameFactor(plan.nodes[id]!.redFactor, factors.get(id) ?? null)).length;
      const signature = nodeIds.map((id) => `${id}:${factors.get(id)?.type ?? '-'}:${factors.get(id)?.stars ?? 0}`).join('|');
      return { factors: new Map(factors), geneLevel, parentContribution, totalStars, concentration, changedNodes, signature };
    }

    if (Object.keys(requirements).length === 0 && geneType === null && !parentNeedsStars) {
      return [candidateFor(new Map(nodeIds.map((id) => [id, cloneFactor(plan.nodes[id]!.redFactor)])))];
    }

    const best = new Map<string, BlockCandidate>();
    const searchedTotals = new Set<string>();
    const tiers = geneType === null ? [0] : [12, 6];
    for (const tier of tiers) {
      const targets = { ...requirements };
      if (geneType !== null) targets[geneType] = Math.max(targets[geneType] ?? 0, tier);
      const parentMinimum = parentType === null ? 0 : Math.max(targets[parentType] ?? 0, fixedStars[parentType] ?? 0);
      // Only the two direct older nodes can aid the parent: at most six extra stars.
      const additionalMaximum = parentType !== null && parentNeedsStars ? 6 : 0;
      for (let additional = 0; additional <= additionalMaximum; additional++) {
        const exact = { ...targets };
        if (parentType !== null && parentNeedsStars) exact[parentType] = parentMinimum + additional;
        const types = APTITUDE_KEYS.filter((type) => (exact[type] ?? 0) > (fixedStars[type] ?? 0));
        const remaining = types.map((type) => Math.max(0, (exact[type] ?? 0) - (fixedStars[type] ?? 0)));
        const totalsKey = types.map((type, index) => `${type}:${remaining[index]}`).join('|');
        if (searchedTotals.has(totalsKey)) continue;
        searchedTotals.add(totalsKey);
        if (remaining.reduce((sum, count) => sum + Math.ceil(count / 3), 0) > freeIds.length) continue;
        const assigned = new Map<string, RedFactor | null>(fixedIds.map((id) => [id, cloneFactor(plan.nodes[id]!.redFactor)]));

        function visit(position: number): void {
          tick();
          const slotsLeft = freeIds.length - position;
          if (remaining.reduce((sum, count) => sum + Math.ceil(count / 3), 0) > slotsLeft) return;
          if (position === freeIds.length) {
            if (remaining.some((count) => count !== 0)) return;
            const candidate = candidateFor(assigned);
            if (geneType !== null && candidate.geneLevel === 0) return;
            const stateKey = `${candidate.geneLevel}:${candidate.parentContribution}`;
            const previous = best.get(stateKey);
            if (!previous || compareBlock(candidate, previous) < 0) best.set(stateKey, candidate);
            return;
          }
          const id = freeIds[position]!;
          assigned.set(id, null);
          visit(position + 1);
          types.forEach((type, index) => {
            for (let stars = 1; stars <= Math.min(3, remaining[index]!); stars++) {
              remaining[index]! -= stars;
              assigned.set(id, { type, stars: stars as 1 | 2 | 3 });
              visit(position + 1);
              remaining[index]! += stars;
            }
          });
          assigned.delete(id);
        }
        visit(0);
      }
    }
    return [...best.values()];
  }

  try {
    const selected: BlockCandidate[] = [];
    for (const group of parentGroups) {
      const left = blockCandidates(group.grandIds[0], group.requiredType, group.requiredGreatStars > 0);
      const right = blockCandidates(group.grandIds[1], group.requiredType, group.requiredGreatStars > 0);
      if (left.length === 0 || right.length === 0) {
        const affected = group.grandIds.filter((_, index) => (index === 0 ? left : right).length === 0).map(id => labels.get(id)).join('·');
        return failed('infeasible', [`${affected}: 고정 혈통과 남은 1～3성 계획 슬롯으로 목표 생성 적성을 충족할 수 없습니다. 해당 가지의 고정과 인자 목표를 확인하세요.`, ...(before.genes.length ? ['선택한 유전자 최소 6성 조건도 함께 적용했습니다.'] : [])]);
      }
      let best: SelectedPair | null = null;
      for (const first of left) for (const second of right) {
        tick();
        if (first.parentContribution + second.parentContribution < group.requiredGreatStars) continue;
        const pair: SelectedPair = {
          blocks: [first, second],
          twelveCount: Number(first.geneLevel === 12) + Number(second.geneLevel === 12),
          totalStars: first.totalStars + second.totalStars,
          concentration: first.concentration + second.concentration,
          changedNodes: first.changedNodes + second.changedNodes,
          signature: `${first.signature}/${second.signature}`,
        };
        if (!best || comparePair(pair, best) < 0) best = pair;
      }
      if (!best) return failed('infeasible', ['조부모의 필수 조건을 지키면서 부모의 목표 인자 A 적성까지 유지할 수 없습니다. 고정 인자와 목표 종류를 확인하세요.']);
      selected.push(...best.blocks);
    }
    const proposed = structuredClone(plan);
    for (const candidate of selected) for (const [id, factor] of candidate.factors) {
      if (!protectedIds.has(id)) proposed.nodes[id]!.redFactor = cloneFactor(factor);
    }
    const after = evaluateLineage(proposed, snapshot, constraints);
    if (!after.hardSatisfied || after.genes.some((gene) => gene.level < 6)) {
      return failed('infeasible', ['배분 후 세대별 적성·유전자 조건을 다시 검사했으나 모든 필수 조건을 충족하지 못했습니다.', ...after.checks.filter((check) => !check.satisfied).map((check) => check.reason)]);
    }
    const changes = Object.values(plan.nodes).flatMap((node): RedFactorChange[] => sameFactor(node.redFactor, proposed.nodes[node.nodeId]!.redFactor) ? [] : [{ nodeId: node.nodeId, before: cloneFactor(node.redFactor), after: cloneFactor(proposed.nodes[node.nodeId]!.redFactor) }]);
    const hasFallback = after.genes.some((gene) => gene.level === 6);
    return {
      status: 'feasible', plan: proposed, before, after, changes, examinedStates,
      reasons: [
        '필수 목표 적성과 고정 혈통을 모두 유지했습니다.',
        ...(after.genes.length ? [hasFallback ? '12성으로 필수 조건을 지킬 수 없는 가지는 6성 대안을 선택했습니다.' : '필수 조건 손실 없이 유전자 12성 목표를 충족했습니다.'] : []),
        '같은 충족 조건·총별수에서는 같은 종류를 한쪽 혈통에 모으는 배분을 우대했습니다. 획득 확률 증가를 뜻하지 않습니다.',
      ],
    };
  } catch (error: unknown) {
    if (error instanceof SearchLimitReached) return failed('search-limited', ['탐색 한도에 도달했습니다. 불가능하다고 판정하지 않았으며 원래 배분을 유지합니다.']);
    throw error;
  }
}
