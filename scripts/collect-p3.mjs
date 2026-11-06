/* global fetch, AbortSignal, Buffer, console */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const dir = path.resolve('data/raw/p3-2026-11-05');
await fs.mkdir(dir, {recursive:true});
const audit = [];
async function preservePrevious(name, nextBytes) {
  try {
    const previous=await fs.readFile(path.join(dir,name));
    if(previous.equals(nextBytes))return;
    const hash=crypto.createHash('sha256').update(previous).digest('hex');
    const history=path.resolve('data/raw/p3-history',hash);
    await fs.mkdir(history,{recursive:true});await fs.writeFile(path.join(history,name),previous);
  } catch(error) { if(error.code!=='ENOENT')throw error; }
}
async function fetchFile(url, name) {
  try {
    const response = await fetch(url, {headers:{'User-Agent':'UMA-local-data-audit'}, signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error('HTTP '+response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    await preservePrevious(name,bytes);
    await fs.writeFile(path.join(dir,name),bytes);
    audit.push({url,file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),checkedOn:'2026-11-05',status:'downloaded'});
    return name.endsWith('.json') ? JSON.parse(bytes.toString()) : bytes.toString();
  } catch(error) { audit.push({url,file:name,status:'failed',reason:String(error)}); return null; }
}
const head = await fetchFile('https://api.github.com/repos/daftuyda/UmaTools/commits?per_page=1','umatools-head.json');
const sha = head?.[0]?.sha;
if(sha) await Promise.all(['skills_all.json','support_card.json','support_hints.json','uma_data.json','races.json'].map(name=>fetchFile(`https://raw.githubusercontent.com/daftuyda/UmaTools/${sha}/public/assets/${name}`,'ut_'+name)));
await Promise.all([
  fetchFile('https://raw.githubusercontent.com/Tsuyuchan-jp/umamusume-data/main/manifest.json','tsuyu-manifest.json'),
  fetchFile('https://raw.githubusercontent.com/Tsuyuchan-jp/umamusume-data/main/README.md','tsuyu-readme.md'),
  fetchFile('https://api.github.com/repos/Tsuyuchan-jp/umamusume-data/git/trees/main?recursive=1','tsuyu-tree.json'),
  fetchFile('https://gametora.com/ko/umamusume/gacha','gt-kr-gacha.html'),
  fetchFile('https://gametora.com/ko/umamusume/foresight-timeline','gt-kr-future.html'),
  fetchFile('https://gametora.com/ko/umamusume','gt-kr-home.html'),
  fetchFile('https://gametora.com/umamusume','gt-jp-home.html'),
]);
const tree = JSON.parse(await fs.readFile(path.join(dir,'tsuyu-tree.json'),'utf8'));
const tsuyuSha = tree.sha;
await Promise.all(['characters.json','skills.json','supports.json','events.json','courses.json','effects/available.json','scenarios/toresenken.json'].map(name=>
  fetchFile(`https://raw.githubusercontent.com/Tsuyuchan-jp/umamusume-data/${tsuyuSha}/data/${name}`, 'tsuyu-'+name.replaceAll('/','-'))));
const manifest = await fetchFile('https://gametora.com/data/manifests/umamusume.json','gt-manifest.json');
if(manifest) await Promise.all(['ko/gacha/char-standard','ko/gacha/support-standard','ko/foresight/timeline','ko/foresight/predicted_releases','ko/events/champions-meeting','events/champions-meeting','support-cards','character-cards','skills','ko/skills','racetracks','scenarios','training_events/ssr','training_events/sr','training_events/friend','training_events/group','training_events/shared','dict/evrew','dict/te_names_by_id_ko','dict/te_names_by_id_ja','dict/choice_texts_ja','support-card-sources','support_effects','events'].filter(key=>manifest[key]).map(key=>
  fetchFile(`https://gametora.com/data/umamusume/${key}.${manifest[key]}.json`,'gt-'+key.replaceAll('/','-')+'.json')));
const effectFiles = tree.tree.filter(x=>x.type==='blob' && /^data\/effects\/\d+\/.*\.json$/.test(x.path));
for(let i=0;i<effectFiles.length;i+=8) await Promise.all(effectFiles.slice(i,i+8).map(x=>fetchFile(`https://raw.githubusercontent.com/Tsuyuchan-jp/umamusume-data/${tsuyuSha}/${x.path}`,'tsuyu-'+x.path.slice(5).replaceAll('/','-'))));
const auditBytes=Buffer.from(JSON.stringify(audit,null,2));
await preservePrevious('download-audit.json',auditBytes);
await fs.writeFile(path.join(dir,'download-audit.json'),auditBytes);
console.log(audit.map(x=>({file:x.file,status:x.status,bytes:x.bytes,reason:x.reason})));
