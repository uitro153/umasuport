import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { makeReferenceEngineFixture } from '../unit/reference-engine-fixture';
// Test-only ID -> real display-name lookup. Browser inputs receive names;
// canonical selectors remain internal evidence for the exact chosen entity.
const p3 = JSON.parse(readFileSync('data/local/p3-skill-support.json', 'utf8')) as { skills: { skillId: string; nameKo: string | null; nameJa: string; displayName: string }[]; supports: { supportId: string; displayName: string }[] };
const p1 = JSON.parse(readFileSync('data/local/p1-reference.json', 'utf8')) as { costumes: { costumeId: string; displayName: string }[] };
const fixture = makeReferenceEngineFixture().snapshot;
export function skillName(id: string, data: { skills: readonly { skillId: string; nameKo: string | null; nameJa: string; displayName: string }[] } = p3): string {
  const row = data.skills.find(item => item.skillId === id); if (!row) throw new Error(`Missing test skill ${id}`);
  return row.nameKo || row.nameJa || row.displayName;
}
export function supportName(id: string, data: { supports: readonly { supportId: string; displayName: string }[] } = p3): string {
  const row = data.supports.find(item => item.supportId === id); if (!row) throw new Error(`Missing test support ${id}`);
  return row.displayName;
}
export function costumeName(id: string): string {
  const fake = fixture.costumes.find(item => item.costumeId === id); if (fake) return fake.nameJa;
  const row = p1.costumes.find(item => item.costumeId === id); if (!row) throw new Error(`Missing test costume ${id}`);
  return row.displayName;
}

/** User flow for a new browser with no preinstalled quick choices. */
export async function chooseSkillGoal(scope: Page | Locator, id: string): Promise<void> {
  await scope.getByLabel('우선순위 스킬명 검색', { exact: true }).fill(skillName(id));
  await scope.getByTestId(`p6-skill-${id}`).click();
}
