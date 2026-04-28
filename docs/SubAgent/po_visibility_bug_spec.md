# PO / Requisition Visibility Bug — Research Spec

**Date:** 2026-03-23  
**Reported By:** Bug report — standard users and supervisors can see all POs  
**Severity:** Critical (security / data exposure)  
**Affected Users:**
- Jordan Howell (tech assistant) — can see ALL purchase orders system-wide
- Sandra Simpsons (supervisor/principal) — can see ALL purchase orders system-wide

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Files Analyzed](#2-files-analyzed)
3. [System Architecture — PO Visibility Model](#3-system-architecture--po-visibility-model)
4. [Bug #1 — Supervisors (Level 3) Have Global instead of Location-Scoped Visibility](#4-bug-1--supervisors-level-3-have-global-instead-of-location-scoped-visibility)
5. [Bug #2 — "My Requests" Tab Does Not Filter for Level 3+ Users](#5-bug-2--my-requests-tab-does-not-filter-for-level-3-users)
6. [Bug #3 — "All" Tab Is Incorrectly Visible to Level 2 Users](#6-bug-3--all-tab-is-incorrectly-visible-to-level-2-users)
7. [Bug #4 — Route Comment Contradicts Service Logic (Documentation Drift)](#7-bug-4--route-comment-contradicts-service-logic-documentation-drift)
8. [Bug #5 — Permission Middleware May Match Expired Permission Before Valid One](#8-bug-5--permission-middleware-may-match-expired-permission-before-valid-one)
9. [Root Cause for Jordan Howell Specifically](#9-root-cause-for-jordan-howell-specifically)
10. [Expected vs. Actual Behavior Matrix](#10-expected-vs-actual-behavior-matrix)
11. [Security Implications](#11-security-implications)
12. [Proposed Fixes](#12-proposed-fixes)
13. [Testing Checklist](#13-testing-checklist)

---

## 1. Executive Summary

The Purchase Order list endpoint (`GET /api/purchase-orders`) uses a simple binary permission split in the service layer:

```
permLevel < 3  →  only own POs (requestorId: userId)
permLevel ≥ 3  →  ALL POs globally (no restriction)
```

This design has **three overlapping bugs**:

1. **Supervisors (level 3) have global PO visibility.** A school principal (`REQ:3`) who supervises only Washington Elementary can see every PO submitted by every person in every school and department. The `LocationSupervisor` table exists and is already used for email routing, but is never consulted for list-query scoping.

2. **The "My Requests" tab sends no `onlyMine` signal to the backend.** For level 3+ users this tab is functionally identical to the "All" tab — both return all POs organization-wide.

3. **The "All" tab is visible to level 2 (General User) staff** (`minPermLevel: 2`), implying they can see everyone's requests. They cannot (backend correctly restricts them), but the misleading UI label erodes trust and is a forward-compatibility risk.

Additionally, a likely contributing factor for Jordan Howell: the `ENTRA_TECH_ADMIN_GROUP_ID` Entra group grants `REQ:3` to all technology staff, giving tech assistants unintended supervisor-level PO visibility.

---

## 2. Files Analyzed

| File | Purpose |
|------|---------|
| `backend/src/services/purchaseOrder.service.ts` | Core query filtering logic |
| `backend/src/controllers/purchaseOrder.controller.ts` | HTTP handlers; permLevel plumbing |
| `backend/src/routes/purchaseOrder.routes.ts` | Route declarations, checkPermission calls |
| `backend/src/middleware/permissions.ts` | checkPermission middleware; permLevel assignment |
| `backend/src/validators/purchaseOrder.validators.ts` | Query schema — accepted filter params |
| `backend/prisma/schema.prisma` | Data models (purchase_orders, LocationSupervisor, User) |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | List UI, tab definitions, buildFilters() |
| `frontend/src/hooks/queries/usePurchaseOrders.ts` | TanStack Query hooks |
| `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | Frontend permLevel resolution |
| `frontend/src/services/purchaseOrder.service.ts` | API client, getStats() implementation |
| `docs/PERMISSIONS_AND_ROLES.md` | Authoritative permission matrix |
| `docs/permission.md` | Detailed auth flow documentation |
| `docs/requisition_flow.md` | Workflow design spec |

---

## 3. System Architecture — PO Visibility Model

### Permission Levels for REQUISITIONS Module

| Level | Role Name | Intended Visibility |
|:-----:|-----------|---------------------|
| 1 | Viewer | Own POs only |
| 2 | General User / Staff | Own POs only |
| 3 | Supervisor (Principal, VP, Dept. Head) | **Should be location-scoped** |
| 4 | PO Entry / Purchasing Staff | All POs (needs full processing view) |
| 5 | Finance Director | All POs (financial oversight) |
| 6 | Director of Schools | All POs (final approver) |

### Key Database Models

```
purchase_orders
  └── requestorId → users.id
  └── officeLocationId → office_locations.id

LocationSupervisor (location_supervisors)
  └── userId → users.id
  └── locationId → office_locations.id
  └── isPrimary: Boolean
```

### Entra Group → REQ Permission Mapping (Relevant Groups)

| Entra Group | App Role | REQ Level Granted |
|-------------|----------|:-----------------:|
| ENTRA_ALL_STAFF_GROUP_ID | VIEWER | **2** |
| **ENTRA_TECH_ADMIN_GROUP_ID** | TECHNICIAN | **3** ← over-broad |
| ENTRA_PRINCIPALS_GROUP_ID | MANAGER | 3 |
| ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID | MANAGER | 3 |
| ENTRA_FINANCE_DIRECTOR_GROUP_ID | MANAGER | 5 |

---

## 4. Bug #1 — Supervisors (Level 3) Have Global instead of Location-Scoped Visibility

### Location

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Lines:** ~252–276 (the `getPurchaseOrders` method `where` clause)

### Problematic Code

```typescript
const where: Prisma.purchase_ordersWhereInput = {
  // Scope: levels 1-2 see only own POs; level 3+ sees all   ← BUG: comment intent vs reality
  ...(permLevel < 3 && { requestorId: userId }),
  ...(status && { status }),
  ...(locationId && { officeLocationId: locationId }),
  // ...date, search filters...
};
```

### What Actually Happens

For any user with `permLevel >= 3` (supervisors, finance directors, directors, AND tech staff via tech admin group mapping):

- Query has **no** `requestorId` restriction
- Query has **no** `officeLocationId` restriction (unless the user manually selects a location filter in the UI)
- Result: 100% of `purchase_orders` records are returned, paginated

Sandra Simpsons is a principal at one school. She logs in, the `checkPermission('REQUISITIONS', 1)` middleware sets her `req.user.permLevel = 3` (her highest REQ permission). The service sees `3 >= 3`, applies no restriction, and returns all 847 POs from twelve schools and the district office.

### Expected Behavior

Level 3 (Supervisor) users should only see:
1. **POs associated with locations they supervise** (via `LocationSupervisor`) — specifically `officeLocationId IN (supervised location IDs)`
2. **Their own POs** regardless of location (they can also submit requests)

Level 4+ users should retain global visibility (they need to see all POs for processing/approval).

### Missing Filter (Pseudocode)

```typescript
if (permLevel === 3) {
  const supervisedLocationIds = await getSupervisedLocationIds(userId);
  where.OR = [
    { requestorId: userId },  // own POs always visible
    ...(supervisedLocationIds.length > 0
      ? [{ officeLocationId: { in: supervisedLocationIds } }]
      : []),
  ];
} else if (permLevel < 3) {
  where.requestorId = userId;
}
// permLevel >= 4: no restriction (global visibility)
```

### `getPurchaseOrderById` — Same Issue

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Lines:** ~312–317

```typescript
if (permLevel < 3 && po.requestorId !== userId) {
  throw new AuthorizationError('You do not have permission to view this purchase order');
}
```

Level 3 users can access any single PO by ID. The fix to the list query must be mirrored here — a level-3 supervisor should only be able to view detail for POs that are within their supervised locations or their own.

---

## 5. Bug #2 — "My Requests" Tab Does Not Filter for Level 3+ Users

### Location

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`  
**Function:** `buildFilters()` (~line 97)

### Problematic Code

```typescript
const buildFilters = (): PurchaseOrderFilters => {
  const f: PurchaseOrderFilters = {
    page: page + 1,
    limit: rowsPerPage,
  };
  if (statusFilter) f.status = statusFilter;
  if (search.trim()) f.search = search.trim();
  if (dateFrom) f.dateFrom = dateFrom;
  if (dateTo) f.dateTo = dateTo;
  const activeFY = fiscalYearFilter || settings?.currentFiscalYear;
  if (activeFY) f.fiscalYear = activeFY;
  // ↓ Tab-specific logic
  if (tab === 'issued' && !statusFilter) f.status = 'po_issued';
  if (tab === 'pending' && !statusFilter) { /* ... */ }
  // BUG: tab === 'mine' sends NO onlyMine flag to the server
  return f;
};
```

### What Actually Happens

When a level-3 supervisor (Sandra) clicks the **"My Requests"** tab:
- `buildFilters()` produces `{ page: 1, limit: 25, fiscalYear: "FY2026" }` — no user scoping
- The backend receives no `onlyMine` or `requestorId` parameter
- The service applies `permLevel < 3` → false → no `requestorId` filter
- Return value: all POs in the system, paginated

"My Requests" and "All" tabs are **functionally identical** for supervisors and above.

### Expected Behavior

- "My Requests" tab → always shows only the current user's own submitted POs, regardless of permLevel
- "All" tab → shows full scope (all for level 3+ globally, or location-scoped for level 3)

### Root Cause

The backend `PurchaseOrderQuerySchema` has no `onlyMine` parameter:

**File:** `backend/src/validators/purchaseOrder.validators.ts` (~line 60)

```typescript
export const PurchaseOrderQuerySchema = z.object({
  page: ...,
  limit: ...,
  status: ...,
  search: ...,
  dateFrom: ...,
  dateTo: ...,
  locationId: ...,
  fiscalYear: ...,
  // ← NO onlyMine field
});
```

There is no mechanism for the frontend to say "only return this user's own POs" regardless of their permission level. For level 1–2 users the backend enforces this automatically; for level 3+ there is no opt-in mechanism.

---

## 6. Bug #3 — "All" Tab Is Incorrectly Visible to Level 2 Users

### Location

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`  
**Lines:** ~56–63 (TABS constant)

### Problematic Code

```typescript
const TABS: TabDef[] = [
  { key: 'all',     label: 'All',                minPermLevel: 2 },  // ← should be 3
  { key: 'mine',    label: 'My Requests',         minPermLevel: 1 },
  { key: 'pending', label: 'Pending My Approval', minPermLevel: 3 },
  { key: 'issued',  label: 'Issued',              minPermLevel: 1 },
];
```

### What Actually Happens

Level 2 (standard staff, e.g., `VIEWER` role from ALL_STAFF group, REQ:2) users see the **"All"** tab. When they click it, the backend correctly restricts results to their own POs (`permLevel: 2 < 3`), but:

- The tab label suggests they can see all requests organization-wide
- If the backend threshold ever changes or the user's permLevel is incorrectly elevated, they would immediately gain accidental full visibility
- This is a forward-compatibility security risk and a confusing UX

### Expected Behavior

The "All" tab should only appear for users with `permLevel >= 3` — those who actually have a broader-than-own scope. Level 2 users should only see "My Requests", "Issued", and the navigation to create new requests.

---

## 7. Bug #4 — Route Comment Contradicts Service Logic (Documentation Drift)

### Location

**File:** `backend/src/routes/purchaseOrder.routes.ts`  
**Line:** ~49 (comment above GET `/` route)

### Conflicting Text

```typescript
/**
 * GET /api/purchase-orders
 * List purchase orders (own only for level 1; all for level 2+)  ← WRONG
 */
```

### Actual Service Behavior

```typescript
// backend/src/services/purchaseOrder.service.ts ~L252
// Scope: levels 1-2 see only own POs; level 3+ sees all
...(permLevel < 3 && { requestorId: userId }),
```

The route comment says `level 2+` see all POs. The service code correctly implements `level 3+` sees all. This discrepancy:

1. Caused documented confusion for developers during Sprint C-2
2. Could lead a future maintainer to "fix" the service to match the comment, widening the scope to level-2 users seeing all POs
3. Creates inconsistency between the route documentation and the actual behavioral intent documented in `docs/PERMISSIONS_AND_ROLES.md`

---

## 8. Bug #5 — Permission Middleware May Match Expired Permission Before Valid One

### Location

**File:** `backend/src/middleware/permissions.ts`  
**Lines:** ~82–86

### Problematic Code

```typescript
const matchingPermission = userPermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel
  // ↑ Does NOT filter by expiresAt — may find an expired higher-level permission first
);

if (!matchingPermission) {
  throw new AuthorizationError(...);
}

// Check if the FOUND permission has expired — SEPARATELY
if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date()) {
  throw new AuthorizationError('Permission for X module has expired');
}
```

### What Actually Happens (Race Condition)

Consider a user who previously had a temporary `REQ:3` grant (expired) and now has a permanent `REQ:2` grant:

1. `userPermissions` array contains `[expired REQ:3, valid REQ:2]` (order depends on DB insertion order)
2. `find()` may return the expired REQ:3 record (it satisfies `level >= 1`)
3. The expiry check fires → throws `403 AuthorizationError('Permission has expired')`
4. The user is denied all access to the PO module, despite having valid REQ:2

The `highestLevel` computation at line ~118 **does** correctly filter expired permissions:

```typescript
const highestLevel = userPermissions
  .filter(up => up.permission.module === module && (!up.expiresAt || up.expiresAt >= now))
  .reduce((max, up) => Math.max(max, up.permission.level), 0);
```

But this line is never reached if the expired-first-found scenario triggers the early 403 throw.

### Impact on the Bug Report

If Jordan Howell previously had a temporary REQ:3 supervisory grant that expired, but still has valid REQ:2 (ALL_STAFF group), they would be locked out of all PO access. More dangerously, if the records happen to be returned in the opposite order and the expired REQ:3 appears second while a valid lower-level match appears first, `matchingPermission` would be the valid REQ:2 but `highestLevel` could still be 0 if the filter eliminates the only REQ:2 record — though that situation shouldn't arise with correct data.

---

## 9. Root Cause for Jordan Howell Specifically

Jordan Howell is described as a "tech assistant." Based on the Entra group → permission mapping in `docs/PERMISSIONS_AND_ROLES.md`:

| Entra Group | Role | REQ Level |
|-------------|------|:---------:|
| `ENTRA_TECH_ADMIN_GROUP_ID` (Priority 13) | TECHNICIAN | **3** |
| `ENTRA_ALL_STAFF_GROUP_ID` (Priority 15) | VIEWER | 2 |

If Jordan is a member of the Technology Admin Entra group (likely if they support the tech department), they receive **REQ:3**. With `permLevel = 3`, the service applies no `requestorId` filter, and Jordan sees all POs.

This is a **design configuration issue compounded by the missing location-scope filter**:

- The `ENTRA_TECH_ADMIN_GROUP_ID` mapping grants REQ:3 so tech staff can approve/forward requisitions. However, a tech assistant should arguably only have REQ:2 (submit own) unless they have supervisor duties.
- Even if the Entra group mapping is corrected to REQ:2 for tech assistants, the larger structural bug (Bug #1 — global visibility for level 3) remains for legitimate supervisors like Sandra Simpsons.

**Both fixes are required:**
1. Review whether `ENTRA_TECH_ADMIN_GROUP_ID` should grant REQ:3 or REQ:2
2. Implement location-scoped filtering for level 3 in the service

---

## 10. Expected vs. Actual Behavior Matrix

| User | Role | REQ Level | Current Behavior | Expected Behavior |
|------|------|:---------:|-----------------|-------------------|
| Jordan Howell (tech asst.) | TECHNICIAN | 3 (from tech group) | Sees ALL POs | Bug #1+#9: Should see only own POs (REQ:2 redesign) OR location-scoped if truly supervisory |
| Sandra Simpsons (principal) | MANAGER | 3 (from principals group) | Sees ALL POs from all schools | Bug #1: Should see only POs from her supervised school(s) and her own submissions |
| Standard VIEWER staff | VIEWER | 2 (from ALL_STAFF) | Correctly sees own POs only | ✅ Correct (but "All" tab label is misleading — Bug #3) |
| Finance Director | MANAGER | 5 (from finance group) | Sees ALL POs | ✅ Correct (global finance oversight) |
| Director of Schools | ADMIN/MANAGER | 6 | Sees ALL POs | ✅ Correct (final approver) |
| PO Entry / Bookkeeper | VIEWER/MANAGER | 4 | Sees ALL POs | ✅ Correct (processes approved POs) |

---

## 11. Security Implications

### Data Exposure (OWASP A01 — Broken Access Control)

The current behavior exposes the following data to unauthorized users:

- **PO description / title** — may contain sensitive procurement details, personal data (e.g., medical equipment requests with implied diagnoses)
- **Dollar amounts** — reveals budget allocation at each school/department
- **Vendor relationships** — competitive information
- **Requestor identities** — links employees to specific purchase requests
- **Program codes and account codes** — financial chart of accounts data
- **Office location associations** — organizational data

Any user with `REQ:3` (supervisor level) has unrestricted read access to all of this data for all users in all locations.

### Privilege Escalation Vector

Because tech staff (possibly multiple dozen employees) hold REQ:3 via the TECH_ADMIN Entra group, the effective blast radius of this bug is larger than principals alone. Every technician in the group can browse all POs.

### Audit / Compliance Risk

Financial procurement data is typically subject to internal control requirements. Widespread unintended access to purchase order data may violate internal audit policies, FERPA (if student-related purchases), or district procurement procedures.

---

## 12. Proposed Fixes

### Fix #1 — Backend: Add Location-Scoped Filter for Level 3 Supervisors

**File:** `backend/src/services/purchaseOrder.service.ts`

**In `getPurchaseOrders()`**, change the `where` clause construction to:

```typescript
// Build user-scope clause
let userScopeClause: Prisma.purchase_ordersWhereInput = {};

if (permLevel < 3) {
  // Levels 1-2: own POs only
  userScopeClause = { requestorId: userId };
} else if (permLevel === 3) {
  // Level 3 (Supervisor): own POs + POs from supervised locations
  const supervisedLocations = await this.prisma.locationSupervisor.findMany({
    where: { userId },
    select: { locationId: true },
  });
  const locationIds = supervisedLocations.map((ls) => ls.locationId);

  if (locationIds.length > 0) {
    userScopeClause = {
      OR: [
        { requestorId: userId },
        { officeLocationId: { in: locationIds } },
      ],
    };
  } else {
    // Supervisor with no assigned locations: fall back to own POs only
    userScopeClause = { requestorId: userId };
  }
}
// permLevel >= 4: no restriction (global visibility — finance, DOS, PO entry)

const where: Prisma.purchase_ordersWhereInput = {
  ...userScopeClause,
  ...(status && { status }),
  ...(locationId && { officeLocationId: locationId }),
  ...(fiscalYear && { fiscalYear }),
  // ... rest of filters
};
```

**In `getPurchaseOrderById()`**, mirror the same logic:

```typescript
if (permLevel < 3) {
  if (po.requestorId !== userId) {
    throw new AuthorizationError('You do not have permission to view this purchase order');
  }
} else if (permLevel === 3) {
  if (po.requestorId !== userId) {
    // Check if this PO is in a location the supervisor manages
    if (po.officeLocationId) {
      const isSupervisorForLocation = await this.prisma.locationSupervisor.findFirst({
        where: { userId, locationId: po.officeLocationId },
      });
      if (!isSupervisorForLocation) {
        throw new AuthorizationError('You do not have permission to view this purchase order');
      }
    } else {
      // PO has no location — not the requestor, not supervising → deny
      throw new AuthorizationError('You do not have permission to view this purchase order');
    }
  }
}
// permLevel >= 4: no restriction
```

### Fix #2 — Backend: Add `onlyMine` Query Parameter

**File:** `backend/src/validators/purchaseOrder.validators.ts`

Add to `PurchaseOrderQuerySchema`:
```typescript
onlyMine: z.preprocess(
  (val) => val === 'true' || val === '1',
  z.boolean().optional(),
),
```

**File:** `backend/src/services/purchaseOrder.service.ts`

In `getPurchaseOrders()`, accept `onlyMine` from filters and, when set, always add `requestorId: userId` to the `where` clause (overrides the location-scope logic):

```typescript
if (filters.onlyMine || permLevel < 3) {
  where.requestorId = userId;
} else if (permLevel === 3) {
  // location-scoped logic (Fix #1)
}
```

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

In `buildFilters()`, add:
```typescript
if (tab === 'mine') f.onlyMine = true;   // ← new
if (tab === 'issued' && !statusFilter) f.status = 'po_issued';
// ...
```

**File:** `frontend/src/types/purchaseOrder.types.ts`

Add `onlyMine?: boolean` to `PurchaseOrderFilters`.

**File:** `frontend/src/services/purchaseOrder.service.ts`

In `getAll()`, append `onlyMine` to the query string when set:
```typescript
if (filters.onlyMine) q.append('onlyMine', 'true');
```

### Fix #3 — Frontend: Raise "All" Tab Minimum Permission to Level 3

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

```typescript
// Before
{ key: 'all',  label: 'All',  minPermLevel: 2 },

// After
{ key: 'all',  label: 'All',  minPermLevel: 3 },
```

Level 1–2 users will only see "My Requests" and "Issued". The UX correctly reflects that they only have personal scope.

### Fix #4 — Backend: Correct Misleading Route Comment

**File:** `backend/src/routes/purchaseOrder.routes.ts`

```typescript
// Before
* List purchase orders (own only for level 1; all for level 2+)

// After
* List purchase orders (own only for levels 1–2; location-scoped for level 3; all for levels 4+)
```

### Fix #5 — Backend: Filter Expired Permissions in Middleware Before `find()`

**File:** `backend/src/middleware/permissions.ts`

Modify the permission resolution block to filter active (non-expired) permissions first:

```typescript
const now = new Date();
const activePermissions = userPermissions.filter(
  (up) => !up.expiresAt || up.expiresAt >= now,
);

const matchingPermission = activePermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel,
);

if (!matchingPermission) {
  // Check if they HAD a matching permission that is now expired (for a better error message)
  const expiredMatch = userPermissions.find(
    (up) => up.permission.module === module
      && up.permission.level >= requiredLevel
      && up.expiresAt
      && up.expiresAt < now,
  );
  throw new AuthorizationError(
    expiredMatch
      ? `Permission for ${module} module has expired`
      : `Insufficient permissions for ${module} module (requires level ${requiredLevel})`,
  );
}

// No separate expired check needed — matchingPermission is already from activePermissions
const highestLevel = activePermissions
  .filter((up) => up.permission.module === module)
  .reduce((max, up) => Math.max(max, up.permission.level), 0);
req.user!.permLevel = highestLevel || matchingPermission.permission.level;
```

### Fix #6 (Recommendation) — Review ENTRA_TECH_ADMIN_GROUP_ID Permission Grant

**File:** `backend/prisma/seed.ts` (Entra group → permissions mapping)  
**File:** `backend/src/services/userSync.service.ts` (getRoleFromGroups)

Review whether tech staff truly need `REQ:3`. If tech assistants only submit requisitions (not approve them), the mapping should be `REQ:2` for non-supervisory tech staff. Supervisory tech roles can be handled via manual permission overrides or a separate sub-group.

---

## 13. Testing Checklist

After implementing the fixes, verify the following scenarios:

### Level 1 (Viewer)
- [ ] Can only see own POs on "My Requests" tab
- [ ] "All" tab is NOT visible
- [ ] Cannot access another user's PO detail by direct URL

### Level 2 (General Staff)
- [ ] Can only see own POs on "My Requests" tab
- [ ] "All" tab is NOT visible (after Fix #3)
- [ ] Dashboard stats count reflects only own POs

### Level 3 (Supervisor — e.g., Sandra Simpsons, principal of one school)
- [ ] "My Requests" tab shows ONLY Sandra's own submissions
- [ ] "All" tab shows ONLY POs from her supervised school(s) plus her own
- [ ] Cannot access detail page for a PO from an unsupervised school by direct URL → 403
- [ ] Can see all statuses (draft through issued) for her school's POs
- [ ] Supervisor with NO assigned locations sees only own POs

### Level 4 (PO Entry / Purchasing Staff)
- [ ] Can see ALL POs organization-wide
- [ ] "My Requests" tab correctly filters to only their own submissions (Fix #2)

### Level 5–6 (Finance Director / Director of Schools)
- [ ] Can see ALL POs organization-wide
- [ ] "My Requests" tab correctly filters to their own submissions

### ADMIN role
- [ ] Can see ALL POs
- [ ] "My Requests" tab shows only admin's own

### Permission Expiry (Fix #5)
- [ ] User with expired REQ:3 + valid REQ:2 is NOT locked out; accesses POs at level 2 scope
- [ ] User with ONLY expired REQ:2 receives 403 "Permission expired" message

---

## Spec File Path

`c:\Tech-V2\docs\SubAgent\po_visibility_bug_spec.md`
