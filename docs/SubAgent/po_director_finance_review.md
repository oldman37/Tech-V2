# Review: Director of Finance Environment Variable Fix

**Date:** 2026-03-13  
**Reviewed File:** `backend/src/services/userSync.service.ts`  
**Reference:** `docs/SubAgent/po_director_finance_investigation.md`  
**Build Result:** SUCCESS  
**Overall Assessment:** PASS

---

## 1. Fix Summary

Changed 3 occurrences of `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` → `ENTRA_FINANCE_DIRECTOR_GROUP_ID` in `userSync.service.ts` to match the `.env` file and the rest of the codebase.

| Location | Line | Change | Status |
|---|---|---|---|
| Constructor guard | 136 | `if (process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID)` | ✅ Correct |
| Map.set key | 137 | `this.groupRoleMappings.set(process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID, {` | ✅ Correct |
| priorityOrder array | 311 | `process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID,` | ✅ Correct |

---

## 2. Codebase Consistency Check

### Source files using `ENTRA_FINANCE_DIRECTOR_GROUP_ID` (correct name):

| File | Line | Usage |
|---|---|---|
| `backend/.env` | 65 | Definition: `=5f8623ed-...` |
| `backend/src/services/userSync.service.ts` | 136, 137, 311 | Constructor + priorityOrder |
| `backend/src/routes/admin.routes.ts` | 72 | Health check |
| `backend/scripts/sync-supervisors.ts` | 51 | Script reference |
| `backend/scripts/sync-supervisor-assignments.ts` | 46 | Script reference |
| `backend/scripts/sync-locations-and-supervisors.ts` | 46 | Script reference |
| `backend/scripts/seed-supervisors-from-groups.ts` | 75 | Script reference |

### Remaining references to old name `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID`:

| File | Line | Nature | Action Needed |
|---|---|---|---|
| `backend/dist/services/userSync.service.js` | 107, 108, 268 | **Stale compiled output** | Rebuild with `npm run build` |
| `docs/PERMISSIONS_AND_ROLES.md` | 166 | Documentation table | Update for consistency |
| `docs/permission.md` | 120 | Documentation table | Update for consistency |
| `docs/SubAgent/po_director_finance_investigation.md` | multiple | Historical investigation doc | No action (describes the bug) |
| `docs/SubAgent/remove_legacy_permissions_review.md` | multiple | Historical review doc | No action (describes the bug) |

**No remaining mismatches in source code (`.ts` files).** ✅

---

## 3. Logic Integrity

### Constructor mapping (lines 135–145):
- Guard condition, Map key, and permission payload are all internally consistent
- Permission mapping unchanged: `{ module: 'REQUISITIONS', level: 5 }` (Director of Finance)
- Role unchanged: `'USER'`
- Ancillary permissions unchanged: TECHNOLOGY level 2, MAINTENANCE level 2

### Priority order (lines 305–325):
- `ENTRA_FINANCE_DIRECTOR_GROUP_ID` is at position 4 in the priority array (after Admin, Technology Director, Director of Schools)
- This matches the documented priority hierarchy in the JSDoc comment above `getRoleFromGroups()`
- The lookup logic is unmodified: iterates array, checks `groupIds.includes()`, returns first match

### End-to-end flow:
1. `.env` defines `ENTRA_FINANCE_DIRECTOR_GROUP_ID=5f8623ed-...` → constructor reads value → guard is truthy → mapping registered ✅
2. `getRoleFromGroups()` reads same env var → value matches Map key → Director of Finance mapping returned ✅
3. `syncPermissionsForUser()` writes REQUISITIONS level 5 → backend `checkPermission('REQUISITIONS', 5)` passes ✅
4. Frontend receives level 5 → Finance Director approval UI elements visible ✅

---

## 4. Analysis Criteria Results

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | **Best Practices** | ✅ PASS | Variable name now consistent across all source files |
| 2 | **Security** | ✅ PASS | No new security issues; env var access pattern unchanged |
| 3 | **Consistency** | ✅ PASS | Matches `.env`, scripts, routes, and all other references |
| 4 | **Completeness** | ✅ PASS | All 3 source occurrences fixed; no orphaned references in `.ts` files |
| 5 | **Build Validation** | ✅ PASS | `npx tsc --noEmit` exits with 0 errors |

---

## 5. Recommended Follow-up (Non-blocking)

1. **Rebuild `dist/`**: Run `npm run build` in `backend/` to regenerate compiled JS. The stale `dist/` files still contain the old env var name and will fail at runtime until rebuilt.
2. **Update documentation**: Update `docs/PERMISSIONS_AND_ROLES.md` (line 166) and `docs/permission.md` (line 120) to use `ENTRA_FINANCE_DIRECTOR_GROUP_ID` for consistency.
3. **Add `.env.example` entry**: The `.env.example` file does not include any Entra group IDs beyond `ENTRA_ADMIN_GROUP_ID`. Consider adding `ENTRA_FINANCE_DIRECTOR_GROUP_ID` and other group IDs to prevent future naming confusion.

---

## 6. Verdict

**PASS** — The fix correctly resolves the environment variable mismatch. All 3 occurrences in source code are renamed consistently. TypeScript compiles cleanly. No logic changes, no typos, no regressions. The Director of Finance role will now receive REQUISITIONS level 5 permissions as intended.
