import { readFile, writeFile } from 'node:fs/promises';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { createEmptyPedigree, SLOT_KEYS, ANCESTOR_SLOT_KEYS } from '../../src/domain/pedigree';
import { calculateReferencePedigree, enumerateReferenceGrandparentArrangements } from '../../src/engine/reference-pedigree';
import { calculateReferenceAptitudes, REFERENCE_RED_RULE } from '../../src/engine/reference-aptitude';
import expected from '../../tests/golden/public-expectations.json';

const snapshot = validateReferenceSnapshot(JSON.parse(await readFile('data/local/p1-reference.json', 'utf8')));
const pedigree = createEmptyPedigree();
expected.calculator.costumes.forEach((id, index) => { pedigree[SLOT_KEYS[index]!].costumeId = id; });
const result = calculateReferencePedigree(pedigree, snapshot, { allowUnverifiedFormula: true });
const terms = result.contributions.map((term) => term.value);
if (result.previewTotal !== expected.calculator.total || JSON.stringify(terms) !== JSON.stringify(expected.calculator.termsInEngineOrder)) throw new Error('External seven-slot golden mismatch');
const layouts = enumerateReferenceGrandparentArrangements(pedigree, snapshot, { allowUnverifiedFormula: true });
if (layouts.length !== 6 || new Set(layouts.map((row) => JSON.stringify([row.pedigree.grandA1,row.pedigree.grandA2,row.pedigree.grandB1,row.pedigree.grandB2]))).size !== 6) throw new Error('Arrangement uniqueness mismatch');
pedigree.target.costumeId = '100301';
for (const key of ANCESTOR_SLOT_KEYS) pedigree[key].redFactor = { type: 'mile', stars: 3 };
const mile = calculateReferenceAptitudes(pedigree,snapshot).changes.find((row) => row.type === 'mile');
if (mile?.base !== 'E' || mile.result !== 'A' || mile.totalStars !== 18 || mile.gradeSteps !== 4) throw new Error('Real aptitude golden mismatch');
const report = { checkedOn: '2026-11-05', snapshotId: snapshot.snapshotId, sourceManifestSha256: snapshot.sourceManifestSha256,
  external: { source: expected.calculator.url, server: expected.calculator.server, expected: expected.calculator.total, actual: result.previewTotal, expectedTerms: expected.calculator.termsInEngineOrder, actualTerms: terms, matchedCases: 1 },
  arrangements: layouts.map((row) => ({ id: row.arrangementId, total: row.result.previewTotal })), redRule: REFERENCE_RED_RULE, realAptitudeCase: mile,
  historicalDiscrepancies: expected.historical, krGameplayExpectedCases: 0, validation: snapshot.validation };
await writeFile('data/local/p1-calculation.validation.json', `${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
