# PO Department / Program / School Selection — Final Verification Review

**Feature:** Department, Program, or School selection on Purchase Orders  
**Review Date:** March 19, 2026  
**Reviewer:** Copilot Review Agent (Phase 3 — Final)  
**Spec File:** `docs/SubAgent/po_department_selection_spec.md`  
**Initial Review:** `docs/SubAgent/po_department_selection_review.md`  
**Status:** ✅ APPROVED

---

## Build Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Backend TypeScript | `cd C:\Tech-V2\backend && npx tsc --noEmit` | ✅ **PASS** — 0 errors |
| Frontend TypeScript | `cd C:\Tech-V2\frontend && npx tsc --noEmit` | ✅ **PASS** — 0 errors |
| Prisma Schema | `npx prisma validate` | ✅ **PASS** — "schema is valid 🚀" |

---

## Score Table — Initial vs Final

| Category | Initial Score | Initial Grade | Final Score | Final Grade | Delta |
|----------|--------------|---------------|-------------|-------------|-------|
| Specification Compliance | 92% | A | 96% | A | +4% ↑ |
| Best Practices | 85% | B | 90% | A- | +5% ↑ |
| Functionality | 90% | A- | 95% | A | +5% ↑ |
| Code Quality | 88% | B+ | 92% | A | +4% ↑ |
| Security | 95% | A | 95% | A | — |
| Performance | 90% | A- | 90% | A- | — |
| Consistency | 92% | A | 93% | A | +1% ↑ |
| Build Success | 100% | A+ | 100% | A+ | — |
| **Overall** | **91.5%** | **A-** | **93.9%** | **A** | **+2.4% ↑** |

---

## Final Assessment: ✅ APPROVED

All three refinements from the initial review have been correctly applied. All three build checks pass. No regressions detected in any previously-correct implementation file.

---

## Verification of Each Fix

---

### REC-1 — Self-supervisor bypass when location supervisor IS the requestor

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Lines:** ~499–535  
**Verdict: ✅ FIXED — Matches spec section 7.1 exactly**

#### What changed

A `locationSupervisorIsRequestor` flag was added to `submitPurchaseOrder`. The flag is set `true` in the `else-if` branch that handles the case where the entity location's primary supervisor is the same person as the requestor. Priority 2 (personal supervisor fallback) now guards on this flag.

#### Code trace

```typescript
// Line 499
let locationSupervisorIsRequestor = false;

// Lines 517–522: else-if branch (location supervisor IS requestor)
} else if (locationSupervisorRecord && locationSupervisorRecord.userId === po.requestorId) {
  // Location supervisor IS the requestor — self-supervisor bypass path.
  // Set locationSupervisorIsRequestor so Priority 2 personal-supervisor fallback is skipped.
  isSelfSupervisor = true;
  locationSupervisorIsRequestor = true;
}

// Lines 533–535: Priority 2 guard
// Skipped when the entity location's own primary supervisor is already the requestor (locationSupervisorIsRequestor),
// matching spec section 7.1: self-supervisor → bypass path without escalating to personal supervisor.
if (isSelfSupervisor && !supervisorId && !locationSupervisorIsRequestor) {
```

#### Spec alignment (section 7.1 decision tree)

```
├─ Record found BUT supervisorId = requestorId
│  └─ isSelfSupervisor = true  → bypass path (if enabled)
```

Code now correctly implements this path. Previously the code fell through to the personal supervisor lookup, routing the PO to the requestor's separate personal supervisor instead of taking the bypass.

#### Updated routing correctness table

| Scenario | Expected (spec) | Actual | Verdict |
|----------|-----------------|--------|---------|
| PO has officeLocationId; primary location supervisor found, ≠ requestor | Route to location supervisor | ✅ Routes to location supervisor | **PASS** |
| PO has officeLocationId; no primary location supervisor found | Fall back to personal supervisor | ✅ Falls back to personal supervisor | **PASS** |
| PO has officeLocationId; primary location supervisor = requestor | Take self-supervisor bypass | ✅ Bypass path taken — personal supervisor fallback skipped | **PASS** (was DEVIATION) |
| PO has no officeLocationId; personal supervisor found | Route to personal supervisor | ✅ Routes to personal supervisor | **PASS** |
| PO has no officeLocationId; no personal supervisor | Self-supervisor bypass (if enabled) | ✅ Bypass path taken | **PASS** |
| Bypass disabled by feature flag | Force normal submit | ✅ `isSelfSupervisor = false` applied | **PASS** |
| DISTRICT_OFFICE selected as entity | Reject with error | ✅ `ValidationError` thrown | **PASS** |
| Full chain: supervisor → finance → DOS → issue | Unchanged | ✅ Approval levels unchanged | **PASS** |

---

### REC-2 — `AuthRequest` type in `getMe` and `getMyOfficeLocation`

**File:** `backend/src/controllers/user.controller.ts`  
**Verdict: ✅ FIXED — No `@ts-ignore` in new feature handlers**

#### What changed

`AuthRequest` is imported from `../middleware/auth` at line 2. Both new feature handlers use it as the request parameter type, eliminating the need for `@ts-ignore`:

```typescript
// Line 26 — was: req: Request with @ts-ignore before req.user access
export const getMe = async (req: AuthRequest, res: Response) => {

// Line 43 — was: req: Request with @ts-ignore before req.user access
export const getMyOfficeLocation = async (req: AuthRequest, res: Response) => {
```

#### Remaining `@ts-ignore` instances (lines 90 and 164)

Two `@ts-ignore` comments remain in `updateUserPermissions` and `addUserSupervisor` — both are pre-existing handlers not introduced by this feature, and were outside the scope of REC-2 as defined in the initial review. These represent pre-existing tech debt that did not regress.

#### Consistency check

`AuthRequest` usage is now consistent with `location.controller.ts` (`assignSupervisor`) and the rest of the controller layer that accesses `req.user`. TypeScript type safety is restored for all feature-added handlers.

---

### OPT — SCHOOL entity selected but `myLocation` is null

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`  
**Lines:** ~208–213 (handler logic), ~477–480 (Alert render)  
**Verdict: ✅ IMPLEMENTED**

#### Handler fix (no incorrect auto-fill)

```typescript
// Lines 208–212: School selected but user has no office location on file
} else if (loc.type === 'SCHOOL') {
  // School selected but user has no office location on file — do not auto-fill;
  // the user will need to enter their shipping address manually.
  setShipTo('');
  setAutoFilledShipTo(false);
}
```

Previously the `else` branch would auto-fill `shipTo` from the selected school's own address — incorrect per spec (ship-to must come from the **requestor's** location, not the selected entity).

#### Informational Alert

```tsx
{entityType === 'SCHOOL' && !myLocation && selectedLocationId && (
  <Alert severity="info" sx={{ mt: -1 }}>
    Your office location is not set in the directory. Please enter your school&apos;s
    shipping address manually below.
  </Alert>
)}
```

The Alert is:
- Conditional on `entityType === 'SCHOOL'` (only School type)
- Only shown when `myLocation` is `null` (user has no Entra office location)
- Only shown when a location is selected (`selectedLocationId` truthy)
- Uses `severity="info"` (informational, not an error)
- Directs the user to enter the shipping address manually

This matches the intended behavior from OPT-1 and correctly uses `Alert` from MUI (already imported).

---

## Regression Check — Previously Correct Files

### `backend/src/services/location.service.ts` — ✅ NO REGRESSION

- `findAll(options?: { types?: string[] })` intact with internal whitelist filter ✅
- `filteredTypes && filteredTypes.length > 0` guard prevents empty `in: []` query ✅
- `orderBy: [{ supervisorType: 'asc' }, { isPrimary: 'desc' }]` preserved ✅

### `backend/src/routes/user.routes.ts` — ✅ NO REGRESSION

- `GET /me` declared before `router.use(requireAdmin)` ✅
- `GET /me/office-location` declared before `router.use(requireAdmin)` ✅
- Both routes protected by `authenticate` only — accessible to all authenticated users per spec ✅
- CSRF protection applied only to state-changing routes (after `validateCsrfToken` use call) ✅

### `backend/src/validators/purchaseOrder.validators.ts` — ✅ NO REGRESSION

- `entityType: z.enum(['SCHOOL', 'DEPARTMENT', 'PROGRAM']).optional().nullable()` present in `CreatePurchaseOrderSchema` ✅
- `officeLocationId: z.string().uuid(...)` unchanged ✅
- `UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial()` inherits `entityType` ✅

### `frontend/src/types/purchaseOrder.types.ts` — ✅ NO REGRESSION

- `entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null` in `PurchaseOrderSummary` ✅
- `PurchaseOrder extends PurchaseOrderSummary` — inherits `entityType` for detail view ✅
- `POOfficeLocation.type?: string | null` present ✅

### `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` — ✅ NO REGRESSION

- Entity location section renders when `po.officeLocation` is present ✅
- Label: `"Department / School / Program"` ✅
- `entityType` chip: `color={po.entityType === 'SCHOOL' ? 'primary' : 'default'}` ✅
- Human-readable chip label via `charAt(0) + slice(1).toLowerCase()` ✅

---

## Security Compliance — Final Status

No new security concerns introduced by the refinements.

| Security Criterion | Status | Notes |
|--------------------|--------|-------|
| REC-1 fix — no security regression | ✅ | Bypass is MORE restrictive than before (spec-compliant), not less |
| REC-2 fix — `AuthRequest` type | ✅ | Improves type safety; `userId` still sourced from JWT only |
| OPT fix — `Alert` render | ✅ | Display-only; no data exposure; does not affect routing |
| OWASP A01–A10 | ✅ | All previously-verified criteria remain satisfied |

---

## Outstanding Items (Not Blocking Approval)

These items were documented in the initial review and remain open as-is. They do not block approval.

| ID | File | Description | Status |
|----|------|-------------|--------|
| OPT-2 | `location.routes.ts` | Add Zod `validateRequest()` for `types` query param on `GET /locations` | Open (service whitelist provides defense-in-depth) |
| OPT-3 | `purchaseOrder.service.ts` | Cache `getSettings()` result — called twice in `submitPurchaseOrder` | Open (minor; settings likely cached in service) |
| OPT-4 | `RequisitionWizard.tsx` | Minor `useCallback` dep optimization | Open (functionally correct as-is) |
| UNSCOPED | `PurchaseOrderList.tsx` | Entity column and entity type filter in list grid (spec 6.5) | Unreviewed — outside file scope |

---

## Summary

All three refinements (REC-1, REC-2, OPT) are correctly implemented and verified:

1. **REC-1**: `submitPurchaseOrder` now correctly takes the self-supervisor bypass path when the entity location's primary supervisor is the requestor — the `locationSupervisorIsRequestor` flag precisely prevents the personal supervisor fallback from overriding the spec-mandated bypass. All 8 routing scenarios now pass.

2. **REC-2**: `getMe` and `getMyOfficeLocation` use `AuthRequest` type. No `@ts-ignore` in either new handler. TypeScript type safety restored for all feature-introduced code paths.

3. **OPT**: When School is selected but `myLocation` is null, `shipTo` is cleared (not incorrectly auto-filled from the school's own address), and a clear informational `Alert` instructs the user to enter the shipping address manually.

All three build checks pass with 0 errors. No regressions detected.

**Overall Grade: A (93.9%)**
