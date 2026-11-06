import { describe, expect, it } from 'vitest';
import { applyLineageGrandparentArrangement, createLineagePlan } from '../../src/domain/lineage';
import { createLineageTreeEdges, getLineageTreeGeometry } from '../../src/ui/lineage/tree-geometry';

describe('presentation-only lineage tree geometry', () => {
  it('uses the actual visible parent graph, with six or thirty edges', () => {
    const plan = createLineagePlan();
    for (const expanded of [false, true]) {
      const geometry = getLineageTreeGeometry(plan, expanded);
      expect(geometry.nodes).toHaveLength(expanded ? 31 : 7);
      expect(geometry.edges).toHaveLength(expanded ? 30 : 6);
      const visible = new Set(geometry.nodes.map((node) => node.nodeId));
      for (const edge of geometry.edges) {
        expect(plan.nodes[edge.childId]!.parentIds).toContain(edge.parentId);
        expect(visible.has(edge.childId) && visible.has(edge.parentId)).toBe(true);
      }
    }
  });
  it('keeps every upper-seven world box unchanged when revealing the older 24', () => {
    const plan = createLineagePlan();
    const collapsed = getLineageTreeGeometry(plan, false);
    const expanded = getLineageTreeGeometry(plan, true);
    expect(expanded.nodes.filter((node) => node.depth <= 2)).toEqual(collapsed.nodes);
    expect(expanded.width).toBe(collapsed.width);
  });
  it('never edits an input node, red factor, lock or relation while switching views', () => {
    const plan = createLineagePlan();
    plan.nodes.ancestor_15!.costumeId = '100101';
    plan.nodes.ancestor_15!.redFactor = { type: 'dirt', stars: 2 };
    plan.nodes.ancestor_15!.locked = true;
    const before = JSON.stringify(plan);
    for (let index = 0; index < 12; index++) getLineageTreeGeometry(plan, index % 2 === 0);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('follows owner identities after a legal grandparent branch arrangement', () => {
    const next = applyLineageGrandparentArrangement(createLineagePlan(), ['grandB1', 'grandA1', 'grandB2', 'grandA2']);
    const geometry = getLineageTreeGeometry(next, true);
    expect(geometry.edges.filter((edge) => edge.childId === 'parentA').map((edge) => edge.parentId)).toEqual(next.nodes.parentA!.parentIds);
    expect(geometry.edges.filter((edge) => edge.childId === 'grandA1').map((edge) => edge.parentId)).toEqual(['ancestor_7', 'ancestor_8']);
  });
  it('terminates each orthogonal path at the exact card anchors', () => {
    const plan = createLineagePlan();
    const geometry = getLineageTreeGeometry(plan, true);
    const boxes = new Map(geometry.nodes.map((node) => [node.nodeId, node]));
    for (const edge of geometry.edges) {
      const child = boxes.get(edge.childId)!; const parent = boxes.get(edge.parentId)!;
      expect(edge.from).toEqual({ x: child.x + child.width / 2, y: child.y + child.height });
      expect(edge.to).toEqual({ x: parent.x + parent.width / 2, y: parent.y });
      expect(edge.path.endsWith(`V ${parent.y}`)).toBe(true);
    }
    expect(createLineageTreeEdges(plan, geometry.nodes.slice(0, 7))).toHaveLength(6);
  });
  it('keeps every generation inside the canvas without overlapping siblings', () => {
    const geometry = getLineageTreeGeometry(createLineagePlan(), true);
    for (let depth = 0; depth <= 4; depth++) {
      const row = geometry.nodes.filter((node) => node.depth === depth);
      expect(row).toHaveLength(2 ** depth);
      row.forEach((node, index) => {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThanOrEqual(geometry.width);
        expect(node.y + node.height).toBeLessThanOrEqual(geometry.height);
        if (index) expect(node.x).toBeGreaterThan(row[index - 1]!.x + row[index - 1]!.width);
      });
    }
  });
  it('keeps adjacent grandparent fan-outs visually separate', () => {
    const geometry = getLineageTreeGeometry(createLineagePlan(), true);
    const edgeA = geometry.edges.find((edge) => edge.childId === 'grandA1')!;
    const edgeB = geometry.edges.find((edge) => edge.childId === 'grandA2')!;
    const edgeC = geometry.edges.find((edge) => edge.childId === 'grandB1')!;
    const edgeD = geometry.edges.find((edge) => edge.childId === 'grandB2')!;
    expect(edgeA.points[1]!.y).toBeLessThan(edgeB.points[1]!.y);
    expect(edgeD.points[1]!.y).toBeLessThan(edgeC.points[1]!.y);
    expect(edgeA.points[1]!.y).not.toBe(edgeB.points[1]!.y);
  });
});
