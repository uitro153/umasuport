import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=path.resolve(process.argv[2]??'data/raw/third-party/cross-validation-2026-11-05');
const head=JSON.parse(await fs.readFile(path.join(dir,'trainers-head.json')))[0].sha;
const files=['db/db.json','src/components/Card/CardInfo.tsx','schema/Card.js','schema/Skill.js','src/types/Card/card.ts','src/components/Card/BonusTable.tsx','src/components/Card/SimpleBonusTable.tsx'];
const results=[];
for(const file of files){const url=`https://raw.githubusercontent.com/YIRer/umamusume_trainers/${head}/${file}`;try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());const target='trainers-'+file.replaceAll('/','-');await fs.writeFile(path.join(dir,target),b);results.push({url,file:target,sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length});}catch(e){results.push({url,error:String(e)});}}
const url=`https://api.github.com/repos/YIRer/umamusume_trainers/commits?path=db/db.json&per_page=1`;
try{const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);await fs.writeFile(path.join(dir,'trainers-db-commit.json'),await r.text());}catch(e){results.push({url,error:String(e)});}
await fs.writeFile(path.join(dir,'trainers-source-audit.json'),JSON.stringify(results,null,2));console.log(results.map(r=>({file:r.file,bytes:r.bytes,error:r.error})));
