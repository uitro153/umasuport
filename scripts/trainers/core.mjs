import crypto from 'node:crypto';
export const hash=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const norm=value=>(typeof value==='string'?value:'').normalize('NFKC').replace(/[◯〇○]/g,'○').replace(/[\s・･]/g,'');
const key=String;
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const index=(rows,field='id')=>new Map(rows.map(r=>[key(r[field]),r]));
export function auditTrainers(db){
  const issues=[],duplicates={};
  for(const table of ['umamusume','cards','skills','conditions'])if(!Array.isArray(db[table]))throw new Error('Not an array: '+table);
  for(const table of ['umamusume','cards','skills']){const seen=new Set();duplicates[table]=[];for(const r of db[table]){if(r.id===null||r.id===undefined)issues.push({kind:'missing-id',table});else if(seen.has(key(r.id)))duplicates[table].push(r.id);seen.add(key(r.id));}}
  const people=index(db.umamusume),skills=index(db.skills),cards=index(db.cards);
  let events=0,commonEvents=0;const uniqueEvents=new Set();
  for(const c of db.cards){
    if(!['training','support'].includes(c.type))issues.push({kind:'unknown-card-type',id:c.id,type:c.type});
    if(c.targetID!==null&&c.targetID!==undefined&&!people.has(key(c.targetID)))issues.push({kind:'foreign-key',table:'cards',id:c.id,field:'targetID',value:c.targetID});
    for(const field of ['uniqueSkillsIds','hasSkillsIds','trainingSkillsIds','baseSkillsIds','awakeningSkillsIds','evolutionSkillsIds','specialSkillsIds'])for(const s of c[field]??[])if(!skills.has(key(s)))issues.push({kind:'foreign-key',table:'cards',id:c.id,field,value:s});
    for(const [bucket,list]of Object.entries(c.events??{})){if(!Array.isArray(list)){issues.push({kind:'non-array-event-bucket',id:c.id,bucket});continue;}for(const e of list){events++;if(bucket==='common')commonEvents++;uniqueEvents.add(hash(e));}}
  }
  for(const s of db.skills)for(const c of s.targetIDs??[])if(!cards.has(key(c)))issues.push({kind:'foreign-key',table:'skills',id:s.id,field:'targetIDs',value:c});
  return {counts:{people:db.umamusume.length,costumes:db.cards.filter(c=>c.type==='training').length,supports:db.cards.filter(c=>c.type==='support').length,skills:db.skills.length,conditions:db.conditions.length,events,commonEvents,distinctEventPayloads:uniqueEvents.size},duplicates,issues,
    missingNames:Object.fromEntries(['umamusume','cards','skills'].map(t=>[t,{ko:db[t].filter(r=>!nonempty(r.name?.ko)).length,ja:db[t].filter(r=>!nonempty(r.name?.ja)).length}])),
    missingSkillConditions:db.skills.filter(s=>!nonempty(s.condition)).length,emptySkillEffects:db.skills.filter(s=>!nonempty(s.effect)).length,
    groupSupports:db.cards.filter(c=>c.type==='support'&&c.targetID===null).map(c=>({id:c.id,name:c.name})),
    fieldPresence:Object.fromEntries(['umamusume','cards','skills'].map(t=>[t,Object.fromEntries([...new Set(db[t].flatMap(Object.keys))].map(f=>[f,{absent:db[t].filter(r=>!Object.hasOwn(r,f)).length,null:db[t].filter(r=>r[f]===null).length,blank:db[t].filter(r=>r[f]==='').length}]))]))};
}

function finalOneToOne(rows){
  const groups=new Map();for(const r of rows.filter(r=>r.status==='one-to-one')){const list=groups.get(r.originalId)??[];list.push(r);groups.set(r.originalId,list);}
  for(const list of groups.values())if(list.length>1)for(const row of list){row.status='ambiguous';row.reason='Multiple local IDs compete for one original ID';delete row.originalId;}
  return rows;
}
export function mapSkills(db,p3,gtCards,utSkills=[]){
  const people=index(db.umamusume);const gtOwners=new Map();
  for(const c of gtCards)for(const s of [...(c.skills_unique??[]),...(c.skills_evo??[]).map(e=>e.new)]){const set=gtOwners.get(key(s))??new Set();set.add(norm(c.name_jp));gtOwners.set(key(s),set);}
  const localRole=new Map(),localOwners=new Map();
  for(const c of db.cards.filter(c=>c.type==='training'))for(const [field,role]of [['uniqueSkillsIds','native'],['evolutionSkillsIds','evolution']])for(const sid of c[field]??[]){localRole.set(key(sid),role);const set=localOwners.get(key(sid))??new Set();set.add(norm(people.get(key(c.targetID))?.name?.ja));localOwners.set(key(sid),set);}
  const byName=new Map();for(const s of p3.skills){const name=norm(s.nameJa);if(!name)continue;const list=byName.get(name)??[];list.push(s);byName.set(name,list);}
  const signature=s=>`${s.rarity}:${Math.floor((s.iconId??0)/10)}`;
  const independentKo=s=>s.translationStatus?.startsWith('cross-dataset-identity-verified')?(s.raw?.name_ko??null):s.nameKo;
  const iconEvidence=new Map();
  for(const s of db.skills){const candidates=byName.get(norm(s.name?.ja))??[];if(candidates.length===1&&nonempty(s.name?.ko)&&norm(independentKo(candidates[0]))===norm(s.name.ko)){const set=iconEvidence.get(s.imageSrc)??new Set();set.add(signature(candidates[0]));iconEvidence.set(s.imageSrc,set);}}
  const ut=new Map(utSkills.map(s=>[key(s.id),s]));
  const inherited=new Set(p3.skillRelations.filter(r=>r.relation==='inherited_version').map(r=>r.relatedSkillId));
  return finalOneToOne(db.skills.map(s=>{
    let nameCandidates=byName.get(norm(s.name?.ja))??[];
    if(!nameCandidates.length){const aliases=(s.name?.ja??'').split(/\s+/).flatMap(a=>byName.get(norm(a))??[]);if(new Set(aliases.map(a=>a.skillId)).size>=2)nameCandidates=[...new Map(aliases.map(a=>[a.skillId,a])).values()];}
    const role=localRole.get(key(s.id))??(s.tags?.includes('진화스킬')?'evolution':'ordinary');
    const candidates=nameCandidates.filter(c=>role==='native'?[3,4,5].includes(c.rarity):role==='evolution'?c.rarity===6:[1,2].includes(c.rarity)&&!inherited.has(c.skillId));
    const evidenceFor=c=>{
      const evidence=['exact-normalized-Japanese'];
      if(nonempty(s.name?.ko)&&norm(s.name.ko)===norm(independentKo(c)))evidence.push('Korean-name-agreement');
      if(nonempty(s.effect)&&norm(s.effect)===norm(c.descriptionKo))evidence.push('effect-text-agreement');
      if(ut.has(c.skillId)&&norm(ut.get(c.skillId).skillName)===norm(s.name.ja))evidence.push('independent-U-tools-ID-and-Japanese');
      if(role!=='ordinary'&&[...(localOwners.get(key(s.id))??[])].some(o=>gtOwners.get(c.skillId)?.has(o)))evidence.push('native-or-evolution-owner-agreement');
      if(role==='ordinary'&&iconEvidence.get(s.imageSrc)?.has(signature(c)))evidence.push('icon-family-and-rarity-consistent-with-exact-bilingual-seeds');
      return evidence;
    };
    const strong=candidates.filter(c=>evidenceFor(c).length>=2);
    const status=strong.length===1?'one-to-one':strong.length>1||candidates.length>1?'ambiguous':nameCandidates.length&&candidates.length===0?'content-conflict':nameCandidates.length?'needs-review':'trainers-only';
    return {entity:'skill',localId:key(s.id),status,originalId:status==='one-to-one'?strong[0].skillId:undefined,candidates:candidates.map(c=>c.skillId),nameCandidates:nameCandidates.map(c=>c.skillId),role,evidence:status==='one-to-one'?evidenceFor(strong[0]):[],names:s.name};
  }));
}

export function mapPeople(db,p1,p3){
  const originals=new Map(p1.characters.map(c=>[c.baseId,{id:c.baseId,ja:c.nameJa,ko:c.nameKo}]));
  for(const c of p3.supports)if(c.ownerBaseId&&!originals.has(c.ownerBaseId))originals.set(c.ownerBaseId,{id:c.ownerBaseId,ja:c.nameJa,ko:c.nameKo});
  return finalOneToOne(db.umamusume.map(p=>{const candidates=[...originals.values()].filter(c=>norm(c.ja)&&norm(c.ja)===norm(p.name?.ja));const strong=candidates.filter(c=>norm(c.ko)&&norm(c.ko)===norm(p.name?.ko));return {entity:'person',localId:key(p.id),status:strong.length===1?'one-to-one':candidates.length>1?'ambiguous':candidates.length?'needs-review':'trainers-only',originalId:strong.length===1?strong[0].id:undefined,candidates:candidates.map(c=>c.id),evidence:strong.length===1?['exact-Japanese','Korean-name-agreement']:[]};}));
}

export function mapCards(db,p3,gtCards,skillMapping,peopleMapping){
  const skills=new Map(skillMapping.filter(r=>r.status==='one-to-one').map(r=>[r.localId,r.originalId]));
  const people=new Map(peopleMapping.filter(r=>r.status==='one-to-one'||r.candidates.length===1).map(r=>[r.localId,r.originalId??r.candidates[0]]));
  const mapList=list=>[...new Set((list??[]).map(x=>skills.get(key(x))).filter(Boolean))];
  const grades=c=>[c.status?.ground?.turf?.rank,c.status?.ground?.duct?.rank,...['short','mile','medium','long'].map(k=>c.status?.distance?.[k]?.rank),...['escape','leading','between','pushing'].map(k=>c.status?.strategy?.[k]?.rank)];
  const results=db.cards.map(c=>{
    const owner=people.get(key(c.targetID));const role=c.type==='training'?'costume':'support';let candidates,strong,evidence;
    if(role==='costume'){
      const native=mapList(c.uniqueSkillsIds);const apt=grades(c);
      candidates=gtCards.filter(g=>owner===key(g.char_id));
      strong=candidates.filter(g=>{
        if(apt.length!==10||!apt.every((v,i)=>v===g.aptitude[i]))return false;
        if(native.length>0&&native.some(s=>(g.skills_unique??[]).map(key).includes(s)))return true;
        const evo=mapList(c.evolutionSkillsIds);
        if(evo.length>0&&evo.every(s=>(g.skills_evo??[]).some(e=>key(e.new)===s)))return true;
        const growth=['speed','stamina','power','guts','intelligence'].map(k=>Number(c.status?.status?.[k]?.bonus));
        const base=mapList(c.baseSkillsIds);
        return growth.every((v,i)=>v===g.stat_bonus[i])&&base.length>=2&&base.every(s=>(g.skills_innate??[]).map(key).includes(s));
      });
      evidence=['exact-Japanese-owner-candidate','all-ten-training-aptitudes','native-ID-or-growth-and-at-least-two-innate-IDs'];
    }else{
      const has=mapList(c.hasSkillsIds),training=mapList(c.trainingSkillsIds);
      const rarity=['','R','SR','SSR'][c.star];const type=['int','wisdom'].includes(c.supportType)?'intelligence':c.supportType;
      candidates=p3.supports.filter(s=>s.rarity===rarity&&s.type.toLowerCase()===type&&(owner?s.ownerBaseId===owner:c.targetID===null&&s.type==='group'));
      strong=candidates.filter(s=>{
        const hints=new Set((s.raw.hints?.hint_skills??[]).map(key)),events=new Set((s.raw.event_skills??[]).map(key));
        const hintAgreement=has.length>=3&&has.every(id=>hints.has(id));
        const eventAgreement=training.length>=2&&training.every(id=>events.has(id));
        return c.targetID===null?norm(c.name?.ja)===norm(s.nameJa)&&eventAgreement:hintAgreement||eventAgreement;
      });
      if(strong.length>1){
        const effectIds={'우정 보너스':1,'의욕에 의한 효과':2,'스피드 보너스':3,'스태미나 보너스':4,'파워 보너스':5,'근성 보너스':6,'지능 보너스':7,'트레이닝 효과':8,'초기 인연 게이지':14,'레이스 보너스':15,'팬 보너스':16,'힌트 Lv':17,'힌트 발생률':18,'득의율':19};
        const precise=strong.filter(s=>{let agree=0,conflict=0;for(const b of c.bonusEffectTable??[]){const effectId=effectIds[b.name];if(!effectId)continue;for(const [lb,value]of b.effects.entries()){if(value==='-'||value===''||value===null)continue;const v=Number(String(value).replace('%',''));const original=p3.supportLimitBreakEffects.find(e=>e.supportId===s.supportId&&e.effectId===effectId&&e.limitBreak===lb);if(original){if(v===original.value)agree++;else conflict++;}}}return agree>=5&&conflict===0;});
        if(precise.length===1)strong=precise;
      }
      evidence=['owner-or-explicit-group','rarity','support-type','mapped-hint-subset-or-at-least-two-event-skills'];
    }
    const originalId=strong.length===1?key(role==='costume'?strong[0].card_id:strong[0].supportId):undefined;
    return {entity:role,localId:key(c.id),status:strong.length===1?'one-to-one':strong.length>1?'ambiguous':candidates.length?'needs-review':role==='support'&&owner&&p3.supports.some(s=>s.ownerBaseId===owner)?'content-conflict':'trainers-only',originalId,candidates:candidates.map(g=>key(role==='costume'?g.card_id:g.supportId)),evidence:strong.length===1?evidence:[],mappedHas:mapList(c.hasSkillsIds),mappedTraining:mapList(c.trainingSkillsIds)};
  });
  return [...finalOneToOne(results.filter(r=>r.entity==='costume')),...finalOneToOne(results.filter(r=>r.entity==='support'))];
}

export function parseUtools(html){
  const chunks=[];for(const m of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)){try{const a=JSON.parse(m[1]);if(a[0]===1)chunks.push(a[1]);}catch{/* Public non-JSON scripts are not executed. */}}
  const records=new Map();for(const line of chunks.join('').split('\n')){const m=line.match(/^([\da-f]+):(.*)$/s);if(!m)continue;try{records.set(m[1],JSON.parse(m[2]));}catch{/* Flight module markers are not data. */}}
  const root=[...records.values()].find(v=>Array.isArray(v)&&v[3]?.effectData&&v[3]?.skills);
  if(!root)throw new Error('Public U-tools data record not found');
  const resolve=(value,depth=0)=>{
    if(depth>40)throw new Error('Reference nesting too deep');
    if(typeof value==='string'&&/^\$[\da-f]+:/.test(value)){const [record,...parts]=value.slice(1).split(':');let target=records.get(record);for(const p of parts)target=target?.[p];return target===undefined?{unresolvedReference:value}:resolve(target,depth+1);}
    if(Array.isArray(value))return value.map(v=>resolve(v,depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,depth+1)]));
    return value==='$undefined'?null:value;
  };
  const props=root[3],rows=[];
  const walk=value=>{if(!value||typeof value!=='object')return;if(Number.isFinite(value.expectedEffect)&&value.id&&value.courseEffect){rows.push(resolve(value));return;}for(const child of Object.values(value))walk(child);};walk(props.children);
  return {course:props.course,style:props.typeId,skills:props.skills,defaultVt:props.defaultVt,rows:[...new Map(rows.map(r=>[hash(r),r])).values()]};
}

