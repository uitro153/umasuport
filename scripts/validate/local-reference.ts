import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateReferenceSnapshot } from '../../src/domain/reference';
import { groupAffinity } from '../../src/engine/reference-affinity';
import { getReferenceAvailability } from '../../src/engine/reference-availability';

const file = resolve(process.argv[2] ?? 'data/local/p1-reference.json');
try {
  const snapshot = validateReferenceSnapshot(JSON.parse(await readFile(file, 'utf8')) as unknown);
  const mismatches = snapshot.affinity.pairs.filter((pair) => groupAffinity(snapshot, [pair.aBaseId, pair.bBaseId]).value !== pair.baseValue);
  if (mismatches.length) throw new Error(`원자료 쌍 재현 불일치: ${mismatches.length}건`);
  const cutoffDate = '2026-11-05';
  const availability = snapshot.applications.map((application) => getReferenceAvailability(application, cutoffDate));
  const report = {
    snapshotId: snapshot.snapshotId,
    scope: 'structural-validation-and-historical-jp-reproduction-only',
    cutoffDate,
    characters: snapshot.characters.length,
    costumes: snapshot.costumes.length,
    pairsReproduced: snapshot.affinity.pairs.length,
    pairMismatches: mismatches.length,
    officialDates: snapshot.applications.filter((row) => row.kr.confirmedDate !== null).length,
    secondaryDates: snapshot.applications.filter((row) => row.kr.observedDate !== null).length,
    unknownAvailability: availability.filter((row) => row.state === 'unknown').length,
    missingKoreanName: snapshot.costumes.filter((row) => row.nameKo === null).length,
    missingKoreanOutfit: snapshot.costumes.filter((row) => row.outfitKo === null).length,
    mixedLanguage: snapshot.costumes.filter((row) => row.displayLanguage === 'mixed').length,
    independentKrExpectedCases: 0,
    validation: snapshot.validation,
  };
  await writeFile(resolve('data/local/p1-reference.validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : '로컬 참고 검증 실패');
  process.exitCode = 1;
}
