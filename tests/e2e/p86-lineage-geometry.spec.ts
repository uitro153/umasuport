import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedPlan } from '../../src/domain/saved-plan';

test('동일 계보의 7·31인 연결선은 네 화면폭과 세 확대율에서 실제 카드 앵커에 일치한다', async ({ page }, info) => {
  test.setTimeout(180000);
  const artifacts = join(process.cwd(), '.preview/p87-artifacts/regression-p86');
  await mkdir(artifacts, { recursive: true });
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
  await page.goto('/');
  await expect(page.getByTestId('p86-unified-tree')).toBeVisible({ timeout: 30000 });
  // Restore an existing V1 sample through the user-facing importer. These are
  // real canonical costume IDs with deliberate user-authored factor records.
  const plan = JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json', 'utf8')) as SavedPlan;
  plan.inputs.referenceFilters.includeUnknown = true;
  await page.getByRole('button', { name: '저장·복원·비교', exact: true }).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('p8-import-json').setInputFiles({ name: 'existing-31-node-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan), 'utf8') });
  await expect(page.getByTestId('p8-apply-restore')).toBeEnabled();
  await page.getByTestId('p8-apply-restore').click();
  await page.getByRole('button', { name: '계보 화면으로', exact: true }).click();
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  const outcomes = [];
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    for (const zoom of ['0.8', '1', '1.5']) {
      await page.getByLabel('계보 확대', { exact: true }).selectOption(zoom);
      for (const expanded of [false, true]) {
        const toggle = page.getByTestId('p86-toggle-lineage');
        if ((await toggle.getAttribute('aria-expanded')) !== String(expanded)) await toggle.click();
        await expect(page.locator('[data-tree-node]')).toHaveCount(expanded ? 31 : 7);
        await expect(page.locator('.p86-tree-lines path')).toHaveCount(expanded ? 30 : 6);
        const measure = () => page.evaluate(() => {
          const world = document.querySelector<HTMLElement>('[data-testid="p86-tree-world"]')!;
          const svg = world.querySelector('svg')!;
          const matrix = svg.getScreenCTM()!;
          return [...svg.querySelectorAll('path')].map((edge) => {
            const child = world.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(edge.dataset.childId!)}"]`)!.getBoundingClientRect();
            const parent = world.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(edge.dataset.parentId!)}"]`)!.getBoundingClientRect();
            const from = svg.createSVGPoint(); from.x = Number(edge.dataset.fromX); from.y = Number(edge.dataset.fromY);
            const to = svg.createSVGPoint(); to.x = Number(edge.dataset.toX); to.y = Number(edge.dataset.toY);
            const actualFrom = from.matrixTransform(matrix); const actualTo = to.matrixTransform(matrix);
            const expectedFrom = { x: child.left + child.width / 2, y: child.bottom };
            const expectedTo = { x: parent.left + parent.width / 2, y: parent.top };
            return { childId: edge.dataset.childId!, parentId: edge.dataset.parentId!,
              actualFrom: { x: actualFrom.x, y: actualFrom.y }, actualTo: { x: actualTo.x, y: actualTo.y }, expectedFrom, expectedTo,
              maxError: Math.max(Math.abs(actualFrom.x - expectedFrom.x), Math.abs(actualFrom.y - expectedFrom.y), Math.abs(actualTo.x - expectedTo.x), Math.abs(actualTo.y - expectedTo.y)) };
          });
        });
        await expect.poll(async () => Math.max(...(await measure()).map((edge) => edge.maxError))).toBeLessThanOrEqual(1);
        const edges = await measure();
        outcomes.push({ width, height: width === 375 ? 812 : 1000, zoom: Number(zoom), expanded, maxError: Math.max(...edges.map((edge) => edge.maxError)), edges });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const text = await page.getByTestId('p86-unified-tree').innerText();
        expect(text).not.toMatch(/costumeId|nodeId|factorInstanceId|128×128|300×400|unentered|partial/);
        await page.getByTestId('p86-unified-tree').screenshot({ path: join(artifacts, `${info.project.name}-lineage-${width}-${expanded ? 31 : 7}-${Number(zoom) * 100}pct.png`) });
      }
    }
  }
  await writeFile(join(artifacts, `${info.project.name}-connector-measurements.json`), JSON.stringify({ scope: 'DOM card anchors versus SVG transformed endpoints in actual CSS pixels', tolerance: 1, outcomes }, null, 2) + '\n');
});
