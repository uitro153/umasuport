import { z } from 'zod';

/** Dates are Seoul calendar dates unless a field explicitly carries an offset. */
export const dateOnlySchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || match[0] !== value) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (days[month - 1] ?? 0);
}, 'Expected a valid calendar date in YYYY-MM-DD format');

export const offsetDateTimeSchema = z.iso.datetime({ offset: true }).refine(
  (value) => dateOnlySchema.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value)),
  'Expected a valid ISO datetime with Z or an explicit UTC offset',
);

// An absolute end assertion rejects the final newline that JavaScript's `$` permits.
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*(?![\s\S])/, 'Expected a stable ID');
export const textSchema = z.string().min(1).refine((value) => value.trim().length > 0, 'Expected nonblank text');
export const sourceIdsSchema = z.array(idSchema).min(1).refine(
  (ids) => new Set(ids).size === ids.length,
  'Duplicate source references are not allowed',
);

export const aptitudeGradeSchema = z.enum(['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S']);
export const aptitudesSchema = z.strictObject({
  turf: aptitudeGradeSchema,
  dirt: aptitudeGradeSchema,
  sprint: aptitudeGradeSchema,
  mile: aptitudeGradeSchema,
  medium: aptitudeGradeSchema,
  long: aptitudeGradeSchema,
  front: aptitudeGradeSchema,
  pace: aptitudeGradeSchema,
  late: aptitudeGradeSchema,
  end: aptitudeGradeSchema,
});

export type DateOnly = z.infer<typeof dateOnlySchema>;
export type AptitudeGrade = z.infer<typeof aptitudeGradeSchema>;
export type Aptitudes = z.infer<typeof aptitudesSchema>;
