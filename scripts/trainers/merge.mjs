import { hash,norm } from './core.mjs';
const sourceId='trainers-2026-10-30';
export function mergeVerified(db,p3,p1,mappings,metadata){
  const merged=structuredClone(p3),lineage=structuredClone(p1);
  const upstreamManifest=p3.sources.find(s=>s.id===sourceId)?.upstreamP3ManifestSha256??p3.sourceManifestSha256;
  const source={id:sourceId,url:'https://github.com/YIRer/umamusume_trainers/blob/'+metadata.sourceCommit+'/db/db.json',repository_commit:metadata.sourceCommit,repository_updated_at:metadata.dataUpdatedAt,data_updated_at:metadata.dataUpdatedAt,verified_on:'2026-11-05',coverage:'Pinned uploaded Korean dataset; explicit cross-dataset identities and conditional event narratives',missing:'No KR release dates or structured race-effect formulas',status:'cross-dataset-reference-not-official-translation-or-KR-release-certification',upstreamP3ManifestSha256:upstreamManifest};
  if(!merged.sources.some(s=>s.id===sourceId))merged.sources.push(source);
  if(!lineage.sources.some(s=>s.id===sourceId))lineage.sources.push(source);
  const skills=new Map(mappings.filter(r=>r.entity==='skill'&&r.status==='one-to-one').map(r=>[r.localId,r.originalId]));
  const labelChanges=[];
  for(const [localId,originalId]of skills){const original=merged.skills.find(s=>s.skillId===originalId),local=db.skills.find(s=>String(s.id)===localId);if(!original.nameKo&&local.name?.ko){labelChanges.push({entity:'skill',id:originalId,localId,before:null,after:local.name.ko});original.nameKo=local.name.ko;original.displayName=local.name.ko;original.translationStatus='cross-dataset-identity-verified-source-Korean-not-officially-certified';original.sourceIds=[...new Set([...original.sourceIds,sourceId])];}}
  for(const mapping of mappings.filter(m=>m.entity==='person'&&m.status==='one-to-one')){
    const original=lineage.characters.find(c=>c.baseId===mapping.originalId),local=db.umamusume.find(c=>String(c.id)===mapping.localId);
    if(original&&!original.nameKo&&local.name?.ko){original.nameKo=local.name.ko;original.displayName=local.name.ko;original.displayLanguage='ko';original.translationStatus='cross-dataset-identity-verified-source-Korean';original.labelSourceIds=[...new Set([...original.labelSourceIds,sourceId])];labelChanges.push({entity:'person',id:original.baseId,localId:mapping.localId,before:null,after:local.name.ko});}
  }
  for(const costume of lineage.costumes){const base=lineage.characters.find(c=>c.baseId===costume.baseId);if(!costume.nameKo&&base?.nameKo&&base.labelSourceIds.includes(sourceId)){
    costume.nameKo=base.nameKo;costume.displayName=`${costume.nameKo} [${costume.outfitKo??costume.outfitJa}]`;costume.displayLanguage=costume.outfitKo?'ko':'mixed';costume.labelSourceIds=[...new Set([...costume.labelSourceIds,sourceId])];costume.translationStatus='cross-dataset-identity-verified-source-Korean';labelChanges.push({entity:'costume-name',id:costume.costumeId,before:null,after:base.nameKo});
  }}
  const originalsByToken=new Map();
  for(const local of db.skills){const originalId=skills.get(String(local.id));if(!originalId)continue;for(const name of [local.name?.ja,local.name?.ko])if(name){const token=norm(name),set=originalsByToken.get(token)??new Set();set.add(originalId);originalsByToken.set(token,set);}}
  const parseRewards=(text)=>{
    const ids=new Set(),unresolved=[];
    for(const match of (text??'').matchAll(/[「『“"]([^「」『』“”"\n]+)[」』”"]/g)){const token=norm(match[1]);const candidates=originalsByToken.get(token);if(candidates?.size===1)ids.add([...candidates][0]);else unresolved.push({token:match[1],candidates:[...(candidates??[])]});}
    return {skills:[...ids].map(skillId=>({skillId,hintLevel:null})),unresolved};
  };
  const eventRecords=[],eventRoutes=[],unresolvedRewards=[];let commonCount=0;
  for(const mapping of mappings.filter(r=>r.entity==='support'&&r.status==='one-to-one')){
    const card=db.cards.find(c=>String(c.id)===mapping.localId),original=merged.supports.find(s=>s.supportId===mapping.originalId);
    if(!original.nameKo&&card.name?.ko){original.nameKo=card.name.ko;const title=original.raw.title_ko??original.raw.title_ja??'';original.displayName=`${card.name.ko} ${title}`;original.translationStatus='cross-dataset-identity-verified-source-Korean-not-officially-certified';original.sourceIds=[...new Set([...original.sourceIds,sourceId])];labelChanges.push({entity:'support',id:original.supportId,localId:mapping.localId,before:null,after:card.name.ko});}
    for(const [bucket,list]of Object.entries(card.events??{}))for(const event of list){
      const eventId=`trainers-${original.supportId}-${bucket}-${hash(event).slice(0,16)}`;
      if(eventRecords.some(e=>e.eventId===eventId))continue;
      const choices=[];
      for(const [i,choice]of (event.choices??[]).entries()){
        const branches=choice.results?.length?choice.results:[{condition:event.condition??'',result:choice.result??''}];
        for(const [j,branch]of branches.entries()){
          const reward=parseRewards(branch.result);unresolvedRewards.push(...reward.unresolved.map(r=>({eventId,choice:i,branch:j,...r})));
          const choiceId=`choice-${i}-branch-${j}`;
          const label=`${choice.description?.ko?.trim()||choice.description?.ja?.trim()||`선택지 문구 미수록 (${i+1})`}${branch.condition?` · ${branch.condition}`:/성공|실패/.test(branch.result??'')?' · 성공·실패 조건 원문 확인':''}`;
          choices.push({choiceId,label,skills:reward.skills,raw:{sourceChoice:choice,sourceBranch:branch,eventCondition:event.condition??'',bucket,serverApplicability:'unverified'}});
        }
      }
      eventRecords.push({eventId,supportId:original.supportId,label:`트레이너스 · ${bucket==='common'?'공통(카드 고유 아님)':'카드 연결'} · ${event.title?.ko??event.title?.ja??'이름 미확인'}`,server:'source-unspecified',choices,sourceIds:[sourceId],raw:{localCardId:String(card.id),bucket,source:event,guaranteedAcquisition:false}});
      if(bucket==='common'){commonCount++;continue;}
      for(const c of choices)for(const s of c.skills)eventRoutes.push({supportId:original.supportId,skillId:s.skillId,server:'source_unspecified',acquisition:'event',sourceGroup:null,sourceIds:[sourceId],eventId,choiceId:c.choiceId,hintLevel:null});
    }
  }
  merged.supportEvents??=[];
  const newEvents=eventRecords.filter(e=>!merged.supportEvents.some(old=>old.eventId===e.eventId));merged.supportEvents.push(...newEvents);
  const routeKey=r=>`${r.supportId}:${r.skillId}:${r.server}:${r.acquisition}:${r.eventId??''}:${r.choiceId??''}`;
  const oldKeys=new Set(merged.supportSkills.map(routeKey));const newRoutes=eventRoutes.filter(r=>!oldKeys.has(routeKey(r)));merged.supportSkills.push(...newRoutes);
  const beforeRelease=hash(p3.applications),beforeEffects=hash(p3.skills.map(s=>({id:s.skillId,raw:s.raw,groups:s.conditionGroups,cost:s.cost})));
  if(hash(merged.applications)!==beforeRelease||hash(merged.skills.map(s=>({id:s.skillId,raw:s.raw,groups:s.conditionGroups,cost:s.cost})))!==beforeEffects)throw new Error('Protected release/effect fields changed');
  merged.datasetVersion=p3.datasetVersion.replace(/ \+ trainers.*$/,'')+' + trainers-2026-10-30';
  merged.sourceManifestSha256=hash({upstreamManifest,trainersSha256:metadata.sha256});
  merged.snapshotId=p3.snapshotId.replace(/-trainers-[a-f0-9]+$/,'')+'-trainers-'+hash({...merged,snapshotId:null,generatedAt:null}).slice(0,12);
  lineage.datasetVersion=p1.datasetVersion.replace(/ \+ trainers.*$/,'')+' + trainers-2026-10-30';
  lineage.snapshotId=p1.snapshotId.replace(/-trainers-[a-f0-9]+$/,'')+'-trainers-'+hash({...lineage,snapshotId:null}).slice(0,12);
  const newUniqueEventPairs=[...new Set(newRoutes.map(r=>r.supportId+':'+r.skillId))].filter(pair=>!p3.supportSkills.some(r=>r.acquisition==='event'&&r.supportId+':'+r.skillId===pair));
  return {p3:merged,p1:lineage,labelChanges,newEvents,newRoutes,unresolvedRewards,
    audit:{sourceId,labelChanges:labelChanges.length,skillLabels:labelChanges.filter(r=>r.entity==='skill').length,supportLabels:labelChanges.filter(r=>r.entity==='support').length,personLabels:labelChanges.filter(r=>r.entity==='person').length,
      preservedKrApplicationsSha256:beforeRelease,preservedEffectAndCostSha256:beforeEffects,preservedLineageApplications:hash(lineage.applications)===hash(p1.applications),
      newEventNarratives:newEvents.length,commonEventNarratives:commonCount,newSourceUnspecifiedEventRoutes:newRoutes.length,newUniqueSourceUnspecifiedEventPairs:newUniqueEventPairs.length,
      newKrConfirmedHintRoutes:0,newKrConfirmedEventRoutes:0,newGoldLowerRelations:0,unresolvedQuotedRewards:unresolvedRewards.length}};
}
