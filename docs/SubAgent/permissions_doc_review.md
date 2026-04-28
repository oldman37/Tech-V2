# Permissions Documentation Review
## Tech-V2 — `docs/permission.md`

**Review Type:** Accuracy, Completeness & Quality Assessment  
**Reviewed:** 2026-03-12  
**Reviewer:** Copilot Review Agent  
**Document Under Review:** `docs/permission.md`  
**Source Files Cross-Referenced:**
- `backend/src/middleware/auth.ts`
- `backend/src/middleware/permissions.ts`
- `backend/src/middleware/csrf.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `frontend/src/store/authStore.ts`
- `frontend/src/components/ProtectedRoute.tsx`
- `backend/src/routes/inventory.routes.ts`
- `backend/src/routes/purchaseOrder.routes.ts`
- `backend/src/routes/assignment.routes.ts`
- `backend/src/routes/fundingSource.routes.ts`
- `backend/src/routes/user.routes.ts`
- `backend/src/routes/admin.routes.ts`
- `backend/src/routes/auth.routes.ts`
- `shared/src/types.ts`

---

## Assessment: NEEDS_REFINEMENT

The document is largely high quality — comprehensive, well-structured, and accurate at the code level. However, **three confirmable factual errors** were found by cross-referencing source files. Two affect developer safety (middleware order confusion, undocumented security edge case); one is a data counting error. These must be corrected before the document is used as a reference for new feature development.

---

## Summary Score Table

| Category              | Score  | Grade |
|-----------------------|--------|-------|
| Accuracy              | 7/10   | C     |
| Completeness          | 9/10   | A     |
| Security Coverage     | 7/10   | C     |
| Developer Usability   | 7/10   | C     |
| API Route Accuracy    | 8/10   | B     |
| Formatting            | 10/10  | A     |
| **Overall**           | **8/10** | **B-** |

---

## CRITICAL Issues (must fix — incorrect or dangerous)

---

### CRITICAL-1: Middleware order is wrong in Section 7.1 AND Section 11 examples — contradicts Section 10 and the actual code

**Location:** Section 7.1 "Middleware Stack" and Section 11 "Adding Permissions to New Features"

**Document Claims (Section 7.1):**
```
authenticate → validateCsrfToken → checkPermission → validateRequest → controller
```

**What Section 10 says (contradicting 7.1):**
> `validateRequest` (Zod schema) runs **before** permission checks — invalid input is rejected early, before any DB query or permission DB lookup is performed.

**What the actual code does (consistent with Section 10):**

From `inventory.routes.ts`:
```typescript
router.post(
  '/inventory',
  validateRequest(CreateInventorySchema, 'body'),   // ← runs FIRST
  checkPermission('TECHNOLOGY', 2),                 // ← runs SECOND
  inventoryController.createInventoryItem
);
```

From `purchaseOrder.routes.ts`:
```typescript
router.post('/',
  validateRequest(CreatePurchaseOrderSchema, 'body'),  // ← FIRST
  checkPermission('REQUISITIONS', 2),                  // ← SECOND
  purchaseOrderController.createPurchaseOrder,
);
```

Both routes — and all other routes verified — consistently place `validateRequest` **before** `checkPermission`. The correct order is:

```
authenticate → validateCsrfToken → validateRequest → checkPermission → controller
```

**Additionally, Section 11's example code omits `validateRequest` entirely**, showing bare `checkPermission` without any input validation in the route definition. This does not match the codebase pattern and could lead new developers to skip input validation when adding new routes.

**Impact:** A developer following Section 7.1 would implement new routes with `checkPermission` before `validateRequest`. This means malformed payloads would trigger a DB permission query before Input validation rejects them — wasting a DB roundtrip and diverging from the codebase's established security-first pattern.

**Fix Required:**
1. Correct Section 7.1 middleware order to: `authenticate → validateCsrfToken → validateRequest → checkPermission → controller`
2. Update Section 11 "Adding Permissions" code examples to include `validateRequest` *before* `checkPermission`

---

### CRITICAL-2: Seeded permission record count is wrong — "All 14" should be "All 17"

**Location:** Section 3 heading "Seeded Permission Records (All 14)"

**Document Claims:** 14 seeded permission records.

**Actual count from `prisma/seed.ts`:**

| Module | Levels | Count |
|--------|--------|------:|
| TECHNOLOGY | 1, 2, 3 | 3 |
| MAINTENANCE | 1, 2, 3 | 3 |
| REQUISITIONS | 1, 2, 3, 4, 5 | 5 |
| PROFESSIONAL_DEV | 0, 1 | 2 |
| SPECIAL_ED | 0, 1 | 2 |
| TRANSCRIPTS | 0, 1 | 2 |
| **Total** | | **17** |

The seed script itself logs: `✅ Created ${allPermissions.length} permissions across 6 modules`, which would print **17** at runtime.

The count of 14 appeared in the spec document and was carried forward unchecked into `permission.md`.

**Note:** Section 4 of the document's permission matrix in the spec also says "14 seeded permission records" with the same error. The spec (`permissions_doc_spec.md` Section 4.6) should be updated to match.

**Impact:** Low functional risk, but a clearly wrong fact in a reference document undermines credibility. Developers seeding their database will get 17 records, not 14.

**Fix Required:** Change "Seeded Permission Records (All 14)" to "Seeded Permission Records (All 17)"

---

### CRITICAL-3: `checkPermission` expiry ordering bug not documented — creates a false 403 scenario in Security Considerations and Troubleshooting

**Location:** Section 7.4 key behaviors, Section 10 "Permission Expiry", Section 12 Q&A troubleshooting

**Document Claims (Section 10):**
> An expired permission is treated as absent (same as having no permission) and returns `403`.

**What the actual code does:**

```typescript
// Step 1: Find ANY matching permission (ignoring expiresAt)
const matchingPermission = userPermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel
);

if (!matchingPermission) {
  throw new AuthorizationError(...);
}

// Step 2: Check if THAT specific match is expired
if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date()) {
  throw new AuthorizationError(`Permission for ${module} module has expired`);
}
```

**The edge-case bug this creates:**  
If a user has both `TECHNOLOGY:3` (expired) and `TECHNOLOGY:1` (valid), and a route calls `checkPermission('TECHNOLOGY', 1)`:

1. `find()` may return `TECHNOLOGY:3` first (satisfies `level >= 1`, and `findMany` has no explicit ordering).
2. The expiry check fires on `TECHNOLOGY:3` → returns `403 Forbidden`.
3. `TECHNOLOGY:1` (which is valid) is never evaluated.

**Result:** The user is denied access even though they have a valid permission for the required level. The document's troubleshooting guide (Section 12) does not mention this scenario.

The document correctly describes the DB query logic in Section 7.4, but does not flag this as a known limitation and the Security section's "Permission Expiry" description is misleading in edge cases (it implies expired = absent, which is only true when no lower valid permission exists).

**Impact:** Developers diagnosing unexpected 403 errors for users with mixed expired/valid permissions for the same module will not find guidance in the document. The FAQ explains "check expiresAt" but doesn't acknowledge this can produce a false 403 even with valid lower-level permissions.

**Fix Required:**
1. Add a bug/limitation note to Section 7.4:
   > **Known limitation:** `find()` is performed without expiry filtering. If a user has a higher-level expired permission and a lower-level valid permission for the same module, `find()` may select the expired record (depending on DB return order), causing a false `403`. The `highestLevel` recalculation below does filter expiry correctly, but the initial gate check does not. This edge case should be fixed by filtering expiry within the initial `find()`.
2. Add an entry to Section 12 FAQ for the symptom: "User has a valid permission listed but still gets 403" pointing to this edge case.

---

## RECOMMENDED Issues (should fix — inaccurate or misleading)

---

### RECOMMENDED-1: Section 7.1 table summary for `requireAdmin` is incomplete

**Location:** Section 7.1 Middleware Stack table, "Purpose" column for `requireAdmin`

**Document Claims:** "Checks `roles[0] === 'ADMIN'`"

**Actual code:**
```typescript
const hasAdminRole = req.user.roles.includes('ADMIN');
const isInAdminGroup = adminGroupId && req.user.groups.includes(adminGroupId);

if (!hasAdminRole && !isInAdminGroup) { ...
```

`requireAdmin` checks BOTH the `roles` array AND the raw Entra group membership (`ENTRA_ADMIN_GROUP_ID`). The table uses `.roles[0]` which implies only the first role element is checked and the group fallback is ignored.

Section 7.3 correctly shows the full dual-check code — so this is not wrong throughout the document — but the Section 7.1 summary table is misleading.

**Fix:** Update Section 7.1 purpose cell to: "Checks `roles.includes('ADMIN')` OR Entra admin group membership"

---

### RECOMMENDED-2: Admin sync route paths in Section 9 are incorrect/incomplete

**Location:** Section 9 Admin/Settings Routes table

**Document Claims:**
```
POST | /admin/sync-users | ✓ | ADMIN
```

**Actual routes in `admin.routes.ts`:**
```
POST /admin/sync-users/all     — sync all Entra users
POST /admin/sync-users/staff   — sync All Staff group only
POST /admin/sync-users/students — sync All Students group only
```

There is no `POST /admin/sync-users` bare endpoint. The document under-documents the admin sync API by collapsing three distinct endpoints into one incorrect path.

**Fix:** Replace the single row with three rows showing the correct paths `/admin/sync-users/all`, `/admin/sync-users/staff`, `/admin/sync-users/students`.

---

### RECOMMENDED-3: CSRF pattern name is technically inaccurate

**Location:** Section 7.5 heading "Pattern: Double Submit Cookie"

**Issue:** The standard Double Submit Cookie pattern requires the `XSRF-TOKEN` cookie to **not** be HttpOnly, so JavaScript can read the cookie value and submit it back as a request header. In this implementation, the `XSRF-TOKEN` cookie IS marked `httpOnly: true`, meaning JavaScript cannot read it. Instead, the server sends the token value in the `X-CSRF-Token` response header, which the frontend reads and caches.

This is more accurately described as a **Custom Request Header token** pattern (or "header-delivered synchronizer token"), not a textbook Double Submit Cookie pattern.

The described implementation IS secure (attacker cannot read the httpOnly cookie or produce the custom header from a cross-origin context), but labeling it "Double Submit Cookie" may mislead developers implementing similar patterns who follow the documented name to external references and find mismatching behavior.

**Fix:** Rename the pattern label to "Custom Request Header CSRF Token" or add a parenthetical: "Double Submit Cookie (httpOnly variant — token delivered via response header, not readable cookie)"

---

## OPTIONAL Issues (nice to have)

---

### OPTIONAL-1: `optionalAuth` and `requireGroup` middlewares are not documented

**Location:** Section 7.1 Middleware Stack table

`auth.ts` exports three additional middleware functions not mentioned in the document:
- `optionalAuth` — authenticates without failing if no token present (used for endpoints that behave differently for authenticated vs. anonymous users)
- `requireGroup(groupId)` — gate based on a raw Entra group GUID rather than an application role

These are not currently used in documented routes, but listing them in Section 7.1 (even in a "less common middleware" sub-section) would prevent future developers from creating redundant alternatives.

---

### OPTIONAL-2: Section 8.1 auth store note regarding module permissions

Section 8.1 documents that JWT tokens are not stored in localStorage, which is good. It would be worth adding a note stating that module `permLevel` values are intentionally not exposed to frontend state — they are set server-side per request by `checkPermission` and only available within the request context. This prevents the misunderstanding that the frontend could inspect `user.permLevel` from the store for UI decisions.

---

### OPTIONAL-3: Section 12 FAQ — no entry for the "new login required after permission change" issue

The document mentions Entra sync updates permissions at login time, but the FAQ doesn't cover the scenario where an admin manually updates permissions via `PUT /api/users/:id/permissions` and the user needs to refresh their JWT to pick up the new effective permissions in `req.user.groups[]`. The permissions DB records take effect immediately (next API call runs `checkPermission` live against the DB), but the `roles` field in the JWT is stale until re-login. A FAQ entry explaining this nuance would prevent support confusion.

---

## What the Document Does Well

- **Schema documentation** (Section 6): Prisma models shown match the actual schema precisely for all permission-relevant fields.
- **`checkPermission` code listing** (Section 7.4): The full middleware code is reproduced accurately and the key behaviors (ADMIN bypass, highest-level attachment) are correctly explained.
- **`ProtectedRoute` component** (Section 8.2): Code shown matches the actual component exactly.
- **`authStore.ts`** (Section 8.1): Interface and persisted-state description match the actual store.
- **CSRF implementation** (Section 7.5): Code shown is accurate; security note about `timingSafeEqual` is correct.
- **Purchase Order route permission map** (Section 9): All endpoints verified against `purchaseOrder.routes.ts` — all levels accurate.
- **Permission matrix** (Section 2 and 4): Entra group → role → module level mappings are internally consistent and consistent with the spec.
- **Security Considerations** (Section 10): OWASP alignment table is appropriate and well-reasoned.
- **Formatting and structure**: Excellent use of Markdown, well-organized ToC with working anchors, consistent table formatting throughout.

---

## Corrections Summary

| # | Severity | Section | Finding | Action |
|---|----------|---------|---------|--------|
| 1 | CRITICAL | 7.1, 11 | Middleware order reversed — `validateRequest` runs before `checkPermission` in actual code | Correct order in §7.1; add `validateRequest` to §11 examples |
| 2 | CRITICAL | 3 | "All 14" seeded permissions — actual count is 17 | Change to "All 17" |
| 3 | CRITICAL | 7.4, 10, 12 | `checkPermission` expiry bug not documented — expired higher-level can block valid lower-level | Add limitation note to §7.4; add FAQ entry to §12 |
| 4 | RECOMMENDED | 7.1 | `requireAdmin` summary says `roles[0] === 'ADMIN'` — misses Entra group fallback check | Update summary cell |
| 5 | RECOMMENDED | 9 | Admin sync route listed as `/admin/sync-users` — actual routes are `/all`, `/staff`, `/students` | Expand to 3 rows with correct paths |
| 6 | RECOMMENDED | 7.5 | Pattern labeled "Double Submit Cookie" — XSRF-TOKEN is httpOnly; token delivered via response header | Rename/clarify pattern label |
| 7 | OPTIONAL | 7.1 | `optionalAuth`, `requireGroup` undocumented | Add to middleware table |
| 8 | OPTIONAL | 8.1 | `permLevel` not in frontend state — worth making explicit | Add a note |
| 9 | OPTIONAL | 12 | No FAQ for "permission updated but still 403 on first call after admin grant" — JWT expiry/live DB nuance | Add FAQ entry |

---

*Review document for: [docs/permission.md](../permission.md)*  
*Spec document: [docs/SubAgent/permissions_doc_spec.md](permissions_doc_spec.md)*
