import { expect, it } from 'vitest';
import { createLineagePlan, validateLineagePlan } from '../../src/domain/lineage';

it('P8.7.3 JSON 고정 혈통의 모브 계획을 허용하되 상위 실제 소유자는 확인한다', () => {
  const input = createLineagePlan();
  input.nodes.ancestor_15!.redFactor = { type: 'mile', stars: 2 };
  expect(() => validateLineagePlan(input)).not.toThrow();
  input.nodes.parentA!.locked = true;
  expect(() => validateLineagePlan(input)).not.toThrow();
  expect(input.nodes.ancestor_15!.costumeId).toBeNull();
  input.nodes.parentA!.redFactor = { type: 'mile', stars: 2 };
  expect(() => validateLineagePlan(input)).toThrow(/고정 혈통의 인자 소유/);
});
