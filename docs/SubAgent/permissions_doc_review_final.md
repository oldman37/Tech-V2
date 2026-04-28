# Permissions Documentation — Final Review
## Tech-V2 — `docs/permission.md`

**Review Type:** Post-Refinement Verification  
**Reviewed:** 2026-03-12  
**Reviewer:** Copilot Review Agent  
**Document Under Review:** `docs/permission.md`  
**Previous Review:** `docs/SubAgent/permissions_doc_review.md`  
**Source Files Cross-Referenced:**
- `backend/src/middleware/auth.ts`
- `backend/src/middleware/permissions.ts`
- `backend/src/middleware/csrf.ts`
- `backend/prisma/seed.ts`
- `backend/src/routes/admin.routes.ts`
- `backend/src/routes/inventory.routes.ts`
- `backend/src/routes/purchaseOrder.routes.ts`
- `backend/src/routes/user.routes.ts`

---

## Assessment: APPROVED

All three CRITICAL issues from the initial review have been resolved. All three RECOMMENDED improvements are implemented. All three OPTIONAL improvements were also addressed. One minor residual inconsistency was introduced in the Section 5.2 flow diagram during refinement — it is cosmetic and does not affect any enforcement documentation.

---

## Summary Score Table

| Category | Initial Score | Final Score | Grade |
|----------|--------------|-------------|-------|
| Accuracy | 7/10 | 9/10 | A- |
| Completeness | 9/10 | 10/10 | A |
| Security Coverage | 7/10 | 9/10 | A- |
| Developer Usability | 7/10 | 9/10 | A- |
| API Route Accuracy | 8/10 | 9/10 | A- |
| Formatting | 10/10 | 10/10 | A |
| **Overall** | **8/10 (B-)** | **9/10 (A-)** | **A-** |

---

## CRITICAL Issues — Verification

### CRITICAL-1: Middleware order ✅ RESOLVED

**Initial finding:** Section 7.1 and Section 11 showed `validateRequest` running *after* `checkPermission`, contradicting actual route files.

**Verified resolution:**
- Section 7.1 middleware table now includes a dedicated `validateRequest` row with description: "Zod input validation — runs **before** `checkPermission` so invalid input is rejected before any DB query."
- Section 7.1 summary now states: `authenticate → validateCsrfToken → validateRequest → checkPermission → controller`
- Section 11 code examples (GET, POST, and admin-only routes) all show `validateRequest` placed before `checkPermission`, with inline comment:
  > "Order: authenticate → validateCsrfToken → validateRequest → checkPermission → controller"

Cross-checked against `inventory.routes.ts`, `purchaseOrder.routes.ts`, and `user.routes.ts` — all confirmed `validateRequest` before `checkPermission` in actual code. ✓

---

### CRITICAL-2: Seeded permission count ✅ RESOLVED

**Initial finding:** Section 3 heading stated "All 14" seeded permission records; actual count in `prisma/seed.ts` is 17.

**Verified resolution:**
- Section 3 heading now reads: **"Seeded Permission Records (All 17)"** ✓

Count re-verified from `seed.ts`:

| Module | Levels | Count |
|--------|--------|------:|
| TECHNOLOGY | 1, 2, 3 | 3 |
| MAINTENANCE | 1, 2, 3 | 3 |
| REQUISITIONS | 1, 2, 3, 4, 5 | 5 |
| PROFESSIONAL_DEV | 0, 1 | 2 |
| SPECIAL_ED | 0, 1 | 2 |
| TRANSCRIPTS | 0, 1 | 2 |
| **Total** | | **17** |

Confirmed correct. ✓

---

### CRITICAL-3: `checkPermission` expiry ordering ✅ RESOLVED

**Initial finding:** The undocumented edge case where an expired higher-level permission can block a valid lower-level permission and cause a false `403`.

**Verified resolution across three locations:**

**Section 7.4** — "Known limitation — expiry check ordering" note added:
> The initial `find()` gate does **not** pre-filter by expiry. If a user holds multiple permissions for the same module (e.g., `TECHNOLOGY:3` expired AND `TECHNOLOGY:1` valid) and a route requires level 1, `find()` may return the expired `TECHNOLOGY:3` record first. The expiry check then fires on that record and throws `403`, even though the valid `TECHNOLOGY:1` permission was never evaluated. The `highestLevel` recalculation lower in the function does filter expiry correctly, but it only runs **after** the gate check passes. **Workaround:** Remove expired permissions promptly by resubmitting the user's full permission set via `PUT /api/users/:id/permissions`.

**Section 10 "Permission Expiry"** — Qualified to read "returns `403 Forbidden` in most cases — with one edge case" and cross-referenced to §7.4 known limitation and the new FAQ entry. ✓

**Section 12 FAQ** — New entry added: "Q: User gets 403 even though they have a valid lower-level permission for the module" with diagnosis SQL query and fix instructions. ✓

Cross-checked against `permissions.ts` source: the `find()` → expiry-check sequence is accurately described. ✓

---

## RECOMMENDED Issues — Verification

### RECOMMENDED-1: `requireAdmin` summary in Section 7.1 ✅ RESOLVED

**Initial finding:** Section 7.1 table row for `requireAdmin` said "Checks `roles[0] === 'ADMIN'`", missing the Entra group fallback.

**Verified resolution:**
- Section 7.1 table now reads: "Checks `roles.includes('ADMIN')` OR Entra admin group membership" ✓

Cross-checked against `auth.ts`: `requireAdmin` performs both `req.user.roles.includes('ADMIN')` AND `req.user.groups.includes(adminGroupId)`. Section 7.3 full code listing is also correct. ✓

---

### RECOMMENDED-2: Admin sync route paths in Section 9 ✅ RESOLVED

**Initial finding:** Section 9 showed a single `POST /admin/sync-users` row; actual routes are `/all`, `/staff`, `/students`, and `/group/:groupId`.

**Verified resolution:**
- Section 9 Admin/Settings Routes table now shows 4 rows:
  - `POST /admin/sync-users/all`
  - `POST /admin/sync-users/staff`
  - `POST /admin/sync-users/students`
  - `POST /admin/sync-users/group/:groupId`

Cross-checked against `admin.routes.ts` — all four routes confirmed. ✓

---

### RECOMMENDED-3: CSRF pattern name ✅ RESOLVED

**Initial finding:** Pattern was labeled "Double Submit Cookie" but the `XSRF-TOKEN` cookie is HttpOnly (JavaScript cannot read it); the token is delivered via response header — making it a Custom Request Header pattern.

**Verified resolution:**
- Section 7.5 now reads: "Custom Request Header CSRF Token (httpOnly variant — the `XSRF-TOKEN` cookie is marked `httpOnly: true` so JavaScript cannot read it directly; the token is instead delivered to the client via the `X-CSRF-Token` **response header**...)" ✓

Note: The comment block at the top of `csrf.ts` still reads "Double Submit Cookie pattern" — this is a code comment inconsistency and is outside the scope of the documentation review, but worth fixing in a follow-up pass.

---

## OPTIONAL Issues — Verification

### OPTIONAL-1: `optionalAuth` and `requireGroup` undocumented ✅ RESOLVED

- Section 7.1 middleware table now lists both `optionalAuth` ("Authenticates without failing if no token is present") and `requireGroup(groupId)` ("Gates access based on raw Entra group GUID"). ✓

### OPTIONAL-2: `permLevel` not exposed in frontend state ✅ RESOLVED

- Section 8.1 now includes an explicit note that module permission levels are set server-side by `checkPermission`, are not in the JWT, not synced to the frontend auth store, and are unavailable to frontend JavaScript. ✓

### OPTIONAL-3: FAQ entry for "permission updated but still 403" ✅ RESOLVED

- Section 12 now includes: "Q: An admin granted a user new permissions, but the user still gets 403" with a clear explanation distinguishing immediate `UserPermission` record changes from JWT-cached role changes, and a summary table showing when each type of change takes effect. ✓

---

## New Issues Found During Refinement

### MINOR-1: Section 5.2 flow diagram — `requireAdmin` box not updated

**Location:** Section 5.2 "API Request Authorization Flow" — the ASCII flow diagram

**Issue:** The `requireAdmin` box in the ASCII flow diagram still shows the pre-refinement text:
```
│ requireAdmin   │
│                │
│ Checks:        │
│ roles[0]       │
│ === 'ADMIN'    │
```

This is inconsistent with the corrected Section 7.1 table (`roles.includes('ADMIN') OR Entra admin group membership`) and the full Section 7.3 code listing. The RECOMMENDED-1 fix was applied to the table and code section but not to the flow diagram.

**Impact:** Very low — the flow diagram is a simplified visualization. Section 7.1 and Section 7.3 (the authoritative reference sections) are both correct. A developer reading the code listing will get the right picture.

**Fix required:** Update the `requireAdmin` flow diagram box to:
```
│ requireAdmin   │
│                │
│ roles.includes │
│ ('ADMIN') OR   │
│ Entra group    │
│ fallback       │
```

---

## Internal Consistency Check

All verified consistent:

| Check | Result |
|-------|--------|
| Middleware order stated in §7.1 matches §11 examples | ✓ Consistent |
| Middleware order stated in §7.1 matches §10 security section | ✓ Consistent |
| Seeded count (17) matches all module-level listings in §3 | ✓ Consistent (3+3+5+2+2+2 = 17) |
| §7.4 expiry limitation cross-referenced to §10 and §12 | ✓ Consistent |
| `requireAdmin` dual-check in §7.1 table matches §7.3 code | ✓ Consistent |
| Admin sync routes in §9 match `admin.routes.ts` | ✓ Consistent |
| CSRF pattern description in §7.5 matches `csrf.ts` behavior | ✓ Consistent |
| `permLevel` note in §8.1 matches §7.4 code behavior | ✓ Consistent |
| §5.2 flow diagram `requireAdmin` box vs §7.1 table | ✗ Minor inconsistency (see MINOR-1) |

---

## Remaining Concerns

1. **MINOR-1** (above) — `requireAdmin` box in Section 5.2 flow diagram not updated. Low priority; does not affect authoritative documentation.

2. **Code comment in `csrf.ts`** — The file-level comment block still calls the pattern "Double Submit Cookie pattern" which is technically inaccurate (now corrected in the docs). Consider updating the source file comment to match the documentation in a separate code cleanup pass.

---

## Conclusion

The refined `docs/permission.md` successfully addresses all findings from the initial review. The document is accurate, internally consistent (with one cosmetic flow-diagram exception), and complete. It is suitable as the authoritative reference for developers building on or maintaining the Tech-V2 permission system.

**Final Assessment: APPROVED**

---

*Final review document for: [docs/permission.md](../permission.md)*  
*Initial review: [docs/SubAgent/permissions_doc_review.md](permissions_doc_review.md)*  
*Spec: [docs/SubAgent/permissions_doc_spec.md](permissions_doc_spec.md)*
