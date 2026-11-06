import type { DeepReadonly } from '../data/snapshot';
import { getLineageSlots, type LineageConstraints, type LineagePlan } from '../domain/lineage';
/** Legacy rotation/gene fields remain readable in V1, but are not allocation inputs. */
export function factorOnlyConstraints(plan: DeepReadonly<LineagePlan>): LineageConstraints {
  return { preserveParentFactorTargets: true, grandparentGoals: Object.fromEntries(getLineageSlots(plan)
    .filter(slot => slot.depth === 2).map(slot => [slot.nodeId, {
      targetFactorType: plan.nodes[slot.nodeId]!.redFactor?.type ?? null, rotationRequirements: {}, geneType: null,
    }])) };
}
