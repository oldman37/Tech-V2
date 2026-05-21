/** Canonical ordered list of grade level values from extensionAttribute2. */
export const GRADE_LEVELS = [
  'PK', 'K',
  '1', '2', '3', '4', '5', '6',
  '7', '8', '9', '10', '11', '12',
] as const;

export type GradeLevel = typeof GRADE_LEVELS[number];

/**
 * Returns the numeric sort index for a grade level string.
 * Unknown/null values sort to the end.
 */
export function gradeLevelSortIndex(grade: string | null | undefined): number {
  if (!grade) return 99;
  const n = parseInt(grade, 10);
  const normalized = isNaN(n) ? grade : String(n);
  const idx = GRADE_LEVELS.indexOf(normalized as GradeLevel);
  return idx === -1 ? 98 : idx;
}

/** Human-readable label for display. PK → "Pre-K", K → "Kindergarten", else "Grade N".
 * Accepts both padded ("02") and unpadded ("2") numeric values — both display as "Grade 2".
 */
export function gradeLevelLabel(grade: string | null | undefined): string {
  if (!grade) return 'Unknown';
  if (grade === 'PK') return 'Pre-K';
  if (grade === 'K')  return 'Kindergarten';
  const n = parseInt(grade, 10);
  return `Grade ${isNaN(n) ? grade : n}`;
}

/**
 * Converts a UI grade level value to the zero-padded format stored in the DB.
 * "2" → "02", "10" → "10", "K" → "K", "PK" → "PK".
 * Already-padded values ("02") are returned unchanged.
 */
export function toDbGradeLevel(grade: string): string {
  const n = parseInt(grade, 10);
  if (!isNaN(n) && n >= 1 && n <= 12) {
    return String(n).padStart(2, '0');
  }
  return grade;
}
