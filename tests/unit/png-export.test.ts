import { describe, expect, it, vi } from 'vitest';
import { createLineagePngDocument, createSupportPngDocument, downloadPngDocument, layoutPngDocument, loadCachedPngImage, preparePngImages, wrapPngText, type PngAssetResolver, type PngDocument } from '../../src/ui/plans/png-export';
import { createDefaultWorkspace, synchronizeFactorInstances } from '../../src/engine/plan-persistence';
import { createLineagePlan, getProtectedNodeIds } from '../../src/domain/lineage';
import { calculateReferencePedigree } from '../../src/engine/reference-pedigree';
import { calculateReferenceAptitudes } from '../../src/engine/reference-aptitude';
import { makeReferenceEngineFixture } from './reference-engine-fixture';
import actualSource from '../golden/p3-engine-real-subset.json';
import { validateP3Snapshot } from '../../src/domain/skill-support';
import { recommendSupportDecks, type P4RecommendationRequest } from '../../src/engine/support-deck-optimizer';
import { getCompatiblePlanRoutes } from '../../src/engine/plan-comparison';

const actual = validateP3Snapshot(actualSource);
const fixture = makeReferenceEngineFixture();
const inputs = createDefaultWorkspace(actual, '2026-11-05'); inputs.referencePlan = createLineagePlan(fixture.pedigree);
let instance = 0; inputs.factorInstances = synchronizeFactorInstances(inputs.referencePlan, inputs.whiteFactors, {}, () => `00000000-0000-4000-8000-${String(++instance).padStart(12, '0')}`);
const snapshotIds = { reference: fixture.snapshot.snapshotId, p3: actual.snapshotId, p5: null };
const options = { title: '한국어 ○◎ ★3', inputs, reference: fixture.snapshot, snapshotIds,
  affinity: calculateReferencePedigree(fixture.pedigree, fixture.snapshot, { allowUnverifiedFormula: true }), aptitudes: calculateReferenceAptitudes(fixture.pedigree, fixture.snapshot) };

describe('P8 canvas document projection and readable layout', () => {
  it('preserves every Korean grapheme, ○◎ and stars while wrapping names without spaces', () => {
    const text = '매우긴한국어스킬명○◎★★★🏇';
    const lines = wrapPngText(text, 8, (value) => [...value].length);
    expect(lines.join('')).toBe(text); expect(lines.every((line) => [...line].length <= 8)).toBe(true);
    expect(wrapPngText('첫째\n둘째', 30, (value) => value.length)).toEqual(['첫째', '둘째']);
  });
  it('keeps exact seven/31 owner identities in audit while printing only a readable shared tree', () => {
    const before = structuredClone(options);
    const seven = createLineagePngDocument({ ...options, variant: 'seven' });
    const full = createLineagePngDocument({ ...options, variant: 'full' });
    expect(seven.sections).toHaveLength(7); expect(full.sections).toHaveLength(31);
    expect(seven.subtitle.join(' ')).toContain('기본 상성 25점');
    expect(seven.audit?.lineage?.plan.nodes.parentA!.costumeId).toBe('costume_b');
    expect(seven.audit?.lineage?.instances.parentA!.factorInstanceId).toBe(inputs.factorInstances.parentA!.factorInstanceId);
    expect(seven.sections[1]!.image).toEqual({ kind: 'costume', canonicalId: 'costume_b', alt: fixture.snapshot.costumes.find((row) => row.costumeId === 'costume_b')!.displayName });
    expect(seven.footnotes.filter((line) => line.includes('© Cygames'))).toEqual(['게임 이미지 © Cygames · 로컬 참고용 · 공개 재배포 허가 미확인']);
    expect(full.footnotes.filter((line) => line.includes('© Cygames'))).toEqual(seven.footnotes.filter((line) => line.includes('© Cygames')));
    const sevenTree = seven.visual?.kind === 'lineage' ? seven.visual : undefined;
    const fullTree = full.visual?.kind === 'lineage' ? full.visual : undefined;
    expect(sevenTree?.geometry.edges).toHaveLength(6); expect(fullTree?.geometry.edges).toHaveLength(30);
    expect(fullTree?.geometry.nodes.slice(0, 7)).toEqual(sevenTree?.geometry.nodes);
    const layout = layoutPngDocument(full, (text, size) => [...text].length * size * 0.6);
    expect(layout.width).toBeGreaterThan(3000); expect(layout.height).toBeLessThan(2500);
    expect(layout.images).toHaveLength(7); expect(layout.connectors).toHaveLength(30);
    const printed = layout.lines.map((line) => line.text).join('');
    expect(printed).not.toMatch(/nodeId|costumeId|ancestor_30|unentered|snapshot|SHA-256/);
    for (const owner of Object.values(inputs.factorInstances)) expect(printed).not.toContain(owner.factorInstanceId);
    expect(options).toEqual(before);
  });
  it('preserves unconfirmed bloodlines and blocks oversized images instead of truncating', () => {
    const changed = structuredClone(inputs); changed.factorInstances.parentA!.bloodlineStatus = 'unconfirmed';
    const document = createLineagePngDocument({ ...options, inputs: changed, affinity: null, aptitudes: null, variant: 'full' });
    expect(document.subtitle[0]).toContain('인증 보류');
    const layout = layoutPngDocument(document, (text, size) => [...text].length * size, 1200);
    expect(layout.width).toBeGreaterThan(3000); expect(layout.lines.every((line) => line.x >= 48 && line.y < layout.height)).toBe(true);
    expect(layout.images.every((image) => image.x + image.width < layout.width && image.y + image.height < layout.height)).toBe(true);
    expect(document.audit?.lineage?.plan.nodes.ancestor_30).toBeDefined();
    expect(layout.lines.map((line) => line.text).join('')).not.toContain('ancestor_30');
    expect(() => layoutPngDocument({ title: '과대 문서', subtitle: [], sections: [{ title: '길이 검사', lines: Array(2000).fill('한 줄') }], footnotes: [] }, (text) => text.length)).toThrow('정보량');
  });
  it('matches the UI inherited bloodline protection and does not ask the final runner for a red factor', () => {
    const protectedInputs = structuredClone(inputs);
    protectedInputs.referencePlan.nodes.grandB2!.locked = true;
    protectedInputs.referencePlan.nodes.target!.redFactor = null;
    const before = structuredClone(protectedInputs);
    const document = createLineagePngDocument({ ...options, inputs: protectedInputs, variant: 'full' });
    if (document.visual?.kind !== 'lineage') throw new Error('Expected lineage tree');
    expect(new Set(document.visual.nodes.filter((node) => node.locked).map((node) => node.nodeId))).toEqual(getProtectedNodeIds(protectedInputs.referencePlan));
    expect(document.visual.nodes.find((node) => node.nodeId === 'target')!.factor).toBe('본육성 대상');
    expect(document.audit?.lineage?.plan).toEqual(protectedInputs.referencePlan);
    expect(document.audit?.lineage?.instances).toEqual(protectedInputs.factorInstances);
    expect(protectedInputs).toEqual(before);
  });
  it('outputs actual card IDs, compatible targets and uncertainty without importing old potential unions', () => {
    const request: P4RecommendationRequest = { course: { courseId: '10903', distanceM: 1600, surface: 'turf', trackId: '10009', rotation: 1, season: 1, weather: 1, groundCondition: 1 }, runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true };
    const result = recommendSupportDecks(actual, request); const deck = result.recommendations[0]!;
    const document = createSupportPngDocument({ title: '실제 발췌 데이터', snapshot: actual, request, result, deck,
      eventLabel: '한신 1600m', scenarioLabel: '기본 시나리오', priorities: [], scopeLabel: '현재', snapshotIds });
    for (const card of deck.cards) expect(document.audit?.support?.supportIds).toContain(card.supportId);
    expect(document.sections.flatMap((section) => section.image ? [section.image.canonicalId] : [])).toEqual(deck.cards.map((card) => card.supportId));
    expect(document.visual?.kind === 'support' && document.visual.rows).toHaveLength(deck.compatibleSkillIds.length);
    if (document.visual?.kind === 'support') expect(document.visual.cards.every((card) => card.details.includes('가상'))).toBe(true);
    expect(document.audit?.support?.deck).toEqual(deck);
    expect(document.footnotes.filter((line) => line.includes('© Cygames'))).toEqual(['게임 이미지 © Cygames · 로컬 참고용 · 공개 재배포 허가 미확인']);
    expect(() => createSupportPngDocument({ title: '없는 편성', snapshot: actual, request, result, deck: { ...deck, deckId: 'unverified-deck' }, eventLabel: '', scenarioLabel: '', priorities: [], scopeLabel: '', snapshotIds })).toThrow('현재 추천 결과');
  });
  it('rejects stale exports before accessing browser canvas/font APIs', async () => {
    const current = vi.fn(() => 'new-input');
    await expect(downloadPngDocument({ title: 'old', subtitle: [], sections: [], footnotes: [] }, { filename: 'old.png', resultSignature: 'old-input', getCurrentSignature: current })).rejects.toThrow('이전 결과');
    expect(current).toHaveBeenCalledOnce();
  });
  it('prints all and only current compatible skill rows, ordered by goals, with checked routes retained off-canvas', () => {
    const request: P4RecommendationRequest = { course: { courseId: '10903', distanceM: 1600, surface: 'turf', trackId: '10009', rotation: 1, season: 1, weather: 1, groundCondition: 1 }, runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true };
    const result = recommendSupportDecks(actual, request); const deck = result.recommendations[0]!;
    const skillId = deck.compatibleSkillIds.at(-1)!;
    const verifiedRoutes = getCompatiblePlanRoutes(actual, deck);
    const document = createSupportPngDocument({ title: '수급표', snapshot: actual, request, result, deck, eventLabel: '한신 1600m', scenarioLabel: '기본', priorities: [{ skillId, priority: 'required' }], scopeLabel: '현재', snapshotIds, verifiedRoutes });
    if (document.visual?.kind !== 'support') throw new Error('Expected support visual projection');
    expect(document.visual.rows[0]!.skillId).toBe(skillId);
    expect(new Set(document.visual.rows.map((row) => row.skillId))).toEqual(new Set(deck.compatibleSkillIds));
    expect(document.visual.rows.flatMap((row) => row.routes).every((route) => verifiedRoutes.some((checked) => JSON.stringify(checked) === JSON.stringify(route)))).toBe(true);
    expect(document.audit?.support?.eventDecisions).toEqual(deck.eventDecisions);
    const layout = layoutPngDocument(document, (text, size) => [...text].length * size * 0.6);
    const printed = layout.lines.map((line) => line.text).join('');
    expect(layout.images).toHaveLength(6); expect(layout.width).toBe(2080);
    for (const name of ['스킬 수급표', '공급 서포트', '수급 경로', '조건·확실성']) expect(printed).toContain(name);
    for (const row of document.visual.rows) expect(printed).toContain(row.name);
    for (const id of [...deck.compatibleSkillIds, ...deck.cards.map((card) => card.supportId)]) expect(printed).not.toContain(`[${id}]`);
    expect(printed).not.toMatch(/snapshot|source_unspecified|supportId|nodeId|trainers-|300×400|128×128/);
    expect(document.audit?.snapshotIds).toEqual(snapshotIds);
    expect(document.audit?.support?.request).toEqual(request);
    // Presentation-only status intersection: an unresolved alternative event
    // must not erase this already compatible route or falsely call it excluded.
    deck.unresolvedEventSkillIds = [skillId];
    const withUnresolvedAlternative = createSupportPngDocument({ title: '별도 경로 보존', snapshot: actual, request, result, deck, eventLabel: '', scenarioLabel: '', priorities: [], scopeLabel: '현재', snapshotIds, verifiedRoutes });
    if (withUnresolvedAlternative.visual?.kind !== 'support') throw new Error('Expected support table');
    expect(withUnresolvedAlternative.visual.rows.some((row) => row.skillId === skillId)).toBe(true);
    expect(withUnresolvedAlternative.visual.notes.join(' ')).toContain('별도 양립 경로 유지');
    expect(withUnresolvedAlternative.visual.notes.join(' ')).not.toContain('확보표에서 제외');
    const firstRow = document.visual.rows[0]!;
    document.visual.rows = Array.from({ length: 1800 }, () => structuredClone(firstRow));
    expect(() => layoutPngDocument(document, (text, size) => [...text].length * size * 0.6)).toThrow('정보량');
  });
  it('keeps current unverified target diagnostics visible even when its acquisition opportunity is attained', () => {
    const request: P4RecommendationRequest = { course: { courseId: '10903', distanceM: 1600, surface: 'turf', trackId: '10009', rotation: 1, season: 1, weather: 1, groundCondition: 1 }, runningStyle: 'pace', cutoffDate: '2026-11-05', includeUnknown: true };
    const result = recommendSupportDecks(actual, request); const deck = result.recommendations[0]!;
    const skillId = deck.compatibleSkillIds[0]!; const row = result.skillEvaluations.find((item) => item.skillId === skillId)!;
    // Presentation-only diagnostics fixture. It asserts no new game condition,
    // acquisition rule or numeric evaluation beyond the existing current result.
    result.skillPriorities = { selections: [{ skillId, priority: 'required' }], policy: { preferred: 8, strong: 24 }, targets: [{
      skillId, priority: 'required', attained: true, grade: 'unverified', applicability: 'unverified', availability: row.availability,
      warnings: ['표시 검사: 효과·조건 검증 보류'], availableSourceSupportIds: [], eligibleSourceSupportIds: [], candidateSourceSupportIds: [], potentialSourceSupportIds: [],
    }] };
    result.warnings.push('표시 검사: 기존 전체 결과 경고');
    const document = createSupportPngDocument({ title: '현재 미검증 진단 표시', snapshot: actual, request, result, deck, eventLabel: '한신 1600m', scenarioLabel: '기본', priorities: [{ skillId, priority: 'required' }], scopeLabel: '현재', snapshotIds });
    expect(document.subtitle.join(' ')).toContain('양립 경로 있음');
    expect(document.visual?.kind === 'support' && document.visual.rows.find((item) => item.skillId === skillId)?.certainty).toContain('효과·조건 검증 보류');
    expect(document.audit?.support?.priorityDiagnostics?.targets[0]?.warnings).toContain('표시 검사: 효과·조건 검증 보류');
    expect(document.audit?.support?.warnings).toContain('표시 검사: 기존 전체 결과 경고');
  });
  it('checks freshness again after an asynchronous font wait and never creates a stale canvas', async () => {
    let releaseFonts!: () => void;
    const ready = new Promise<void>((resolve) => { releaseFonts = resolve; });
    const createElement = vi.fn();
    vi.stubGlobal('document', { fonts: { ready }, createElement });
    let signature = 'matching';
    try {
      const pending = downloadPngDocument({ title: 'fresh', subtitle: [], sections: [], footnotes: [] }, { filename: 'fresh.png', resultSignature: 'matching', getCurrentSignature: () => signature });
      signature = 'changed-during-font-wait'; releaseFonts();
      await expect(pending).rejects.toThrow('이전 결과');
      expect(createElement).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('P8.5 canonical PNG artwork and asynchronous isolation', () => {
  const reference = { kind: 'costume' as const, canonicalId: '100101', alt: '동일 ID의 육성 의상' };
  const document: PngDocument = { title: '이미지와 소유 ID', subtitle: [], sections: [
    { title: '부모 A · 원래 의상', lines: ['보유 인자 ★★ / 부모 연결 grandA1, grandA2'], image: reference },
  ], footnotes: ['기존 입력 보존'] };
  const guard = { filename: 'canonical.png', resultSignature: 'current', getCurrentSignature: () => 'current' };
  const picture = { naturalWidth: 256, naturalHeight: 256 } as HTMLImageElement;
  const asset = (canonicalId: string, src = `/game-assets/${canonicalId}.png`): NonNullable<ReturnType<PngAssetResolver>> => ({ canonicalId, src, sourceAssetId: canonicalId, mappingStatus: 'mapped', width: 256, height: 256, mimeType: 'image/png', sourceUrl: 'https://example.invalid/canonical-source', rightsStatus: 'pending', publicRedistribution: 'not-verified', usageScope: 'local-reference', variant: 'thumbnail' });

  it('deduplicates repeated owners by kind and canonical ID without conflating a support and costume', async () => {
    const resolver = vi.fn<PngAssetResolver>((kind, id) => asset(id, `/game-assets/${kind}/${id}.webp`));
    const loader = vi.fn(async () => picture);
    const repeated: PngDocument = { ...document, sections: [...document.sections, { ...document.sections[0]! }, { title: '서포트', lines: ['동일 숫자라도 별도 유형'], image: { kind: 'support', canonicalId: reference.canonicalId, alt: '실제 카드' } }] };
    const images = await preparePngImages(repeated, guard, resolver, loader);
    expect(images.size).toBe(2); expect(loader).toHaveBeenCalledTimes(2);
    expect(images.get('costume:100101')?.image).toBe(picture);
    expect(images.get('support:100101')?.image).toBe(picture);
    expect(resolver.mock.calls).toEqual([['costume', '100101', 'art'], ['support', '100101', 'art']]);
  });

  it('uses only a manifest-approved same-ID thumbnail when art is unavailable', async () => {
    const resolver = vi.fn<PngAssetResolver>((_, id, variant) => variant === 'art' ? null : asset(id, `/game-assets/thumbnails/${id}.webp`));
    const loader = vi.fn(async () => picture);
    const images = await preparePngImages(document, guard, resolver, loader);
    expect(resolver.mock.calls).toEqual([['costume', '100101', 'art'], ['costume', '100101', 'thumbnail']]);
    expect(loader).toHaveBeenCalledWith('/game-assets/thumbnails/100101.webp');
    expect(images.get('costume:100101')?.status).toBe('loaded');
  });

  it('blocks mismapped IDs before loading and keeps names, links, stars and source text on missing/failed art', async () => {
    const before = structuredClone(document); const loader = vi.fn(async () => null);
    const wrong = await preparePngImages(document, guard, () => asset('100102'), loader);
    expect(wrong.get('costume:100101')?.status).toBe('identity-mismatch');
    expect(loader).not.toHaveBeenCalled();
    const absent = await preparePngImages(document, guard, () => null, loader);
    expect(absent.get('costume:100101')?.status).toBe('unavailable');
    const failed = await preparePngImages(document, guard, () => asset('100101'), loader);
    expect(failed.get('costume:100101')?.status).toBe('failed');
    const layout = layoutPngDocument(document, (text, size) => [...text].length * size * 0.6);
    expect(layout.lines.map((line) => line.text).join('')).toContain('보유 인자 ★★ / 부모 연결 grandA1, grandA2');
    expect(document).toEqual(before);
  });

  it('wraps long names beside artwork without overlap and returns to the full text width below it', () => {
    const long: PngDocument = { ...document, sections: [{ ...document.sections[0]!, title: '아주긴의상명○◎★★★'.repeat(8), lines: Array(30).fill('백인자와 부모 연결을 보존합니다.') }] };
    const layout = layoutPngDocument(long, (text, size) => [...text].length * size * 0.6, 480);
    const box = layout.images[0]!;
    expect(layout.lines.every((line) => line.x >= 52 && line.x < layout.width - 52 && line.y < layout.height)).toBe(true);
    expect(layout.lines.filter((line) => line.y >= box.y && line.y < box.y + box.height + 24).every((line) => line.x >= box.x + box.width + 24)).toBe(true);
    expect(layout.lines.some((line) => line.y >= box.y + box.height + 24 && line.x === 52)).toBe(true);
    expect(layout.lines.map((line) => line.text).join('')).toContain('아주긴의상명○◎★★★'.repeat(8));
  });

  it('rejects input changes while actual image loading is pending', async () => {
    let complete!: (image: HTMLImageElement | null) => void;
    const pendingImage = new Promise<HTMLImageElement | null>((resolve) => { complete = resolve; });
    let signature = 'current';
    const pending = preparePngImages(document, { ...guard, getCurrentSignature: () => signature }, () => asset('100101'), () => pendingImage);
    signature = 'another-plan'; complete(picture);
    await expect(pending).rejects.toThrow('이전 결과');
  });

  it('caches successful browser image loads but retries failures with anonymous CORS and no substitute source', async () => {
    let created = 0; let shouldFail = false;
    const requests: { src: string; crossOrigin: string; decoding: string }[] = [];
    vi.stubGlobal('Image', class {
      crossOrigin = ''; decoding = ''; naturalWidth = 256; naturalHeight = 256;
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor() { created++; }
      set src(value: string) {
        requests.push({ src: value, crossOrigin: this.crossOrigin, decoding: this.decoding });
        queueMicrotask(() => { if (shouldFail) this.onerror?.(); else this.onload?.(); });
      }
    });
    try {
      const one = loadCachedPngImage('/test/p85-success.webp'); const two = loadCachedPngImage('/test/p85-success.webp');
      expect(one).toBe(two); expect(await one).toBeTruthy(); expect(created).toBe(1);
      shouldFail = true; expect(await loadCachedPngImage('/test/p85-retry.webp')).toBeNull();
      shouldFail = false; expect(await loadCachedPngImage('/test/p85-retry.webp')).toBeTruthy();
      expect(created).toBe(3);
      expect(requests.every((request) => request.crossOrigin === 'anonymous' && request.decoding === 'async')).toBe(true);
      expect(requests.map((request) => request.src)).toEqual(['/test/p85-success.webp', '/test/p85-retry.webp', '/test/p85-retry.webp']);
    } finally { vi.unstubAllGlobals(); }
  });
});
