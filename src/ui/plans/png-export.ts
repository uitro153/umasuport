import type { DeepReadonly } from '../../data/snapshot';
import type { WorkspaceInputs, SavedPlan } from '../../domain/saved-plan';
import type { ReferenceSnapshot } from '../../domain/reference';
import type { P3Snapshot } from '../../domain/skill-support';
import { getLineageSlots, getProtectedNodeIds } from '../../domain/lineage';
import { APTITUDE_LABELS, type AptitudeResult } from '../../engine/aptitude';
import type { ReferencePedigreeResult } from '../../engine/reference-pedigree';
import type { P4DeckRecommendation, P4RecommendationRequest, P4RecommendationResult } from '../../engine/support-deck-optimizer';
import type { UserSkillPriority } from '../../engine/skill-priorities';
import type { SkillAcquisitionRoute } from '../../engine/support-acquisition';
import { resolveGameAsset } from '../../data/game-assets';
import { getLineageTreeGeometry, type LineageTreeGeometry } from '../lineage/tree-geometry';

/** Canonical identity stays in the projection and tests, never in its printed label. */
export interface PngImageReference { kind: 'costume' | 'support'; canonicalId: string; alt: string }
interface PngSection { title: string; lines: string[]; image?: PngImageReference }
export interface PngLineageNode {
  nodeId: string; character: string; outfit: string; factor: string; locked: boolean;
  image?: PngImageReference;
}
export interface PngSkillRow {
  skillId: string; name: string; group: string; suppliers: string; paths: string; certainty: string;
  routes: SkillAcquisitionRoute[]; priority: UserSkillPriority['priority'] | null;
}
interface PngSupportCard { supportId: string; name: string; details: string; image: PngImageReference }
/** Presentation only. Audit data is retained for machine inspection, not painted. */
export interface PngDocument {
  title: string; subtitle: string[]; sections: PngSection[]; footnotes: string[];
  visual?: { kind: 'lineage'; geometry: LineageTreeGeometry; nodes: PngLineageNode[] }
    | { kind: 'support'; cards: PngSupportCard[]; rows: PngSkillRow[]; notes: string[] };
  audit?: {
    snapshotIds: SavedPlan['snapshotIds'];
    lineage?: { plan: WorkspaceInputs['referencePlan']; instances: WorkspaceInputs['factorInstances']; whiteFactors: WorkspaceInputs['whiteFactors'] };
    support?: { supportIds: string[]; compatibleSkillIds: string[]; verifiedRoutes: SkillAcquisitionRoute[]; eventDecisions: P4DeckRecommendation['eventDecisions']; warnings: string[];
      request: P4RecommendationRequest; deck: P4DeckRecommendation; priorityDiagnostics?: P4RecommendationResult['skillPriorities'] };
  };
}
export interface PngExportGuard {
  filename: string; resultSignature: string; getCurrentSignature: () => string;
}
const priorityLabels = { required: '필수', strong: '강력 우선', preferred: '우선' };
const styleLabels = { front: '도주', pace: '선행', late: '선입', end: '추입' };
const typeLabels: Record<string, string> = { speed: '스피드', stamina: '스태미나', power: '파워', guts: '근성', intelligence: '지능', friend: '친구', group: '그룹' };
const routeLabels = { hint: '일반 힌트', event: '이벤트', 'gold-lower': '금색 하위' };
const preferenceLabels = { balanced: '균형 우선', skills: '스킬 수급 우선', stability: '육성 안정성 우선' };
const imageRightsNote = '게임 이미지 © Cygames · 로컬 참고용 · 공개 재배포 허가 미확인';
const factorText = (factor: WorkspaceInputs['referencePlan']['nodes'][string]['redFactor']) => factor ? `${APTITUDE_LABELS[factor.type]} ${'★'.repeat(factor.stars)}` : '적인자 미입력';
const cleanScenario = (label: string) => label.replace(/\s*\[\d+\]\s*$/u, '').trim();
const shortCardName = (name: string) => name.split(/\s*\[/u)[0] || name;

/** Use already calculated values. No affinity/allocator/optimizer runs here. */
export function createLineagePngDocument(options: {
  title: string; inputs: WorkspaceInputs; reference: DeepReadonly<ReferenceSnapshot>;
  snapshotIds: SavedPlan['snapshotIds']; affinity: ReferencePedigreeResult | null;
  aptitudes: AptitudeResult | null; variant: 'seven' | 'full';
}): PngDocument {
  const { inputs, reference, affinity, aptitudes } = options;
  const costumes = new Map(reference.costumes.map((row) => [row.costumeId, row]));
  const protectedIds = getProtectedNodeIds(inputs.referencePlan);
  const geometry = getLineageTreeGeometry(inputs.referencePlan, options.variant === 'full');
  const nodes = geometry.nodes.map((slot): PngLineageNode => {
    const node = inputs.referencePlan.nodes[slot.nodeId]!;
    const isMob = slot.depth > 2;
    const costume = !isMob && node.costumeId ? costumes.get(node.costumeId) : undefined;
    return { nodeId: slot.nodeId, character: isMob ? '모브' : costume?.nameKo ?? costume?.nameJa ?? '캐릭터 미정',
      outfit: costume?.outfitKo ?? costume?.outfitJa ?? '', factor: slot.depth === 0 && !node.redFactor ? '본육성 대상' : factorText(node.redFactor), locked: protectedIds.has(slot.nodeId),
      ...(!isMob && node.costumeId ? { image: { kind: 'costume' as const, canonicalId: node.costumeId, alt: costume?.displayName ?? '선택한 육성마' } } : {}) };
  });
  const realOwners = new Set(getLineageSlots(inputs.referencePlan).filter(slot => slot.depth <= 2).map(slot => slot.nodeId));
  const unconfirmed = Object.entries(inputs.factorInstances).some(([id,item]) => realOwners.has(id) && item.bloodlineStatus === 'unconfirmed');
  const status = unconfirmed ? '혈통 재확인 필요 · 상성·적성 인증 보류'
    : affinity?.previewTotal !== null && affinity?.previewTotal !== undefined ? `기본 상성 ${affinity.previewTotal}점 · 공개 계산식 · 한국 실측 대기` : '기본 상성 계산 대기';
  const aptitudeSummary = !unconfirmed && aptitudes ? aptitudes.changes.map((row) => `${APTITUDE_LABELS[row.type]} ${row.base}→${row.result}`) : [];
  return {
    title: `${options.title} · ${options.variant === 'full' ? '31인 계보 — 수동 적인자 설계' : '7인 계보'}`,
    subtitle: [status, ...(aptitudeSummary.length ? [aptitudeSummary.slice(0, 6).join('   '), aptitudeSummary.slice(6).join('   ')].filter(Boolean) : []),
      `기준일 ${inputs.referenceFilters.dateInput} · ${inputs.referenceFilters.allowForecast ? '미래시 포함' : '현재 출시 기준'}`],
    sections: nodes.map((node) => ({ title: `${geometry.nodes.find((box) => box.nodeId === node.nodeId)!.label} · ${node.character}`, lines: [node.outfit, node.factor, ...(node.locked ? ['혈통 고정'] : [])], ...(node.image ? { image: node.image } : {}) })),
    footnotes: [imageRightsNote], visual: { kind: 'lineage', geometry, nodes },
    audit: { snapshotIds: structuredClone(options.snapshotIds), lineage: { plan: structuredClone(inputs.referencePlan), instances: structuredClone(inputs.factorInstances), whiteFactors: structuredClone(inputs.whiteFactors) } },
  };
}

/** The table uses only the displayed compatible plan, never a potential union. */
export function createSupportPngDocument(options: {
  title: string; snapshot: DeepReadonly<P3Snapshot>; request: P4RecommendationRequest;
  result: P4RecommendationResult; deck: P4DeckRecommendation; eventLabel: string;
  scenarioLabel: string; priorities: readonly UserSkillPriority[]; scopeLabel: string;
  snapshotIds: SavedPlan['snapshotIds']; verifiedRoutes?: readonly SkillAcquisitionRoute[];
  comparison?: { gainedSkillIds: readonly string[]; lostSkillIds: readonly string[] } | null;
}): PngDocument {
  const { snapshot, request, result, deck } = options;
  if (!result.recommendations.includes(deck)) throw new Error('현재 추천 결과에 없는 편성은 출력할 수 없습니다.');
  const skills = new Map(snapshot.skills.map((row) => [row.skillId, row.displayName]));
  const skillName = (id: string) => skills.get(id) ?? '명칭 확인 필요';
  const compatible = new Set(deck.compatibleSkillIds);
  const priorities = new Map(options.priorities.map((row) => [row.skillId, row.priority]));
  const cards = new Map(deck.cards.map((card) => [card.supportId, card]));
  const routeKey = (route: SkillAcquisitionRoute) => `${route.supportId}/${route.skillId}/${route.sourceSkillId}/${route.kind}/${route.sourceServer ?? ''}`;
  const actualRouteKeys = new Set(deck.cards.flatMap((card) => card.routes.map(routeKey)));
  // The UI passes getCompatiblePlanRoutes' checked event branches. Without that
  // explicit projection only the existing hints are certifiable here.
  const verifiedRoutes = (options.verifiedRoutes ?? deck.cards.flatMap((card) => card.routes.filter((route) => route.sourceKind === 'hint')))
    .filter((route) => cards.has(route.supportId) && compatible.has(route.skillId) && actualRouteKeys.has(routeKey(route)));
  const green = new Set(deck.greenSkillIds);
  const rows = deck.compatibleSkillIds.map((skillId): PngSkillRow => {
    const routes = verifiedRoutes.filter((route) => route.skillId === skillId);
    const decisions = deck.eventDecisions.filter((event) => event.skillIds.includes(skillId)
      && routes.some((route) => route.sourceKind === 'event' && route.supportId === event.supportId));
    const hasEvent = routes.some((route) => route.sourceKind === 'event');
    const hasHint = routes.some((route) => route.sourceKind === 'hint');
    const conditions = [...new Set(decisions.map((event) => event.condition).filter((value): value is string => !!value))];
    const confirmedReward = decisions.length > 0 && decisions.every((event) => event.assurance === 'guaranteed');
    const target = result.skillPriorities?.targets.find((item) => item.skillId === skillId);
    const certainty = (!routes.length ? '선택 경로 상세 확인 필요'
      : [hasHint ? '힌트 발생 시' : '', hasEvent ? confirmedReward ? '선택 보상 확인 · 발생 별도' : decisions.length && decisions.every((event) => event.assurance === 'possible') ? '선택 분기 · 획득 기회' : '선택 분기 · 조건 미확인' : '',
        decisions.some((event) => event.outcome === 'success') ? '성공 분기' : decisions.some((event) => event.outcome === 'failure') ? '실패 분기' : '',
        conditions.join(' / '), routes.some((route) => route.sourceServer === 'JP') ? '일본 미래시' : ''].filter(Boolean).join(' · '))
      + (target && (target.grade === 'unverified' || target.applicability === 'unverified') ? ' · 효과·조건 검증 보류' : '');
    return { skillId, name: skillName(skillId), group: priorities.has(skillId) ? `${priorityLabels[priorities.get(skillId)!]} 목표` : green.has(skillId) ? '유효 패시브 스킬' : '그 외 유효 스킬',
      suppliers: [...new Set(routes.map((route) => `${deck.cards.findIndex((card) => card.supportId === route.supportId) + 1}번 ${shortCardName(cards.get(route.supportId)!.name)}`))].join(' / ') || '경로 검토 필요',
      paths: [...new Set(routes.map((route) => `${routeLabels[route.kind]}${route.kind === 'gold-lower' ? `(${route.sourceKind === 'event' ? '이벤트' : '힌트'})` : ''}`))].join(' / ') || '미확인',
      certainty, routes: structuredClone(routes), priority: priorities.get(skillId) ?? null };
  });
  const priorityOrder = (row: PngSkillRow) => row.priority === 'required' ? 0 : row.priority === 'strong' ? 1 : row.priority === 'preferred' ? 2 : green.has(row.skillId) ? 3 : 4;
  rows.sort((a, b) => priorityOrder(a) - priorityOrder(b) || a.name.localeCompare(b.name, 'ko') || a.skillId.localeCompare(b.skillId));
  const visualCards = deck.cards.map((card): PngSupportCard => ({ supportId: card.supportId, name: card.name,
    details: `${typeLabels[card.type] ?? card.type} · ${card.rarity} · ${card.ownership === 'unregistered' ? '가상 ' : ''}${card.limitBreak}돌파${card.ownership === 'borrowed' ? ' · 대여' : ''}`,
    image: { kind: 'support', canonicalId: card.supportId, alt: card.name } }));
  const missed = options.priorities.filter((goal) => !compatible.has(goal.skillId)).map((goal) => `${skillName(goal.skillId)}(${priorityLabels[goal.priority]})`);
  const unresolvedWithoutRoute = deck.unresolvedEventSkillIds.filter((skillId) => !compatible.has(skillId));
  const unresolvedWithAlternateRoute = deck.unresolvedEventSkillIds.filter((skillId) => compatible.has(skillId));
  const notes = [`양립 가능한 선택 경로를 표시했습니다. 힌트·이벤트 발생 및 백인자 획득은 보장하지 않습니다.`,
    ...(missed.length ? [`미확보 목표: ${missed.join(' / ')}`] : []),
    ...(unresolvedWithoutRoute.length ? [`조건 미확인으로 확보표에서 제외: ${unresolvedWithoutRoute.map(skillName).join(' / ')}`] : []),
    ...(unresolvedWithAlternateRoute.length ? [`일부 이벤트 경로 미확인 · 표의 별도 양립 경로 유지: ${unresolvedWithAlternateRoute.map(skillName).join(' / ')}`] : []),
    ...(deck.missingImportantSkillIds.length ? [`놓친 주요 스킬: ${deck.missingImportantSkillIds.map(skillName).join(' / ')}`] : []),
    ...(options.comparison ? [`기본안 대비 얻음: ${options.comparison.gainedSkillIds.map(skillName).join(' / ') || '없음'} · 잃음: ${options.comparison.lostSkillIds.map(skillName).join(' / ') || '없음'}`] : [])];
  return {
    title: `${options.title} · 인자작 서포트 6장`,
    subtitle: [`${options.eventLabel} · ${styleLabels[request.runningStyle]} · ${cleanScenario(options.scenarioLabel)}`,
      options.scopeLabel.replace(/일반 P6/gu, '전역 목표 추천'),
      `${preferenceLabels[request.preference ?? 'balanced']} · 정성 ${deck.score.coverageValue} + 사용자 ${deck.score.preferenceBonus ?? 0} = ${deck.score.customizedValue ?? deck.score.coverageValue}`,
      `양립 목표 ${deck.compatibleSkillIds.length}개 · 패시브 스킬 ${deck.greenSkillIds.length}개 · ${request.forecast && request.allowForecast ? '일본 출시 순서 기반 미래시' : '한국 출시 기준'}`,
      ...(options.priorities.length ? [`적용 목표: ${options.priorities.map((goal) => `${skillName(goal.skillId)}(${priorityLabels[goal.priority]} · ${compatible.has(goal.skillId) ? '양립 경로 있음' : '미충족'})`).join(' / ')}`] : [])],
    sections: visualCards.map((card) => ({ title: card.name, lines: [card.details], image: card.image })),
    footnotes: [imageRightsNote], visual: { kind: 'support', cards: visualCards, rows, notes },
    audit: { snapshotIds: structuredClone(options.snapshotIds), support: { supportIds: deck.cards.map((card) => card.supportId), compatibleSkillIds: [...deck.compatibleSkillIds], verifiedRoutes: structuredClone(verifiedRoutes), eventDecisions: structuredClone(deck.eventDecisions), warnings: [...result.warnings],
      request: structuredClone(request), deck: structuredClone(deck), ...(result.skillPriorities ? { priorityDiagnostics: structuredClone(result.skillPriorities) } : {}) } },
  };
}

export interface PngTextLine { text: string; x: number; y: number; fontSize: number; bold: boolean; color: string }
export interface PngImageBox { reference: PngImageReference; x: number; y: number; width: number; height: number }
export interface PngRectangle { x: number; y: number; width: number; height: number; fill: string; stroke?: string; radius?: number }
export interface PngConnector { points: { x: number; y: number }[] }
export interface PngLayout { width: number; height: number; lines: PngTextLine[]; images: PngImageBox[]; rectangles?: PngRectangle[]; connectors?: PngConnector[] }
type Measure = (text: string, fontSize: number, bold: boolean) => number;

/** Grapheme-safe wrapping also handles long Korean names without spaces. */
export function wrapPngText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  if (!(maxWidth > 0)) throw new RangeError('출력 폭은 양수여야 합니다.');
  const result: string[] = []; const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && measure(line + segment) > maxWidth) { result.push(line.trimEnd()); line = segment.trimStart(); }
      else line += segment;
    }
    result.push(line);
  }
  return result;
}
function assertCanvasSize(width: number, height: number) {
  if (width > 16384 || height > 32760 || width * height > 80_000_000) throw new Error('이미지 정보량이 너무 많습니다. 범위를 줄이거나 JSON 백업을 이용하세요.');
}
function addText(layout: PngLayout, text: string, x: number, y: number, maxWidth: number, size: number, measure: Measure, bold = false, color = '#243449', maxLines = Infinity): number {
  const wrapped = wrapPngText(text, maxWidth, (value) => measure(value, size, bold));
  const visible = wrapped.slice(0, maxLines);
  if (wrapped.length > maxLines && visible.length) {
    let tail = visible[visible.length - 1]!;
    while (tail && measure(`${tail}…`, size, bold) > maxWidth) tail = tail.slice(0, -1);
    visible[visible.length - 1] = `${tail}…`;
  }
  for (const line of visible) { layout.lines.push({ text: line, x, y, fontSize: size, bold, color }); y += Math.ceil(size * 1.4); }
  return y;
}
function addHeader(layout: PngLayout, document: PngDocument, measure: Measure, padding: number): number {
  let y = addText(layout, document.title, padding, padding, layout.width - padding * 2, 32, measure, true, '#113e3b');
  y += 12;
  for (const line of document.subtitle) y = addText(layout, line, padding, y, layout.width - padding * 2, 22, measure);
  return y + 30;
}
function lineageLayout(document: PngDocument, measure: Measure): PngLayout {
  if (document.visual?.kind !== 'lineage') throw new Error('계보 출력 데이터가 없습니다.');
  const { geometry, nodes } = document.visual; const scale = 1.5; const padding = 48;
  const minX = Math.min(...geometry.nodes.map((node) => node.x)) - 24;
  const maxX = Math.max(...geometry.nodes.map((node) => node.x + node.width)) + 24;
  const layout: PngLayout = { width: Math.ceil((maxX - minX) * scale + padding * 2), height: 0, lines: [], images: [], rectangles: [], connectors: [] };
  const top = addHeader(layout, document, measure, padding);
  const x = (value: number) => padding + (value - minX) * scale;
  const y = (value: number) => top + value * scale;
  for (const edge of geometry.edges) {
    layout.connectors!.push({ points: edge.points.map((point) => ({ x: x(point.x), y: y(point.y) })) });
  }
  for (const box of geometry.nodes) {
    const node = nodes.find((item) => item.nodeId === box.nodeId)!;
    const left = x(box.x); const nodeTop = y(box.y); const width = box.width * scale; const height = box.height * scale;
    layout.rectangles!.push({ x: left, y: nodeTop, width, height, fill: node.locked ? '#f2f3e9' : '#f5faf8', stroke: node.locked ? '#b2a05a' : '#bed8ce', radius: 14 });
    const inner = 12 * scale; const size = (box.depth >= 3 ? 12 : 14) * scale;
    let textY = addText(layout, `${box.label}${node.locked ? ' · 고정' : ''}`, left + inner, nodeTop + inner, width - inner * 2, (box.depth >= 3 ? 10 : 11) * scale, measure, false, '#5b7770', 1);
    const portrait = (box.depth >= 4 ? 38 : box.depth === 3 ? 44 : 70) * scale;
    if (node.image) layout.images.push({ reference: node.image, x: left + (width - portrait) / 2, y: textY + 3, width: portrait, height: portrait });
    else if (box.depth <= 2) addText(layout, '미선택', left + inner, textY + portrait / 3, width - inner * 2, size, measure, false, '#78918a', 1);
    textY += portrait + 8;
    textY = addText(layout, node.character, left + inner, textY, width - inner * 2, size, measure, true, '#174e47', 1);
    if (box.depth <= 2 && node.outfit) addText(layout, node.outfit, left + inner, textY, width - inner * 2, 11 * scale, measure, false, '#526c65', 2);
    addText(layout, node.factor, left + inner, nodeTop + height - 30 * scale, width - inner * 2, 13 * scale, measure, true, '#9b3648', 1);
  }
  const footerY = top + geometry.height * scale + 12;
  layout.height = addText(layout, document.footnotes.join(' · '), padding, footerY, layout.width - padding * 2, 16, measure, false, '#698078') + padding;
  assertCanvasSize(layout.width, layout.height); return layout;
}
function supportLayout(document: PngDocument, measure: Measure): PngLayout {
  if (document.visual?.kind !== 'support') throw new Error('서포트 출력 데이터가 없습니다.');
  const { cards, rows, notes } = document.visual; const padding = 48; const gap = 24;
  const layout: PngLayout = { width: 2080, height: 0, lines: [], images: [], rectangles: [] };
  let top = addHeader(layout, document, measure, padding);
  const cardWidth = (layout.width - padding * 2 - gap * 2) / 3;
  const cardHeight = Math.max(248, ...cards.map((card) => 104
    + wrapPngText(card.name, cardWidth - 204, (value) => measure(value, 25, true)).length * 35
    + wrapPngText(card.details, cardWidth - 204, (value) => measure(value, 21, false)).length * 30));
  cards.forEach((card, index) => {
    const x = padding + (index % 3) * (cardWidth + gap); const y = top + Math.floor(index / 3) * (cardHeight + gap);
    layout.rectangles!.push({ x, y, width: cardWidth, height: cardHeight, fill: '#f4faf8', stroke: '#bdd8ce', radius: 14 });
    layout.images.push({ reference: card.image, x: x + 16, y: y + 16, width: 150, height: 200 });
    let textY = addText(layout, card.name, x + 184, y + 30, cardWidth - 204, 25, measure, true, '#174e47');
    textY = addText(layout, card.details, x + 184, textY + 14, cardWidth - 204, 21, measure);
    addText(layout, `${index + 1}번 카드`, x + 184, Math.max(textY + 20, y + 178), cardWidth - 204, 18, measure, false, '#688078');
  });
  top += 2 * (cardHeight + gap) + 18;
  top = addText(layout, '스킬 수급표', padding, top, layout.width - padding * 2, 30, measure, true, '#174e47') + 8;
  top = addText(layout, '필수·우선 목표 → 유효 패시브 스킬 → 그 외 유효 스킬 · 양립 가능한 경로 기준', padding, top, layout.width - padding * 2, 20, measure, false, '#526c65') + 18;
  const columnWidth = (layout.width - padding * 2 - gap) / 2;
  const cellWidths = [230, 210, 168, columnWidth - 608];
  const half = Math.ceil(rows.length / 2); const bottoms: number[] = [];
  for (let table = 0; table < 2; table++) {
    const left = padding + table * (columnWidth + gap); let y = top;
    layout.rectangles!.push({ x: left, y, width: columnWidth, height: 48, fill: '#1d5c50', radius: 5 });
    let x = left;
    ['스킬명', '공급 서포트', '수급 경로', '조건·확실성'].forEach((label, index) => { addText(layout, label, x + 10, y + 12, cellWidths[index]! - 20, 20, measure, true, '#ffffff'); x += cellWidths[index]!; });
    y += 48;
    for (const row of rows.slice(table * half, (table + 1) * half)) {
      const cells = [`${row.name}\n${row.group}`, row.suppliers, row.paths, row.certainty];
      const lineCount = Math.max(...cells.map((text, index) => wrapPngText(text, cellWidths[index]! - 20, (value) => measure(value, 18, index === 0)).length));
      const height = Math.max(66, lineCount * 26 + 20);
      layout.rectangles!.push({ x: left, y, width: columnWidth, height, fill: row.priority ? '#fff5d9' : row.group === '유효 패시브 스킬' ? '#e8f5e8' : '#f6f9f7', stroke: '#d8e5de' });
      let x = left;
      cells.forEach((text, index) => { addText(layout, text, x + 10, y + 10, cellWidths[index]! - 20, 18, measure, index === 0, index === 0 ? '#174e47' : '#344d46'); x += cellWidths[index]!; });
      y += height;
    }
    bottoms.push(y);
  }
  top = Math.max(...bottoms) + 30;
  for (const note of notes) top = addText(layout, note, padding, top, layout.width - padding * 2, 20, measure, false, '#526c65') + 8;
  top += 10;
  layout.height = addText(layout, document.footnotes.join(' · '), padding, top, layout.width - padding * 2, 16, measure, false, '#698078') + padding;
  assertCanvasSize(layout.width, layout.height); return layout;
}

/** Visual exports use their safe natural size. Generic diagnostic documents keep the legacy wrapper. */
export function layoutPngDocument(document: PngDocument, measure: Measure, width = 1200): PngLayout {
  if (document.visual?.kind === 'lineage') return lineageLayout(document, measure);
  if (document.visual?.kind === 'support') return supportLayout(document, measure);
  if (width < 480 || width > 2400) throw new RangeError('PNG 폭은 480~2400px 범위여야 합니다.');
  const padding = 52; const layout: PngLayout = { width, height: 0, lines: [], images: [] }; let y = padding;
  let imageBottom = 0; let imageTextStart = padding;
  const add = (text: string, fontSize: number, bold = false, color = '#243449') => {
    for (const paragraph of text.split('\n')) {
      let remaining = paragraph;
      do {
        const x = y < imageBottom ? imageTextStart : padding;
        const line = wrapPngText(remaining, width - padding - x, (value) => measure(value, fontSize, bold))[0] ?? '';
        layout.lines.push({ text: line, x, y, fontSize, bold, color }); y += Math.ceil(fontSize * 1.5);
        remaining = remaining.slice(line.length).trimStart();
      } while (remaining.length);
    }
  };
  add(document.title, 34, true, '#102c40'); y += 14; document.subtitle.forEach((line) => add(line, 23));
  for (const section of document.sections) {
    y += 25;
    if (section.image) {
      const imageWidth = width < 700 ? 104 : 128; const imageHeight = section.image.kind === 'support' ? Math.ceil(imageWidth * 4 / 3) : imageWidth;
      layout.images.push({ reference: section.image, x: padding, y, width: imageWidth, height: imageHeight }); imageBottom = y + imageHeight + 24; imageTextStart = padding + imageWidth + 24;
    } else { imageBottom = 0; imageTextStart = padding; }
    add(section.title, 27, true, '#086b65'); (section.lines.length ? section.lines : ['없음']).forEach((line) => add(line, 22));
    y = Math.max(y, imageBottom); imageBottom = 0; imageTextStart = padding;
  }
  y += 30; document.footnotes.forEach((line) => add(line, 19, false, '#526273')); layout.height = y + padding;
  assertCanvasSize(layout.width, layout.height); return layout;
}

function assertCurrent(guard: PngExportGuard) {
  if (!guard.resultSignature || guard.resultSignature !== guard.getCurrentSignature()) throw new Error('입력이 변경되어 이전 결과는 출력할 수 없습니다. 현재 조건으로 다시 계산하세요.');
}

type ResolvedPngAsset = NonNullable<ReturnType<typeof resolveGameAsset>>;
export type PngAssetResolver = (kind: PngImageReference['kind'], id: string, variant: 'thumbnail' | 'art') => ResolvedPngAsset | null;
export interface PreparedPngImage {
  reference: PngImageReference;
  image: HTMLImageElement | null;
  status: 'loaded' | 'unavailable' | 'failed' | 'identity-mismatch';
}
const imageKey = (reference: PngImageReference) => `${reference.kind}:${reference.canonicalId}`;
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const MAX_CACHED_IMAGES = 96;

/** Load only selected canonical assets. Failed loads can be retried; no other
 * character/card image is substituted. Browser CORS is never bypassed. */
export function loadCachedPngImage(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src);
  if (cached) { imageCache.delete(src); imageCache.set(src, cached); return cached; }
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const picture = new Image();
    let finished = false;
    const complete = (value: HTMLImageElement | null) => {
      if (finished) return;
      finished = true; clearTimeout(timeout); picture.onload = null; picture.onerror = null;
      resolve(value);
    };
    const timeout = setTimeout(() => complete(null), 10000);
    picture.crossOrigin = 'anonymous'; picture.decoding = 'async';
    picture.onload = () => complete(picture.naturalWidth > 0 && picture.naturalHeight > 0 ? picture : null);
    picture.onerror = () => complete(null);
    picture.src = src;
  });
  imageCache.set(src, pending);
  void pending.then((image) => {
    if (!image && imageCache.get(src) === pending) imageCache.delete(src);
  }, () => { if (imageCache.get(src) === pending) imageCache.delete(src); });
  while (imageCache.size > MAX_CACHED_IMAGES) imageCache.delete(imageCache.keys().next().value!);
  return pending;
}

/** Separate from rendering to verify exact IDs and asynchronous freshness. */
export async function preparePngImages(
  document: PngDocument, guard: PngExportGuard,
  resolver: PngAssetResolver = resolveGameAsset,
  loader: (src: string) => Promise<HTMLImageElement | null> = loadCachedPngImage,
): Promise<Map<string, PreparedPngImage>> {
  assertCurrent(guard);
  const references = new Map(document.sections.flatMap((section) => section.image ? [[imageKey(section.image), section.image] as const] : []));
  const prepared = await Promise.all([...references].map(async ([key, reference]): Promise<[string, PreparedPngImage]> => {
    // Both variants must pass the manifest's same-ID and usage gates. This is
    // a resolution fallback, never a different costume or support card.
    const asset = resolver(reference.kind, reference.canonicalId, 'art') ?? resolver(reference.kind, reference.canonicalId, 'thumbnail');
    if (!asset) return [key, { reference, image: null, status: 'unavailable' }];
    if (asset.canonicalId !== reference.canonicalId) return [key, { reference, image: null, status: 'identity-mismatch' }];
    let image: HTMLImageElement | null;
    try { image = await loader(asset.src); } catch { image = null; }
    assertCurrent(guard);
    return [key, { reference, image, status: image ? 'loaded' : 'failed' }];
  }));
  assertCurrent(guard);
  return new Map(prepared);
}

function drawPngImage(context: CanvasRenderingContext2D, box: PngImageBox, prepared: PreparedPngImage | undefined, font: (size: number, bold: boolean) => string) {
  context.save();
  context.fillStyle = '#edf3f4'; context.fillRect(box.x, box.y, box.width, box.height);
  context.strokeStyle = '#d2dfe3'; context.strokeRect(box.x, box.y, box.width, box.height);
  const image = prepared?.image;
  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    // Preserve the entire square portrait/card art, with no arbitrary crop.
    context.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
  } else {
    const label = prepared?.status === 'identity-mismatch' ? '이미지 확인 필요' : prepared?.status === 'failed' ? '이미지 로딩 실패' : '이미지 미확인';
    const fallbackSize = Math.min(16, Math.max(10, box.width / 5));
    const fallbackLineHeight = Math.ceil(fallbackSize * 1.35);
    context.font = font(fallbackSize, false); context.fillStyle = '#526273'; context.textAlign = 'center';
    const lines = wrapPngText(label, box.width - 16, (value) => context.measureText(value).width);
    const top = box.y + (box.height - lines.length * fallbackLineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, box.x + box.width / 2, top + index * fallbackLineHeight));
  }
  context.restore();
}

export async function downloadPngDocument(document: PngDocument, guard: PngExportGuard): Promise<void> {
  assertCurrent(guard);
  await globalThis.document.fonts.ready;
  assertCurrent(guard);
  const canvas = globalThis.document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이 브라우저에서 PNG 출력을 사용할 수 없습니다. JSON 백업을 이용하세요.');
  const font = (size: number, bold: boolean) => `${bold ? '700' : '400'} ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  const layout = layoutPngDocument(document, (text, size, bold) => { context.font = font(size, bold); return context.measureText(text).width; });
  const images = await preparePngImages(document, guard);
  assertCurrent(guard);
  canvas.width = layout.width; canvas.height = layout.height;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.textBaseline = 'top';
  for (const connector of layout.connectors ?? []) {
    context.beginPath(); context.strokeStyle = '#99b5aa'; context.lineWidth = 3;
    connector.points.forEach((point, index) => { if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); });
    context.stroke();
  }
  for (const rectangle of layout.rectangles ?? []) {
    context.beginPath(); context.roundRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.radius ?? 0);
    context.fillStyle = rectangle.fill; context.fill();
    if (rectangle.stroke) { context.strokeStyle = rectangle.stroke; context.lineWidth = 1.5; context.stroke(); }
  }
  for (const box of layout.images) drawPngImage(context, box, images.get(imageKey(box.reference)), font);
  for (const line of layout.lines) { context.font = font(line.fontSize, line.bold); context.fillStyle = line.color; context.fillText(line.text, line.x, line.y); }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 생성에 실패했습니다.')), 'image/png'));
  assertCurrent(guard);
  const url = URL.createObjectURL(blob); const link = globalThis.document.createElement('a');
  link.href = url; link.download = guard.filename.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/(?:\.png)?$/i, '.png');
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
