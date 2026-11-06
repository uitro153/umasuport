import type { DeepReadonly } from '../../data/snapshot';
import { getLineageSlots, type LineagePlan } from '../../domain/lineage';

export interface TreePoint { x: number; y: number }
export interface LineageTreeNodeBox {
  nodeId: string; depth: number; path: string; label: string;
  x: number; y: number; width: number; height: number;
}
export interface LineageTreeEdge {
  childId: string; parentId: string; from: TreePoint; to: TreePoint; points: TreePoint[]; path: string;
}
export interface LineageTreeGeometry {
  width: number; height: number; nodes: LineageTreeNodeBox[]; edges: LineageTreeEdge[];
}

/** Presentation geometry only. Stable world coordinates keep the same upper
 * seven in place when the older 24 nodes are revealed. No plan is modified. */
export function getLineageTreeGeometry(plan: DeepReadonly<LineagePlan>, expanded: boolean): LineageTreeGeometry {
  const slots = getLineageSlots(plan).filter((slot) => expanded || slot.depth <= 2);
  const byDepth = [0, 0, 0, 0, 0];
  const nodes = slots.map((slot): LineageTreeNodeBox => {
    const index = byDepth[slot.depth]!++;
    const centers = slot.depth === 0 ? [1280] : slot.depth === 1 ? [960, 1600] : slot.depth === 2 ? [800, 1120, 1440, 1760] : null;
    const width = slot.depth <= 2 ? 204 : slot.depth === 3 ? 180 : 136;
    const height = slot.depth === 0 ? 210 : slot.depth <= 2 ? 196 : slot.depth === 3 ? 132 : 116;
    const center = centers?.[index] ?? (slot.depth === 3 ? 160 + index * 320 : 80 + index * 160);
    return { nodeId: slot.nodeId, depth: slot.depth, path: slot.path, label: slot.label,
      x: center - width / 2, y: [36, 292, 532, 784, 974][slot.depth]!, width, height };
  });
  return { width: 2560, height: expanded ? 1130 : 756, nodes, edges: createLineageTreeEdges(plan, nodes) };
}

export function createLineageTreeEdges(plan: DeepReadonly<LineagePlan>, boxes: readonly LineageTreeNodeBox[]): LineageTreeEdge[] {
  const visible = new Map(boxes.map((box) => [box.nodeId, box]));
  return boxes.flatMap((child) => (plan.nodes[child.nodeId]?.parentIds ?? []).flatMap((parentId) => {
    const parent = visible.get(parentId);
    if (!parent) return [];
    const from = { x: child.x + child.width / 2, y: child.y + child.height };
    const to = { x: parent.x + parent.width / 2, y: parent.y };
    // The older rows fan out beyond the compact upper seven. Route the two
    // outer grandparent branches first so an adjacent branch never joins the
    // same horizontal segment or crosses another owner's descending trunk.
    const ratio = child.depth === 2 ? (child.path === 'LL' || child.path === 'RR' ? 0.32 : 0.68) : 0.5;
    const middleY = from.y + (to.y - from.y) * ratio;
    const points = [from, { x: from.x, y: middleY }, { x: to.x, y: middleY }, to];
    return [{ childId: child.nodeId, parentId, from, to, points, path: `M ${from.x} ${from.y} V ${middleY} H ${to.x} V ${to.y}` }];
  }));
}
