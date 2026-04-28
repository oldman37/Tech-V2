# PO Department / Program / School Selection — Implementation Review

**Feature:** Department, Program, or School selection on Purchase Orders  
**Review Date:** March 19, 2026  
**Reviewer:** Copilot Review Agent (Phase 3)  
**Spec File:** `docs/SubAgent/po_department_selection_spec.md`  
**Status:** PASS

---

## Build Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Backend TypeScript | `npx tsc --noEmit` | ✅ **PASS** — 0 errors |
| Frontend TypeScript | `npx tsc --noEmit` | ✅ **PASS** — 0 errors |
| Prisma Schema | `npx prisma validate` | ✅ **PASS** — schema valid |
| Migration File | `20260319124850_add_po_entity_type` | ✅ **EXISTS** — `entityType TEXT` column + index |

---

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 92% | A |
| Best Practices | 85% | B |
| Functionality | 90% | A- |
| Code Quality | 88% | B+ |
| Security | 95% | A |
| Performance | 90% | A- |
| Consistency | 92% | A |
| Build Success | 100% | A+ |
**Overall Grade: A- (91.5%)**

---

## Overall Assessment: PASS ✅

All critical security requirements are satisfied. One correctness deviation from the spec supervisor-bypass decision tree is flagged as RECOMMENDED. No blocking issues.

---

## Security Compliance Assessment

**Result: PASS — All mandatory security criteria met.**

| Security Criterion | Status | Notes |
|--------------------|--------|-------|
| New routes have `authenticateToken` | ✅ | `router.use(authenticate)` in both `location.routes.ts` and `user.routes.ts` |
| Sensitive operations have `checkPermission` | ✅ | Read-only location/user-self endpoints need no permission gate; write/admin routes have `requireAdmin` |
| All inputs validated with Zod schemas | ✅ | `entityType` enum-validated, `officeLocationId` UUID-validated in `purchaseOrder.validators.ts` |
| No `console.log` statements in reviewed files | ✅ | All output via `logger` (Winston); only internal logger error handler uses `console.error` |
| No sensitive data in logs | ✅ | Logs contain IDs and statuses only; no PII or tokens |
| Custom error classes used | ✅ | `NotFoundError`, `ValidationError`, `AuthorizationError` throughout |
| No tokens in localStorage | ✅ | No localStorage usage observed in reviewed frontend files |
| SQL injection prevented (Prisma ORM only) | ✅ | All queries use Prisma parameterised queries |
| Error messages sanitized for client | ✅ | `handleControllerError` normalises errors; service errors are structured |
| `/users/me/office-location` uses JWT ID only | ✅ | `userId` sourced from `req.user?.id` (JWT), never from request body/params |
| DISTRICT_OFFICE spoofing blocked | ✅ | Service rejects DISTRICT_OFFICE in both `createPurchaseOrder` and `updatePurchaseOrder` |
| Supervisor identity never trusted from client | ✅ | Server derives supervisor from `LocationSupervisor`/`UserSupervisor` tables only |

---

## Detailed File-by-File Findings

---

### 1. `backend/prisma/schema.prisma`

**Verdict: ✅ CORRECT**

- `entityType String?` field added to `purchase_orders` model with `@@index([entityType])` — matches spec section 4.3 exactly.
- Migration `20260319124850_add_po_entity_type/migration.sql` exists with correct `ALTER TABLE` and `CREATE INDEX`.
- No unnecessary model changes; existing `officeLocationId` relation, `OfficeLocation` model, and `LocationSupervisor` model are all unchanged per spec section 4.4–4.5.

**Issues:** None.

---

### 2. `backend/src/services/location.service.ts`

**Verdict: ✅ CORRECT**

- `findAll(options?: { types?: string[] })` correctly implements type-filter per spec section 5.1.
- Internal whitelist validation (`filter((t) => validTypes.includes(t))`) prevents unexpected type values from reaching the DB query.
- Prisma `type: { in: filteredTypes }` only applied when `filteredTypes.length > 0` — preserves original "return all" behavior when no types filter is passed.
- Supervisor include with proper ordering (`isPrimary: 'desc'` ensures primary supervisors sort first) is present.

**Issues:** None.

---

### 3. `backend/src/controllers/location.controller.ts`

**Verdict: ✅ CORRECT with one minor note**

- `getOfficeLocations` correctly parses `types` query param in both array and comma-separated string forms.
- `String(types).split(',').map((t) => t.trim())` handles edge-case whitespace.
- Parameter type is `req: Request` (not `AuthRequest`), which is correct since the controller does not need `req.user`.

**Issues:**

> **OPTIONAL-1**: `GET /locations` route in `location.routes.ts` does not have a `validateRequest()` Zod middleware for the `types` query parameter. The service performs internal whitelist filtering, which provides defense-in-depth, but explicit Zod validation at the route level would be more consistent with how other query params (e.g. `PurchaseOrderQuerySchema`) are validated.

---

### 4. `backend/src/services/user.service.ts`

**Verdict: ✅ CORRECT**

- `getMyOfficeLocation(userId: string)` correctly implements spec section 5.2:
  - Fetches `User.officeLocation` string.
  - Returns `null` (204 response) when `user.officeLocation` is null/empty.
  - Exact-name match against `OfficeLocation.name` (correct — Entra sync normalizes to match the DB name).
  - Includes `supervisors: { where: { isPrimary: true }, take: 1 }` — returns primary supervisor for wizard display.
  - `findFirst` with `isActive: true` guard prevents returning stale locations.

**Issues:** None.

---

### 5. `backend/src/controllers/user.controller.ts`

**Verdict: ✅ CORRECT with pre-existing tech debt**

- `getMyOfficeLocation` controller correctly:
  - Extracts `userId` from `req.user?.id` (JWT middleware — not request params).
  - Returns 204 when `location` is `null`.
  - Returns 200 + location JSON otherwise.

**Issues:**

> **RECOMMENDED-1** (pre-existing, not introduced by this feature): The controller uses `// @ts-ignore - req.user populated by authenticate middleware` in four places (`getMe`, `getMyOfficeLocation`, `updateUserPermissions`, `updateUserRole`). Both new handlers (`getMe`/`getMyOfficeLocation`) should be imported with `AuthRequest` parameter type from `../middleware/auth` to eliminate the `@ts-ignore` comments. This is consistent with how `assignSupervisor` in `location.controller.ts` already uses `AuthRequest`. No security risk — `req.user` is guaranteed by middleware — but the `@ts-ignore` suppresses TypeScript's type safety.

---

### 6. `backend/src/routes/user.routes.ts`

**Verdict: ✅ CORRECT**

- `GET /me/office-location` is correctly placed **before** `router.use(requireAdmin)`, making it accessible to all authenticated users (not just admins) — exactly per spec section 5.2.
- Route chain: `authenticate` → `getMyOfficeLocation`. No `checkPermission` needed since the endpoint returns only the caller's own data.
- `getMyOfficeLocation` is correctly imported and registered.

**Issues:** None.

---

### 7. `backend/src/validators/purchaseOrder.validators.ts`

**Verdict: ✅ CORRECT**

- `entityType: z.enum(['SCHOOL', 'DEPARTMENT', 'PROGRAM']).optional().nullable()` added to `CreatePurchaseOrderSchema` — matches spec section 5.4 exactly.
- `officeLocationId: z.string().uuid()` was already present and remains unchanged.
- `UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial()` automatically inherits the new `entityType` field.
- `program` field retained for backward compatibility per spec guidance.

**Issues:** None.

---

### 8. `backend/src/services/purchaseOrder.service.ts`

**Verdict: ✅ MOSTLY CORRECT — one correctness deviation**

#### `createPurchaseOrder`
- Resolves `entityType` from `officeLocationId` via `officeLocation.findUnique` ✅
- Validates location exists and `isActive: true` ✅
- Rejects `DISTRICT_OFFICE` type with descriptive error ✅
- Stores `entityType: resolvedEntityType` in `purchase_orders.create()` ✅

#### `updatePurchaseOrder`
- Same `officeLocationId` validation and `entityType` resolution as create ✅
- Correctly uses `resolvedEntityType !== undefined` guard to avoid clearing `entityType` on partial updates ✅
- DISTRICT_OFFICE rejection also present in update path ✅

#### `submitPurchaseOrder`
- Priority 1 location supervisor lookup is correct ✅
- Fallback to personal supervisor when no location supervisor found ✅
- Feature flag gate (`supervisorBypassEnabled`) applied correctly ✅
- `supervisorId` included in return value ✅
- Routing decision logged with structured logger ✅

**Issues:**

> **RECOMMENDED-2 (Correctness)**: **`submitPurchaseOrder` — self-supervisor bypass decision for location-is-requestor case deviates from spec.**
>
> **Spec (section 7.1)** defines this decision for the "Record found BUT supervisorId = requestorId" case:
> ```
> └─ isSelfSupervisor = true  → bypass path (if enabled)
> ```
>
> **Current code**: when `locationSupervisorRecord.userId === po.requestorId`, the code sets `isSelfSupervisor = true` but does NOT skip the Priority 2 personal supervisor fallback (condition `if (isSelfSupervisor && !supervisorId)` evaluates to `true`). If the requestor has a personal supervisor who is different from themselves, the PO will be routed to that personal supervisor instead of taking the bypass path.
>
> **Example scenario**: A principal files a PO for their own school. The school's primary supervisor is the principal. The principal also has a superintendent listed as a personal supervisor. Spec says: bypass. Actual: routed to superintendent.
>
> **Proposed fix** (minimal change to `submitPurchaseOrder`):
> ```typescript
> // Add flag before Priority 1 block
> let locationSupervisorIsRequestor = false;
>
> // In the else-if branch:
> } else if (locationSupervisorRecord && locationSupervisorRecord.userId === po.requestorId) {
>   isSelfSupervisor = true;
>   locationSupervisorIsRequestor = true;  // ADD THIS
> }
>
> // Priority 2 condition: add the new flag
> if (isSelfSupervisor && !supervisorId && !locationSupervisorIsRequestor) {
>   // personal supervisor fallback
> }
> ```
>
> **Security note**: The current behavior is more conservative (more review steps), not less. There is no security breach, but the deviation from spec is worth correcting for correctness.

> **OPTIONAL-2 (Performance)**: `this.settingsService.getSettings()` is called twice in `submitPurchaseOrder` — once inside `assertFiscalYearActive()` and once for the bypass flag check. Consider caching the result in a local variable. Minor impact since settings are likely cached in `SettingsService.getSettings()`.

---

### 9. `frontend/src/types/purchaseOrder.types.ts`

**Verdict: ✅ CORRECT**

- `entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null` added to `PurchaseOrderSummary` and `PurchaseOrderDetail` (via inheritance from summary) ✅
- `POOfficeLocation` extended with `type?: string | null` ✅
- `CreatePurchaseOrderInput` updated with `entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null` ✅
- No unjustified `any` types introduced ✅

**Issues:** None.

---

### 10. `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`

**Verdict: ✅ CORRECT with one minor note**

- Location query correctly filters `types=SCHOOL,DEPARTMENT,PROGRAM` ✅
- `useQuery` for `GET /users/me/office-location` correctly implemented ✅
- `groupedLocations` via `useMemo` — correct dependencies ✅
- `handleEntityLocationChange` wrapped in `useCallback` — correct ✅
- Grouped MUI `Select` with `ListSubheader` per spec section 6.1.3 ✅
- Supervisor preview card shown below entity select per spec section 6.1.5 ✅
- Warning shown when no primary supervisor assigned ✅
- "Ship To" field placed below entity select per spec section 6.1.6 ✅
- `entityType` passed in `buildPayload()` ✅
- `autoFilledShipTo` helper text shows when auto-filled ✅
- No `console.log` or `localStorage` usage ✅
- Loading state on Save/Submit buttons ✅
- Error state rendered via `Alert` ✅

**Issues:**

> **OPTIONAL-3 (Auto-fill edge case)**: When `loc.type === 'SCHOOL'` but `myLocation` is `null` (user has no `officeLocation` set in Entra), `handleEntityLocationChange` falls through to the `else` branch and auto-fills `shipTo` with the **selected school's** own address. The spec states the ship-to should come from the requestor's own location. If `myLocation` is null, the appropriate behaviour is to either clear `shipTo` or not auto-fill rather than use the school's address. This is a minor edge case (most staff have an Entra office location) and does not affect approval routing, but could mislead users with no `officeLocation` set.

> **OPTIONAL-4**: `eslint-disable-line react-hooks/exhaustive-deps` comment on `handleEntityLocationChange` deps array. This suppresses a lint warning because React state setter functions (`setShipTo`, etc.) are not listed as deps (correctly, as they are stable). The comment is acceptable but note that `autoFilledShipTo` is in the deps array, causing the callback to re-create whenever `autoFilledShipTo` changes. This is functionally correct but creates a slightly wider callback identity churn than necessary. OPTIONAL optimization only.

---

### 11. `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

**Verdict: ✅ CORRECT**

- Entity location section added to header info grid per spec section 6.2 ✅
- `entityType` chip rendered with correct color: `primary` for SCHOOL, `default` for others ✅
- Label is "Department / School / Program" ✅
- No unjustified `any` types ✅
- Loading skeleton shown while `isLoading` ✅
- Error state shown when `error || !po` ✅
- All action error states have `onClose` handlers ✅

**Issues:** None.

---

## Issue Register

### CRITICAL (must fix before merge)
*None identified.*

---

### RECOMMENDED (should fix)

| ID | File | Description |
|----|------|-------------|
| REC-1 | `purchaseOrder.service.ts` ~L525–L560 | Self-supervisor bypass skipped when entity location supervisor IS the requestor; code falls through to personal supervisor fallback instead of taking bypass path (see detailed fix above) |
| REC-2 | `user.controller.ts` L27, L45, L91, L165 | Pre-existing `@ts-ignore` comments for `req.user`; replace `Request` with `AuthRequest` parameter type in `getMe` and `getMyOfficeLocation` handlers |

---

### OPTIONAL (nice to have)

| ID | File | Description |
|----|------|-------------|
| OPT-1 | `RequisitionWizard.tsx` `handleEntityLocationChange` | When `type === 'SCHOOL'` and `myLocation` is null, do not auto-fill `shipTo` from the school's own address; show a hint instead |
| OPT-2 | `location.routes.ts` | Add Zod `validateRequest()` middleware for `types` query param on `GET /locations` for consistency with other validated endpoints |
| OPT-3 | `purchaseOrder.service.ts` `submitPurchaseOrder` | Cache `getSettings()` result to avoid two round-trips to SystemSettings table in the same submit operation |
| OPT-4 | `RequisitionWizard.tsx` `handleEntityLocationChange` deps | Minor `useCallback` dep optimization — `autoFilledShipTo` in deps causes extra callback re-creations; consider using functional state update form |

---

## Unscoped Items (Not Reviewed)

- **`PurchaseOrderList.tsx` entity column** (spec section 6.5): Outside the reviewed file list. Cannot confirm whether the "Entity" column was added to the PO list grid. Should be verified separately.
- **`PurchaseOrderList.tsx` entityType filter**: Similarly unreviewed.

---

## Approval Routing — Correctness Trace

| Scenario | Expected (spec) | Actual | Verdict |
|----------|-----------------|--------|---------|
| PO has officeLocationId; primary location supervisor found, ≠ requestor | Route to location supervisor | ✅ Routes to location supervisor | PASS |
| PO has officeLocationId; no primary location supervisor found | Fall back to personal supervisor | ✅ Falls back to personal supervisor | PASS |
| PO has officeLocationId; primary location supervisor = requestor | Take self-supervisor bypass | ⚠️ Falls through to personal supervisor (if one exists) | DEVIATION (see REC-1) |
| PO has no officeLocationId; personal supervisor found | Route to personal supervisor | ✅ Routes to personal supervisor | PASS |
| PO has no officeLocationId; no personal supervisor | Self-supervisor bypass (if enabled) | ✅ Bypass path taken | PASS |
| Bypass disabled by feature flag | Force normal submit | ✅ `isSelfSupervisor = false` applied | PASS |
| DISTRICT_OFFICE selected as entity | Reject with error | ✅ `ValidationError` thrown in service | PASS |
| Full chain: supervisor → finance → DOS → issue | Unchanged | ✅ Approval levels and transitions unchanged | PASS |

---

## Security — OWASP Checklist

| OWASP Risk | Status |
|------------|--------|
| A01 Broken Access Control | ✅ All routes authenticated; `userId` from JWT only |
| A02 Cryptographic Failures | ✅ No new cryptographic concerns introduced |
| A03 Injection | ✅ Prisma parameterised queries; Zod enum/UUID validation |
| A04 Insecure Design | ✅ Supervisor routing decision made server-side only |
| A05 Security Misconfiguration | ✅ No new env variables; feature flags via SystemSettings |
| A06 Vulnerable Components | ✅ No new dependencies introduced |
| A07 Auth Failures | ✅ `authenticate` on all new endpoints; JWT user ID not spoofable |
| A08 Software Integrity | ✅ No unsafe deserialization |
| A09 Logging Failures | ✅ Routing decisions logged; no sensitive data in log payloads |
| A10 SSRF | ✅ No server-side HTTP calls to user-controlled URLs |

---

## Summary

The implementation is high-quality, spec-compliant on all major points, and passes all three build validation checks. The codebase follows established patterns (`FundingSourceService`, `@prisma/client` Zod-inferred types, `handleControllerError`, `logger.info/warn`).

**One correctness deviation** (REC-1) exists in the supervisor-bypass decision tree for the edge case where the entity location's primary supervisor is the requestor themselves. In practice this edge case is unlikely (only affects a principal/director filing a PO for their own supervised entity who also has a separate personal supervisor), and the actual effect is *more* approval steps (not fewer), but it should be corrected to match spec for auditability.

**All security requirements are met.** No CRITICAL issues found.
