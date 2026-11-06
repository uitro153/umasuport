import { describe, expect, it } from 'vitest';
import input from '../golden/p3-real-import-input.json';
import { importSkillSupport } from '../../src/data/import-skill-support';
import { validateP3Snapshot } from '../../src/domain/skill-support';

const options = { sourceManifestSha256: 'a'.repeat(64), generatedAt: '2026-11-05T00:00:00Z', tournaments: [] };
function imported() { return importSkillSupport(input, options); }

describe('실제 공개 DB 추출의 P3 변환 계약', () => {
  it('실제 ID·Pt·조건·효과·돌파 연결을 손실 없이 보존한다', () => {
    const snapshot = imported();
    expect(snapshot.skills).toHaveLength(input.skills.length);
    expect(snapshot.supportSkills).toHaveLength(input.supportSkills.length);
    expect(snapshot.skillRevisions).toHaveLength(input.skillRevisions.length);
    expect(snapshot.supportLimitBreakEffects).toHaveLength(input.supportLimitBreakEffects.length);
    const clockwise = snapshot.skills.find((row) => row.skillId === '200012')!;
    expect(clockwise.nameKo).toBe('시계(우) 방향○');
    expect(clockwise.cost).toBe(90);
    expect(clockwise.conditionGroups[0]?.condition).toBe('rotation==1');
    expect(clockwise.conditionGroups[0]?.effects[0]).toMatchObject({ type: 1, value: 400000 });
    expect(snapshot.skills.find((row) => row.skillId === '100011')?.cost).toBeNull();
  });

  it('현재 variant와 과거 명시 그룹/양수 rank를 모두 확인해 금→◎→○를 연결한다', () => {
    const lower = imported().skillRelations.filter((row) => row.relation === 'lower_skill');
    expect(lower).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: '200014', relatedSkillId: '200011' }),
      expect.objectContaining({ skillId: '200011', relatedSkillId: '200012' }),
      expect.objectContaining({ skillId: '200331', relatedSkillId: '200332' }),
    ]));
    expect(lower.every((row) => row.evidence.includes('kr-pending'))).toBe(true);
    expect(lower.some((row) => ['200013', '200333'].includes(row.relatedSkillId))).toBe(false);
  });

  it('variant만 남거나 과거 순위 근거가 없으면 하위 관계를 만들지 않는다', () => {
    const snapshot = importSkillSupport({ ...input, rawMasterSkills: [] }, options);
    expect(snapshot.skillRelations.filter((row) => row.relation === 'lower_skill')).toEqual([]);
    expect(snapshot.skillRelations.filter((row) => row.relation === 'variant')).not.toHaveLength(0);
  });

  it('KR locale 효과와 JP 효과의 출처·검증 상태를 분리한다', () => {
    const revisions = imported().skillRevisions.filter((row) => row.skillId === '100011');
    expect(revisions.find((row) => row.server === 'KR')?.status).toBe('locale_overlay_unverified_against_kr_master');
    expect(revisions.find((row) => row.server === 'JP')?.conditionGroups).not.toEqual(revisions.find((row) => row.server === 'KR')?.conditionGroups);
  });

  it('일반 힌트·이벤트·원본 그룹을 별도 행으로 보존하며 확률로 바꾸지 않는다', () => {
    const links = imported().supportSkills;
    expect(links.some((row) => row.acquisition === 'hint')).toBe(true);
    expect(links.some((row) => row.acquisition === 'event')).toBe(true);
    expect(links.some((row) => row.server === 'KR')).toBe(true);
    expect(links.some((row) => row.server === 'JP')).toBe(true);
    expect(links.every((row) => row.sourceGroup === null || Number.isInteger(row.sourceGroup))).toBe(true);
  });

  it('한국 서포트 2차 출시일을 스킬 또는 공식 날짜로 전파하지 않는다', () => {
    const snapshot = imported();
    const card = snapshot.applications.find((row) => row.entityType === 'support' && row.entityId === '30028');
    expect(card?.kr).toMatchObject({ confirmedDate: null, observedDate: '2022-07-25', evidence: 'secondary_page' });
    expect(snapshot.applications.filter((row) => row.entityType === 'skill').every((row) => row.kr.observedDate === null && row.kr.confirmedDate === null)).toBe(true);
    expect(snapshot.applications.find((row) => row.entityType === 'support' && row.entityId === '30010')?.kr).toMatchObject({ confirmedDate: null, observedDate: null, forecastDate: null });
  });

  it('원본 입력은 변경하지 않고 큐레이션 내용으로 snapshot identity를 구분한다', () => {
    const original = JSON.stringify(input);
    const snapshot = imported();
    expect(JSON.stringify(input)).toBe(original);
    expect(imported().snapshotId).toBe(snapshot.snapshotId);
    expect(importSkillSupport(input, { ...options, generatedAt: '2026-11-06T00:00:00Z' }).snapshotId).toBe(snapshot.snapshotId);
    const altered = structuredClone(input); altered.skills[0]!.cost = 123;
    expect(importSkillSupport(altered, options).snapshotId).not.toBe(snapshot.snapshotId);
  });

  it('불명 ID·중복·잘못된 날짜·2차 자료 공식 승격을 거부한다', () => {
    const snapshot = imported();
    expect(() => validateP3Snapshot({ ...snapshot, skills: [...snapshot.skills, snapshot.skills[0]] })).toThrow('Duplicate');
    const badLink = structuredClone(snapshot); badLink.supportSkills[0]!.skillId = 'nonexistent';
    expect(() => validateP3Snapshot(badLink)).toThrow('Unknown support skill target');
    const fakeOfficial = structuredClone(snapshot); fakeOfficial.applications[0]!.kr.confirmedDate = '2026-11-01';
    fakeOfficial.applications[0]!.kr.evidence = 'secondary_page';
    expect(() => validateP3Snapshot(fakeOfficial)).toThrow();
    const badDate = structuredClone(snapshot); badDate.generatedAt = '2026-02-30T00:00:00Z';
    expect(() => validateP3Snapshot(badDate)).toThrow();
  });
});
