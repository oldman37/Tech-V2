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
  const idx = GRADE_LEVELS.indexOf(grade as GradeLevel);
  return idx === -1 ? 98 : idx;
}

/** Human-readable label for display. PK → "Pre-K", K → "Kindergarten", else "Grade N". */
export function gradeLevelLabel(grade: string | null | undefined): string {
  if (!grade) return 'Unknown';
  if (grade === 'PK') return 'Pre-K';
  if (grade === 'K')  return 'Kindergarten';
  return `Grade ${grade}`;
}
