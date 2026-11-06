import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import type { GameAssetManifest } from '../../src/domain/game-assets';

const manifest = JSON.parse(await readFile('data/assets/p85-manifest.json', 'utf8')) as GameAssetManifest;
const reference = JSON.parse(await readFile('data/local/p1-reference.json', 'utf8')) as { costumes: { costumeId: string; baseId: string; displayName: string }[] };
const p3 = JSON.parse(await readFile('data/local/p3-skill-support.json', 'utf8')) as { supports: { supportId: string; displayName: string; ownerBaseId: string | null; type: string; rarity: string; raw: { url_name: string } }[] };
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const asset = (kind: string, id: string) => manifest.entries.find((row) => row.kind === kind && row.canonicalId === id)!;
const fileUrl = (path: string) => pathToFileURL(resolve('data/local/p85-assets', path)).href;
const costumeIds = ['101801', '101802', '102401', '102402', '100601', '100602', '100101', '100102'];
const supportIds = ['10001', '20043', '30001', '30025', '10021', '30021', '30067', '30137', '20001', '30175', '30113', '30140'];
const costumeCards = costumeIds.map((id) => { const row = reference.costumes.find((item) => item.costumeId === id)!; const image = asset('costume', id).thumbnail!; return `<article><img class="portrait" src="${fileUrl(image.path)}"/><h2>${escape(row.displayName)}</h2><p>costumeId ${id} / baseId ${row.baseId}</p><p>${image.width}×${image.height} / original supplied square thumbnail</p></article>`; });
const supportCards = supportIds.map((id) => { const row = p3.supports.find((item) => item.supportId === id)!; const images = asset('support', id); return `<article><div class="support-images"><img class="icon" src="${fileUrl(images.thumbnail!.path)}"/><img class="card" src="${fileUrl(images.art!.path)}"/></div><h2>${escape(row.displayName)}</h2><p>supportId ${id} / ${row.rarity} / ${row.type}</p><p>ownerBaseId ${row.ownerBaseId ?? 'none'}</p><p class="source">https://gametora.com/umamusume/supports/${escape(row.raw.url_name)}</p></article>`; });
const document = (title: string, cards: string[]) => `<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0;padding:28px;font:16px "Malgun Gothic",sans-serif;background:#eef4f7;color:#15353d}h1{margin:0 0 12px}header p{max-width:1100px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}article{background:#fff;border:1px solid #ccd9df;border-radius:10px;padding:16px;text-align:center;overflow-wrap:anywhere}h2{font-size:17px;line-height:1.6}p{font-size:13px;line-height:1.5}.portrait{width:160px;height:160px;object-fit:contain}.support-images{display:flex;align-items:center;justify-content:center;gap:12px}.icon{width:82px;height:82px;object-fit:contain}.card{width:135px;height:180px;object-fit:contain}.source{font-size:11px;color:#53686d}</style><header><h1>${title}</h1><p>Exact canonical IDs from the current DB. Different costumes/cards must remain different images. Source-file hashes and IDs were checked across all assets; these samples require visual inspection. Local reference preview; public redistribution permission is pending.</p></header><div class="grid">${cards.join('')}</div></html>`;
const directory = '.preview/p85-artifacts'; await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1000 } });
  for (const [name, title, cards] of [['costume-contact-sheet', 'P8.5 의상별 원본 초상화 — 기본 / 웨딩 / 계절 의상', costumeCards], ['support-contact-sheet', 'P8.5 서포트 — 같은 캐릭터 R / SR / SSR 및 친구 / 그룹', supportCards]] as const) {
    const html = `${directory}/${name}.html`; await writeFile(html, document(title, [...cards]), 'utf8');
    await page.goto(pathToFileURL(resolve(html)).href);
    await page.locator('img').evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
    console.log(`${name}: ${cards.length} exact-ID samples rendered`);
  }
} finally { await browser.close(); }
await writeFile(`${directory}/asset-visual-samples.json`, JSON.stringify({ checkedOn: '2026-11-05', sampleScope: 'Human visual spot checks supplement full ID/hash/format validation; not every game depiction was independently human-reviewed.', costumeIds, supportIds, pendingHumanReview: true }, null, 2) + '\n');
