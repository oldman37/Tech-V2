export const GRADE_LEVELS = [
  'PK', 'K', '1', '2', '3', '4', '5', '6',
  '7', '8', '9', '10', '11', '12',
] as const;

export type GradeLevel = typeof GRADE_LEVELS[number];

export function gradeLevelSortIndex(grade: string | null | undefined): number {
  if (!grade) return 99;
  const idx = GRADE_LEVELS.indexOf(grade as GradeLevel);
  return idx === -1 ? 98 : idx;
}
