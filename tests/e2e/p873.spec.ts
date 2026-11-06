import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createEmptyPedigree, SLOT_KEYS } from '../../src/domain/pedigree';
import { createLineagePlan } from '../../src/domain/lineage';
import { validateSavedPlan, type SavedPlan } from '../../src/domain/saved-plan';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { createDefaultWorkspace, createSavedPlan, reconcileWorkspaceLineage } from '../../src/engine/plan-persistence';

function sevenOnly() {
  const p3 = validateP3Snapshot(JSON.parse(readFileSync('data/local/p3-skill-support.json','utf8')));
  const pedigree = createEmptyPedigree();
  ['100901','101401','100601','102601','101001','100401','100301'].forEach((id,i)=>{pedigree[SLOT_KEYS[i]!].costumeId=id;});
  const inputs = reconcileWorkspaceLineage(createDefaultWorkspace(p3,'2026-11-06'),createLineagePlan(pedigree));
  inputs.referenceFilters.includeUnknown=true;
  return createSavedPlan(inputs,{name:'P8.7.3 수동 계보',appVersion:'test',snapshotIds:{reference:null,p3:null,p5:null}},{now:'2026-11-06T02:00:00Z'});
}
async function restore(page:Page,saved:SavedPlan) {
  await page.getByRole('button',{name:'저장·복원·비교',exact:true}).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({timeout:30000});
  await page.getByTestId('p8-import-json').setInputFiles({name:'p873-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  if(await page.getByTestId('p8-import-clone').isVisible())await page.getByTestId('p8-import-clone').click();
  await page.getByTestId('p8-apply-restore').click();
  await page.getByRole('button',{name:'계보 화면으로',exact:true}).click();
}
async function exported(page:Page,path:string) {
  const expanded=await page.getByTestId('p86-toggle-lineage').getAttribute('aria-expanded')==='true';
  await page.getByRole('button',{name:'저장·복원·비교',exact:true}).click();
  await expect(page.getByTestId('p8-export-json')).toBeEnabled({timeout:30000});
  const next=page.waitForEvent('download'); await page.getByTestId('p8-export-json').click();await(await next).saveAs(path);
  const saved=validateSavedPlan(JSON.parse(await readFile(path,'utf8')));
  await page.getByRole('button',{name:'계보 화면으로',exact:true}).click();
  if(expanded)await page.getByTestId('p86-toggle-lineage').click();return saved;
}

test('P8.7.3 같은 너비의 수동 모브 계보·직접 편집·전환 보존과 7인 배치를 확인한다',async({page},info)=>{
  test.setTimeout(90000);await mkdir('.preview/p873',{recursive:true});
  const source=sevenOnly();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00+09:00'));await page.emulateMedia({colorScheme:'dark'});await page.goto('/');await restore(page,source);
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  const width=await page.locator('#main').evaluate(el=>el.getBoundingClientRect().width);
  await page.getByTestId('p86-edit-parentA').click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  const toggle=page.getByTestId('p86-toggle-lineage');await toggle.click();
  await expect(page.getByRole('heading',{name:'31인 계보 — 수동 적인자 설계',exact:true})).toBeVisible();
  expect(await page.locator('#main').evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByTestId('p873-mob')).toHaveCount(24);
  await expect(page.locator('[data-depth="3"] img,[data-depth="4"] img,[data-testid^="p86-edit-ancestor"]')).toHaveCount(0);
  await expect(page.getByTestId('p86-lineage-settings')).toHaveCount(0);
  await expect(page.getByText('31인 적인자 배분안 만들기',{exact:true})).toHaveCount(0);
  expect(await page.getByTestId('p86-tree-viewport').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.getByLabel('계보 노드 선택',{exact:true}).selectOption('ancestor_7');
  await expect(page.getByTestId('p86-node-editor')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('p87-factor-ancestor_7').selectOption('medium');
  await expect(page.getByTestId('p87-factor-ancestor_7').locator('option:checked')).toHaveText('중거리 ★★★');
  await page.getByLabel('증조 1 혈통 고정',{exact:true}).click();await expect(page.getByTestId('p87-factor-ancestor_7')).toBeDisabled();
  await page.getByLabel('증조 1 혈통 고정 해제',{exact:true}).click();
  await page.getByLabel('계보 노드 선택',{exact:true}).selectOption('ancestor_30');await page.getByTestId('p87-factor-ancestor_30').selectOption('turf');
  await page.getByLabel('계보 확대',{exact:true}).selectOption('1.5');await expect(page.getByTestId('p86-tree-world')).toHaveAttribute('data-zoom','1.5');
  await page.getByLabel('계보 확대',{exact:true}).selectOption('1');
  await toggle.click();await expect(page.getByTestId('p873-mob')).toHaveCount(0);await toggle.click();
  await expect(page.getByTestId('p87-factor-ancestor_7')).toHaveValue('medium');await expect(page.getByTestId('p87-factor-ancestor_30')).toHaveValue('turf');
  const manual=await exported(page,`.preview/p873/${info.project.name}-manual-v1.json`);
  expect(manual.inputs.factorInstances).toEqual(source.inputs.factorInstances);
  for(const [id,node]of Object.entries(source.inputs.referencePlan.nodes)){expect(manual.inputs.referencePlan.nodes[id]!.parentIds).toEqual(node.parentIds);expect(manual.inputs.referencePlan.nodes[id]!.costumeId).toBe(node.costumeId);}
  await expect(page.getByTestId('p86-arrange-preview')).toBeEnabled();await page.getByTestId('p86-arrange-preview').click();
  const count=await page.getByTestId('ref-arrangement').count();expect(count).toBeGreaterThan(0);expect(count).toBeLessThanOrEqual(6);
  await page.getByTestId('p86-cancel-arrangement').click();await page.getByTestId('p86-arrange-preview').click();
  await page.getByTestId('ref-arrangement').first().getByRole('button').click();await expect(page.getByText('추천 계보를 적용했습니다.',{exact:true})).toBeVisible();
  await restore(page,manual);await toggle.click();await expect(page.getByTestId('p87-factor-ancestor_7')).toHaveValue('medium');
  await page.getByLabel('계보 노드 선택',{exact:true}).selectOption('ancestor_7');
  await page.getByTestId('p86-unified-tree').screenshot({path:`.preview/p873/${info.project.name}-manual-tree.png`});
  expect(errors).toEqual([]);
  await writeFile(`.preview/p873/${info.project.name}-checks.json`,JSON.stringify({pageWidth:width,mobs:24,arrangements:count,errors},null,2));
});

test('P8.7.3 과거 31인 V1의 캐릭터·UUID·실제 별수를 보존하고 PNG는 모브로 출력한다',async({page},info)=>{
  test.setTimeout(90000);await mkdir('.preview/p873',{recursive:true});
  const saved=validateSavedPlan(JSON.parse(await readFile('data/local/p8-persistence/31-node-example.json','utf8')));
  saved.inputs.referenceFilters.includeUnknown=true;for(const node of Object.values(saved.inputs.referencePlan.nodes))node.locked=false;
  saved.inputs.referencePlan.nodes.ancestor_7!.redFactor={type:'mile',stars:1};saved.inputs.referencePlan.nodes.ancestor_8!.redFactor={type:'long',stars:2};
  await page.clock.setFixedTime(new Date(Math.max(Date.parse('2026-11-06T12:00:00+09:00'),Date.parse(saved.updatedAt))+60000));await page.goto('/');await restore(page,saved);
  await page.getByTestId('p86-toggle-lineage').click();await expect(page.getByTestId('p873-mob')).toHaveCount(24);
  await expect(page.locator('[data-depth="3"] img,[data-depth="4"] img')).toHaveCount(0);
  const unchanged=await exported(page,`.preview/p873/${info.project.name}-legacy-v1.json`);expect(unchanged.inputs).toEqual(saved.inputs);
  await page.getByTestId('p87-factor-ancestor_7').selectOption('medium');await expect(page.getByTestId('p87-factor-ancestor_7').locator('option:checked')).toHaveText('중거리 ★');
  await page.getByTestId('p87-factor-ancestor_8').selectOption('turf');await expect(page.getByTestId('p87-factor-ancestor_8').locator('option:checked')).toHaveText('잔디 ★★');
  const download=page.waitForEvent('download');await page.getByTestId('p8-export-lineage-31').click();
  await(await download).saveAs(`.preview/p873/${info.project.name}-lineage-31.png`);
  const edited=await exported(page,`.preview/p873/${info.project.name}-legacy-edited-v1.json`);
  expect(edited.inputs.factorInstances).toEqual(saved.inputs.factorInstances);expect(edited.inputs.whiteFactors).toEqual(saved.inputs.whiteFactors);
  for(const [id,node]of Object.entries(saved.inputs.referencePlan.nodes)){expect(edited.inputs.referencePlan.nodes[id]!.costumeId).toBe(node.costumeId);expect(edited.inputs.referencePlan.nodes[id]!.parentIds).toEqual(node.parentIds);}
});
