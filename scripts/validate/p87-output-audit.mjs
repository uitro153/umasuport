import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
const dir = '.preview/p87-artifacts';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const imported = read('.preview/p86-artifacts/desktop-support-output-current-v1.json');
const workflows = ['desktop', 'mobile'].map(profile => {
  const before = read(`${dir}/${profile}-before-preferences-v1.json`);
  const after = read(`${dir}/${profile}-after-preferences-v1.json`);
  const originalInstances = imported.inputs.factorInstances;
  const instances = before.inputs.factorInstances;
  const unchangedOwners = Object.keys(instances).filter(id => instances[id].factorInstanceId === originalInstances[id].factorInstanceId);
  return { profile, independentPreferenceInputsEqual: same(before.inputs, after.inputs),
    uniqueUuids: new Set(Object.values(instances).map(item => item.factorInstanceId)).size,
    changedUuidOwners: Object.keys(instances).filter(id => !unchangedOwners.includes(id)),
    allParentConnectionsEqual: Object.entries(imported.inputs.referencePlan.nodes).every(([id, node]) => same(node.parentIds, before.inputs.referencePlan.nodes[id].parentIds)),
    workflow: read(`${dir}/${profile}-workflow.validation.json`) };
});
const outputs = ['lineage-7-images', 'lineage-31-images', 'support-6-images'].map(kind => {
  const profiles = ['desktop', 'mobile'].map(profile => {
    const file = `${dir}/regression-p86/${profile}-${kind}.png`; const bytes = fs.readFileSync(file);
    return { file, sha256: sha(bytes), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  });
  return { kind, profiles, profileBytesEqual: profiles[0].sha256 === profiles[1].sha256 };
});
function walk(root) { return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(root, entry.name)) : [path.join(root, entry.name)]); }
const changedSourceAndTests = ['src', 'tests'].flatMap(walk).filter(file => {
  const baseline = path.join('.preview/p87-baseline', file);
  return !fs.existsSync(baseline) || sha(fs.readFileSync(baseline)) !== sha(fs.readFileSync(file));
}).map(file => file.replaceAll('\\', '/')).sort();
const result = { phase: 'P8.7', generatedAt: new Date().toISOString(),
  scope: 'Read-only comparison of actual browser downloads and retained baseline; preference changes are compared to the same already-edited plan, not to the initial import.',
  workflows, outputs, changedSourceAndTests };
fs.writeFileSync(`${dir}/output-and-input.validation.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (workflows.some(row => !row.independentPreferenceInputsEqual || row.uniqueUuids !== 31 || !row.allParentConnectionsEqual || !same(row.changedUuidOwners, ['parentA']))) process.exitCode = 1;
if (outputs.some(row => !row.profileBytesEqual)) process.exitCode = 1;
