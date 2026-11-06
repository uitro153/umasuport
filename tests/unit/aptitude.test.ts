import { describe, expect, it } from 'vitest';
import {
  ANCESTOR_SLOT_KEYS,
  createEmptyPedigree,
  type AptitudeKey,
  type Pedigree,
  type P1Rules,
  type Snapshot,
} from '../../src/domain';
import { pedigreeRules, pedigreeSnapshot } from '../../src/data/pedigree-data';
import { pinSnapshot } from '../../src/data/snapshot';
import { APTITUDE_LABELS, calculateAptitudes } from '../../src/engine/aptitude';

function selectedPedigree(): Pedigree {
  const pedigree = createEmptyPedigree();
  pedigree.target.costumeId = 'costume_demo_a_default';
  for (const slotKey of ANCESTOR_SLOT_KEYS) pedigree[slotKey].costumeId = 'costume_demo_b_default';
  return pedigree;
}

function distributeStars(pedigree: Pedigree, total: number, type: AptitudeKey = 'dirt'): void {
  let remaining = total;
  for (const slotKey of ANCESTOR_SLOT_KEYS) {
    const stars = Math.min(remaining, 3);
    pedigree[slotKey].redFactor = stars > 0 ? { type, stars: stars as 1 | 2 | 3 } : null;
    remaining -= stars;
  }
}

describe('P1 fixture의 빨간 인자 적성 변화', () => {
  it('대상 미선택은 적성을 임의로 생성하지 않는다', () => {
    expect(calculateAptitudes(createEmptyPedigree(), pedigreeSnapshot, pedigreeRules))
      .toEqual({ status: 'empty', changes: [], issues: [] });
  });

  it.each([
    [0, 'G', 0], [1, 'F', 1], [3, 'F', 1], [4, 'E', 2],
    [6, 'E', 2], [7, 'D', 3], [9, 'D', 3], [10, 'C', 4],
    [12, 'C', 4], [13, 'B', 5], [15, 'B', 5], [16, 'A', 6], [18, 'A', 6],
  ] as const)('가상 규칙의 더트 %i성을 %s로 반영한다', (stars, grade, steps) => {
    const pedigree = selectedPedigree();
    distributeStars(pedigree, stars);
    const result = calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules);
    expect(result.status).toBe('ready');
    expect(result.changes.find((change) => change.type === 'dirt')).toMatchObject({
      base: 'G', result: grade, totalStars: stars, gradeSteps: steps,
    });
  });

  it('부모와 조부모의 여섯 인자만 합산하고 인자 종류를 구분한다', () => {
    const pedigree = selectedPedigree();
    pedigree.parentA.redFactor = { type: 'dirt', stars: 3 };
    pedigree.grandB2.redFactor = { type: 'dirt', stars: 1 };
    pedigree.parentB.redFactor = { type: 'sprint', stars: 2 };
    const result = calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules);
    expect(result.changes.find((change) => change.type === 'dirt')).toEqual({
      type: 'dirt', base: 'G', result: 'E', totalStars: 4, gradeSteps: 2,
      contributors: [{ slotKey: 'parentA', stars: 3 }, { slotKey: 'grandB2', stars: 1 }],
    });
    expect(result.changes.find((change) => change.type === 'sprint')).toMatchObject({
      base: 'E', result: 'D', totalStars: 2, gradeSteps: 1,
    });
    expect(result.changes.find((change) => change.type === 'long')).toMatchObject({
      base: 'C', result: 'C', totalStars: 0, gradeSteps: 0,
    });
  });

  it('대상 자신의 빨간 인자는 현재 대상의 초기 적성에 반영하지 않는다', () => {
    const pedigree = selectedPedigree();
    pedigree.target.redFactor = { type: 'dirt', stars: 3 };
    expect(calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules).changes
      .find((change) => change.type === 'dirt')).toMatchObject({ result: 'G', totalStars: 0, contributors: [] });
  });

  it('빈 조상 슬롯에 남아 있는 인자는 계산에서 제외하고 부분 미리보기로 표시한다', () => {
    const pedigree = selectedPedigree();
    pedigree.parentA.costumeId = null;
    pedigree.parentA.redFactor = { type: 'dirt', stars: 3 };
    pedigree.grandA1.redFactor = { type: 'dirt', stars: 1 };
    const result = calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules);
    expect(result.status).toBe('partial');
    expect(result.changes.find((change) => change.type === 'dirt')).toMatchObject({
      result: 'F', totalStars: 1, contributors: [{ slotKey: 'grandA1', stars: 1 }],
    });
  });

  it('초기 상승은 A에서 멈추고 표시는 실제 상승한 등급 수를 사용한다', () => {
    const pedigree = selectedPedigree();
    distributeStars(pedigree, 18, 'mile');
    expect(calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules).changes
      .find((change) => change.type === 'mile')).toMatchObject({ base: 'B', result: 'A', totalStars: 18, gradeSteps: 1 });
  });

  it('기존 S 적성은 초기 상한 A 때문에 낮아지지 않는다', () => {
    const rawSnapshot = structuredClone(pedigreeSnapshot) as Snapshot;
    rawSnapshot.costumes.find((costume) => costume.costumeId === 'costume_demo_a_default')!.aptitudes.dirt = 'S';
    const snapshot = pinSnapshot(rawSnapshot);
    const pedigree = selectedPedigree();
    distributeStars(pedigree, 18);
    expect(calculateAptitudes(pedigree, snapshot, pedigreeRules).changes
      .find((change) => change.type === 'dirt')).toMatchObject({ base: 'S', result: 'S', gradeSteps: 0 });
  });

  it('의상별 초기 적성 차이를 같은 인물의 대표 적성으로 덮어쓰지 않는다', () => {
    const pedigree = selectedPedigree();
    pedigree.target.costumeId = 'costume_demo_a_alternate';
    const result = calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules);
    expect(result.changes.find((change) => change.type === 'dirt')?.base).toBe('F');
    expect(result.changes.find((change) => change.type === 'mile')?.base).toBe('A');
  });

  it.each(['target', 'parentA', 'grandB2'] as const)('미존재 의상을 %s에 넣으면 계산하지 않는다', (slotKey) => {
    const pedigree = selectedPedigree();
    pedigree[slotKey].costumeId = 'missing_costume';
    const result = calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules);
    expect(result.status).toBe('invalid');
    expect(result.changes).toEqual([]);
    expect(result.issues[0]).toContain(slotKey);
  });

  it.each([0, 4, -1, 1.5])('유효한 1~3성 범위 밖의 %s성을 거부한다', (stars) => {
    const pedigree = selectedPedigree();
    pedigree.parentA.redFactor = { type: 'dirt', stars } as Pedigree['parentA']['redFactor'];
    expect(calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules).status).toBe('invalid');
  });

  it('정의되지 않은 인자 종류를 조용히 무시하지 않는다', () => {
    const pedigree = selectedPedigree();
    pedigree.parentA.redFactor = { type: 'speed', stars: 3 } as unknown as Pedigree['parentA']['redFactor'];
    expect(calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules).status).toBe('invalid');
  });

  it('다른 스냅샷의 규칙을 같은 계산에 섞지 않는다', () => {
    const rules = { ...structuredClone(pedigreeRules), snapshotId: 'another_snapshot' };
    const result = calculateAptitudes(selectedPedigree(), pedigreeSnapshot, rules);
    expect(result.status).toBe('invalid');
    expect(result.changes).toEqual([]);
  });

  it('오름차순이 아닌 별수 규칙은 임의로 해석하지 않는다', () => {
    const rules = structuredClone(pedigreeRules) as P1Rules;
    rules.aptitude.starSteps.reverse();
    expect(calculateAptitudes(selectedPedigree(), pedigreeSnapshot, rules).status).toBe('invalid');
  });

  it('교체한 규칙의 임계값을 사용하며 fixture 수치를 엔진에 고정하지 않는다', () => {
    const rules = structuredClone(pedigreeRules) as P1Rules;
    rules.ruleId = 'fixture_changed_threshold';
    rules.aptitude.starSteps.find((step) => step.minStars === 4)!.minStars = 5;
    const pedigree = selectedPedigree();
    distributeStars(pedigree, 4);
    expect(calculateAptitudes(pedigree, pedigreeSnapshot, rules).changes
      .find((change) => change.type === 'dirt')).toMatchObject({ result: 'F', totalStars: 4, gradeSteps: 1 });
  });

  it('계산은 계보·스냅샷·규칙을 변경하지 않는다', () => {
    const pedigree = selectedPedigree();
    distributeStars(pedigree, 10);
    const before = JSON.stringify([pedigree, pedigreeSnapshot, pedigreeRules]);
    calculateAptitudes(pedigree, pedigreeSnapshot, pedigreeRules);
    expect(JSON.stringify([pedigree, pedigreeSnapshot, pedigreeRules])).toBe(before);
  });

  it('화면용 적성 이름과 결과의 10개 적성 항목이 일치한다', () => {
    const result = calculateAptitudes(selectedPedigree(), pedigreeSnapshot, pedigreeRules);
    expect(result.changes.map((change) => change.type)).toEqual(Object.keys(APTITUDE_LABELS));
    expect(APTITUDE_LABELS.late).toBe('선입');
  });
});
