import { describe, expect, it } from 'vitest';
import rawFixture from '../../data/fixtures/p0.snapshot.json';
import { pinSnapshot } from '../../src/data/snapshot';

describe('계산용 스냅샷 고정', () => {
  it('외부 원본이 바뀌어도 계산 도중 데이터가 섞이지 않는다', () => {
    const input = structuredClone(rawFixture);
    const pinned = pinSnapshot(input);
    const originalName = pinned.characters[0]!.nameKo;
    input.characters[0]!.nameKo = '다른 데이터 버전';
    expect(pinned.characters[0]!.nameKo).toBe(originalName);
    expect(pinned).not.toBe(input);
  });

  it('고정된 스냅샷의 중첩 엔터티도 변경할 수 없다', () => {
    const pinned = pinSnapshot(rawFixture);
    expect(() => {
      // @ts-expect-error Deliberately attempt mutation: both TypeScript and runtime must reject it.
      pinned.characters[0]!.nameKo = '오염된 데이터';
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error Readonly collections cannot be changed, even through nested references.
      pinned.releases.pop();
    }).toThrow(TypeError);
  });

  it('구조를 통과하지 못한 데이터는 계산용으로 고정하지 않는다', () => {
    expect(() => pinSnapshot({ ...rawFixture, schemaVersion: 999 })).toThrow();
  });
});
