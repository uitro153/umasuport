import type { DeepReadonly } from '../data/snapshot';
import type { P3Snapshot } from '../domain/skill-support';

type SupportEvent = NonNullable<P3Snapshot['supportEvents']>[number];
type EventChoice = SupportEvent['choices'][number];

export interface EventAcquisitionOption {
  optionId: string;
  choiceKey: string;
  label: string;
  /** Original reward IDs. Consumers may only intersect these with existing routes. */
  skillIds: string[];
  sourceSkillIds: string[];
  sourceIds: string[];
  outcome: 'success' | 'failure' | 'unspecified';
  assurance: 'possible' | 'guaranteed' | 'unknown';
  condition: string | null;
}

export interface EventAcquisitionGroup {
  /** Includes the support ID, including events shared by different cards. */
  groupId: string;
  eventIds: string[];
  label: string;
  evidence: 'kr-source' | 'jp-reference' | 'source-unspecified';
  status: 'modeled' | 'source-conflict' | 'unknown-scenario' | 'scenario-blocked' | 'unverified';
  /** Reference evidence can constrain a known route, never create a KR route. */
  constraintOnly: boolean;
  rankingEligible: boolean;
  scenarioIds: string[];
  options: EventAcquisitionOption[];
  notes: string[];
}

export interface SupportEventModel {
  groups: EventAcquisitionGroup[];
  unresolvedSkillIds: string[];
  notes: string[];
}

export interface SupportEventContext {
  scenarioId?: string;
  /** Allows JP event structure as explicitly unverified constraints. */
  allowJpReference?: boolean;
}

/**
 * Normalize evidence about mutually exclusive rewards. This function creates no
 * acquisition routes and assigns no event probability. A selected branch is a
 * possible outcome, not an assertion that the event occurs or succeeds.
 */
export function buildSupportEventModel(
  snapshot: DeepReadonly<P3Snapshot>, supportId: string, context: SupportEventContext = {},
): SupportEventModel {
  const byId = new Map<string, DeepReadonly<SupportEvent>[]>();
  for (const event of snapshot.supportEvents ?? []) {
    if (event.supportId !== supportId) continue;
    const key = canonicalEventId(event);
    const rows = byId.get(key) ?? [];
    rows.push(event); byId.set(key, rows);
  }
  const groups = [...byId.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, events]) =>
    normalizeGroup(snapshot, supportId, id, events, context));
  const modeledIds = new Set(groups.filter((group) => group.status === 'modeled')
    .flatMap((group) => group.options.flatMap((option) => option.skillIds)));
  const eventLinks = snapshot.supportSkills.filter((route) => route.supportId === supportId && route.acquisition === 'event'
    && (route.server === 'KR' || context.allowJpReference && route.server === 'JP'));
  const unresolvedSkillIds = unique(eventLinks.filter((route) => !modeledIds.has(route.skillId)).map((route) => route.skillId));
  const notes = unique(groups.flatMap((group) => group.notes));
  if (unresolvedSkillIds.length) notes.push(`이벤트 보상 ${unresolvedSkillIds.length}개는 선택지·양립성 미확인으로 동시 수급 점수에서 제외합니다.`);
  return { groups, unresolvedSkillIds, notes };
}

function normalizeGroup(
  snapshot: DeepReadonly<P3Snapshot>, supportId: string, id: string,
  events: DeepReadonly<SupportEvent>[], context: SupportEventContext,
): EventAcquisitionGroup {
  const evidence = events.some((event) => event.server === 'KR') ? 'kr-source'
    : events.some((event) => event.server === 'JP') ? 'jp-reference' : 'source-unspecified';
  const options = events.flatMap((event) => event.choices.map((choice) => normalizeOption(event, choice)));
  // Exact game-event identity is enough to detect conflicting accounts, but is
  // never a license to merge their contradictory reward lists into one branch.
  const accounts = events.map((event) => event.choices.map((choice) => rewardSignature(normalizeOption(event, choice))).sort().join('|'));
  const conflict = new Set(accounts).size > 1;
  const scenario = scenarioConstraint(snapshot, events, context.scenarioId);
  const common = events.every((event) => {
    const raw = record(event.raw);
    return raw.bucket === 'common' || raw.ownerKind === 'character';
  });
  const unsupported = events.every((event) => !hasSelectionStructure(event));
  const unresolvedBranch = events.some(hasUnresolvedBranches);
  let status: EventAcquisitionGroup['status'] = conflict ? 'source-conflict'
    : scenario.status === 'blocked' ? 'scenario-blocked'
      : scenario.status === 'unknown' ? 'unknown-scenario'
        : common || unsupported || unresolvedBranch || evidence === 'jp-reference' && !context.allowJpReference ? 'unverified' : 'modeled';
  // Missing choices are not evidence that all independent links coexist.
  if (!options.length) status = 'unverified';
  const notes: string[] = [];
  if (conflict) notes.push('같은 이벤트 ID의 출처별 보상이 달라 선택지 점수에서 제외합니다. 원본 보상은 보존합니다.');
  if (status === 'modeled' && options.length > 1) notes.push('이벤트 선택지와 성공·실패 보상은 대안으로 비교하며 동시 획득을 보장하지 않습니다.');
  if (evidence === 'source-unspecified') notes.push('서버 미확인 이벤트: 기존 한국 수급 경로에 대한 분기 제약 참고이며 신규 한국 수급 경로가 아닙니다.');
  else if (evidence === 'jp-reference') notes.push('일본 이벤트 분기 참고: 한국 서버 수급·분기 실측 확인과 구별합니다.');
  if (scenario.status === 'blocked') notes.push('선택한 시나리오에서 발생하지 않는 이벤트입니다.');
  if (scenario.status === 'unknown') notes.push('이벤트의 시나리오 제한을 판정하지 못해 동시 수급 점수에서 제외합니다.');
  if (common) notes.push('캐릭터·공통 이벤트 소유 정보는 카드 고유 수급 경로로 사용하지 않습니다.');
  if (unsupported && !common) notes.push('이벤트 선택 구조가 미확인입니다.');
  if (unresolvedBranch) notes.push('연속 이벤트의 종료·선행 선택 조건 또는 분리되지 않은 성공·실패 서술이 있어 양립성 확인 전 점수에서 제외합니다.');
  return {
    groupId: `${supportId}:${id}`, eventIds: events.map((event) => event.eventId).sort(),
    label: events.find((event) => event.label && !event.label.startsWith('이벤트 '))?.label ?? events[0]!.label,
    evidence, status, constraintOnly: evidence !== 'kr-source',
    rankingEligible: evidence === 'kr-source' && status === 'modeled',
    scenarioIds: scenario.ids, options: deduplicateOptions(options), notes,
  };
}

function normalizeOption(event: DeepReadonly<SupportEvent>, choice: DeepReadonly<EventChoice>): EventAcquisitionOption {
  const raw = record(choice.raw);
  const branch = record(raw.sourceBranch);
  const condition = string(branch.condition) || string(raw.condition) || null;
  const outcome = condition && /실패|失敗|failure/i.test(condition) ? 'failure'
    : condition && /성공|成功|success/i.test(condition) ? 'success' : 'unspecified';
  const nativeChoice = /^choice-(\d+)-branch-\d+$/.exec(choice.choiceId);
  return {
    optionId: `${event.eventId}:${choice.choiceId}`,
    choiceKey: `${event.eventId}:${nativeChoice ? `choice-${nativeChoice[1]}` : choice.choiceId}`,
    label: choice.label, skillIds: unique(choice.skills.map((skill) => skill.skillId)),
    sourceSkillIds: unique(choice.skills.map((skill) => skill.skillId)), sourceIds: [...event.sourceIds],
    outcome,
    // Even an unconditional reward still requires the event to occur. Only an
    // explicit KR guarantee is carried as such; no sample in the current pack
    // meets this condition.
    assurance: event.server === 'KR' && event.choices.length === 1
      && record(event.raw).guaranteedAcquisition === true && !condition ? 'guaranteed' : 'possible',
    condition,
  };
}

function canonicalEventId(event: DeepReadonly<SupportEvent>): string {
  const raw = record(event.raw);
  if (Array.isArray(raw.event) && (typeof raw.event[2] === 'number' || typeof raw.event[2] === 'string')) return `game-${raw.event[2]}`;
  const tsuyuId = /^evt_\d+_(\d+)$/.exec(string(raw.id));
  // Never equate events by a translated title or by overlapping skill rewards.
  return tsuyuId ? `game-${tsuyuId[1]}` : event.eventId;
}

function hasSelectionStructure(event: DeepReadonly<SupportEvent>): boolean {
  const raw = record(event.raw);
  return raw.selection === 'single' || raw.selection === 'auto' || Array.isArray(raw.event)
    || event.choices.some((choice) => Object.keys(record(record(choice.raw).sourceChoice)).length > 0);
}

function hasUnresolvedBranches(event: DeepReadonly<SupportEvent>): boolean {
  for (const choice of event.choices) {
    const raw = record(choice.raw);
    const branch = record(raw.sourceBranch);
    const condition = string(branch.condition);
    const result = string(branch.result) || string(record(raw.sourceChoice).result);
    // No exact chain-step link is provided by the hashed narrative IDs. Do not
    // assume a chain-ending reward coexists with its later gold reward, or infer
    // which previous selection is meant from prose alone.
    if (/연속\s*이벤트.{0,8}종료|連続イベント.{0,8}終了/i.test(result)) return true;
    if (/(?:번째|번|차|[1-9])[^\n]{0,18}이벤트[^\n]{0,30}(?:선택|성공|실패)|첫번째\s*이벤트/i.test(condition)) return true;
    if (/연속\s*(?:[1-9][^\n]{0,6})?이벤트[^\n]{0,16}(?:[1-9]|모두|하나)[^\n]{0,12}(?:선택|성공|실패)/i.test(condition)) return true;
    if (!/성공|실패|成功|失敗|success|failure/i.test(condition)
      && /성공|成功|success/i.test(result) && /실패|失敗|failure/i.test(result)) return true;
  }
  return false;
}

function scenarioConstraint(
  snapshot: DeepReadonly<P3Snapshot>, events: DeepReadonly<SupportEvent>[], selected: string | undefined,
): { ids: string[]; status: 'applicable' | 'blocked' | 'unknown' } {
  const ids: string[] = [];
  let unknown = false;
  const conditions: string[] = [];
  for (const event of events) {
    const raw = record(event.raw);
    const explicit = raw.scenarioIds ?? raw.scenarioId;
    if (typeof explicit === 'string' || typeof explicit === 'number') ids.push(String(explicit));
    else if (Array.isArray(explicit)) for (const value of explicit) if (typeof value === 'string' || typeof value === 'number') ids.push(String(value));
    const source = record(raw.source);
    conditions.push(string(source.condition));
    const scenarioToken = /아오하루|アオハル|URA|L['’]?Arc/i;
    const eventConditions = event.choices.map((choice) => string(record(choice.raw).eventCondition));
    const sharedChoiceRestriction = eventConditions.length > 0 && eventConditions.every((condition) => condition === eventConditions[0])
      && scenarioToken.test(eventConditions[0]!);
    const hasExplicitRestriction = typeof explicit === 'string' || typeof explicit === 'number'
      || Array.isArray(explicit) && explicit.some((value) => typeof value === 'string' || typeof value === 'number');
    const hasGroupRestriction = hasExplicitRestriction || scenarioToken.test(string(source.condition)) || sharedChoiceRestriction;
    const branchRestrictions = event.choices.map((choice, index) => scenarioToken.test(string(record(record(choice.raw).sourceBranch).condition))
      || scenarioToken.test(eventConditions[index]!));
    // A scenario-qualified branch beside an unrestricted/unknown branch cannot
    // impose its scenario on the whole event and thereby admit both rewards.
    if (!hasGroupRestriction && branchRestrictions.some(Boolean) && branchRestrictions.some((restricted) => !restricted)) unknown = true;
    for (const choice of event.choices) {
      const choiceRaw = record(choice.raw);
      conditions.push(string(choiceRaw.eventCondition), string(record(choiceRaw.sourceBranch).condition));
    }
  }
  for (const condition of unique(conditions.filter(Boolean))) {
    // These tokens are present in the source event conditions. Match them to
    // actual scenario names in the supplied pack, rather than inventing links.
    const tokens = [...condition.matchAll(/아오하루|アオハル|URA|L['’]?Arc/gi)].map((match) => match[0]);
    if (tokens.length) {
      // Negation, alternatives, and free-form exclusions need their own data
      // contract. Holding them is safer than reversing "outside URA" into URA.
      if (/아닌|이외|외의|제외|발생하지|발생\s*안|불가|以外|除く|ではない|not\b|except|outside/i.test(condition)) {
        unknown = true;
        continue;
      }
      for (const token of tokens) {
        const matches = snapshot.scenarios.filter((scenario) => [scenario.nameKo, scenario.nameJa, scenario.nameEn, scenario.displayName]
          .some((name) => name?.toLowerCase().includes(token.toLowerCase())));
        if (matches.length === 1) ids.push(matches[0]!.scenarioId); else unknown = true;
      }
    } else if (/시나리오|シナリオ|scenario/i.test(condition)) unknown = true;
  }
  const distinct = unique(ids);
  if (distinct.some((id) => !snapshot.scenarios.some((scenario) => scenario.scenarioId === id))) unknown = true;
  // Scenario restrictions are currently attached to the event group. Different
  // scenario branches cannot safely be treated as an OR over every reward. Hold
  // the group until option-level applicability has independently verified data.
  if (distinct.length > 1) unknown = true;
  return { ids: distinct, status: unknown || distinct.length > 0 && !selected ? 'unknown'
    : distinct.length && !distinct.includes(selected!) ? 'blocked' : 'applicable' };
}

function deduplicateOptions(options: EventAcquisitionOption[]): EventAcquisitionOption[] {
  const rows = new Map<string, EventAcquisitionOption>();
  for (const option of options) {
    const signature = rewardSignature(option);
    const previous = rows.get(signature);
    if (previous) previous.sourceIds = unique([...previous.sourceIds, ...option.sourceIds]);
    else rows.set(signature, { ...option });
  }
  return [...rows.values()].sort((a, b) => a.optionId.localeCompare(b.optionId));
}
function rewardSignature(option: EventAcquisitionOption) { return `${option.skillIds.join(',')};${option.outcome};${option.condition ?? ''}`; }
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown) { return typeof value === 'string' ? value : ''; }
function unique(values: readonly string[]) { return [...new Set(values)].sort(); }
