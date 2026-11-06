import type { DeepReadonly } from '../data/snapshot';
import type { ReferenceSnapshot } from '../domain/reference';
import type { AptitudeGrade } from '../domain/primitives';
import { APTITUDE_KEYS, type AptitudeKey } from '../domain/pedigree';
import { getInheritedNodeIds, getLineageSlotMap, getLineageSlots, lineageConstraintsSchema, lineagePlanSchema, type GrandparentGoal, type LineageConstraints, type LineagePlan } from '../domain/lineage';
import { APTITUDE_LABELS } from './aptitude';
import { applyReferenceRedStars } from './reference-aptitude';
import { findLineageCharacterIssues } from './lineage-validity';

const grades: readonly AptitudeGrade[] = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];

/** Minimum total stars among the actual six parent/grandparent factors. */
export function requiredStars(base: AptitudeGrade, target: AptitudeGrade): number | null {
  if (!grades.includes(base) || !grades.includes(target)) return null;
  for (let stars = 0; stars <= 18; stars++) {
    if (grades.indexOf(applyReferenceRedStars(base, stars)) >= grades.indexOf(target)) return stars;
  }
  return null;
}

export interface LineageAptitudeChange {
  type: AptitudeKey;
  base: AptitudeGrade;
  result: AptitudeGrade;
  totalStars: number;
  gradeSteps: number;
  contributors: { nodeId: string; stars: 1 | 2 | 3 }[];
}

export interface LineageNodeEvaluation {
  nodeId: string;
  depth: number;
  costumeId: string | null;
  changes: LineageAptitudeChange[];
  issues: string[];
  /** Factors are plans for a future owner, rather than a claimed completed factor. */
  plannedContributorIds: string[];
}

export interface LineageConstraintCheck {
  nodeId: string;
  type: AptitudeKey;
  targetGrade: AptitudeGrade;
  actualGrade: AptitudeGrade | null;
  requiredStars: number | null;
  currentStars: number;
  satisfied: boolean;
  reason: string;
  kind: 'factor-target' | 'rotation' | 'parent-factor-target';
}

export interface LineageGeneCheck {
  nodeId: string;
  type: AptitudeKey;
  totalStars: number;
  level: 0 | 6 | 12;
  contributorIds: string[];
  /** Largest same-type star sum on either three-node great-grandparent branch. */
  concentration: number;
  validation: 'planning-thresholds-kr-pending';
}

export interface LineageEvaluation {
  status: 'valid' | 'incomplete' | 'invalid';
  nodeEvaluations: Record<string, LineageNodeEvaluation>;
  checks: LineageConstraintCheck[];
  genes: LineageGeneCheck[];
  hardSatisfied: boolean;
  issues: string[];
}

const emptyEvaluation = (issues: string[]): LineageEvaluation => ({ status: 'invalid', nodeEvaluations: {}, checks: [], genes: [], hardSatisfied: false, issues });

/**
 * Evaluate the actual two-generation window of each of the seven young nodes.
 * No depth-four factor can directly affect a depth-one parent's initial aptitude.
 * A factor on an unspecified older owner is an explicit future plan, never a
 * claim that a completed/owned factor or its generation probability is known.
 */
export function evaluateLineage(
  inputPlan: DeepReadonly<LineagePlan>,
  snapshot: DeepReadonly<ReferenceSnapshot>,
  inputConstraints: DeepReadonly<LineageConstraints> = { grandparentGoals: {} },
): LineageEvaluation {
  const parsedPlan = lineagePlanSchema.safeParse(inputPlan);
  if (!parsedPlan.success) return emptyEvaluation(parsedPlan.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  const parsedConstraints = lineageConstraintsSchema.safeParse(inputConstraints);
  if (!parsedConstraints.success) return emptyEvaluation(parsedConstraints.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  const plan = parsedPlan.data;
  const characterIssues = findLineageCharacterIssues(plan, snapshot);
  if (characterIssues.length) return emptyEvaluation(characterIssues.map(issue => issue.message));
  const constraints = parsedConstraints.data;
  const slots = getLineageSlots(plan);
  const positions = getLineageSlotMap(plan);
  const costumes = new Map(snapshot.costumes.map((row) => [row.costumeId, row]));
  const issues: string[] = [];
  for (const slot of slots.filter(row => row.depth <= 2)) {
    const id = plan.nodes[slot.nodeId]!.costumeId;
    if (id !== null && !costumes.has(id)) issues.push(`${slot.label}: 의상 데이터를 찾을 수 없습니다 (${id}).`);
  }
  const grandparents = slots.filter((slot) => slot.depth === 2);
  for (const id of Object.keys(constraints.grandparentGoals)) {
    if (!grandparents.some((slot) => slot.nodeId === id)) issues.push('조부모 목표가 현재 계보의 조부모 인자 소유자와 일치하지 않습니다.');
  }
  if (issues.length > 0) return emptyEvaluation(issues);

  const nodeEvaluations: Record<string, LineageNodeEvaluation> = {};
  for (const slot of slots.filter((row) => row.depth <= 2)) {
    const node = plan.nodes[slot.nodeId]!;
    const costume = node.costumeId === null ? undefined : costumes.get(node.costumeId);
    const inheritedIds = getInheritedNodeIds(plan, slot.nodeId);
    const plannedContributorIds = inheritedIds.filter((id) => plan.nodes[id]!.redFactor !== null
      && (slots.find(row => row.nodeId === id)!.depth > 2 || plan.nodes[id]!.costumeId === null));
    const changes = costume ? APTITUDE_KEYS.map((type): LineageAptitudeChange => {
      const contributors = inheritedIds.flatMap((id) => {
        const factor = plan.nodes[id]!.redFactor;
        return factor?.type === type ? [{ nodeId: id, stars: factor.stars }] : [];
      });
      const totalStars = contributors.reduce((sum, row) => sum + row.stars, 0);
      const base = costume.aptitudes[type];
      const result = applyReferenceRedStars(base, totalStars);
      return { type, base, result, totalStars, gradeSteps: grades.indexOf(result) - grades.indexOf(base), contributors };
    }) : [];
    nodeEvaluations[node.nodeId] = { nodeId: node.nodeId, depth: slot.depth, costumeId: node.costumeId, changes,
      issues: costume ? [] : [`${slot.label}의 캐릭터를 선택하세요.`], plannedContributorIds };
  }

  const checks: LineageConstraintCheck[] = [];
  const addCheck = (nodeId: string, type: AptitudeKey, targetGrade: AptitudeGrade, kind: LineageConstraintCheck['kind']) => {
    const evaluation = nodeEvaluations[nodeId]!;
    const change = evaluation.changes.find((row) => row.type === type);
    const minimum = change ? requiredStars(change.base, targetGrade) : null;
    const satisfied = change !== undefined && grades.indexOf(change.result) >= grades.indexOf(targetGrade);
    const label = slots.find((slot) => slot.nodeId === nodeId)!.label;
    const purpose = kind === 'rotation' ? '로테이션' : '목표 인자 생성';
    checks.push({ nodeId, type, targetGrade, actualGrade: change?.result ?? null, requiredStars: minimum,
      currentStars: change?.totalStars ?? 0, satisfied, kind,
      reason: satisfied ? `${label} ${APTITUDE_LABELS[type]} ${targetGrade} 조건 충족` : !change ? `${label}의 캐릭터를 선택하세요.`
        : minimum === null ? `${label} ${APTITUDE_LABELS[type]} ${change.base}→${targetGrade}: 공개 초기 보정 상한으로 도달할 수 없습니다.`
          : `${label} ${purpose}: ${APTITUDE_LABELS[type]} ${change.result}→${targetGrade} 필요 (같은 종류 최소 ${minimum}성).` });
  };

  const genes: LineageGeneCheck[] = [];
  for (const slot of grandparents) {
    const node = plan.nodes[slot.nodeId]!;
    const goal: GrandparentGoal = constraints.grandparentGoals[node.nodeId] ?? { targetFactorType: node.redFactor?.type ?? null, rotationRequirements: {}, geneType: null };
    if (goal.targetFactorType) addCheck(node.nodeId, goal.targetFactorType, 'A', 'factor-target');
    for (const type of APTITUDE_KEYS) {
      const grade = goal.rotationRequirements[type];
      if (grade) addCheck(node.nodeId, type, grade, 'rotation');
    }
    if (goal.geneType) {
      const type = goal.geneType;
      const inheritedIds = getInheritedNodeIds(plan, node.nodeId);
      const contributorIds = inheritedIds.filter((id) => plan.nodes[id]!.redFactor?.type === type);
      const totalStars = contributorIds.reduce((sum, id) => sum + plan.nodes[id]!.redFactor!.stars, 0);
      const branchTotals = node.parentIds!.map((id) => [id, ...(plan.nodes[id]!.parentIds ?? [])].reduce((sum, member) => sum + (plan.nodes[member]!.redFactor?.type === type ? plan.nodes[member]!.redFactor!.stars : 0), 0));
      genes.push({ nodeId: node.nodeId, type, totalStars, level: totalStars >= 12 ? 12 : totalStars >= 6 ? 6 : 0,
        contributorIds, concentration: Math.max(...branchTotals), validation: 'planning-thresholds-kr-pending' });
    }
  }
  if (constraints.preserveParentFactorTargets !== false) {
    for (const key of ['parentA', 'parentB'] as const) {
      const node = plan.nodes[positions[key]]!;
      if (node.redFactor) addCheck(node.nodeId, node.redFactor.type, 'A', 'parent-factor-target');
    }
  }
  const incomplete = Object.values(nodeEvaluations).some((row) => row.costumeId === null);
  return { status: incomplete ? 'incomplete' : 'valid', nodeEvaluations, checks, genes,
    hardSatisfied: checks.every((check) => check.satisfied), issues: [] };
}
