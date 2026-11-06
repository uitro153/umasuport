import { z } from 'zod';
import { type Aptitudes, aptitudeGradeSchema, idSchema, sourceIdsSchema, textSchema } from './primitives';
import type { Snapshot } from './snapshot';

export const SLOT_KEYS = ['target', 'parentA', 'parentB', 'grandA1', 'grandA2', 'grandB1', 'grandB2'] as const;
export const ANCESTOR_SLOT_KEYS = ['parentA', 'parentB', 'grandA1', 'grandA2', 'grandB1', 'grandB2'] as const;
export const GRANDPARENT_SLOT_KEYS = ['grandA1', 'grandA2', 'grandB1', 'grandB2'] as const;
export const APTITUDE_KEYS = ['turf', 'dirt', 'sprint', 'mile', 'medium', 'long', 'front', 'pace', 'late', 'end'] as const;

export type SlotKey = typeof SLOT_KEYS[number];
export type AncestorSlotKey = typeof ANCESTOR_SLOT_KEYS[number];
export type GrandparentSlotKey = typeof GRANDPARENT_SLOT_KEYS[number];
export type AptitudeKey = keyof Aptitudes;

export const slotKeySchema = z.enum(SLOT_KEYS);
export const aptitudeKeySchema = z.enum(APTITUDE_KEYS);
export const redFactorSchema = z.strictObject({
  type: aptitudeKeySchema,
  stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export const pedigreeSlotSchema = z.strictObject({
  costumeId: idSchema.nullable(),
  redFactor: redFactorSchema.nullable(),
});
export const pedigreeSchema = z.strictObject({
  target: pedigreeSlotSchema,
  parentA: pedigreeSlotSchema,
  parentB: pedigreeSlotSchema,
  grandA1: pedigreeSlotSchema,
  grandA2: pedigreeSlotSchema,
  grandB1: pedigreeSlotSchema,
  grandB2: pedigreeSlotSchema,
});

export type RedFactor = z.infer<typeof redFactorSchema>;
export type PedigreeSlot = z.infer<typeof pedigreeSlotSchema>;
export type Pedigree = z.infer<typeof pedigreeSchema>;

export function createEmptyPedigree(): Pedigree {
  return {
    target: { costumeId: null, redFactor: null },
    parentA: { costumeId: null, redFactor: null },
    parentB: { costumeId: null, redFactor: null },
    grandA1: { costumeId: null, redFactor: null },
    grandA2: { costumeId: null, redFactor: null },
    grandB1: { costumeId: null, redFactor: null },
    grandB2: { costumeId: null, redFactor: null },
  };
}

const pairKey = (a: SlotKey, b: SlotKey): string => [a, b].sort().join('|');
const pairSchema = z.tuple([slotKeySchema, slotKeySchema]);

export const pedigreeRulesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ruleId: idSchema,
  snapshotId: idSchema,
  kind: z.enum(['fixture', 'verified']),
  sourceIds: sourceIdsSchema,
  affinity: z.strictObject({
    terms: z.array(z.strictObject({
      termId: idSchema,
      label: textSchema,
      slotA: slotKeySchema,
      slotB: slotKeySchema,
      weight: z.number().nonnegative(),
    })).min(1),
    forbiddenSameBasePairs: z.array(pairSchema),
  }),
  aptitude: z.strictObject({
    starSteps: z.array(z.strictObject({
      minStars: z.number().int().min(0).max(18),
      gradeSteps: z.number().int().min(0).max(7),
    })).min(1),
    initialCap: aptitudeGradeSchema.extract(['A']),
  }),
}).superRefine((rules, context) => {
  const termIds = new Set<string>();
  const weights = new Map<string, number>();
  rules.affinity.terms.forEach((term, i) => {
    if (termIds.has(term.termId)) {
      context.addIssue({ code: 'custom', path: ['affinity', 'terms', i, 'termId'], message: 'Duplicate affinity term ID' });
    }
    termIds.add(term.termId);
    if (term.slotA === term.slotB) {
      context.addIssue({ code: 'custom', path: ['affinity', 'terms', i], message: 'A relationship must connect different slots' });
    }
    const key = pairKey(term.slotA, term.slotB);
    if (weights.has(key)) {
      context.addIssue({ code: 'custom', path: ['affinity', 'terms', i], message: 'Duplicate relationship; combine its weight into one term' });
    }
    weights.set(key, term.weight);
  });

  const forbidden = new Set<string>();
  rules.affinity.forbiddenSameBasePairs.forEach(([a, b], i) => {
    if (a === b || forbidden.has(pairKey(a, b))) {
      context.addIssue({ code: 'custom', path: ['affinity', 'forbiddenSameBasePairs', i], message: 'Forbidden pairs must be distinct unordered slot pairs' });
    }
    forbidden.add(pairKey(a, b));
  });

  // C(4,2) is valid only when a sibling swap does not change score or validity.
  for (const [first, second] of [['grandA1', 'grandA2'], ['grandB1', 'grandB2']] as const) {
    const swap = (slot: SlotKey): SlotKey => slot === first ? second : slot === second ? first : slot;
    if (rules.affinity.terms.some((term) => weights.get(pairKey(swap(term.slotA), swap(term.slotB))) !== term.weight)) {
      context.addIssue({ code: 'custom', path: ['affinity', 'terms'], message: `Sibling slots ${first}/${second} must have equivalent relationship weights` });
    }
    if (rules.affinity.forbiddenSameBasePairs.some(([a, b]) => !forbidden.has(pairKey(swap(a), swap(b))))) {
      context.addIssue({ code: 'custom', path: ['affinity', 'forbiddenSameBasePairs'], message: `Sibling slots ${first}/${second} must have equivalent restrictions` });
    }
  }

  const steps = rules.aptitude.starSteps;
  if (steps[0]?.minStars !== 0 || steps[0]?.gradeSteps !== 0) {
    context.addIssue({ code: 'custom', path: ['aptitude', 'starSteps', 0], message: 'The zero-star entry must produce zero grade steps' });
  }
  steps.forEach((step, i) => {
    const previous = steps[i - 1];
    if (previous && (step.minStars <= previous.minStars || step.gradeSteps < previous.gradeSteps)) {
      context.addIssue({ code: 'custom', path: ['aptitude', 'starSteps', i], message: 'Star thresholds must strictly increase and grade steps must not decrease' });
    }
  });
});

export type P1Rules = z.infer<typeof pedigreeRulesSchema>;

type SnapshotReferences = Pick<Snapshot, 'snapshotId' | 'kind'> & {
  readonly sources: readonly Pick<Snapshot['sources'][number], 'sourceId' | 'evidence'>[];
};

/** Link rules to the exact immutable snapshot; schema validity is not game validation. */
export function validatePedigreeRules(input: unknown, snapshot: SnapshotReferences): P1Rules {
  return pedigreeRulesSchema.superRefine((rules, context) => {
    if (rules.snapshotId !== snapshot.snapshotId) {
      context.addIssue({ code: 'custom', path: ['snapshotId'], message: 'Rules must target the active snapshot' });
    }
    if (rules.kind !== snapshot.kind) {
      context.addIssue({ code: 'custom', path: ['kind'], message: 'Rule and snapshot evidence kinds must match' });
    }
    const sources = new Map(snapshot.sources.map((source) => [source.sourceId, source]));
    rules.sourceIds.forEach((id, i) => {
      const source = sources.get(id);
      if (!source) context.addIssue({ code: 'custom', path: ['sourceIds', i], message: `Unknown rule source: ${id}` });
      else if (rules.kind === 'verified' && source.evidence === 'fixture') {
        context.addIssue({ code: 'custom', path: ['sourceIds', i], message: 'Verified rules cannot rely on fixture evidence' });
      }
    });
  }).parse(input);
}
