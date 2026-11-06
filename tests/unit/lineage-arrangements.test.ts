import { describe, expect, it } from 'vitest';
import real from '../golden/real-reference-subset.json';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { createEmptyPedigree, SLOT_KEYS } from '../../src/domain/pedigree';
import { createLineagePlan, getLineageSlotMap, setLineageLock, updateLineageNode } from '../../src/domain/lineage';
import { enumerateLineageArrangements } from '../../src/engine/lineage-arrangements';

const snapshot = validateReferenceSnapshot(real);
function samplePlan() {
  const pedigree = createEmptyPedigree();
  ['100901', '101401', '100601', '102601', '101001', '100401', '100301'].forEach((id, index) => { pedigree[SLOT_KEYS[index]!].costumeId = id; });
  return createLineagePlan(pedigree);
}

describe('31인 혈통을 유지하는 기본 상성 배치', () => {
  it('검증된 일곱 관계를 유지하면서 전체 조부 혈통을 함께 재연결한다', () => {
    let plan = samplePlan();
    plan = updateLineageNode(plan, 'ancestor_7', { costumeId: '100301', redFactor: { type: 'dirt', stars: 2 } });
    const before = structuredClone(plan);
    const arrangements = enumerateLineageArrangements(plan, snapshot);
    expect(arrangements.map((row) => row.result.previewTotal)).toEqual([164, 161, 159, 157, 155, 152]);
    for (const row of arrangements) {
      const positions = getLineageSlotMap(row.plan);
      expect(positions.target).toBe('target');
      expect(positions.parentA).toBe('parentA');
      expect(positions.parentB).toBe('parentB');
      expect(row.plan.nodes.ancestor_7).toEqual(before.nodes.ancestor_7);
      for (const key of ['grandA1', 'grandA2', 'grandB1', 'grandB2']) expect(row.plan.nodes[key]).toEqual(before.nodes[key]);
    }
    expect(plan).toEqual(before);
  });

  it('같은 의상·인자여도 서로 다른 깊은 혈통을 합쳐 버리지 않는다', () => {
    let plan = samplePlan();
    for (const key of ['grandA1', 'grandB1']) plan = updateLineageNode(plan, key, { costumeId: '100301', redFactor: { type: 'mile', stars: 3 } });
    plan = updateLineageNode(plan, 'grandB2', { costumeId: '100401' });
    plan = updateLineageNode(plan, 'ancestor_7', { redFactor: { type: 'dirt', stars: 1 } });
    plan = updateLineageNode(plan, 'ancestor_9', { redFactor: { type: 'long', stars: 2 } });
    const arrangements = enumerateLineageArrangements(plan, snapshot);
    expect(arrangements).toHaveLength(4);
    expect(new Set(arrangements.map((row) => row.plan.nodes.parentA!.parentIds!.slice().sort().join('|'))).size).toBe(4);
  });

  it('보유 부모 혈통이 고정되어 있으면 실제 연결을 바꾸는 배치를 제외한다', () => {
    const plan = setLineageLock(samplePlan(), 'parentA', true);
    const arrangements = enumerateLineageArrangements(plan, snapshot);
    expect(arrangements).toHaveLength(1);
    expect(arrangements[0]!.plan.nodes.parentA!.parentIds).toEqual(plan.nodes.parentA!.parentIds);
    expect(arrangements[0]!.result.previewTotal).toBe(159);
  });
});
