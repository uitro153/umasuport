import { describe, expect, it } from 'vitest';
import { parseQuickSkills, serializeQuickSkills } from '../../src/ui/skills/quick-skill-preferences';
describe('local quick-skill preferences independent of V1 plans', () => {
  it('preserves explicit empty lists and ordered unique real-ID strings', () => {
    expect(parseQuickSkills(serializeQuickSkills([]))).toEqual([]);
    expect(parseQuickSkills(serializeQuickSkills(['201601', '201322', '201601']))).toEqual(['201601', '201322']);
  });
  it.each([null, '{', '{"version":2,"skillIds":[]}', '{"version":1,"skillIds":[1]}', '{"version":1,"skillIds":["<script>"]}', JSON.stringify({ version: 1, skillIds: Array(101).fill('201601') })])('rejects malformed/unsupported preferences %s', raw => {
    expect(parseQuickSkills(raw)).toBeNull();
  });
});
