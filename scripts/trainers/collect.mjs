import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=path.resolve(process.argv[2]??'data/raw/third-party/cross-validation-2026-11-05');await fs.mkdir(dir,{recursive:true});
const log=[];
async function get(url,file){try{const r=await fetch(url,{headers:{'User-Agent':'UMA-source-cross-validation'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());await fs.writeFile(path.join(dir,file),b);log.push({url,file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),checkedOn:'2026-11-05',status:'downloaded'});}catch(e){log.push({url,file,status:'failed',reason:String(e)});}}
await Promise.all([
get('https://api.github.com/repos/YIRer/umamusume_trainers/git/trees/main?recursive=1','trainers-tree.json'),
get('https://api.github.com/repos/YIRer/umamusume_trainers/commits?per_page=1','trainers-head.json'),
get('https://raw.githubusercontent.com/YIRer/umamusume_trainers/main/README.md','trainers-readme.md'),
get('https://docs.google.com/spreadsheets/d/1GABAd3Xw6NrbVTJICqtaEC1rbzTsFWx8589XiiaB3qk/export?format=xlsx','simulator.xlsx'),
get('https://docs.google.com/spreadsheets/d/1GABAd3Xw6NrbVTJICqtaEC1rbzTsFWx8589XiiaB3qk/edit','simulator.html'),
get('https://xn--gck1f423k.xn--1bvt37a.tools/race/courses/10906/effects/leader','utools-10906-leader.html'),
get('https://open-jupiter-umamusume.game-info.wiki/d/%a5%b9%a5%ad%a5%eb%bb%c5%cd%cd','onj-skills.html'),
]);
await fs.writeFile(path.join(dir,'download-audit.json'),JSON.stringify(log,null,2));console.log(log.map(x=>({file:x.file,status:x.status,bytes:x.bytes,reason:x.reason})));
