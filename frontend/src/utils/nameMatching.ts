/**
 * Name matching helpers for creatable reference-data pickers.
 *
 * Exists so a misspelled write-in still surfaces the existing record rather than
 * fragmenting the reference tables (Dell / dell / Delll as three brand rows).
 */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance with a single-row DP and an early exit once the best
 * possible result in a row already exceeds `max` — enough for a <= 2 threshold
 * without pulling in a dependency.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (row[j - 1] as number) + 1,      // insertion
        (prev[j] as number) + 1,          // deletion
        (prev[j - 1] as number) + cost,   // substitution
      );
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }

  return prev[b.length] as number;
}

export interface NameMatchResult<T> {
  /** A normalized-exact match — select this instead of creating anything. */
  exact: T | null;
  /** A close-but-not-equal match worth confirming with the user. */
  near: T | null;
}

/**
 * Compare `typed` against `options`.
 *
 * `minLengthForNear` keeps short names (HP, Bus) from tripping the confirm dialog
 * constantly — at 2-3 characters a distance of 2 is most of the word.
 */
export function findNameMatch<T extends { name: string }>(
  typed: string,
  options: T[],
  maxDistance = 2,
  minLengthForNear = 4,
): NameMatchResult<T> {
  const normalizedTyped = normalizeName(typed);
  if (!normalizedTyped) return { exact: null, near: null };

  let near: T | null = null;
  let nearDistance = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const normalizedOption = normalizeName(option.name);
    if (normalizedOption === normalizedTyped) return { exact: option, near: null };

    if (normalizedTyped.length >= minLengthForNear) {
      const distance = levenshtein(normalizedTyped, normalizedOption, maxDistance);
      if (distance <= maxDistance && distance < nearDistance) {
        near = option;
        nearDistance = distance;
      }
    }
  }

  return { exact: null, near };
}
