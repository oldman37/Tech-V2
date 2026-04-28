# Sprint C-2 Purchase Orders — Final Re-Review

**Date:** 2026-03-10  
**Reviewer:** Re-Review Subagent (Phase 4 Validation)  
**Sprint:** C-2 Purchase Orders  
**Prior Review:** `sprint_c2_review.md` (Phase 3 — Grade: B / 85%)  
**Status:** **APPROVED**

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

## Verification — Original Findings

### CRIT-1 — XSS via Unsanitized User Input in Email HTML Templates

**Status: RESOLVED ✅**

`escapeHtml()` helper added at the top of `email.service.ts`. Full character encoding:

```typescript
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

All 5 special characters covered (`&`, `<`, `>`, `"`, `'`). Applied to ALL user-controlled
interpolations across all 4 email functions:

| Email function | Escaped values |
|---|---|
| `poDetailHtml()` (shared) | `escapeHtml(po.description)`, `escapeHtml(po.vendors.name)`, `escapeHtml(po.poNumber)` |
| `sendRequisitionApproved()` | `escapeHtml(stageName)` |
| `sendRequisitionRejected()` | `escapeHtml(reason)` |
| `sendPOIssued()` | `escapeHtml(po.poNumber)` (conditional) |

No unescaped user-controlled interpolation remains in any HTML email body.

---

### CRIT-2 — Email Addresses Logged as PII

**Status: RESOLVED ✅**

`sendMail()` helper now redacts the local-part of the email before logging:

```typescript
const redacted = options.to.replace(/^[^@]*/, '***');
logger.info('Email sent', { to: redacted, subject: options.subject });
```

The implementation is more conservative than the suggested fix (replaces the entire local-part
with `***` rather than preserving the first 3 characters, e.g., `***@district.org`). This is
acceptable and arguably better practice.

`logger.error` on failure no longer includes `to` at all, and logs only `error.message`:

```typescript
logger.error('Failed to send email', {
  subject: options.subject,
  error: error instanceof Error ? error.message : String(error),
});
```

---

### REC-1 — `console.error` in Frontend Mutation Hooks

**Status: RESOLVED ✅**

`usePurchaseOrderMutations.ts` contains **zero** `console.error` calls. All 8 mutation hooks
(`useCreatePurchaseOrder`, `useUpdatePurchaseOrder`, `useDeletePurchaseOrder`,
`useSubmitPurchaseOrder`, `useApprovePurchaseOrder`, `useRejectPurchaseOrder`,
`useAssignAccountCode`, `useIssuePurchaseOrder`) define only `onSuccess` cache invalidation.

Errors surface correctly via `mutation.error` state and caller-level `onError` callbacks in
`PurchaseOrderDetail.tsx` (which calls `setActionError()` for user-visible error display).

---

### REC-2 — Denial Reason Logged as Potential PII

**Status: RESOLVED ✅** *(fixed as part of refinement, not originally in validation scope)*

`rejectPurchaseOrder()` service log no longer includes the denial reason:

```typescript
// Before:
logger.info('Purchase order rejected', { id, rejectedBy: userId, reason: rejectData.reason });

// After:
logger.info('Purchase order rejected', { id, rejectedBy: userId });
```

---

### REC-3 / "REC-4 in Validation" — Controller DB Roundtrip (`getRequisitionsPermLevel`)

**Status: RESOLVED ✅**

The `getRequisitionsPermLevel()` helper is **gone** from the controller. Every handler now reads
`req.user!.permLevel ?? 1`:

```typescript
const permLvl = req.user!.permLevel ?? 1;
```

The `checkPermission` middleware attaches the user's **highest non-expired** level for the module:

```typescript
const highestLevel = userPermissions
  .filter(up => up.permission.module === module && (!up.expiresAt || up.expiresAt >= now))
  .reduce((max, up) => Math.max(max, up.permission.level), 0);
req.user!.permLevel = highestLevel || matchingPermission.permission.level;
```

ADMIN users receive `req.user.permLevel = 5` and bypass the DB query entirely.

**Backward compatibility confirmed:** `permLevel` is declared as `permLevel?: number` (optional)
in `AuthRequest`. Other controllers that don't read `permLevel` are unaffected. TypeScript compile
is clean (EXIT_CODE:0).

---

### REC-4 / "REC-5 in Validation" — `items: any[]` in Service Response Interface

**Status: RESOLVED ✅**

`PurchaseOrderListResponse.items` is now typed with a Prisma-inferred payload type:

```typescript
type PurchaseOrderListItem = Prisma.purchase_ordersGetPayload<{
  include: {
    User: { select: { id: true; firstName: true; lastName: true; email: true } };
    vendors: { select: { id: true; name: true } };
    officeLocation: { select: { id: true; name: true; code: true } };
    _count: { select: { po_items: true } };
  };
}>;

export interface PurchaseOrderListResponse {
  items: PurchaseOrderListItem[];
  ...
}
```

This is the ideal solution — the type is derived from the exact `include` shape of the query,
so it will remain accurate as the schema evolves.

---

### REC-6 — "Pending My Approval" Tab Has No Status Filter

**Status: RESOLVED ✅**

`buildFilters()` in `PurchaseOrderList.tsx` now applies the correct status filter based on
the user's permission level:

```typescript
if (tab === 'pending' && !statusFilter) {
  const STATUS_FOR_LEVEL: Partial<Record<number, POStatus>> = {
    3: 'submitted',
    4: 'supervisor_approved',
    5: 'purchasing_approved',
  };
  const pendingStatus = STATUS_FOR_LEVEL[permLevel];
  if (pendingStatus) f.status = pendingStatus;
}
```

Level 3 (Supervisor) → `submitted`, Level 4 (Purchasing) → `supervisor_approved`,
Level 5 (DOS) → `purchasing_approved`. Correct per spec.

---

### Spec Gap — `assignAccountCode` History Record

**Status: RESOLVED ✅**

`assignAccountCode()` in the service now creates a `RequisitionStatusHistory` entry inside a
`prisma.$transaction()`:

```typescript
const updated = await this.prisma.$transaction(async (tx) => {
  const record = await tx.purchase_orders.update({ ... });

  await tx.requisitionStatusHistory.create({
    data: {
      purchaseOrderId: id,
      fromStatus:      po.status,
      toStatus:        po.status,
      changedById:     userId,
      changedAt:       now,
      notes:           'Account code assigned',
    },
  });

  return record;
});
```

The `fromStatus = toStatus` pattern (no transition, `purchasing_approved → purchasing_approved`)
is a reasonable choice for an assignment that doesn't change the workflow stage. The history
entry is atomic with the update.

---

### Items NOT in Phase 4 Scope (Carried Over)

| Finding | Status | Notes |
|---|---|---|
| REC-5 — Redundant Zod Validation in Controller | **NOT RESOLVED** | Controller still calls `Schema.parse(req.body)` after `validateRequest` middleware. Functionally harmless double-parse; no security impact. Minor code smell. |
| REC-7 — Submit Email Sent to Requestor, Not Supervisor | **NOT RESOLVED** | Acknowledged in code comment: "Wire to supervisor lookup in future." No supervisor notification on submit. Workflow email is incomplete but not a regression. |
| REC-8 — `getStats` Fetches Up to 1,000 POs Client-Side | **NOT RESOLVED** | Pre-existing limitation. Not part of phase 4 scope. Requires dedicated backend stats endpoint. |

---

## New Issues Check (Phase 4 Regressions)

**None found.**

| Area | Verdict |
|---|---|
| `permLevel` attachment backward compatibility | ✅ Safe — `permLevel?: number` optional on `AuthRequest`; no other controllers broken |
| TypeScript errors from auth middleware changes | ✅ None — backend EXIT_CODE:0 |
| Mutations error handling after `onError` removal | ✅ Correct — callers use `mutation.error` and per-call `onError` callbacks with `setActionError` |
| CSRF on GET routes concern | ✅ Non-issue — `validateCsrfToken` middleware skips safe methods (`PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']`) |
| App.tsx routes | ✅ All 3 PO routes present: `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/:id` |
| AppLayout nav item | ✅ Enabled: `{ label: 'Purchase Orders', icon: '📋', path: '/purchase-orders' }` |

---

## Updated Score Table

| Category | Phase 3 Score | Phase 4 Score | Delta | Grade |
|---|---|---|---|---|
| Specification Compliance | 95% | 98% | +3% | A+ |
| Best Practices | 78% | 90% | +12% | A- |
| Functionality | 88% | 95% | +7% | A |
| Code Quality | 82% | 90% | +8% | A- |
| Security | 72% | 95% | +23% | A |
| Performance | 72% | 86% | +14% | B+ |
| Consistency | 96% | 96% | — | A |
| Build Success | 100% | 100% | — | A+ |

**Phase 3 Overall: B (85%)**  
**Phase 4 Overall: A- (94%)**

---

## Final Assessment: APPROVED ✅

All CRITICAL findings (CRIT-1, CRIT-2) are fully resolved. All validation-scoped RECOMMENDED
findings are resolved. Three non-scoped items (REC-5, REC-7, REC-8) carry over as known
technical debt — none are blockers. Both builds pass cleanly.

The codebase is safe to merge and deploy for Sprint C-2.

### Remaining Concerns (Low Priority / Future Work)

1. **REC-7 (Supervisor Email):** The submit email notifies the requestor rather than the
   supervisor. The supervisor receives no email when a new PO needs their approval. This is a
   product gap, not a regression. Schedule for a follow-up task — requires supervisor lookup
   via `UserSupervisor` relation.

2. **REC-5 (Double Zod Parse):** Controller parses `req.body` via `Schema.parse()` after
   `validateRequest` middleware already validated it. No functional or security impact.
   Clean up in a future refactor sprint.

3. **REC-8 (Stats endpoint):** Client-side stats aggregation from a 1,000-record fetch is
   inaccurate beyond 1,000 POs. Requires a dedicated `GET /api/purchase-orders/stats`
   backend endpoint using `GROUP BY`.
