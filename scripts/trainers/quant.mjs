import fs from 'node:fs';
import path from 'node:path';
import { parseUtools,hash,norm } from './core.mjs';

export function buildQuantEvidence(research,p3,sheetInspection){
  const contexts=[],rows=[],unmapped=[];
  for(const file of fs.readdirSync(research).filter(f=>/^utools-\d+-\w+\.html$/.test(f))){
    const bytes=fs.readFileSync(path.join(research,file)),data=parseUtools(bytes.toString());
    const contextId=`utools-${data.course.id}-${data.style}-2026-11-05`;
    const sourceUrl=`https://xn--gck1f423k.xn--1bvt37a.tools/race/courses/${data.course.id}/effects/${data.style}`;
    contexts.push({contextId,sourceUrl,sourceSha256:hash(bytes),server:'JP',courseId:String(data.course.id),style:data.style,observedOn:'2026-11-05',course:data.course,baselineVelocityTrace:data.defaultVt,
      conditions:{season:null,weather:null,groundCondition:null,stats:null,runnerCount:null,opponentDistribution:null},patchVersion:null,sampleCount:null,rankEligible:false});
    for(const row of data.rows){
      const original=p3.skills.find(s=>s.skillId===String(row.id));
      if(!original||norm(original.nameJa)!==norm(row.skillName)){unmapped.push({contextId,id:row.id,name:row.skillName,reason:'ID or exact Japanese name not aligned with P3'});continue;}
      const r=row.courseEffect.r;
      const values=Array.isArray(r)?r:Object.fromEntries(Object.entries(r??{}));
      const listedCosts=new Map([[String(row.id),row.needSkillPoint],...Object.values(row.lowerSkillIPtMap??{}).map(x=>[String(x.id),x.pt])]);
      const validCost=[...listedCosts.values()].every(v=>typeof v==='number'&&v>=0);
      const totalCost=validCost?[...listedCosts.values()].reduce((a,b)=>a+b,0):null;
      rows.push({evidenceId:contextId+'-'+row.id+'-'+hash(row.courseEffect).slice(0,12),contextId,skillId:String(row.id),nameJa:row.skillName,
        reportedExpectedMargin:row.expectedEffect,reportedMinimum:values?.[0]??null,reportedMaximum:values?.[1]??null,reportedMean:values?.[2]??null,reportedMedian:values?.[3]??null,
        reportedActivationRate:values?.[4]??null,effectiveRate:null,
        sourceDisplayedEfficiencyScale:100,listedPrerequisiteCost:totalCost,derivedMarginPerPoint:totalCost>0?row.expectedEffect/totalCost:null,
        derivedMarginPer100Points:totalCost>0?100*row.expectedEffect/totalCost:null,
        costBasis:'source-listed-prerequisites-no-hint-discount',activationDefinition:'source-r[4]-labelled-activation-rate-not-effective-rate',
        variant:row.courseEffect.c??null,raw:row,rankEligible:false,status:'source-quantities-captured-KR-patch-and-profile-unverified'});
    }
  }
  const main=sheetInspection.find(s=>s.name==='main'),notes=sheetInspection.find(s=>s.name==='text');
  const cell=(sheet,ref)=>sheet?.cells.find(c=>c.cell===ref)??null;
  const serial=Number(cell(notes,'C20')?.value);
  const sheet={version:cell(notes,'A20')?.value,versionDate:Number.isFinite(serial)?new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10):null,
    workbookSha256:hash(fs.readFileSync(path.join(research,'simulator.xlsx'))),sheetCounts:sheetInspection.map(s=>({name:s.name,cells:s.cells.length,formulas:s.cells.filter(c=>c.formula!==null).length})),
    titleCell:{sheet:'main',...cell(main,'B2')},versionCells:{sheet:'text',version:cell(notes,'A20'),date:cell(notes,'C20'),changes:cell(notes,'D20')},
    sourceInputs:['C10','G10','K10','D14','H14','L14','D16','I16','C20','G20','K20'].map(ref=>({sheet:'main',...cell(main,ref)})),
    outputCells:['L26','R26','L31','O31','R31'].map(ref=>({sheet:'main',...cell(main,ref)})),
    status:'read-only-formula-and-cached-value-inspection-not-a-new-simulation',currentKrPatchVerified:false,
    warnings:['Version date predates the 2026-11-05 target. Do not certify current KR behavior from version number alone.','No workbook cell was changed and no new simulation was executed.','Cached values are not sample-based activation/effectiveness rates.']};
  const protocol={contract:'uma-skill-quant-evidence',schemaVersion:1,asOf:'2026-11-05',contexts,records:rows,
    definitions:{sourceActivationAssumption:0.925,sourceRateIndices:{minimum:0,maximum:1,mean:2,median:3,activationRate:4},sourceEfficiency:'100 * expectedMargin / source prerequisite-inclusive Pt. This is per 100 Pt, not per 1 Pt.',effectiveRate:'Must specify eligible activation locations, effective-window overlap criterion and denominator. Not the same as r[4].'},
    rankingPolicy:{default:'reference-only',required:['verified identity','matching server and effective patch','exact course/style/season/weather/ground','reproducible stats and opponents','metric definition and denominator','cost basis and hint levels','run/sample method and version'],automaticMultiplicationBySourceRate:false},simulator:sheet,unmapped};
  return protocol;
}

export function getEligibleQuantEvidence(record,context,verified=false){
  if(!verified||record.rankEligible!==true||context?.reviewStatus!=='verified'||record.reviewStatus!=='verified'||!context?.patchVersion||!context.simulatorVersion||!context.runMethod||!context.conditions?.stats||!context.conditions?.runnerCount||[context.conditions.season,context.conditions.weather,context.conditions.groundCondition].some(v=>v===null||v===undefined)||!context.sampleCount)return {eligible:false,reason:'patch-profile-or-method-unverified'};
  return {eligible:true,reason:'explicitly-reviewed-context'};
}
