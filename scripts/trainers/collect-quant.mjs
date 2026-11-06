import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const dir=process.argv[2]??'data/raw/third-party/cross-validation-2026-11-05',base='https://xn--gck1f423k.xn--1bvt37a.tools';
const log=[];
async function get(url,file){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());await fs.writeFile(dir+'/'+file,b);log.push({url,file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),checkedOn:'2026-11-05',status:'downloaded'});}catch(e){log.push({url,file,status:'failed',reason:String(e)});}}
const html=await fs.readFile(dir+'/utools-10906-leader.html','utf8');
const scripts=[...html.matchAll(/src="([^"]+\.js[^" ]*)"/g)].map(x=>x[1]).filter(x=>x.startsWith('/_next/static/chunks/'));
await Promise.all(scripts.map((s,i)=>get(base+s,`utools-code-${i}.js`)));
await Promise.all(['runner','betweener','chaser'].map(style=>get(`${base}/race/courses/10906/effects/${style}`,`utools-10906-${style}.html`)));
await get('https://open-jupiter-umamusume.game-info.wiki/d/'+encodeURIComponent('スキル仕様'),'onj-skills-utf8.html');
await fs.writeFile(dir+'/quant-download-audit.json',JSON.stringify(log,null,2));console.log(log.map(r=>({file:r.file,bytes:r.bytes,status:r.status,reason:r.reason})));
