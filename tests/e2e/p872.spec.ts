import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createEmptyPedigree, SLOT_KEYS } from '../../src/domain/pedigree';
import { createLineagePlan } from '../../src/domain/lineage';
import type { SavedPlan } from '../../src/domain/saved-plan';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { createDefaultWorkspace, createSavedPlan, reconcileWorkspaceLineage } from '../../src/engine/plan-persistence';
import { skillName } from './name-search-data';
import { auditTextContrast } from './p872-contrast';

function sample() {
  const p3 = validateP3Snapshot(JSON.parse(readFileSync('data/local/p3-skill-support.json','utf8')));
  const pedigree = createEmptyPedigree(); ['100901','101401','100601','102601','101001','100401','100301'].forEach((id,i) => { pedigree[SLOT_KEYS[i]!].costumeId = id; });
  pedigree.parentA.redFactor = { type:'long', stars:2 };
  const plan = createLineagePlan(pedigree); plan.nodes.parentB!.locked = true;
  const inputs = reconcileWorkspaceLineage(createDefaultWorkspace(p3,'2026-11-06'), plan);
  inputs.referenceFilters.includeUnknown = true;
  inputs.globalPriorities = [{ skillId:'201601', priority:'required' }, { skillId:'201322', priority:'preferred' }];
  return createSavedPlan(inputs, { name:'P8.7.2 사용자 기록 검증', appVersion:'test', snapshotIds:{ reference:null,p3:null,p5:null } }, { now:'2026-11-06T02:00:00Z' });
}
async function importPlan(page: Page, plan: SavedPlan) {
  await page.getByRole('button',{name:'저장·복원·비교',exact:true}).click();
  await expect(page.getByTestId('p8-import-json')).toBeEnabled({timeout:30000});
  await page.getByTestId('p8-import-json').setInputFiles({name:'p872-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});
  if (await page.getByTestId('p8-import-clone').isVisible()) await page.getByTestId('p8-import-clone').click();
  await page.getByTestId('p8-apply-restore').click(); await page.getByRole('button',{name:'계보 화면으로',exact:true}).click();
}
async function exportPlan(page: Page, file: string): Promise<SavedPlan> {
  await page.getByRole('button',{name:'저장·복원·비교',exact:true}).click();
  await expect(page.getByTestId('p8-export-json')).toBeEnabled({timeout:30000});
  const pending = page.waitForEvent('download'); await page.getByTestId('p8-export-json').click(); await (await pending).saveAs(file);
  return JSON.parse(await readFile(file,'utf8'));
}

test('P8.7.2 다크 갤러리·직접 인자·수동 모브 계획의 저장 복원을 검수한다',async({page},info)=>{
  test.setTimeout(120000); const out='.preview/p872'; await mkdir(out,{recursive:true});
  const original=sample(); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00+09:00')); await page.emulateMedia({colorScheme:'dark'}); await page.goto('/'); await importPlan(page,original);
  await expect(page.getByTestId('ref-total')).toHaveText('159');
  await page.getByTestId('p86-edit-target').click(); const gallery=page.getByRole('dialog').last();
  await expect(gallery).toBeVisible(); await expect(page.getByTestId('p86-node-editor')).toHaveCount(0);
  await gallery.locator('img').evaluateAll(async images=>{for(const node of images){const img=node as HTMLImageElement; const r=img.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)await img.decode();}});
  const galleryContrast=await auditTextContrast(gallery);
  await gallery.getByTestId('costume-detail-100901').click(); const detailContrast=await auditTextContrast(gallery);
  await gallery.getByRole('button',{name:'상세 닫기',exact:true}).click(); await gallery.screenshot({path:`${out}/${info.project.name}-dark-gallery.png`});
  await page.keyboard.press('Escape');
  await page.getByTestId('p87-factor-parentA').selectOption('turf');
  await expect(page.getByTestId('p87-factor-parentA').locator('option:checked')).toHaveText('잔디 ★★');
  await page.getByTestId('p87-factor-grandA1').selectOption('sprint');
  await expect(page.getByTestId('p87-factor-grandA1').locator('option:checked')).toHaveText('단거리 ★★★');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByTestId('p86-node-editor')).toHaveCount(0);
  await page.getByTestId('ref-slot-grandA1').screenshot({path:`${out}/${info.project.name}-inline-factor.png`});
  await page.getByLabel('계보 노드 선택',{exact:true}).selectOption('parentA');
  const records=page.getByTestId('p86-node-editor'); await expect(records).toBeVisible();
  expect(await records.evaluate(element=>element.tagName)).toBe('SECTION'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await records.getByLabel('부모 A 인자 별수',{exact:true}).selectOption('1');
  await records.getByRole('button',{name:'편집 닫기',exact:true}).click();
  await page.getByTestId('p87-factor-parentA').selectOption('medium');
  await expect(page.getByTestId('p87-factor-parentA').locator('option:checked')).toHaveText('중거리 ★');
  const treeContrast=await auditTextContrast(page.getByTestId('p86-unified-tree'));
  await page.getByRole('button',{name:'라이트 테마로 전환',exact:true}).click();
  await expect(page.getByTestId('p87-factor-grandA1')).toHaveValue('sprint');
  await page.getByRole('button',{name:'다크 테마로 전환',exact:true}).click();
  await page.getByTestId('p86-toggle-lineage').click();
  await page.getByTestId('p87-factor-ancestor_15').selectOption('turf');
  await expect(page.getByTestId('p87-factor-ancestor_15').locator('option:checked')).toHaveText('잔디 ★★★');
  await page.getByTestId('p87-factor-ancestor_15').selectOption('');
  const deep=page.locator('[data-depth="3"] select,[data-depth="4"] select');
  expect(await deep.evaluateAll(items=>items.every(item=>(item as HTMLSelectElement).value===''))).toBe(true);
  await page.getByTestId('p87-factor-ancestor_17').selectOption('sprint');
  await page.getByTestId('p87-factor-ancestor_18').selectOption('medium');
  const manualContrast=await auditTextContrast(page.getByTestId('p86-unified-tree'));
  await expect(page.getByTestId('p86-lineage-settings')).toHaveCount(0);
  const saved=await exportPlan(page,`${out}/${info.project.name}-manual-v1.json`);
  expect(saved.inputs.factorInstances).toEqual(original.inputs.factorInstances);
  expect(saved.inputs.globalPriorities).toEqual(original.inputs.globalPriorities);
  for(const [id,node] of Object.entries(original.inputs.referencePlan.nodes)) expect(saved.inputs.referencePlan.nodes[id]!.parentIds).toEqual(node.parentIds);
  const changes=Object.entries(saved.inputs.referencePlan.nodes).filter(([id,node])=>id.startsWith('ancestor')&&node.redFactor);
  expect(changes).toHaveLength(2); expect(changes.map(([,n])=>n.redFactor!.stars)).toEqual([3,3]);
  expect(changes.every(([,n])=>n.costumeId===null)).toBe(true); expect(saved.inputs.referencePlan.nodes.parentB).toEqual(original.inputs.referencePlan.nodes.parentB);
  await importPlan(page,saved); await page.getByTestId('p86-toggle-lineage').click();
  await expect(page.getByTestId('p87-factor-ancestor_17')).toHaveValue('sprint');
  await expect(page.getByTestId('p87-factor-ancestor_18')).toHaveValue('medium');
  await writeFile(`${out}/${info.project.name}-checks.json`,JSON.stringify({galleryContrast,detailContrast,treeContrast,manualContrast,changes:changes.map(([id,n])=>({nodeId:id,factor:n.redFactor,owner:n.costumeId})),errors},null,2));
  expect(errors).toEqual([]); for(const check of [galleryContrast,detailContrast,treeContrast,manualContrast])expect(check.failures).toEqual([]);
});

test('P8.7.2 기존 자동 다섯 목록을 정리하고 개인 편집·실제 목표를 보존한다',async({page},info)=>{
  test.setTimeout(90000); const out='.preview/p872'; await mkdir(out,{recursive:true});
  await page.emulateMedia({colorScheme:'dark'}); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00+09:00')); await page.goto('/'); await importPlan(page,sample());
  await page.getByRole('button',{name:'스킬·서포트 분석',exact:true}).click(); const panel=page.getByTestId('p6-priority-settings').first();
  await expect(panel.getByTestId('p872-quick-empty')).toBeVisible({timeout:30000}); await expect(panel.getByTestId('p6-priority-count')).toHaveText('2 / 10');
  await page.evaluate(()=>{localStorage.setItem('uma-user-quick-skills-v1',JSON.stringify({version:1,skillIds:['201601','200452','201262','201332','200432']}));window.dispatchEvent(new Event('uma-quick-skills-changed'));});
  await expect(panel.locator('[data-testid^="p6-quick-"]')).toHaveCount(0);
  await expect(panel.getByTestId('p6-priority-count')).toHaveText('2 / 10');
  await expect(panel.getByTestId('p6-selected-201601')).toBeVisible();
  const skillsContrast=await auditTextContrast(page.locator('#skills-main'));
  await page.getByRole('button',{name:'서포트 1 선택',exact:true}).click();
  const cards=page.getByRole('dialog').last(); const supportContrast=await auditTextContrast(cards);
  await cards.locator('.p86-support-info').first().click(); const supportDetailContrast=await auditTextContrast(cards);
  await writeFile(`${out}/${info.project.name}-skills-contrast.json`,JSON.stringify({skillsContrast,supportContrast,supportDetailContrast},null,2));
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('uma-user-quick-skills-v1')!).version)).toBe(2);
  await panel.screenshot({path:`${out}/${info.project.name}-empty-quick.png`});
  await page.goto('/?view=skills'); await page.reload(); await expect(panel.getByTestId('p872-quick-empty')).toBeVisible({timeout:30000});
  for(const id of ['200012','200452']){await panel.getByRole('searchbox').fill(skillName(id));await panel.getByTestId(`p87-quick-add-${id}`).click();}
  await panel.getByTestId('p87-quick-manager').locator('summary').click();
  await panel.getByLabel('포지션 센스 빠른 선택 위로',{exact:true}).click();
  await panel.getByLabel('시계(우) 방향○ 빠른 선택 삭제',{exact:true}).click();
  await page.reload(); await expect(panel.getByTestId('p6-quick-200452')).toBeVisible({timeout:30000});
  await expect(panel.getByTestId('p6-quick-201601')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('uma-user-quick-skills-v1')!).skillIds)).toEqual(['200452']);
  for(const check of [skillsContrast,supportContrast,supportDetailContrast]) expect(check.failures).toEqual([]);
});
