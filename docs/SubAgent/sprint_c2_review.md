# Sprint C-2 Purchase Orders — Code Review

**Date:** 2026-03-10  
**Reviewer:** Code Review Subagent  
**Sprint:** C-2 Purchase Orders  
**Status:** NEEDS_REFINEMENT

---

## Build Results

### Backend — `cd c:\Tech-V2\backend && npx tsc --noEmit`

```
EXIT CODE: 0
Output: (none — clean compile)
```

**Result: PASS ✅**

### Frontend — `cd c:\Tech-V2\frontend && npx tsc --noEmit`

```
EXIT CODE: 0
Output: (none — clean compile)
```

**Result: PASS ✅**

---

## Summary Score

| Category                  | Score | Grade |
|---------------------------|-------|-------|
| Specification Compliance  | 95%   | A     |
| Best Practices            | 78%   | C+    |
| Functionality             | 88%   | B+    |
| Code Quality              | 82%   | B     |
| Security                  | 72%   | C     |
| Performance               | 72%   | C     |
| Consistency               | 96%   | A     |
| Build Success             | 100%  | A+    |

**Overall Grade: B (85%)**

**Overall Assessment: NEEDS_REFINEMENT**

---

## Findings

### CRITICAL

---

#### CRIT-1 — XSS via Unsanitized User Input in Email HTML Templates

**File:** `backend/src/services/email.service.ts`  
**Lines:** `poDetailHtml()` function (line ~64–77), `sendRequisitionRejected()` (line ~128–140)

User-supplied values are directly interpolated into raw HTML without escaping. A user with REQUISITIONS level ≥ 2 can craft a PO title, vendor name, or denial reason that injects arbitrary HTML into outgoing administrator/supervisor emails.

**Affected interpolations (unescaped):**
- `${po.description}` — PO title (user-controlled via create/update)
- `${po.vendors?.name ?? 'N/A'}` — vendor name (user-controlled)
- `${reason}` — denial reason text (user-controlled via reject endpoint)
- `${po.poNumber}` — PO number (user-controlled via issue endpoint)
- `${stageName}` — approval stage label (attacker-controlled if roles are misassigned)

**Attack vector:** A requestor submits a PO titled `<a href="https://phish.example.com">Click here to approve</a>`. When the supervisor receives the notification email, the fake link is rendered as a real hyperlink inside the email.

**Fix:** HTML-escape all user-controlled values before interpolation.

```typescript
// Add this helper at the top of email.service.ts:
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Then use: escapeHtml(po.description), escapeHtml(reason), etc.
```

**OWASP:** A03:2021 — Injection (XSS)

---

#### CRIT-2 — Email Addresses Logged as PII in Structured Logs

**File:** `backend/src/services/email.service.ts`, `sendMail()` helper  
**Lines:** ~53 (`logger.info`) and ~57 (`logger.error`)

The `sendMail` helper logs `to: options.to` on both success and failure paths, and the `logger.error` path logs the raw `error` object which may include stack traces or internal transport details.

```typescript
// Current (problematic):
logger.info('Email sent', { to: options.to, subject: options.subject });
logger.error('Failed to send email', { to: options.to, subject: options.subject, error });
```

**Fix:**
```typescript
// Redact email, log only first 3 chars + domain; log error.message not full error:
const redacted = options.to.replace(/^(.{3}).*?(@.*)$/, '$1***$2');
logger.info('Email sent', { to: redacted, subject: options.subject });
logger.error('Failed to send email', {
  subject: options.subject,
  error: error instanceof Error ? error.message : String(error),
});
```

**OWASP:** A09:2021 — Security Logging and Monitoring Failures

---

### RECOMMENDED

---

#### REC-1 — `console.error` in All Frontend Mutation Hooks — No User-Facing Error Handling

**File:** `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts`  
**Lines:** ~37, 50, 61, 77, 92, 107, 122, 135 (every `onError` handler)

All eight mutation hooks use `console.error(...)` as the sole error handler. Users never see these errors unless they have dev tools open. This violates the project's "no console.log" guidance and creates invisible failures.

```typescript
// Current (all 8 hooks):
onError: (error: Error) => {
  console.error('Failed to create purchase order:', error);
},
```

**Fix:** Replace `console.error` with either a toast/snackbar notification system or remove the console error entirely (callers already use `onError` callbacks with `setActionError`). The detail page and wizard already handle errors via `setActionError`/`setSubmitError` — the hook-level `onError` is effectively unreachable in practice.

Recommended: remove the `onError` from mutation hook definitions and let callers handle errors at the call site (current pattern for `createPurchaseOrder`, `submitPurchaseOrder` in Wizard/Detail pages is already correct).

---

#### REC-2 — Denial Reason Logged as Potential PII

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Line:** ~495 (`logger.info('Purchase order rejected', { ... reason: rejectData.reason })`)

`rejectData.reason` is logged at INFO level. Denial reasons can contain employee names, performance commentary, or other personally identifiable information.

**Fix:**
```typescript
// Before:
logger.info('Purchase order rejected', { id, rejectedBy: userId, reason: rejectData.reason });

// After:
logger.info('Purchase order rejected', { id, rejectedBy: userId });
```

---

#### REC-3 — N+1 DB Query: `getRequisitionsPermLevel` Called on Every Request

**File:** `backend/src/controllers/purchaseOrder.controller.ts`  
**Lines:** ~44–52 (`getRequisitionsPermLevel` helper), called in every handler

Every controller handler independently queries `UserPermission` via `getRequisitionsPermLevel()`. With 7 handlers performing CRUD + workflow operations, each request incurs an extra DB roundtrip.

The `checkPermission` middleware already resolves the minimum required level for the route. The controller should extend this pattern rather than re-querying.

**Preferred fix:** Attach the resolved `permLevel` to `req.user` inside the `checkPermission` middleware, or use a shared cache. Alternatively, pass `req.user.roles` through and derive the level from a cached permission lookup via a lightweight in-memory map.

**Impact:** Each of the 12 endpoints makes one extra `UserPermission` query. At high concurrency this compounds.

---

#### REC-4 — `any[]` Type in Service Response Interface

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Line:** ~52 (`export interface PurchaseOrderListResponse`)

```typescript
export interface PurchaseOrderListResponse {
  items: any[];   // ← should be Prisma return type or a typed DTO
  ...
}
```

This defeats TypeScript strict mode benefits and hides type errors downstream. The spec defined this as a named type.

**Fix:** Type the `items` field with the Prisma-inferred return type (or a typed interface). At minimum:
```typescript
items: object[];
```
Ideally extract the full Prisma `purchase_orders` include shape as a named type.

---

#### REC-5 — Redundant Zod Validation in Controller (Double-Parsing)

**File:** `backend/src/controllers/purchaseOrder.controller.ts`  
**Lines:** ~80 (`CreatePurchaseOrderSchema.parse(req.body)`), ~98, ~163, ~176, ~189, ~204

The `validateRequest` middleware already runs Zod parsing and stores the validated result. The controller then re-runs the same schema's `.parse()`. The second pass is redundant — if validation failed, `validateRequest` would have rejected the request before reaching the handler.

**Fix:** Replace `Schema.parse(req.body)` with a type cast:
```typescript
// Before:
const data = CreatePurchaseOrderSchema.parse(req.body);

// After (body already validated by middleware):
const data = req.body as CreatePurchaseOrderDto;
```

Alternatively, store the validated result in `req` inside `validateRequest` (a common pattern — attach `req.validatedBody`) to make the chain explicit.

---

#### REC-6 — `PurchaseOrderList` "Pending My Approval" Tab Has No Status Filter

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`  
**Lines:** `buildFilters()` function (~82–98)

The "Pending My Approval" tab is visible to users with permission level ≥ 3, but `buildFilters()` applies no filter for it — it returns all POs with no status constraint.

The correct behaviour:
- Level 3 user: show `status = submitted`
- Level 4 user: show `status = supervisor_approved`
- Level 5 user: show `status = purchasing_approved`

Similarly, the "Mine" tab does not add a `requestorId` filter. For level 2+ users (who can see all POs), the "Mine" tab should still scope to the user's own POs.

**Fix:**
```typescript
if (tab === 'pending') {
  const STATUS_FOR_LEVEL: Record<number, POStatus> = {
    3: 'submitted',
    4: 'supervisor_approved',
    5: 'purchasing_approved',
  };
  const pendingStatus = STATUS_FOR_LEVEL[permLevel];
  if (pendingStatus && !statusFilter) f.status = pendingStatus;
}
// For "Mine" tab at level 2+, pass requestorId if the backend supports it
// (may require adding requestorId filter support to the backend query)
```

---

#### REC-7 — Submit Email Sent to Requestor Instead of Supervisor

**File:** `backend/src/controllers/purchaseOrder.controller.ts`  
**Lines:** ~162–165 (`submitPurchaseOrder` handler)

The code comment acknowledges this gap: `"For now, send to requestor's email as acknowledgement. Wire to supervisor lookup in future."` The supervisor never receives the notification email when a PO is submitted. This defeats the purpose of the email trigger for the submit transition.

**Fix:** Implement a supervisor lookup (the `UserSupervisor` relation exists in the schema) and send the notification to the requestor's direct supervisor.

---

#### REC-8 — `getStats` Fetches Up to 1,000 POs Client-Side

**File:** `frontend/src/services/purchaseOrder.service.ts`  
**Lines:** `getStats()` function (~100–122)

Stats are computed client-side from a 1,000-record fetch of the full PO list. At volume, this:
1. Sends excessive data over the wire
2. Strains the browser
3. Returns inaccurate counts once PO count exceeds 1,000

The code itself notes this limitation. A dedicated `GET /api/purchase-orders/stats` backend endpoint using `GROUP BY` is the correct solution.

---

### OPTIONAL

---

#### OPT-1 — `RequisitionWizard`: No Validation Feedback for Shipping Cost Field

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`  
**Line:** `shippingCost` TextField (~225–231)

The `shippingCost` input is `type="number"` but stored as a string state `useState<string>('')`. Non-numeric input passes through silently until submission. There is no `error` prop on the field, unlike all other validated fields.

**Fix:** Add basic validation: `parseFloat(shippingCost) < 0` → show error.

---

#### OPT-2 — Action Buttons Flash as Hidden During Permission Load

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`  
**Lines:** All `canSubmit`, `canApprove`, `canReject`, `canAssign`, `canIssue` conditions

During the `useRequisitionsPermLevel` query (while `isLoading = true`), `permLevel` returns `0` and all action buttons are hidden. Users with level 2–5 will see the actions panel empty for ~100–300ms, then the buttons appear.

**Fix:** Show skeleton placeholders in the Actions panel while `permLevel` is loading:
```tsx
const { permLevel, isLoading: permLoading } = useRequisitionsPermLevel();
// ...
{permLoading && <Skeleton variant="rectangular" height={40} />}
```

---

#### OPT-3 — Barrel Export Missing `useRequisitionsPermLevel` from Hooks Index

**Files:** `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`  

The hook is a standalone file but is not re-exported from any hooks barrel (`index.ts`). This is consistent with the project's pattern (hooks are consumed by direct path import), so no barrel export is strictly required. Note for future consolidation.

---

#### OPT-4 — `email.service.ts` Transporter Created at Module Load (No ENV Validation)

**File:** `backend/src/services/email.service.ts`  
**Lines:** ~27–35 (transporter creation)

If `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` are undefined (e.g., in a test environment), the transporter is silently created with `undefined` values and will throw at send time. Since send failures are swallowed, misconfigured SMTP fails silently.

**Fix:** Add startup validation or a guard that disables email when SMTP is not configured:
```typescript
const SMTP_ENABLED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
```

---

## Specification Compliance Checklist

### API Endpoints

| Endpoint | Route | Controller | Service | Result |
|---|---|---|---|---|
| GET /api/purchase-orders | ✅ | ✅ | ✅ | PASS |
| POST /api/purchase-orders | ✅ | ✅ | ✅ | PASS |
| GET /api/purchase-orders/:id | ✅ | ✅ | ✅ | PASS |
| PUT /api/purchase-orders/:id | ✅ | ✅ | ✅ | PASS |
| DELETE /api/purchase-orders/:id | ✅ | ✅ | ✅ | PASS |
| POST /api/purchase-orders/:id/submit | ✅ | ✅ | ✅ | PASS |
| POST /api/purchase-orders/:id/approve | ✅ | ✅ | ✅ | PASS |
| POST /api/purchase-orders/:id/reject | ✅ | ✅ | ✅ | PASS |
| POST /api/purchase-orders/:id/account | ✅ | ✅ | ✅ | PASS |
| POST /api/purchase-orders/:id/issue | ✅ | ✅ | ✅ | PASS |
| GET /api/purchase-orders/:id/pdf | ✅ | ✅ | ✅ | PASS |
| GET /api/purchase-orders/:id/history | ✅ | ✅ | ✅ | PASS |

All 12 endpoints implemented.

### Workflow Transitions

| Transition | Status | Notes |
|---|---|---|
| draft → submitted | PASS | `submitPurchaseOrder()` |
| submitted → supervisor_approved | PASS | `approvePurchaseOrder()` level 3 |
| supervisor_approved → purchasing_approved | PASS | level 4 |
| purchasing_approved → dos_approved | PASS | level 5 |
| dos_approved → po_issued | PASS | `issuePurchaseOrder()` |
| any active → denied | PASS | `rejectPurchaseOrder()` |

### RequisitionStatusHistory

Every workflow-changing method creates a `RequisitionStatusHistory` record atomically within a transaction:
- `submitPurchaseOrder` ✅
- `approvePurchaseOrder` ✅
- `rejectPurchaseOrder` ✅
- `issuePurchaseOrder` ✅
- `assignAccountCode` ❌ — does NOT create a history record (minor gap, not specified in spec but logically expected)

### Security Compliance Checklist

| Check | Status | Notes |
|---|---|---|
| All routes have `authenticate` middleware | ✅ | `router.use(authenticate)` at top |
| All mutation routes have CSRF protection | ✅ | `router.use(validateCsrfToken)` — skips GET/HEAD/OPTIONS |
| All inputs validated with Zod schemas | ✅ | `validateRequest` middleware on all routes |
| No `console.log` in backend | ✅ | Structured `logger` used throughout |
| No `console.log` in frontend service/hooks | ❌ | `console.error` in all 8 mutation `onError` handlers |
| Custom error classes | ✅ | `NotFoundError`, `ValidationError`, `AuthorizationError` |
| No stack traces in error responses | ✅ | `handleControllerError` handles this |
| No raw SQL | ✅ | Prisma ORM exclusively |
| Rate limiting | ✅ | Inherited from global middleware |
| No sensitive data in logs (backend) | ⚠️ | Email addresses logged; denial reasons logged |

### Schema Changes

| Change | Status |
|---|---|
| `purchase_orders.poNumber` nullable | ✅ |
| `purchase_orders.status` default `'draft'` | ✅ |
| Sprint C-2 addition fields (shipTo, shippingCost, notes, etc.) | ✅ |
| `po_items.lineNumber` and `po_items.model` added | ✅ |
| `RequisitionStatusHistory` model created | ✅ |
| `OfficeLocation` back-reference added | ✅ |
| `User.poStatusHistory` back-reference added | ✅ |
| Indexes on `purchase_orders` | ✅ |
| Indexes on `requisition_status_history` | ✅ |
| Migration applied | ✅ (`20260310194441_add_purchase_order_workflow_fields`) |

### Middleware Changes

| Change | Status |
|---|---|
| `REQUISITIONS` added to `PermissionModule` | Requires verification — not confirmed in this review |
| `PermissionLevel` extended to 1–5 | Requires verification |

> **Note:** The `permissions.ts` middleware changes were required per the backend spec (section 2). The controller uses hardcoded level comparisons (`permLevel >= 2` etc.) which work regardless of the type. However, the `PermissionModule` and `PermissionLevel` type extensions should be verified to avoid TypeScript type incompatibilities with other modules. Since `tsc --noEmit` passes, these changes are present.

### Frontend Checklist

| Item | Status |
|---|---|
| `purchaseOrder.types.ts` matches backend response shapes | ✅ |
| `queryKeys.purchaseOrders` added to `lib/queryKeys.ts` | ✅ |
| All 8 mutations implemented | ✅ |
| All 4 query hooks implemented | ✅ |
| `useRequisitionsPermLevel` hook implemented | ✅ |
| `PurchaseOrderList` page with filters/tabs/pagination | ✅ |
| `RequisitionWizard` multi-step form | ✅ |
| `PurchaseOrderDetail` with actions + timeline | ✅ |
| App.tsx routes for `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/:id` | ✅ |
| `AppLayout.tsx` nav item enabled | ✅ (no `disabled: true`) |
| Barrel export `pages/PurchaseOrders/index.ts` | ✅ |
| Permission-gated action buttons | ✅ |
| Loading/skeleton states | ✅ (list + detail) |
| Error state handling | ✅ |
| Pending tab filter correct | ❌ (REC-6) |

---

## Required Fixes Before PASS

The following issues must be resolved before this sprint is considered complete:

1. **CRIT-1** — HTML-escape user-supplied values in `email.service.ts` email templates.
2. **CRIT-2** — Redact PII from email log entries; log `error.message` not full error objects.
3. **REC-1** — Replace all `console.error` in `usePurchaseOrderMutations.ts` `onError` handlers.
4. **REC-6** — "Pending My Approval" tab must filter by the correct status for the user's permission level.
5. **REC-7** — Submit notification email must be sent to the supervisor, not the requestor.

---

## Positive Notes

- **Full 12-endpoint API** implemented cleanly in a single PR.
- **Atomic transactions** used correctly throughout service layer (`$transaction` on every multi-table write).
- **Status history audit trail** written on all four workflow transitions.
- **CSRF + Authentication** pattern perfectly matches existing routes — zero security regressions.
- **Prisma cascade deletes** configured correctly (`po_items` and `RequisitionStatusHistory` both cascade on parent delete).
- **PO number uniqueness** enforced at both DB level (`@unique`) and service level (explicit duplicate check before issue).
- **TanStack Query v5** patterns (`keepPreviousData`, proper `queryKey` factory, `staleTime`) implemented correctly.
- **PDF generation** is complete and well-structured.
- **Permission-gated UI** in detail page precisely mirrors the spec decision table.
- **TypeScript builds cleanly** — zero compile errors/warnings on both backend and frontend.

---

*Review file: `c:\Tech-V2\docs\SubAgent\sprint_c2_review.md`*
