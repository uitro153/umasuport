import fs from 'node:fs';
import path from 'node:path';
import { auditTrainers, mapSkills, mapPeople, mapCards, norm, hash, parseUtools } from './core.mjs';
import { buildQuantEvidence } from './quant.mjs';
import { mergeVerified } from './merge.mjs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>v.startsWith('--')?[...a,[v.slice(2),all[i+1]]]:a,[]));
const project=path.resolve(args.project??process.cwd());
const input=path.resolve(args.input??path.join(project,'data/raw/third-party/trainers/db.json'));
const research=path.resolve(args.research??path.join(project,'data/raw/third-party/cross-validation-2026-11-05'));
const output=path.resolve(args.out??project);
const save=(name,data)=>{const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n');};
const bytes=fs.readFileSync(input),db=JSON.parse(bytes);
const p3=JSON.parse(fs.readFileSync(path.join(project,'data/local/p3-skill-support.json')));
const p1=JSON.parse(fs.readFileSync(path.join(project,'data/local/p1-reference.json')));
const gt=JSON.parse(fs.readFileSync(path.join(project,'data/raw/p3-2026-11-05/gt-character-cards.json')));
const audit=auditTrainers(db);
save('data/normalized/trainers/input-audit.json',{bytes:bytes.length,sha256:hash(bytes),...audit});
if(Object.values(audit.duplicates).some(a=>a.length))throw new Error('Duplicate source IDs require review');
if(audit.issues.length)throw new Error('Invalid source references or structures require review');
const quant=[];
for(const file of fs.readdirSync(research).filter(f=>/^utools-\d+-\w+\.html$/.test(f))){const parsed=parseUtools(fs.readFileSync(path.join(research,file),'utf8'));quant.push({...parsed,file});}
const skills=mapSkills(db,p3,gt,quant.flatMap(q=>q.skills)),people=mapPeople(db,p1,p3);
let cards=mapCards(db,p3,gt,skills,people);
// A costume independently identified by all aptitudes, growth and innate skills
// can corroborate a differently-spelled native name without fuzzy matching.
for(const c of cards.filter(r=>r.entity==='costume'&&r.status==='one-to-one')){
  const local=db.cards.find(r=>String(r.id)===c.localId),original=gt.find(g=>String(g.card_id)===c.originalId);
  if(local.uniqueSkillsIds?.length!==1||original.skills_unique?.length!==1)continue;
  const row=skills.find(s=>s.localId===String(local.uniqueSkillsIds[0]));
  if(row&&row.status!=='one-to-one'&&!skills.some(r=>r.status==='one-to-one'&&r.originalId===String(original.skills_unique[0]))){row.status='one-to-one';row.originalId=String(original.skills_unique[0]);row.evidence=['independently-matched-costume','single-native-skill-on-both-sides','Japanese-spelling-difference-retained'];}
}
cards=mapCards(db,p3,gt,skills,people);
for(const person of people.filter(r=>r.status!=='one-to-one'&&r.candidates.length===1))if(cards.some(r=>r.status==='one-to-one'&&String(db.cards.find(c=>String(c.id)===r.localId)?.targetID)===person.localId)){
  person.status='one-to-one';person.originalId=person.candidates[0];person.evidence=['exact-Japanese-owner','independently-identified-card-fingerprint'];
}
const mappings=[...people,...cards,...skills];save('data/normalized/trainers/id-map.json',mappings);
const conflicts=[];
for(const row of skills.filter(r=>r.status==='one-to-one')){const local=db.skills.find(s=>String(s.id)===row.localId),original=p3.skills.find(s=>s.skillId===row.originalId);
  if(original.nameKo&&local.name.ko&&norm(original.nameKo)!==norm(local.name.ko))conflicts.push({entity:'skill',localId:row.localId,originalId:row.originalId,field:'nameKo',kind:'translation-difference-not-auto-overwritten',p3:original.nameKo,trainers:local.name.ko});
  if(original.descriptionKo&&local.effect&&norm(original.descriptionKo)!==norm(local.effect))conflicts.push({entity:'skill',localId:row.localId,originalId:row.originalId,field:'effectDescription',kind:'text-difference-server-patch-review-needed',p3:original.descriptionKo,trainers:local.effect});
  if(norm(original.nameJa)!==norm(local.name.ja))conflicts.push({entity:'skill',localId:row.localId,originalId:row.originalId,field:'nameJa',kind:'spelling-difference-identity-corroborated-by-costume',p3:original.nameJa,trainers:local.name.ja});
}
save('data/normalized/trainers/conflicts.json',conflicts);
const skillMap=new Map(skills.filter(r=>r.status==='one-to-one').map(r=>[r.localId,r.originalId]));
const labels=skills.filter(r=>r.status==='one-to-one').flatMap(r=>{const s=p3.skills.find(s=>s.skillId===r.originalId),local=db.skills.find(s=>String(s.id)===r.localId);return !s.nameKo&&local.name.ko?[{skillId:r.originalId,trainersId:r.localId,nameKo:local.name.ko,sourceId:'trainers-2026-10-30',status:'cross-dataset-identity-verified-translation-not-official',evidence:r.evidence}]:[];});
save('data/curated/trainers/verified-label-additions.json',labels);
const routeComparisons=[];const hintCandidates=[],trainingCandidates=[],bonusConflicts=[];
for(const row of cards.filter(r=>r.entity==='support'&&r.status==='one-to-one')){
  const local=db.cards.find(c=>String(c.id)===row.localId);
  const matches=field=>(local[field]??[]).map(id=>({localSkillId:String(id),skillId:skillMap.get(String(id))??null}));
  for(const [field,kind]of [['hasSkillsIds','hint'],['trainingSkillsIds','event']])for(const entry of matches(field)){
    const existing=entry.skillId?p3.supportSkills.filter(r=>r.supportId===row.originalId&&r.skillId===entry.skillId&&r.acquisition===kind):[];
    const item={supportId:row.originalId,localCardId:row.localId,sourceField:field,...entry,existingServers:[...new Set(existing.map(r=>r.server))],status:entry.skillId?(existing.length?'corroborated-existing-route':'candidate-field-semantics-and-patch-review'):'unmapped-skill'};
    routeComparisons.push(item);if(!existing.length)(kind==='hint'?hintCandidates:trainingCandidates).push(item);
  }
  for(const field of ['힌트 Lv','힌트 발생률']){const r=local.bonusEffectTable?.find(b=>norm(b.name)===norm(field));if(!r)continue;const effectId=field==='힌트 Lv'?17:18;
    r.effects.forEach((value,lb)=>{if(value==='-'||value===''||value===null)return;const n=Number(String(value).replace('%',''));const p=p3.supportLimitBreakEffects.find(e=>e.supportId===row.originalId&&e.effectId===effectId&&e.limitBreak===lb);if(p&&n!==p.value)bonusConflicts.push({supportId:row.originalId,trainersId:row.localId,field,limitBreak:lb,p3:p.value,trainers:n,status:'not-overwritten'});});
  }
}
save('data/normalized/trainers/route-comparison.json',routeComparisons);save('data/normalized/trainers/bonus-conflicts.json',bonusConflicts);
const summaries={};for(const entity of ['person','costume','support','skill']){const list=mappings.filter(r=>r.entity===entity);summaries[entity]=Object.fromEntries([...new Set(list.map(r=>r.status))].map(status=>[status,list.filter(r=>r.status===status).length]));}
const summary={asOf:'2026-11-05',inputSha256:hash(bytes),inputCounts:audit.counts,mappings:summaries,labelAdditions:labels.length,translationConflicts:conflicts.filter(c=>c.field==='nameKo').length,descriptionDifferences:conflicts.filter(c=>c.field==='effectDescription').length,routeCorroborations:routeComparisons.filter(r=>r.status==='corroborated-existing-route').length,hintCandidates:hintCandidates.length,eventListCandidates:trainingCandidates.length,bonusConflicts:bonusConflicts.length,quantContexts:quant.length,quantReportedRows:quant.reduce((n,q)=>n+q.rows.length,0)};
const p3Only={skills:p3.skills.filter(s=>!skills.some(r=>r.status==='one-to-one'&&r.originalId===s.skillId)).map(s=>s.skillId),supports:p3.supports.filter(s=>!cards.some(r=>r.entity==='support'&&r.status==='one-to-one'&&r.originalId===s.supportId)).map(s=>s.supportId),costumes:gt.filter(s=>!cards.some(r=>r.entity==='costume'&&r.status==='one-to-one'&&r.originalId===String(s.card_id))).map(s=>String(s.card_id))};
save('data/normalized/trainers/p3-only.json',p3Only);
const inputMetadata={sha256:hash(bytes),bytes:bytes.length,checkedOn:'2026-11-05',repository:'https://github.com/YIRer/umamusume_trainers',sourceCommit:JSON.parse(fs.readFileSync(path.join(research,'trainers-head.json')))[0].sha,dataCommit:JSON.parse(fs.readFileSync(path.join(research,'trainers-db-commit.json')))[0].sha,dataUpdatedAt:JSON.parse(fs.readFileSync(path.join(research,'trainers-db-commit.json')))[0].commit.author.date,uploadedFileMatchesPinnedRepository:hash(bytes)===hash(fs.readFileSync(path.join(research,'trainers-db-db.json')))};
if(!inputMetadata.uploadedFileMatchesPinnedRepository)throw new Error('Input does not match the pinned upstream file; refresh provenance before merging');
save('data/raw/third-party/trainers/manifest.json',inputMetadata);fs.mkdirSync(path.join(output,'data/raw/third-party/trainers'),{recursive:true});if(input!==path.join(output,'data/raw/third-party/trainers/db.json'))fs.copyFileSync(input,path.join(output,'data/raw/third-party/trainers/db.json'));
const parsedSheet=JSON.parse(fs.readFileSync(args.sheet??path.join(research,'sheet-inspection.json')));
const quantEvidence=buildQuantEvidence(research,p3,parsedSheet);save('data/normalized/quantitative/utools-10906-2026-11-05.json',quantEvidence);
save('data/normalized/quantitative/simulator-v4.9.1-inspection.json',quantEvidence.simulator);
summary.quantMappedRows=quantEvidence.records.length;summary.quantRankEligibleRows=0;summary.simulatorVersionDate=quantEvidence.simulator.versionDate;
const merged=mergeVerified(db,p3,p1,mappings,inputMetadata);
if(args.validate==='true'){
  const {validateP3Snapshot}=await import(pathToFileURL(path.join(project,'src/domain/skill-support.ts')).href);
  const {validateReferenceSnapshot}=await import(pathToFileURL(path.join(project,'src/domain/reference.ts')).href);
  validateP3Snapshot(merged.p3);validateReferenceSnapshot(merged.p1);
}
if(output===project&&!p3.sources.some(s=>s.id==='trainers-2026-10-30')){
  const backup=path.join(project,'data/local/before-trainers-'+hash(p3.snapshotId).slice(0,12));fs.mkdirSync(backup,{recursive:true});
  for(const file of ['p3-skill-support.json','p1-reference.json','p3-integrated.sqlite'])if(!fs.existsSync(path.join(backup,file)))fs.copyFileSync(path.join(project,'data/local',file),path.join(backup,file));
}
save('data/curated/trainers/applied-labels.json',merged.labelChanges);
save('data/normalized/trainers/merge-audit.json',merged.audit);
save('data/normalized/trainers/unresolved-event-rewards.json',merged.unresolvedRewards);
summary.merge=merged.audit;
summary.skillKoreanMissingBefore=p3.skills.filter(s=>!s.nameKo).length;summary.skillKoreanMissingAfter=merged.p3.skills.filter(s=>!s.nameKo).length;
const classification=(entity,id)=>{const row=(entity==='costume'?p1: p3).applications.find(a=>a.entityType===entity&&a.entityId===id);if(!row)return 'unknown';const date=row.kr.confirmedDate??row.kr.observedDate;if(date)return date<='2026-11-05'?'KR-released-by-dated-source':'KR-scheduled-by-dated-source';if(row.kr.forecastDate)return 'forecast-not-confirmed-KR-release';return 'unknown';};
summary.matchedContentAvailability={};for(const entity of ['costume','support']){const rows=mappings.filter(r=>r.entity===entity&&r.status==='one-to-one');summary.matchedContentAvailability[entity]=rows.reduce((counts,r)=>{const k=classification(entity,r.originalId);counts[k]=(counts[k]??0)+1;return counts;},{});}
const sqlite=path.join(output,'data/local/p3-integrated.pending.sqlite');fs.mkdirSync(path.dirname(sqlite),{recursive:true});fs.copyFileSync(path.join(project,'data/local/p3-integrated.sqlite'),sqlite);
const sql=new DatabaseSync(sqlite);sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS trainers_identity_map(entity TEXT,local_id TEXT,original_id TEXT,status TEXT,json TEXT NOT NULL,PRIMARY KEY(entity,local_id)); CREATE TABLE IF NOT EXISTS trainers_conflict(id INTEGER PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quantitative_context(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quantitative_evidence(id TEXT PRIMARY KEY,context_id TEXT REFERENCES quantitative_context(id),skill_id TEXT REFERENCES p3_skill(id),json TEXT NOT NULL); BEGIN; DELETE FROM trainers_identity_map; DELETE FROM trainers_conflict; DELETE FROM quantitative_evidence; DELETE FROM quantitative_context; DELETE FROM p3_route;');
for(const r of merged.p3.skills)sql.prepare('INSERT OR REPLACE INTO p3_skill VALUES (?,?)').run(r.skillId,JSON.stringify(r));
for(const r of merged.p3.supports)sql.prepare('INSERT OR REPLACE INTO p3_support VALUES (?,?)').run(r.supportId,JSON.stringify(r));
for(const r of merged.p3.supportSkills)sql.prepare('INSERT INTO p3_route(support_id,skill_id,json) VALUES (?,?,?)').run(r.supportId,r.skillId,JSON.stringify(r));
for(const r of merged.p3.supportEvents??[])sql.prepare('INSERT OR REPLACE INTO p3_event VALUES (?,?,?)').run(r.eventId,r.supportId,JSON.stringify(r));
sql.prepare('INSERT OR REPLACE INTO p3_snapshot VALUES (?,?)').run(merged.p3.snapshotId,JSON.stringify(merged.p3));
for(const r of mappings)sql.prepare('INSERT INTO trainers_identity_map VALUES (?,?,?,?,?)').run(r.entity,r.localId,r.originalId??null,r.status,JSON.stringify(r));
for(const r of [...conflicts,...bonusConflicts])sql.prepare('INSERT INTO trainers_conflict(json) VALUES (?)').run(JSON.stringify(r));
for(const c of quantEvidence.contexts)sql.prepare('INSERT INTO quantitative_context VALUES (?,?)').run(c.contextId,JSON.stringify(c));
for(const r of quantEvidence.records)sql.prepare('INSERT INTO quantitative_evidence VALUES (?,?,?,?)').run(r.evidenceId,r.contextId,r.skillId,JSON.stringify(r));
sql.exec('COMMIT');summary.sqlite={integrity:sql.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyViolations:sql.prepare('PRAGMA foreign_key_check').all().length};if(summary.sqlite.integrity!=='ok'||summary.sqlite.foreignKeyViolations)throw new Error('SQLite integrity failed');sql.close();
fs.renameSync(sqlite,path.join(output,'data/local/p3-integrated.sqlite'));
save('data/local/p3-skill-support.json',merged.p3);save('data/local/p1-reference.json',merged.p1);
save('data/normalized/trainers/summary.json',summary);console.log(summary);

