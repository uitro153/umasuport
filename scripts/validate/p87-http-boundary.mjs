import fs from 'node:fs';
import console from 'node:console';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
const paths = ['/__local/p1-reference', '/__local/p3-skill-support', '/data/local/p3-integrated.sqlite', '/game-assets/costumes/100101.png'];
const outcomes = [];
for (const path of paths) {
  const accept = path.endsWith('.png') ? 'image/png' : path.endsWith('.sqlite') ? 'application/vnd.sqlite3' : 'application/json';
  const response = await globalThis.fetch(`http://127.0.0.1:5198${path}`, { headers: { accept } });
  const body = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type');
  const leaked = /application\/json|image\/png/.test(type ?? '') || body.subarray(0, 16).toString().startsWith('SQLite format');
  outcomes.push({ path, accept, status: response.status, contentType: type, spaFallback: (type ?? '').includes('text/html'), leakedPrivatePayload: leaked });
}
const root = Buffer.from(await (await globalThis.fetch('http://127.0.0.1:5198/')).arrayBuffer());
const digest = data => createHash('sha256').update(data).digest('hex');
const rootIndexMatchesBuild = digest(root) === digest(fs.readFileSync('dist/index.html'));
const result = { scope: 'Actual loopback-only production preview GETs with explicit resource Accept headers; default wildcard requests may return SPA fallback HTML, not private payload.', outcomes, rootIndexMatchesBuild,
  blocked: rootIndexMatchesBuild && outcomes.every(row => !row.leakedPrivatePayload && row.status === 404) };
fs.writeFileSync('.preview/p87-artifacts/production-boundary.validation.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.blocked) process.exitCode = 1;
