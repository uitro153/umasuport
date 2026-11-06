import { test, expect, type Page } from '@playwright/test';
import { makeReferenceEngineFixture } from '../unit/reference-engine-fixture';
import { focusMob, restoreLineage } from './p9-lineage';
import { createLineagePlan } from '../../src/domain/lineage';
import { createDefaultWorkspace, createSavedPlan, reconcileWorkspaceLineage } from '../../src/engine/plan-persistence';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { readFileSync } from 'node:fs';

async function selectSeven(page:Page,availableTop=false) {
  const {snapshot}=makeReferenceEngineFixture();
  if(availableTop)for(const row of snapshot.applications.slice(0,7))Object.assign(row.kr,{releasedBy:'2026-11-01',evidence:'observed_release',sourceUrl:'https://example.invalid/observation'});
  await page.route('**/__local/p1-reference',route=>route.fulfill({json:snapshot}));
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00+09:00'));await page.goto('/');
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시',{exact:true}).check();
  for(const [index,id]of ['target','parentA','parentB','grandA1','grandA2','grandB1','grandB2'].entries()){
    await page.getByTestId(`p86-edit-${id}`).click();await page.getByTestId(`ref-candidate-costume_${'abcdefg'[index]}`).click();
  }
  await expect(page.getByTestId('ref-total')).toHaveText('25');return snapshot;
}

test('31인 수동 모브 계획과 고정은 7인 재배치·접기 후에도 소유 노드를 따른다',async({page})=>{
  await selectSeven(page);await expect(page.locator('[data-tree-node]')).toHaveCount(7);
  const width=await page.locator('#main').evaluate(el=>el.getBoundingClientRect().width);
  let mob=await focusMob(page,'ancestor_15');
  await expect(page.getByTestId('p873-mob')).toHaveCount(24);
  await expect(page.locator('[data-depth="3"]')).toHaveCount(8);await expect(page.locator('[data-depth="4"]')).toHaveCount(16);
  expect(await page.locator('#main').evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
  await mob.getByTestId('p87-factor-ancestor_15').selectOption('dirt');
  await expect(mob.getByTestId('p87-factor-ancestor_15').locator('option:checked')).toHaveText('더트 ★★★');
  await mob.getByRole('button',{name:/혈통 고정$/}).click();await expect(mob.getByTestId('p87-factor-ancestor_15')).toBeDisabled();
  await page.getByTestId('p86-arrange-preview').click();await expect(page.getByTestId('ref-arrangement')).toHaveCount(6);
  await page.getByRole('button',{name:'참고 배치 6 적용',exact:true}).click();
  mob=await focusMob(page,'ancestor_15');await expect(mob.getByTestId('p87-factor-ancestor_15')).toHaveValue('dirt');
  await expect(mob.getByRole('button',{name:/혈통 고정 해제$/})).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('p86-toggle-lineage').click();await expect(page.locator('[data-tree-node]')).toHaveCount(7);
  mob=await focusMob(page,'ancestor_15');await expect(mob.getByTestId('p87-factor-ancestor_15')).toHaveValue('dirt');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('7인 배치 미리보기는 원본을 보존하고 수동 인자 변경 시 오래된 적용을 차단한다',async({page})=>{
  await selectSeven(page);
  const before=await page.locator('[data-tree-node]').evaluateAll(items=>items.map(el=>el.textContent));
  await page.getByTestId('p86-arrange-preview').click();await expect(page.getByTestId('ref-arrangement')).toHaveCount(6);
  await page.getByTestId('p86-cancel-arrangement').click();
  expect(await page.locator('[data-tree-node]').evaluateAll(items=>items.map(el=>el.textContent))).toEqual(before);
  await page.getByTestId('p86-arrange-preview').click();await page.getByTestId('p87-factor-grandA1').selectOption('long');
  await expect(page.getByTestId('ref-arrangement')).toHaveCount(0);await expect(page.getByTestId('p86-arrangement-stale')).toBeVisible();
  await page.getByTestId('p86-arrange-preview').click();await page.getByTestId('p86-arrange-preview').click();
  await page.getByRole('button',{name:'참고 배치 1 적용',exact:true}).click();await expect(page.getByTestId('ref-total')).toHaveText('25');
  await focusMob(page,'ancestor_7');await expect(page.getByTestId('p87-factor-ancestor_7')).toHaveValue('');
  await expect(page.getByTestId('p86-lineage-settings')).toHaveCount(0);
});

test('7인 인자 보정과 직접 중복 제한을 지키고 모브 계획을 자동 배분하지 않는다',async({page})=>{
  await selectSeven(page);await page.getByTestId('p87-factor-grandA1').selectOption('end');
  await expect(page.getByTestId('ref-aptitude-end').locator('b')).toHaveText('C');
  await page.getByTestId('p86-edit-parentA').click();
  const dialog=page.getByRole('dialog').last();await expect(dialog.getByTestId('ref-candidate-costume_a')).toBeDisabled();
  await expect(dialog.getByTestId('ref-candidate-costume_a')).toContainText('직접 부모');await page.keyboard.press('Escape');
  const mob=await focusMob(page,'ancestor_7');await mob.getByTestId('p87-factor-ancestor_7').selectOption('dirt');
  await expect(mob.getByTestId('p87-factor-ancestor_7').locator('option:checked')).toHaveText('더트 ★★★');
  await expect(page.getByTestId('ref-aptitude-dirt').locator('b')).toHaveText('G');
  await page.getByTestId('p87-factor-grandA1').selectOption('dirt');await expect(page.getByTestId('ref-aptitude-dirt').locator('b')).toHaveText('F');
  await expect(page.getByTestId('p87-factor-ancestor_8')).toHaveValue('');
  await expect(page.getByRole('button',{name:'31인 적인자 배분안 만들기',exact:true})).toHaveCount(0);
});

test('과거 모브 캐릭터의 출시 정보는 7인 계산에 쓰지 않고 상위 출시 필터는 유지한다',async({page})=>{
  await selectSeven(page,true);
  const {pedigree}=makeReferenceEngineFixture();const plan=createLineagePlan(pedigree);
  plan.nodes.ancestor_15!.costumeId='costume_h';plan.nodes.ancestor_15!.redFactor={type:'mile',stars:2};
  const p3=validateP3Snapshot(JSON.parse(readFileSync('data/local/p3-skill-support.json','utf8')));
  const inputs=reconcileWorkspaceLineage(createDefaultWorkspace(p3,'2026-11-06'),plan);inputs.referenceFilters.includeUnknown=true;
  const saved=createSavedPlan(inputs,{name:'옛 모브 기록',appVersion:'e2e',snapshotIds:{reference:null,p3:null,p5:null}},{now:'2026-11-06T02:00:00Z'});
  await restoreLineage(page,saved);const mob=await focusMob(page,'ancestor_15');
  await expect(mob).toContainText('모브');await expect(mob.getByTestId('p87-factor-ancestor_15').locator('option:checked')).toHaveText('마일 ★★');
  await page.getByLabel('한국 출시 미확인도 선택 목록에 표시',{exact:true}).uncheck();
  await expect(page.getByTestId('ref-total')).toHaveText('25');await expect(page.getByTestId('p86-arrange-preview')).toBeEnabled();
  await page.getByLabel('비교 기준일 · Asia/Seoul',{exact:true}).fill('2026-10-31');await expect(page.getByTestId('p86-arrange-preview')).toBeDisabled();
  await expect(page.getByTestId('ref-total')).toHaveText('—');
  await page.getByLabel('비교 기준일 · Asia/Seoul',{exact:true}).fill('2026-11-06');await expect(page.getByTestId('ref-total')).toHaveText('25');
  await expect(mob.getByTestId('p87-factor-ancestor_15').locator('option:checked')).toHaveText('마일 ★★');
});
