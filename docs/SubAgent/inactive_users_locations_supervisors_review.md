# Code Review: Inactive Users on Locations / Supervisors Pages

**Date:** 2026-04-08  
**Reviewer:** GitHub Copilot (Claude Sonnet 4.6)  
**Spec Reference:** `docs/SubAgent/inactive_users_locations_supervisors_spec.md`  
**Files Reviewed:**
- `backend/src/services/location.service.ts`
- `backend/src/services/user.service.ts`
- `backend/src/services/purchaseOrder.service.ts` *(completeness check)*

---

## Build Validation

```
cd C:\Tech-V2\backend && npx tsc --noEmit
```

**Result: SUCCESS** — Zero TypeScript errors. No output produced.

---

## Fix-by-Fix Verification

### Fix #1 — `findAll()` in location.service.ts ✅ CORRECT

```typescript
supervisors: {
  where: { user: { isActive: true } },   // ← added correctly
  include: {
    user: { select: { id, email, displayName, firstName, lastName, jobTitle } }
  },
  orderBy: [{ supervisorType: 'asc' }, { isPrimary: 'desc' }],
},
```

All original query logic preserved. `where` placement is at the `supervisors` relation level — correct for Prisma nested filter on a one-to-many include.

---

### Fix #2 — `findById()` in location.service.ts ✅ CORRECT

```typescript
supervisors: {
  where: { user: { isActive: true } },   // ← added correctly
  include: {
    user: { select: { id, email, displayName, firstName, lastName, jobTitle, department } }
  },
  orderBy: [{ supervisorType: 'asc' }, { isPrimary: 'desc' }],
},
```

Correct. Note `department` field in select is preserved (differs from Fix #1 intentionally — same as original).

---

### Fix #3 — `getSupervisorsByType()` in location.service.ts ✅ CORRECT

```typescript
where: { supervisorType, user: { isActive: true } },
```

Inline nested filter on a `findMany` where clause. Schema confirms `LocationSupervisor.user` is the correct relation field name. All includes and orderBy clauses preserved.

---

### Fix #4 — `getPrimarySupervisorForRouting()` in location.service.ts ✅ CORRECT

```typescript
where: {
  locationId,
  supervisorType,
  isPrimary: true,
  user: { isActive: true },
},
```

All original conditions preserved; `user: { isActive: true }` added as additional filter. Correct.

---

### Fix #5 — `getUserSupervisors()` in user.service.ts ✅ CORRECT

```typescript
where: { userId, supervisor: { isActive: true } },
```

Schema confirms `UserSupervisor.supervisor` is the correct Prisma field name (maps to `user_supervisors_supervisorIdTousers` relation). Filter is correct and will exclude assignments to deactivated supervisors. All original select fields and orderBy preserved.

---

## Schema Validation

| Query Filter | Schema Relation Name | Correct? |
|---|---|---|
| `LocationSupervisor.user: { isActive: true }` | `user User @relation(fields: [userId]…)` | ✅ |
| `UserSupervisor.supervisor: { isActive: true }` | `supervisor User @relation("user_supervisors_supervisorIdTousers"…)` | ✅ |

Both field names match the Prisma schema exactly.

---

## Security Compliance

| Check | Result |
|---|---|
| No `console.log` added | ✅ Pass |
| No `any` types added | ✅ Pass (pre-existing `any` in `assignSupervisor` return type was not introduced by this fix) |
| No raw SQL added | ✅ Pass |
| Auth middleware not modified | ✅ Pass |
| No new endpoints added | ✅ Pass |

---

## Scope Discipline

Changes are exactly and only the 5 targeted `where` clause additions. No refactoring, no added comments, no structural changes to any other method. **Scope discipline: PERFECT.**

---

## Completeness Check — Inactive User Leaks Beyond the 5 Fixes

The following issues were found during broader codebase review. **These are outside the scope of the 5 specified fixes** but represent real data-integrity gaps.

---

### CRITICAL — `purchaseOrder.service.ts` — PO Approval Stage Guard (line ~823)

```typescript
// MISSING: user.isActive: true
const locSup = await this.prisma.locationSupervisor.findFirst({
  where: { locationId: po.officeLocationId, isPrimary: true },
});
if (locSup && locSup.userId !== userId) {
  throw new AuthorizationError('Only the assigned supervisor for this location can approve at this stage');
}
```

**Problem:** If the primary supervisor for a location is deactivated, this query still finds them. The approval-stage authorization check then permanently blocks any other user from approving the PO (since the inactive supervisor cannot log in). This can cause submitted POs to be **permanently stuck** in `submitted` status.

**Required fix:**
```typescript
where: { locationId: po.officeLocationId, isPrimary: true, user: { isActive: true } },
```

---

### CRITICAL — `purchaseOrder.service.ts` — PO Submission Routing (line ~569)

```typescript
// MISSING: user.isActive: true
const locationSupervisorRecord = await this.prisma.locationSupervisor.findFirst({
  where: { locationId: po.officeLocationId, isPrimary: true },
  include: { user: { select: { id, email, displayName, firstName, lastName } } },
});
```

**Problem:** An inactive user assigned as primary supervisor is returned here and their email is used for approval routing notification. The inactive user receives an approval email they cannot action (since they can't log in), and the PO could be routed to a dead mailbox.

**Required fix:**
```typescript
where: { locationId: po.officeLocationId, isPrimary: true, user: { isActive: true } },
```

---

### RECOMMENDED — `user.service.ts` — `getMyOfficeLocation()` (line ~793)

```typescript
supervisors: {
  where: { isPrimary: true },   // MISSING: user: { isActive: true }
  include: {
    user: { select: { id: true, displayName: true, email: true } },
  },
  take: 1,
},
```

**Problem:** The "My Location" view could display an inactive user as the primary supervisor contact. This is a UX issue (inaccurate data shown), but lower risk than the PO routing issues since no workflow action is taken on the result.

**Required fix:**
```typescript
where: { isPrimary: true, user: { isActive: true } },
```

---

### NOT APPLICABLE — `purchaseOrder.service.ts` — Level-3 scope lookup (line ~263)

```typescript
await this.prisma.locationSupervisor.findMany({
  where: { userId },   // Filters by the currently authenticated user's own ID
  select: { locationId: true },
});
```

This queries the *current user's own supervisor assignments* (not supervisor users), so no inactive user exposure risk. ✅ No fix needed.

---

## Findings Summary

| # | Location | Severity | Status |
|---|---|---|---|
| 1 | `location.service.ts` — `findAll()` | Spec target | ✅ Fixed correctly |
| 2 | `location.service.ts` — `findById()` | Spec target | ✅ Fixed correctly |
| 3 | `location.service.ts` — `getSupervisorsByType()` | Spec target | ✅ Fixed correctly |
| 4 | `location.service.ts` — `getPrimarySupervisorForRouting()` | Spec target | ✅ Fixed correctly |
| 5 | `user.service.ts` — `getUserSupervisors()` | Spec target | ✅ Fixed correctly |
| 6 | `purchaseOrder.service.ts` — PO approval stage guard | **CRITICAL** | ❌ Not fixed — PO freeze risk |
| 7 | `purchaseOrder.service.ts` — PO submission routing | **CRITICAL** | ❌ Not fixed — inactive email routing |
| 8 | `user.service.ts` — `getMyOfficeLocation()` | RECOMMENDED | ❌ Not fixed — stale supervisor shown |

---

## Score Table

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 10/10 | A |
| Best Practices | 9/10 | A |
| Functionality | 7/10 | B |
| Code Quality | 10/10 | A |
| Security | 10/10 | A |
| Performance | 10/10 | A |
| Consistency | 10/10 | A |
| Build Success | 10/10 | A |

**Overall Grade: A- (95% within spec scope / NEEDS_REFINEMENT for completeness)**

---

## Assessment

| Dimension | Result |
|---|---|
| Build | **SUCCESS** |
| Spec Compliance (5 targeted fixes) | **PASS** — all 5 correctly implemented |
| Overall (including gaps) | **NEEDS_REFINEMENT** |

The 5 specified fixes are implemented correctly with no regressions, no security issues, and a clean build. However, the `purchaseOrder.service.ts` file contains **2 CRITICAL gaps** where inactive supervisors can still be selected for PO routing and approval gating — these were outside the original spec scope but represent concrete workflow-breaking bugs that should be addressed in a follow-up implementation pass before this feature is considered complete.
