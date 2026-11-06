/** Minimal read-only input so the source intersection can be tested independently. */
export interface ReferenceAffinityInput {
  readonly affinity: {
    readonly members: Readonly<Record<string, readonly string[]>>;
    readonly weights: Readonly<Record<string, number>>;
    readonly defaultWeight: 1;
    readonly duplicateBasePolicy: 'zero';
    readonly sourceIds: readonly string[];
    readonly sourceDate: string;
    readonly server: 'JP';
  };
}

export interface ReferenceGroupWeight {
  groupId: string;
  weight: number;
  basis: 'explicit-weight' | 'default-weight';
}

export interface ReferenceGroupAffinity {
  value: number | null;
  status: 'historical-jp-unverified-kr' | 'missing-character';
  groupIds: string[];
  groups: ReferenceGroupWeight[];
  duplicatePolicyApplied: boolean;
  sourceIds: readonly string[];
  sourceDate: string;
  server: 'JP';
  validation: 'unverified-current-kr';
}

/**
 * Reproduce the supplied historical JP intersection, retaining its source scope.
 * Three-way intersection is calculated from members, never reconstructed from pairs.
 * This reproduction does not establish current KR compatibility or a seven-slot rule.
 */
export function groupAffinity(
  snapshot: ReferenceAffinityInput,
  baseIds: readonly string[],
): ReferenceGroupAffinity {
  if (baseIds.length !== 2 && baseIds.length !== 3) {
    throw new RangeError('상성 그룹 비교는 인물 ID 2개 또는 3개가 필요합니다.');
  }
  const reference = snapshot.affinity;
  const common = {
    sourceIds: reference.sourceIds,
    sourceDate: reference.sourceDate,
    server: reference.server,
    validation: 'unverified-current-kr' as const,
  };
  const memberLists = baseIds.map((id) => Object.hasOwn(reference.members, id) ? reference.members[id] : undefined);
  if (memberLists.some((list) => list === undefined)) {
    return { ...common, value: null, status: 'missing-character', groupIds: [], groups: [], duplicatePolicyApplied: false };
  }
  if (new Set(baseIds).size !== baseIds.length) {
    return { ...common, value: 0, status: 'historical-jp-unverified-kr', groupIds: [], groups: [], duplicatePolicyApplied: true };
  }
  const memberSets = memberLists.map((list) => new Set(list!));
  const groupIds = [...memberSets[0]!].filter((groupId) => memberSets.every((members) => members.has(groupId))).sort();
  const groups = groupIds.map((groupId): ReferenceGroupWeight => {
    const explicit = Object.hasOwn(reference.weights, groupId);
    const weight = explicit ? reference.weights[groupId]! : reference.defaultWeight;
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError(`상성 그룹 ${groupId}의 가중치가 유효하지 않습니다.`);
    return { groupId, weight, basis: explicit ? 'explicit-weight' : 'default-weight' };
  });
  return {
    ...common,
    value: groups.reduce((sum, group) => sum + group.weight, 0),
    status: 'historical-jp-unverified-kr',
    groupIds,
    groups,
    duplicatePolicyApplied: false,
  };
}
