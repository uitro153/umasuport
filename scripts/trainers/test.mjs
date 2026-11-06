import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,auditTrainers,mapSkills} from './core.mjs';
import {mergeVerified} from './merge.mjs';
import {getEligibleQuantEvidence} from './quant.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const db=read('data/raw/third-party/trainers/db.json'),p3=read('data/local/p3-skill-support.json'),p1=read('data/local/p1-reference.json');
const map=read('data/normalized/trainers/id-map.json'),metadata=read('data/raw/third-party/trainers/manifest.json');
test('uploaded bytes, pinned upstream bytes and structural baseline agree',()=>{
 assert.equal(hash(fs.readFileSync(path.join(root,'data/raw/third-party/trainers/db.json'))),metadata.sha256);
 assert.equal(metadata.uploadedFileMatchesPinnedRepository,true);
 const a=auditTrainers(db);assert.deepEqual(a.issues,[]);assert.equal(a.counts.costumes,272);assert.equal(a.counts.supports,405);assert.equal(a.counts.skills,1852);assert.equal(a.counts.people,172);
});
test('local numeric IDs remain a separate namespace',()=>{
 const row=map.find(r=>r.entity==='skill'&&r.localId==='134');assert.equal(row.originalId,'200012');assert.equal(row.status,'one-to-one');
 for(const entity of ['skill','support','costume']){const ids=map.filter(r=>r.entity===entity&&r.status==='one-to-one').map(r=>r.originalId);assert.equal(ids.length,new Set(ids).size);}
});
test('Japanese name alone cannot certify a skill identity',()=>{
 const source={umamusume:[],skills:[{id:134,name:{ja:'テスト',ko:''},tags:[]}],cards:[]};
 const existing={skills:[{skillId:'134',nameJa:'テスト',nameKo:null,rarity:1,raw:{rarity:1},relations:[]}],skillRelations:[]};
 const result=mapSkills(source,existing,[],[]);assert.notEqual(result[0].status,'one-to-one');
});
test('merge is idempotent and preserves release, raw effects and costs',()=>{
 const again=mergeVerified(db,p3,p1,map,metadata);
 assert.deepEqual(again.p3,p3);assert.deepEqual(again.p1,p1);assert.equal(again.newRoutes.length,0);assert.equal(again.newEvents.length,0);assert.equal(again.labelChanges.length,0);
 assert.equal(hash(p3.applications),read('data/normalized/trainers/merge-audit.json').preservedKrApplicationsSha256);
 assert.equal(hash(p3.skills.map(s=>({id:s.skillId,raw:s.raw,groups:s.conditionGroups,cost:s.cost}))),read('data/normalized/trainers/merge-audit.json').preservedEffectAndCostSha256);
});
test('common event evidence never certifies a KR skill route',()=>{
 const events=new Map(p3.supportEvents.map(e=>[e.eventId,e]));
 for(const route of p3.supportSkills.filter(r=>r.sourceIds?.includes('trainers-2026-10-30'))){assert.equal(route.server,'source_unspecified');assert.notEqual(events.get(route.eventId)?.raw?.bucket,'common');}
});
test('quantitative source activation rate is distinct from effective rate and never ranks unreviewed rows',()=>{
 const q=read('data/normalized/quantitative/utools-10906-2026-11-05.json');
 assert.equal(q.records.length,1993);assert.equal(q.definitions.sourceRateIndices.activationRate,4);
 for(const row of q.records){assert.equal(row.effectiveRate,null);assert.equal(getEligibleQuantEvidence(row,q.contexts.find(c=>c.contextId===row.contextId),true).eligible,false);}
 assert.equal(q.simulator.versionDate,'2025-07-08');assert.equal(q.simulator.currentKrPatchVerified,false);
});

