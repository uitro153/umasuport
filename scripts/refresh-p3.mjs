/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { validateP3Snapshot } from '../src/domain/skill-support.ts';
import { validateReferenceSnapshot } from '../src/domain/reference.ts';
import { p3Tournaments, p3TournamentSources } from '../src/data/p3-tournaments.ts';
import { p4Tournaments, p4TournamentSources } from '../src/data/p4-tournaments.ts';
const input = path.resolve(process.env.UMA_P3_INPUT ?? (fs.existsSync('data/raw/p3-base-2026-11-04') ? 'data/raw/p3-base-2026-11-04' : '../audit-input/uma_db'));
const fresh = path.resolve('data/raw/p3-2026-11-05');
const baseManifest=JSON.parse(fs.readFileSync(path.join(input,'FILE_MANIFEST.json'),'utf8'));
const read = n => {
  const bytes=fs.readFileSync(path.join(input,'json',n+'.json'));
  const expected=baseManifest.find(x=>x.path==='json/'+n+'.json');
  if(!expected||crypto.createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new Error('Base input hash mismatch '+n);
  return JSON.parse(bytes.toString());
};
const latest = n => {
  if(n!=='download-audit'&&!audit.some(r=>r.file===n+'.json'&&r.status==='downloaded'))throw new Error('Required fresh download missing: '+n);
  return JSON.parse(fs.readFileSync(path.join(fresh,n+'.json'),'utf8'));
};
const audit = latest('download-audit');
const tsManifest=latest('tsuyu-manifest');
for(const [name,file] of Object.entries({characters:'tsuyu-characters',skills:'tsuyu-skills',supports:'tsuyu-supports',events:'tsuyu-events',courses:'tsuyu-courses',scenarios:'tsuyu-scenarios-toresenken'})){
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(fresh,file+'.json'))).digest('hex')!==tsManifest.files[name].sha256)throw new Error('Additional source manifest mismatch '+name);
}
for(const r of audit.filter(x=>x.status==='downloaded')) if(crypto.createHash('sha256').update(fs.readFileSync(path.join(fresh,r.file))).digest('hex')!==r.sha256) throw new Error('Download hash mismatch '+r.file);
const url=n=>audit.find(x=>x.file===n+'.json')?.url ?? 'https://gametora.com/ko/umamusume';
const str=String, text=x=>typeof x==='string'&&x.trim()?x:null;
const groups=r=>(r?.condition_groups??[]).map(x=>({condition:text(x.condition),precondition:text(x.precondition),baseTime:x.base_time??null,effects:(x.effects??[]).map(e=>({type:e.type,value:e.value,raw:e})),raw:x}));
const gtSkills=latest('gt-skills'), krSkills=latest('gt-ko-skills');
const gtSkillIds=new Set(gtSkills.flatMap(r=>[str(r.id),...(r.gene_version?[str(r.gene_version.id)]:[])]));
const skillRaw=new Map(read('skill').map(r=>[str(r.id),r.raw]));
for(const r of gtSkills){skillRaw.set(str(r.id),r);if(r.gene_version)skillRaw.set(str(r.gene_version.id),r.gene_version);}
const oldSkills=new Map(read('skill').map(x=>[str(x.id),x]));
const skills=[...skillRaw].map(([skillId,r])=>{const old=oldSkills.get(skillId);return {skillId,nameJa:text(r.jpname??r.name_jp)??old?.name_ja??null,nameKo:text(r.name_ko)??old?.name_ko??null,nameEn:text(r.name_en??r.enname)??old?.name_en??null,displayName:text(r.name_ko)??text(r.jpname)??text(r.name_en)??old?.name_ja??skillId,translationStatus:'source-translation-unverified',rarity:r.rarity??old?.rarity??null,cost:r.cost??old?.cost??null,descriptionKo:text(r.desc_ko),descriptionJa:text(r.jpdesc),descriptionEn:text(r.desc_en??r.endesc),iconId:r.iconid??null,conditionGroups:groups(r),sourceIds:[...new Set([gtSkillIds.has(skillId)?'gt_current':old?.source_id??'ut_master',...(r.cost==null&&old?.cost!=null?[old.source_id]:[])])],raw:r};});
const skillIds=new Set(skills.map(x=>x.skillId));
const cards=latest('gt-support-cards');
const supports=cards.map(x=>({supportId:str(x.support_id),ownerBaseId:str(x.char_id),nameJa:text(x.name_jp),nameKo:text(x.name_ko),nameEn:text(x.char_name),displayName:`${text(x.name_ko)??x.name_jp} ${text(x.title_ko)??x.title_ja??''}`,translationStatus:'source-translation-unverified',rarity:['','R','SR','SSR'][x.rarity],type:x.type,uniqueEffect:x.unique??null,sourceIds:['gt_current'],raw:x}));
const supportIds=new Set(supports.map(x=>x.supportId));
const relations=read('skill_relation').filter(x=>skillIds.has(str(x.skill_id))&&skillIds.has(str(x.related_skill_id))).map(x=>({skillId:str(x.skill_id),relatedSkillId:str(x.related_skill_id),relation:x.relation,sourceIds:[x.source_id],evidence:'supplied-source'}));
for(const s of latest('tsuyu-skills'))if(s.lowerSkillId&&skillIds.has(str(s.id))&&skillIds.has(str(s.lowerSkillId)))relations.push({skillId:str(s.id),relatedSkillId:str(s.lowerSkillId),relation:'lower_skill',sourceIds:['tsuyu'],evidence:'explicit-lowerSkillId'});
const skillRelations=[...new Map(relations.map(x=>[`${x.skillId}:${x.relatedSkillId}:${x.relation}`,x])).values()];
const routes=[]; let unresolvedRoutes=0;
function addRoute(card,skill,server,acquisition,sourceId,extra={}){if(!supportIds.has(str(card))||!skillIds.has(str(skill))){unresolvedRoutes++;return;}routes.push({supportId:str(card),skillId:str(skill),server,acquisition,sourceGroup:null,sourceIds:[sourceId],...extra});}
for(const c of cards){for(const s of c.hints?.hint_skills??[])addRoute(c.support_id,s,'JP','hint','gt_current');for(const s of c.event_skills??[])addRoute(c.support_id,s,'JP','event','gt_current');}
for(const s of gtSkills)if(s.loc?.ko)for(const [key,acq] of [['sup_hint','hint'],['sup_e','event']])for(const group of (s.loc.ko[key]??s[key])??[])for(const card of group)addRoute(card,s.id,'KR',acq,'gt_current');
const skillRevisions=[];
for(const [server,rows] of [['KR-legacy-file',krSkills],['JP',gtSkills]])for(const r of rows){for(const s of [r,r.gene_version].filter(Boolean))if(skillIds.has(str(s.id)))skillRevisions.push({skillId:str(s.id),server,snapshot:'observed-2026-11-05',status:'reference-no-effective-date',conditionGroups:groups(s),sourceIds:['gt_current']});}
for(const r of gtSkills)if(r.loc?.ko)for(const s of [r,r.gene_version].filter(Boolean))if(skillIds.has(str(s.id)))skillRevisions.push({skillId:str(s.id),server:'KR',snapshot:'observed-2026-11-05',status:s.loc?.ko?.condition_groups?'locale-explicit-no-effective-date':'locale-root-fallback-no-effective-date',conditionGroups:groups({...s,...s.loc?.ko}),sourceIds:['gt_current']});
const rewards=latest('gt-dict-evrew'),supportEvents=[];
for(const family of ['ssr','sr','friend','group','shared'])for(const [owner,events] of latest('gt-training_events-'+family)){
  const owners=['shared','friend'].includes(family)?cards.filter(x=>x.char_id===owner).map(x=>x.support_id):[owner];
  for(const card of owners)if(supportIds.has(str(card)))for(const ev of events){
    if(!Array.isArray(ev))continue;
    const eventId=`gt-${card}-${ev[2]??ev[0]}`;
    const choices=(ev[1]??[]).map((c,i)=>({choiceId:str(c[0]??i),label:`선택지 ${i+1}`,skills:(c[1]??[]).filter(n=>typeof n==='number').map(n=>rewards[n]).filter(r=>Array.isArray(r)&&r[0]==='sk'&&skillIds.has(str(r[2]))).map(r=>({skillId:str(r[2]),hintLevel:Number.isFinite(Number(r[1]))?Number(r[1]):null})),raw:c}));
    supportEvents.push({eventId,supportId:str(card),label:`이벤트 ${ev[2]??ev[0]}${family==='friend'?' · 등장 인물 기준 참고(카드별 적용 미검증)':''}`,server:'JP',choices,sourceIds:['gt_current'],raw:{ownerKind:['shared','friend'].includes(family)?'character':'support',ownerId:owner,family,event:ev}});
    if(family!=='friend')for(const c of choices)for(const sk of c.skills)addRoute(card,sk.skillId,'JP','event','gt_current',{eventId,choiceId:c.choiceId,hintLevel:sk.hintLevel});
  }
}
for(const ev of latest('tsuyu-events').events){const card=ev.id.match(/^evt_(\d+)_/)?.[1];if(!card||!supportIds.has(card))continue;
  const eventId='ts-'+ev.id,choices=(ev.choices??[{id:'event',label:ev.label,skills:ev.skills??[]}]).map(c=>({choiceId:c.id.replaceAll('+','_') ,label:c.label,skills:(c.skills??[]).filter(s=>skillIds.has(str(s.skillId))).map(s=>({skillId:str(s.skillId),hintLevel:s.hintLevel??null})),raw:c}));
  supportEvents.push({eventId,supportId:card,label:ev.label,server:'JP',choices,sourceIds:['tsuyu'],raw:ev});for(const c of choices)for(const sk of c.skills)addRoute(card,sk.skillId,'JP','event','tsuyu',{eventId,choiceId:c.choiceId,hintLevel:sk.hintLevel});
}
const names=new Map(latest('tsuyu-courses').courses.map(x=>[x.id,x.place]));
const courses=latest('gt-racetracks').flatMap(t=>t.courses.map(c=>({courseId:str(c.id),trackId:str(t.id),venue:names.get(c.id)??str(t.id),distance:c.length,surface:c.terrain,lastSpurtStart:c.spurtStart?.meters??null,finalCornerStart:c.corners.at(-1)?.start??null,finalStraightStart:c.straights.at(-1)?.start??null,sourceIds:['gt_current'],raw:c})));
const date=n=>new Date(n*1000+9*3600000).toISOString().slice(0,10);
const rawScenarios=latest('gt-scenarios');
const oldScenarios=new Map(read('scenario').map(s=>[str(s.game_id),s]));
const scenarios=rawScenarios.map(s=>({scenarioId:str(s.id),nameJa:s.name_ja,nameKo:text(s.name_ko)??oldScenarios.get(str(s.id))?.name_ko??null,nameEn:text(s.name_en_old),displayName:text(s.name_ko)??oldScenarios.get(str(s.id))?.name_ko??s.name_ja,jpDate:s.start_ja?date(s.start_ja):null,status:'source-reference',sourceIds:['gt_current']}));
const unknownKr=()=>({confirmedDate:null,observedDate:null,forecastDate:null,releasedBy:null,evidence:'none',sourceUrl:null,checkedOn:null});
const prediction=latest('gt-ko-foresight-predicted_releases');
const predictions=prediction.supports??prediction.support_cards??prediction;
const applications=cards.map(c=>({entityType:'support',entityId:str(c.support_id),jpDate:c.release??null,kr:{...unknownKr(),...(c.release_ko?{observedDate:c.release_ko,evidence:'secondary_page',sourceUrl:url('gt-support-cards'),checkedOn:'2026-11-05'}:predictions[str(c.support_id)]?.release_date?{forecastDate:predictions[str(c.support_id)].release_date,evidence:'forecast',sourceUrl:url('gt-ko-foresight-predicted_releases'),checkedOn:'2026-11-05'}:{})},patchOverrides:[]}));
for(const s of rawScenarios)applications.push({entityType:'scenario',entityId:str(s.id),jpDate:scenarios.find(x=>x.scenarioId===str(s.id)).jpDate,kr:{...unknownKr(),...(s.start_ko?{observedDate:date(s.start_ko),evidence:'secondary_page',sourceUrl:url('gt-scenarios'),checkedOn:'2026-11-05'}:{})},patchOverrides:[]});
const releasedKrCards=new Set(cards.filter(c=>c.release_ko&&c.release_ko<='2026-11-05').map(c=>str(c.support_id)));
const observedKrSkills=new Set(routes.filter(r=>r.server==='KR'&&releasedKrCards.has(r.supportId)).map(r=>r.skillId));
for(const s of skills){const currentKrPath=observedKrSkills.has(s.skillId);
  applications.push({entityType:'skill',entityId:s.skillId,jpDate:null,kr:{...unknownKr(),...(currentKrPath?{releasedBy:'2026-11-05',evidence:'secondary_current_route_inference',sourceUrl:url('gt-skills'),checkedOn:'2026-11-05'}:{})},patchOverrides:[]});}
const tournaments=[],ambiguousCourses=[];
for(const server of ['KR','JP'])for(const ev of latest(server==='KR'?'gt-ko-events-champions-meeting':'gt-events-champions-meeting')){const r=ev.race;if(!r)continue;
  const candidates=courses.filter(c=>c.trackId===str(r.track)&&c.distance===r.distance&&c.surface===r.ground&&c.raw.turn===r.turn);
  if(candidates.length!==1){ambiguousCourses.push({server,eventId:ev.id,candidates:candidates.map(x=>x.courseId)});continue;}
  tournaments.push({eventId:`${server}-cm-${ev.id}`,name:`${server==='KR'?'한국':'일본'} ${date(ev.start)} 챔미 ${ev.name}`,server,startAt:new Date(ev.start*1000).toISOString(),dateStatus:date(ev.start)>'2026-11-05'?'forecast':'secondary',courseId:candidates[0].courseId,conditions:{distance:r.distance,surface:r.ground,direction:r.turn,season:r.season,weather:r.weather??null,ground:r.condition??null},sourceIds:['gt_current'],sourceUrl:url(server==='KR'?'gt-ko-events-champions-meeting':'gt-events-champions-meeting'),evidence:'secondary-schedule-future-conservative-forecast',checkedOn:'2026-11-05'});
}
const scenarioSkillRoutes=[];for(const s of skillRaw.values())for(const scenario of s.sce_e??[])if(scenarios.some(x=>x.scenarioId===str(scenario)))scenarioSkillRoutes.push({scenarioId:str(scenario),skillId:str(s.id),label:'시나리오 획득 가능·세부 조건 미확인',sourceIds:['gt_current']});
const research=[];for(const filename of fs.readdirSync(fresh).filter(n=>/^tsuyu-effects-\d+-/.test(n))){const r=JSON.parse(fs.readFileSync(path.join(fresh,filename),'utf8'));if(!courses.some(c=>c.courseId===str(r.courseId)))continue;for(const s of r.skills??[])if(skillIds.has(str(s.id))&&typeof s.expectedEffect==='number')research.push({courseId:str(r.courseId),style:r.style,skillId:str(s.id),reportedValue:s.expectedEffect,sourceUrl:r.source,fetchedAt:r.fetchedAt,status:'context-unverified',raw:s});}
const sources=read('source');
sources.push(...p3TournamentSources);
sources.push(...p4TournamentSources);
sources.push({id:'gt_current',url:'https://gametora.com/ko/umamusume',repository_commit:null,repository_updated_at:null,data_updated_at:null,verified_on:'2026-11-05',coverage:'Direct JP/KR skills, supports, events, tracks, release timelines',missing:'Official KR certification and historical patch effective dates',status:'secondary-current-observation'});
sources.push({id:'tsuyu',url:'https://github.com/Tsuyuchan-jp/umamusume-data',repository_commit:latest('tsuyu-tree').sha,repository_updated_at:null,data_updated_at:latest('tsuyu-manifest').generatedAt,verified_on:'2026-11-05',coverage:'Lower skill relations; limited events; course names; research',missing:'Simulation assumptions and KR patch equivalence',status:'partial-secondary'});
const krTournaments=tournaments.filter(t=>t.server==='KR').map(t=>{
  const previous=p3Tournaments.find(p=>p.eventId===t.eventId.toLowerCase()&&p.dateStatus==='confirmed');
  return previous??{...t,eventId:t.eventId.toLowerCase()};
}).concat(p4Tournaments).sort((a,b)=>(b.startAt??'').localeCompare(a.startAt??''));
const snapshot=validateP3Snapshot({contract:'uma-p3-skill-support',schemaVersion:1,snapshotId:'p3-2026-11-05',datasetVersion:'2026-11-05-partial',generatedAt:new Date().toISOString(),sourceManifestSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(fresh,'download-audit.json'))).digest('hex'),warnings:['전체 게임 DB 완성 아님','한국 과거 패치 적용일 미확보','마신 자료는 전제 미검증으로 점수에 미사용','이벤트 획득 경로는 완주·성공 보장 아님'],sources,skills,supports,skillRelations,supportSkills:[...new Map(routes.map(x=>[JSON.stringify(x),x])).values()],skillRevisions,supportLimitBreakEffects:read('support_effect_limit_break').map(x=>({supportId:str(x.support_id),limitBreak:x.limit_break,level:x.level,effectId:x.effect_id,value:x.value,sourceIds:[x.source_id]})),applications,courses,races:read('race').filter(r=>courses.some(c=>c.courseId===str(r.course_id))).map(r=>({raceId:str(r.id),courseId:str(r.course_id),name:r.name,season:r.raw?.season??null,sourceIds:[r.source_id],raw:r})),scenarios,tournaments:krTournaments,supportEvents:[...new Map(supportEvents.map(x=>[x.eventId,x])).values()],scenarioSkillRoutes,research});
fs.mkdirSync('data/local',{recursive:true});fs.mkdirSync('data/normalized/p3',{recursive:true});
snapshot.snapshotId+='-'+crypto.createHash('sha256').update(JSON.stringify({...snapshot,snapshotId:null,generatedAt:null})).digest('hex').slice(0,16);
fs.writeFileSync('data/local/p3-skill-support.json',JSON.stringify(snapshot));
const coverage={asOf:'2026-11-05',status:'partial',skills:skills.length,supports:supports.length,krSkillRevisions:skillRevisions.filter(x=>x.server==='KR').length,skillRelations:skillRelations.length,supportSkills:snapshot.supportSkills.length,supportEvents:snapshot.supportEvents.length,courses:courses.length,tournaments:krTournaments.length,jpReferenceTournaments:tournaments.filter(t=>t.server==='JP').length,scenarios:scenarios.length,researchRows:research.length,unresolvedRoutes,ambiguousCourses,koSkillMissing:skills.filter(x=>!x.nameKo).length,koSupportMissing:supports.filter(x=>!x.nameKo).length,supportKrObserved:applications.filter(x=>x.entityType==='support'&&x.kr.observedDate).length,supportKrForecast:applications.filter(x=>x.entityType==='support'&&x.kr.forecastDate).length,supportsWithHint:new Set(snapshot.supportSkills.filter(x=>x.acquisition==='hint').map(x=>x.supportId)).size,supportsWithEvent:new Set(snapshot.supportSkills.filter(x=>x.acquisition==='event').map(x=>x.supportId)).size,supportsWithOwnedEvent:new Set(snapshot.supportEvents.map(x=>x.supportId)).size,downloaded:audit.filter(x=>x.status==='downloaded').length,downloadFailures:audit.filter(x=>x.status==='failed'),predictionShape:Object.keys(prediction)};
fs.writeFileSync('data/normalized/p3/coverage.json',JSON.stringify(coverage,null,2));
const oldReport='data/local/p3-import.validation.json';
if(fs.existsSync(oldReport)&&!fs.existsSync('data/local/p3-import.before-expansion.json'))fs.copyFileSync(oldReport,'data/local/p3-import.before-expansion.json');
fs.writeFileSync(oldReport,JSON.stringify({...coverage,snapshotId:snapshot.snapshotId,sourceManifestSha256:snapshot.sourceManifestSha256,validation:'structural-pass-game-coverage-pending'},null,2));
fs.writeFileSync('data/normalized/p3/jp-tournaments.json',JSON.stringify(tournaments.filter(t=>t.server==='JP'),null,2));
fs.writeFileSync('data/normalized/p3/costume-releases.json',JSON.stringify(latest('gt-character-cards').map(c=>({costumeId:str(c.card_id),jpDate:c.release,krObservedDate:c.release_ko??null,sourceUrl:url('gt-character-cards'),checkedOn:'2026-11-05'})),null,2));
const p1File='data/local/p1-reference.json';
if(fs.existsSync(p1File)){
  const original=JSON.parse(fs.readFileSync(p1File,'utf8'));
  const backup='data/local/p1-reference.before-p3.json';if(!fs.existsSync(backup))fs.copyFileSync(p1File,backup);
  original.snapshotId=original.snapshotId.replace(/-kr-dates-2026-11-05$/,'')+'-kr-dates-2026-11-05';
  original.datasetVersion=original.datasetVersion.replace(/ \+ KR dates 2026-11-05$/,'')+' + KR dates 2026-11-05';
  if(!original.sources.some(x=>x.id==='gt_current'))original.sources.push(sources.find(x=>x.id==='gt_current'));
  const releaseById=new Map(latest('gt-character-cards').map(x=>[str(x.card_id),x]));
  for(const app of original.applications){if(app.kr.confirmedDate)continue;const c=releaseById.get(app.entityId);const predicted=prediction.char_cards?.[app.entityId]?.release_date;
    if(c?.release_ko)app.kr={...app.kr,observedDate:c.release_ko,evidence:'secondary_page',sourceUrl:url('gt-character-cards'),checkedOn:'2026-11-05'};
    else if(predicted)app.kr={...app.kr,forecastDate:predicted,evidence:'forecast',sourceUrl:url('gt-ko-foresight-predicted_releases'),checkedOn:'2026-11-05'};
  }
  validateReferenceSnapshot(original);fs.writeFileSync(p1File,JSON.stringify(original));
}
const database='data/local/p3-integrated.sqlite';if(!fs.existsSync(database))fs.copyFileSync(path.join(input,'umamusume_partial.sqlite'),database);
const db=new DatabaseSync(database);db.exec('CREATE TABLE IF NOT EXISTS quantitative_context(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quantitative_evidence(id TEXT PRIMARY KEY,context_id TEXT REFERENCES quantitative_context(id),skill_id TEXT REFERENCES p3_skill(id),json TEXT NOT NULL);');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS p3_snapshot(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS p3_skill(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS p3_support(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS p3_route(id INTEGER PRIMARY KEY,support_id TEXT REFERENCES p3_support(id),skill_id TEXT REFERENCES p3_skill(id),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS p3_event(id TEXT PRIMARY KEY,support_id TEXT REFERENCES p3_support(id),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS p3_relation(id INTEGER PRIMARY KEY,skill_id TEXT REFERENCES p3_skill(id),related_skill_id TEXT REFERENCES p3_skill(id),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS p3_application(entity_type TEXT,entity_id TEXT,json TEXT NOT NULL,PRIMARY KEY(entity_type,entity_id)); BEGIN; DELETE FROM quantitative_evidence; DELETE FROM p3_event; DELETE FROM p3_relation; DELETE FROM p3_application; DELETE FROM p3_route; DELETE FROM p3_skill; DELETE FROM p3_support; DELETE FROM p3_snapshot;');
db.prepare('INSERT INTO p3_snapshot VALUES (?,?)').run(snapshot.snapshotId,JSON.stringify(snapshot));for(const s of skills)db.prepare('INSERT INTO p3_skill VALUES (?,?)').run(s.skillId,JSON.stringify(s));for(const s of supports)db.prepare('INSERT INTO p3_support VALUES (?,?)').run(s.supportId,JSON.stringify(s));for(const r of snapshot.supportSkills)db.prepare('INSERT INTO p3_route(support_id,skill_id,json) VALUES (?,?,?)').run(r.supportId,r.skillId,JSON.stringify(r));for(const e of snapshot.supportEvents)db.prepare('INSERT INTO p3_event VALUES (?,?,?)').run(e.eventId,e.supportId,JSON.stringify(e));for(const r of snapshot.skillRelations)db.prepare('INSERT INTO p3_relation(skill_id,related_skill_id,json) VALUES (?,?,?)').run(r.skillId,r.relatedSkillId,JSON.stringify(r));for(const a of snapshot.applications)db.prepare('INSERT INTO p3_application VALUES (?,?,?)').run(a.entityType,a.entityId,JSON.stringify(a));db.exec('COMMIT');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite integrity failed');db.close();console.log(coverage);

