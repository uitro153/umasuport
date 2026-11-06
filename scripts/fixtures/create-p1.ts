import { readFile, writeFile } from 'node:fs/promises';
import { validateSnapshot, validatePedigreeRules, type P1Rules, type Snapshot } from '../../src/domain';

// These deterministic values are fictional test inputs, never extracted game data.
const snapshot = JSON.parse(await readFile('data/fixtures/p0.snapshot.json', 'utf8')) as Snapshot;
snapshot.snapshotId = 'fixture-p1-2026-11-05';
snapshot.datasetVersion = 'fixture.p1.1';
snapshot.generatedAt = '2026-11-05T00:00:00+09:00';
snapshot.sources.push({
  sourceId: 'source_fixture_p1',
  title: 'P1 계보·상성·적성 검증용 가상 규칙 및 자료 — 실제 게임 데이터 아님',
  url: 'https://example.invalid/uma/p1-fixture',
  accessedAt: '2026-11-05',
  evidence: 'fixture',
});

const names = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '거', '너', '더', '러', '머', '버'];
for (let i = 2; i < 20; i++) {
  const letter = String.fromCharCode(97 + i);
  const baseId = `character_demo_${letter}`;
  const costumeId = `costume_demo_${letter}_default`;
  const releaseRef = `release_costume_${letter}_default`;
  snapshot.characters.push({
    baseId, nameKo: `[가상] 캐릭터 ${names[i]}`, nameJa: `[架空] キャラクター${letter.toUpperCase()}`,
    aliases: [`가상${names[i]}`, `테스트${i + 1}`], sourceIds: ['source_fixture_p1'],
  });
  snapshot.costumes.push({
    costumeId, baseId, nameKo: `[가상] 캐릭터 ${names[i]} · 기본 의상`, releaseRef,
    aptitudes: {
      turf: i % 3 === 0 ? 'B' : 'A', dirt: i % 4 === 0 ? 'B' : 'G',
      sprint: i % 3 === 0 ? 'A' : 'D', mile: i % 2 === 0 ? 'B' : 'A',
      medium: i % 3 === 1 ? 'B' : 'A', long: i % 2 === 0 ? 'C' : 'G',
      front: i % 4 === 0 ? 'A' : 'D', pace: i % 4 === 1 ? 'A' : 'C',
      late: i % 4 === 2 ? 'A' : 'B', end: i % 4 === 3 ? 'A' : 'E',
    },
    sourceIds: ['source_fixture_p1'],
  });
  snapshot.releases.push({
    releaseId: releaseRef, entityType: 'costume', entityId: costumeId, jpDate: '2025-01-01',
    krConfirmedDate: i < 17 ? '2026-01-01' : null,
    krForecastDate: i === 17 ? '2027-01-20' : i === 18 ? '2027-03-01' : null,
    sourceIds: ['source_fixture_p1'],
  });
}
snapshot.affinities = [];
for (let i = 0; i < 20; i++) {
  for (let j = i; j < 20; j++) {
    snapshot.affinities.push({
      aBaseId: snapshot.characters[i]!.baseId, bBaseId: snapshot.characters[j]!.baseId,
      baseValue: i === j ? 0 : 5 + ((i * 13 + j * 7 + ((i + j) % 4) * 5) % 31),
      sourceIds: ['source_fixture_p1'],
    });
  }
}

const rules: P1Rules = {
  schemaVersion: 1,
  ruleId: 'fixture-pair-sum-and-red-stars-v1',
  snapshotId: snapshot.snapshotId,
  kind: 'fixture',
  sourceIds: ['source_fixture_p1'],
  affinity: {
    terms: [
      { termId: 'target-parent-a', label: '대상 ↔ 부모 A', slotA: 'target', slotB: 'parentA', weight: 1 },
      { termId: 'target-parent-b', label: '대상 ↔ 부모 B', slotA: 'target', slotB: 'parentB', weight: 1 },
      { termId: 'parent-pair', label: '부모 A ↔ 부모 B', slotA: 'parentA', slotB: 'parentB', weight: 1 },
      { termId: 'target-grand-a1', label: '대상 ↔ 조부 A1', slotA: 'target', slotB: 'grandA1', weight: 1 },
      { termId: 'target-grand-a2', label: '대상 ↔ 조부 A2', slotA: 'target', slotB: 'grandA2', weight: 1 },
      { termId: 'target-grand-b1', label: '대상 ↔ 조부 B1', slotA: 'target', slotB: 'grandB1', weight: 1 },
      { termId: 'target-grand-b2', label: '대상 ↔ 조부 B2', slotA: 'target', slotB: 'grandB2', weight: 1 },
      { termId: 'parent-a-grand-a1', label: '부모 A ↔ 조부 A1', slotA: 'parentA', slotB: 'grandA1', weight: 1 },
      { termId: 'parent-a-grand-a2', label: '부모 A ↔ 조부 A2', slotA: 'parentA', slotB: 'grandA2', weight: 1 },
      { termId: 'parent-b-grand-b1', label: '부모 B ↔ 조부 B1', slotA: 'parentB', slotB: 'grandB1', weight: 1 },
      { termId: 'parent-b-grand-b2', label: '부모 B ↔ 조부 B2', slotA: 'parentB', slotB: 'grandB2', weight: 1 },
    ],
    forbiddenSameBasePairs: [['target', 'parentA'], ['target', 'parentB'], ['parentA', 'parentB']],
  },
  aptitude: {
    starSteps: [
      { minStars: 0, gradeSteps: 0 }, { minStars: 1, gradeSteps: 1 },
      { minStars: 4, gradeSteps: 2 }, { minStars: 7, gradeSteps: 3 },
      { minStars: 10, gradeSteps: 4 }, { minStars: 13, gradeSteps: 5 },
      { minStars: 16, gradeSteps: 6 },
    ],
    initialCap: 'A',
  },
};

validateSnapshot(snapshot);
validatePedigreeRules(rules, snapshot);
await writeFile('data/fixtures/p1.snapshot.json', `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
await writeFile('data/fixtures/p1.rules.json', `${JSON.stringify(rules, null, 2)}\n`, 'utf8');
console.log('Created fictional P1 snapshot and rules. No real game data was used.');
