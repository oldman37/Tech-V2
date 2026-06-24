/**
 * UPN (User Principal Name) generation for OCBOE provisioning.
 *
 * Staff:   {first initial}{normalized last name}@<staffDomain>
 * Student: {first 3 of first}{middle initial}{first 4 of last}@<studentDomain>
 *
 * Collision resolution: append incrementing number starting at 2 until a free UPN is found.
 */

/**
 * Normalize a name part for use in a UPN:
 *   1. NFD decomposition (splits accented chars into base + combining mark)
 *   2. Strip Unicode combining marks (category Mn)
 *   3. Lowercase
 *   4. Strip apostrophes, hyphens, and spaces
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/['\-\s]/g, '');
}

/**
 * Build the base UPN prefix for a staff account (no domain, no collision suffix).
 */
function staffBase(firstName: string, lastName: string): string {
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  return fn.charAt(0) + ln;
}

/**
 * Build the base UPN prefix for a student account (no domain, no collision suffix).
 * Short names are right-padded with 'x' to reach the required length.
 */
function studentBase(firstName: string, middleName: string, lastName: string): string {
  const fn = normalizeName(firstName).padEnd(3, 'x').slice(0, 3);
  const mn = middleName ? normalizeName(middleName).charAt(0) : '';
  const ln = normalizeName(lastName).padEnd(4, 'x').slice(0, 4);
  return fn + mn + ln;
}

/**
 * Resolve a unique staff UPN.
 * `exists` is called with each candidate UPN; return true if already taken.
 */
export async function resolveStaffUpn(
  firstName: string,
  lastName: string,
  domain: string,
  exists: (upn: string) => Promise<boolean>,
): Promise<{ upn: string; mailNickname: string }> {
  const base = staffBase(firstName, lastName);
  const candidate = `${base}@${domain}`;
  if (!(await exists(candidate))) {
    return { upn: candidate, mailNickname: base };
  }
  for (let i = 2; ; i++) {
    const c = `${base}${i}@${domain}`;
    if (!(await exists(c))) {
      return { upn: c, mailNickname: `${base}${i}` };
    }
  }
}

/**
 * Resolve a unique student UPN.
 * `exists` is called with each candidate UPN; return true if already taken.
 */
export async function resolveStudentUpn(
  firstName: string,
  middleName: string,
  lastName: string,
  domain: string,
  exists: (upn: string) => Promise<boolean>,
): Promise<{ upn: string; mailNickname: string }> {
  const base = studentBase(firstName, middleName, lastName);
  const candidate = `${base}@${domain}`;
  if (!(await exists(candidate))) {
    return { upn: candidate, mailNickname: base };
  }
  for (let i = 2; ; i++) {
    const c = `${base}${i}@${domain}`;
    if (!(await exists(c))) {
      return { upn: c, mailNickname: `${base}${i}` };
    }
  }
}
