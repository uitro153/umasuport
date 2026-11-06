import { readFileSync } from 'node:fs';
import { validateP3Snapshot } from '../../src/domain/skill-support';
const data=validateP3Snapshot(JSON.parse(readFileSync('data/local/p3-skill-support.json','utf8')));
console.log(`Actual local P3 validated: ${data.skills.length} skills, ${data.supports.length} supports, ${data.supportEvents?.length??0} owned events. Full game coverage unverified.`);
