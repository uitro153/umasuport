import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { importSkillSupport, type P3ImportInput } from '../src/data/import-skill-support';

const root = resolve(process.argv[2] ?? 'C:/Users/uitro/.codex/.chatgpt-projects/g-p-6ad309bd21c48191b13e4b588afa9fee/audit-input/uma_db');
const integration = resolve(process.argv[3] ?? join(root, '../../data-integration'));
const manifestText = await readFile(join(root, 'FILE_MANIFEST.json'), 'utf8');
const manifest = z.array(z.strictObject({ path: z.string(), bytes: z.number(), sha256: z.string() })).parse(JSON.parse(manifestText));
const tables: Record<Exclude<keyof P3ImportInput, 'labels' | 'applications'>, string> = {
  skills: 'skill', skillRevisions: 'skill_revision', skillRelations: 'skill_relation', rawMasterSkills: 'raw_master_skill',
  supports: 'support', supportSkills: 'support_skill', supportLimitBreakEffects: 'support_effect_limit_break',
  courses: 'course', races: 'race', scenarios: 'scenario', sources: 'source',
};
const input: Partial<P3ImportInput> = {};
for (const [key, table] of Object.entries(tables)) {
  const relative = `json/${table}.json`; const record = manifest.find((row) => row.path === relative);
  const buffer = await readFile(join(root, relative));
  if (!record || record.bytes !== buffer.length || record.sha256 !== createHash('sha256').update(buffer).digest('hex')) {
    throw new Error(`Original manifest mismatch: ${relative}`);
  }
  input[key as keyof P3ImportInput] = JSON.parse(buffer.toString('utf8')) as unknown;
}
input.labels = JSON.parse(await readFile(join(integration, 'data/ko/labels.json'), 'utf8')) as unknown;
input.applications = JSON.parse(await readFile(join(integration, 'data/kr/applications.json'), 'utf8')) as unknown;
const snapshot = importSkillSupport(input as P3ImportInput, {
  sourceManifestSha256: createHash('sha256').update(manifestText).digest('hex'), generatedAt: new Date().toISOString(),
});
await mkdir('data/local', { recursive: true });
await writeFile('data/local/p3-skill-support.json', `${JSON.stringify(snapshot)}\n`, 'utf8');
const report = {
  checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId, sourceManifestSha256: snapshot.sourceManifestSha256,
  verifiedSourceTables: Object.keys(tables).length,
  counts: { skills: snapshot.skills.length, supports: snapshot.supports.length, supportSkills: snapshot.supportSkills.length,
    skillRevisions: snapshot.skillRevisions.length, skillRelations: snapshot.skillRelations.length,
    lowerRelations: snapshot.skillRelations.filter((row) => row.relation === 'lower_skill').length,
    supportLimitBreakEffects: snapshot.supportLimitBreakEffects.length,
    courses: snapshot.courses.length, races: snapshot.races.length, scenarios: snapshot.scenarios.length, tournaments: snapshot.tournaments.length,
    skillCostUnknown: snapshot.skills.filter((row) => row.cost === null).length,
    conditionGroupsMissing: snapshot.skills.filter((row) => row.conditionGroups.length === 0).length,
  },
  supportKr: {
    official: snapshot.applications.filter((row) => row.entityType === 'support' && row.kr.confirmedDate).length,
    secondary: snapshot.applications.filter((row) => row.entityType === 'support' && row.kr.observedDate).length,
    unknown: snapshot.applications.filter((row) => row.entityType === 'support' && !row.kr.confirmedDate && !row.kr.observedDate && !row.kr.forecastDate && !row.kr.releasedBy).length,
  },
  independentKrGameplayCases: 0, measuredHorseLengthGainCases: 0,
  warnings: snapshot.warnings,
};
await writeFile('data/local/p3-import.validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
