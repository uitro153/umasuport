import type { LineagePlan } from '../../domain/lineage';
import type { LineageSkillState } from '../../domain/lineage-skills';
import type { SkillEvaluationRequest } from '../../engine/skill-evaluation';
import type { UserSkillPriority } from '../../engine/skill-priorities';
import type { DeepReadonly } from '../../data/snapshot';
import type { ReferenceSnapshot } from '../../domain/reference';

/** Session-only bridge; game snapshots and the P2 plan remain separate. */
export interface LineageSkillsIntegration {
  plan: LineagePlan;
  reference?: DeepReadonly<ReferenceSnapshot> | null;
  whiteFactors: LineageSkillState;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onWhiteFactorsChange: (state: LineageSkillState) => void;
  globalPriorities: UserSkillPriority[];
  onGlobalPrioritiesChange: (priorities: UserSkillPriority[]) => void;
  runToken: number;
  runNodeId: string | null;
  onAnalysisRequest: (request: SkillEvaluationRequest | null) => void;
  onEditNode: () => void;
  onRunNode: () => void;
  unconfirmedNodeIds?: string[];
}
