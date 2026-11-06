import { expect, it } from 'vitest';
import { matchesNameQuery } from '../../src/ui/name-search';
it('indexes character/card/skill names and normalizes spaces without admitting internal IDs', () => {
  expect(matchesNameQuery('메지로라모누', ['메지로 라모누 [겨울을 녹이는]'], ['30175'])).toBe(true);
  expect(matchesNameQuery(' Fine Motion ', ['Fine Motion'], ['30010'])).toBe(true);
  expect(matchesNameQuery('30175', ['메지로 라모누'], ['30175'])).toBe(false);
  expect(matchesNameQuery('３００１０', ['Fine Motion', '30010'], ['30010'])).toBe(false);
});
it('allows legitimate numbers in outfit names rather than rejecting all numeric input', () => {
  expect(matchesNameQuery('1989', ['MB-19890425'], ['102601'])).toBe(true);
  expect(matchesNameQuery('102601', ['MB-19890425'], ['102601'])).toBe(false);
});
