import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import console from 'node:console';

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const baseline = JSON.parse(fs.readFileSync('.preview/p87-baseline/protected-sha256.json', 'utf8'));
const mismatches = baseline.files.filter(file => !fs.existsSync(file.file) || hash(file.file) !== file.sha256).map(file => file.file);
const source = [...walk('src'), 'vite.config.ts'];
const built = walk('dist');
// This is an explicit-pattern audit, not a general security certification.
// Never print matched credential bytes into test logs.
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /AKIA[A-Z0-9]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/, /AIza[A-Za-z0-9_-]{35}/];
const credentials = [...source, ...built].filter(file => /\.(?:tsx?|js|css|html|json)$/.test(file) && patterns.some(pattern => pattern.test(fs.readFileSync(file, 'utf8'))));
const inappropriatePublicFiles = built.filter(file => /\.(?:sqlite|db|zip|env|map|png|jpe?g|webp)$/i.test(file) || /(?:staging|provenance|manifest|p3-integrated|p[135]-.*\.json)/i.test(path.basename(file)));
const bundledDevEndpoints = built.filter(file => /\.(js|html)$/.test(file) && /\/__local\//.test(fs.readFileSync(file, 'utf8')));
const inlineImages = built.filter(file => /\.js$/.test(file) && /data:image\/(png|jpeg|webp);base64,/.test(fs.readFileSync(file, 'utf8')));
const environmentFiles = fs.readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name));
const result = { phase: 'P8.7', checkedOn: '2026-11-05', scope: 'Read-only current baseline byte audit and bounded source/static-artifact inspection; not public hosting, legal rights, or complete penetration testing.',
  preservation: { expectedFiles: baseline.files.length, mismatches, unchanged: mismatches.length === 0 },
  credentialPatternMatches: credentials, inspectedSourceFiles: source.length, inspectedBuildFiles: built.length,
  inappropriatePublicFiles, bundledDevEndpoints, inlineImages, environmentFiles,
  controls: { localDataEndpoints: 'Vite configureServer only; local loaders guard import.meta.env.DEV before fetch', imports: 'Existing V1 strict size/version/ID/graph/UUID validation retained; see unit/E2E logs', userText: 'React escaped text / Canvas fillText; no newly introduced raw HTML evaluation', preferences: 'Separate bounded localStorage record, canonical ID strings; no V1 fields added', rights: '838 canonical IDs pending; original manifest and public image boundary retained' },
  limitations: ['Pattern absence is not a proof of absence of every secret.', 'P9 hosting, whole-game-data production loading and redistribution approvals remain separate.'] };
fs.mkdirSync('.preview/p87-artifacts', { recursive: true });
fs.writeFileSync('.preview/p87-artifacts/integrity-security.validation.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (mismatches.length || credentials.length || inappropriatePublicFiles.length || bundledDevEndpoints.length || inlineImages.length) process.exitCode = 1;
