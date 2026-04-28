# PO Approval Routing — Review Report

**Date:** 2026-03-11  
**Sprint:** C-3 (gap-fix)  
**Reviewer:** Subagent #3 (QA)  
**Files reviewed:**
- `backend/src/controllers/purchaseOrder.controller.ts`
- `backend/src/services/purchaseOrder.service.ts`
- `backend/src/services/email.service.ts`

**Reference spec:** `docs/SubAgent/po_approval_routing_spec.md`

---

## Overall Assessment: **PASS**

Zero critical issues. Two recommended improvements. Build is clean.

---

## Build Result: **SUCCESS**

```
PS C:\Tech-V2\backend> npx tsc --noEmit 2>&1
PS C:\Tech-V2\backend>
```

Zero errors. Zero warnings. TypeScript compiler exited cleanly.

---

## Score Summary

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 5 / 5 | A |
| Best Practices | 4 / 5 | B+ |
| Functionality | 5 / 5 | A |
| Code Quality | 4 / 5 | B+ |
| Security | 5 / 5 | A |
| Performance | 4 / 5 | B+ |
| Consistency | 4 / 5 | B+ |
| Build Success | 5 / 5 | A |
| **Overall** | **36 / 40** | **A−** |

---

## Section 1 — Specification Compliance

### Gap 1 — Submit routes to supervisor ✅ PASS

The bug in the original code (sending `sendRequisitionSubmitted` to `po.User.email` — the requestor) is fully corrected.

**Service** (`submitPurchaseOrder`): looks up `isPrimary` supervisor, returns `{ po, supervisorEmail, selfSupervisorBypass }`.  
**Controller** (`submitPurchaseOrder` handler): uses the returned `supervisorEmail` — not `po.User?.email` — to call `sendRequisitionSubmitted`. The requestor receives no email on submit (correct).

### Gap 2 — Self-supervisor bypass ✅ PASS

Self-supervisor detection covers both cases specified:
- `!supervisorRecord` — no supervisor assigned
- `supervisorRecord.supervisorId === po.requestorId` — supervisor IS the requestor

On bypass:
- Transaction atomically sets `status: 'purchasing_approved'`, writes `submittedAt`/`submittedDate`, and creates **two** history entries:
  1. `draft → submitted` (changedById = requestorId, changedAt = now)
  2. `submitted → purchasing_approved` with `notes: 'supervisor_approved stage bypassed: requestor is their own primary supervisor'`
- Controller reads `selfSupervisorBypass === true` and routes to `FINANCE_NOTIFY_EMAIL`, guarded by `if (financeEmail)`.

The bypass note text matches the spec exactly. The two-history-entry audit trail is preserved atomically.

### Gap 3 — Forward notifications after L3 and L4 approvals ✅ PASS

Controller `approvePurchaseOrder` handler:

```typescript
if (permLvl === 3) {
  const financeEmail = process.env.FINANCE_NOTIFY_EMAIL;
  if (financeEmail) {
    sendApprovalActionRequired(po as any, financeEmail, 'Purchasing Approval').catch(() => {});
  }
} else if (permLvl === 4) {
  const dosEmail = process.env.DOS_NOTIFY_EMAIL;
  if (dosEmail) {
    sendApprovalActionRequired(po as any, dosEmail, 'Director of Services Approval').catch(() => {});
  }
}
```

- L3 → `FINANCE_NOTIFY_EMAIL` ✅  
- L4 → `DOS_NOTIFY_EMAIL` ✅  
- L5 → no forward (correct, DOS is last approver before issue) ✅  
- Both are env-var-guarded ✅  
- Both are fire-and-forget ✅  
- Requestor's existing approval notification is **also** sent (not replaced) ✅

### Gap 4 — Denial still notifies requestor ✅ PASS

`rejectPurchaseOrder` handler is unchanged:

```typescript
if (po.User?.email) {
  sendRequisitionRejected(po as any, po.User.email, data.reason).catch(() => {});
}
```

The implementation change only touched submit routing and forward notifications. Denial routing is intact and correct.

---

## Section 2 — Security Compliance

| Check | Result | Notes |
|---|---|---|
| No `console.log` | ✅ PASS | Only `logger.info` / `logger.error` used throughout |
| No PII in log messages | ✅ PASS | All logger calls use only IDs (`id`, `submittedBy`, `approvedBy`, `rejectedBy`). Email addresses are redacted to `***@domain` in `sendMail`. |
| All email sends fire-and-forget | ✅ PASS | All 6 send call-sites append `.catch(() => {})` |
| `FINANCE_NOTIFY_EMAIL` guarded | ✅ PASS | `const financeEmail = process.env.FINANCE_NOTIFY_EMAIL; if (financeEmail) { ... }` — two separate guard sites (submit bypass + L3 approve) |
| `DOS_NOTIFY_EMAIL` guarded | ✅ PASS | `const dosEmail = process.env.DOS_NOTIFY_EMAIL; if (dosEmail) { ... }` |
| No hardcoded recipient addresses | ✅ PASS | All outbound "to" addresses come from DB lookups, `po.User.email`, or env vars |
| No sensitive data in thrown errors | ✅ PASS | All errors (`NotFoundError`, `AuthorizationError`, `ValidationError`) carry non-sensitive messages only |
| All DB access via Prisma | ✅ PASS | No raw SQL in any new code; supervisor lookup uses typed `findFirst` |
| HTML injection prevention | ✅ PASS | `escapeHtml()` applied to all user-supplied fields in email templates |

**One minor note (non-blocking):** `FROM_ADDRESS` falls back to the hardcoded string `'noreply@district.org'` when `SMTP_FROM` is unset. This is a "from" address only and activates only if the env var is missing. It does not affect routing correctness, but see Optional Finding #1.

---

## Section 3 — TypeScript Correctness

### Return type inference ✅ PASS

`submitPurchaseOrder` has no explicit return type annotation, but TypeScript infers the return correctly from both branches:
- Normal: `{ po: record, supervisorEmail: string | null, selfSupervisorBypass: false }`
- Bypass: `{ po: record, supervisorEmail: null, selfSupervisorBypass: true }`

The controller's destructuring `const { po, supervisorEmail, selfSupervisorBypass } = await service.submitPurchaseOrder(...)` is type-correct and verified by the zero-error build.

### `po as any` casts — pre-existing, not introduced by this change

All 6 email calls in the controller use `po as any`. This pattern pre-dates this sprint (same convention used in the original code). The email service functions accept a minimal structural type:

```typescript
po: { id: string; description: string; amount: any; vendors?: { name: string } | null }
```

The Prisma return type (which includes full `vendors` shape, `User`, etc.) is not structurally compatible without a cast. This is pre-existing and considered acceptable. See Recommended Finding #2 for the improvement path.

### No implicit `any` introduced ✅ PASS

The new `isSelfSupervisor`, `supervisorEmail`, `supervisorRecord` variables are all properly inferred from Prisma's typed return values.

---

## Section 4 — Consistency with Existing Patterns

### Controller ✅ PASS

All handlers follow the established pattern:

```typescript
export const handlerName = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // ... service call ...
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

The `submitPurchaseOrder` handler correctly extends this pattern with conditional email routing based on the service's returned metadata.

### Service ⚠️ NOTED (acceptable)

`submitPurchaseOrder` is the only service method that returns a wrapped object `{ po, supervisorEmail, selfSupervisorBypass }`. All other methods return the raw Prisma result. This is intentional — the controller needs routing metadata that only the service can compute — and is acceptable design. It would be a concern only if the pattern were used inconsistently for unrelated reasons.

### Email service helper ✅ PASS

`sendApprovalActionRequired` follows the exact same pattern as the existing helpers:
- Same parameter order (po, toEmail, stageName)
- Same `poDetailHtml(po)` usage
- Same `escapeHtml` applied to user-controlled `stageName`
- Same `await sendMail({ to, subject, html })` structure

---

## Section 5 — Edge Cases

### Supervisor lookup failure — PROPAGATES ⚠️ (see Recommended Finding #1)

The `userSupervisor.findFirst(...)` call in `submitPurchaseOrder` sits outside the transaction and has no dedicated try/catch. If Prisma throws (e.g., transient DB connection error), the error propagates out through `submitPurchaseOrder` and is caught by the controller's outer catch, returning a 500 to the client. The PO status is **not** changed (the transaction was never entered), so state integrity is preserved. However, the user's submit is blocked by an infrastructure error unrelated to supervisor availability.

This is the most notable behavioral gap. See Recommended Finding #1 for the mitigation.

### `po.User` null guard ✅ PASS

All four email call-sites that access `po.User?.email` use optional chaining (`?.`). The service returns `User` via `include` so it will be `null` only if the FK points nowhere (impossible in practice, but TypeScript types it as nullable). No null dereference risk.

### `FINANCE_NOTIFY_EMAIL` not set → silent skip ✅ PASS

Confirmed: when the env var is unset, `const financeEmail = process.env.FINANCE_NOTIFY_EMAIL` evaluates to `undefined`, the `if (financeEmail)` guard fails, and the send is skipped with no error. The workflow state transitions have already completed before the email block runs, so workflow correctness is unaffected.

---

## Findings

### CRITICAL
_None._

---

### RECOMMENDED

#### R-1 — Supervisor lookup not wrapped in try/catch
**File:** `backend/src/services/purchaseOrder.service.ts` — `submitPurchaseOrder`, supervisor lookup block  
**Issue:** If `this.prisma.userSupervisor.findFirst(...)` throws (transient DB error, connection pool exhaustion), the entire submit fails with a 500 error even though the PO state transition would have been perfectly valid.  
**Suggested fix:** Wrap the lookup in try/catch, log a warning, and fall back to treating the supervisor as unknown — proceed with a normal submit (`submitted` status) and skip supervisor email sending. This preserves submit functionality when the `user_supervisors` table is temporarily unreachable.

```typescript
let supervisorRecord: Awaited<ReturnType<typeof this.prisma.userSupervisor.findFirst>> | null = null;
try {
  supervisorRecord = await this.prisma.userSupervisor.findFirst({
    where: { userId: po.requestorId, isPrimary: true },
    include: { supervisor: { select: { id: true, email: true } } },
  });
} catch {
  logger.warn('Supervisor lookup failed — proceeding without supervisor notification', { id });
  // supervisorRecord remains null; isSelfSupervisor will be true → bypass path
  // OR treat as no-bypass with no email, depending on policy preference
}
```

**Note:** Before implementing, decide the desired fallback policy: (a) treat lookup failure as "no supervisor" → bypass to `purchasing_approved`, or (b) treat lookup failure as "skip supervisor email, normal submit to `submitted`". Option (b) is safer — it does not auto-advance the PO status based on an error condition.

---

#### R-2 — Explicit return type annotation for `submitPurchaseOrder`
**File:** `backend/src/services/purchaseOrder.service.ts` — `submitPurchaseOrder` method signature  
**Issue:** The method relies on TypeScript return type inference. While the build is clean today, as the method grows more branches, inference errors would be harder to diagnose than a compile-time annotation mismatch.  
**Suggested fix:** Add an explicit `Promise<{ po: ..., supervisorEmail: string | null, selfSupervisorBypass: boolean }>` return annotation. Use the `Prisma.purchase_ordersGetPayload<...>` utility type for the `po` portion.

---

### OPTIONAL

#### O-1 — Hardcoded `FROM_ADDRESS` fallback
**File:** `backend/src/services/email.service.ts`, line with `process.env.SMTP_FROM ?? 'noreply@district.org'`  
**Issue:** `'noreply@district.org'` is hardcoded. If `SMTP_FROM` is unset in production, all emails silently originate from a domain that may not exist, causing delivery failures that are hard to diagnose.  
**Suggestion:** Replace the fallback with a startup warning (alongside the `FINANCE_NOTIFY_EMAIL`/`DOS_NOTIFY_EMAIL` warnings mentioned in spec section 5.1) and consider making `SMTP_FROM` a required env var that crashes startup if absent.

#### O-2 — `accountCode` value logged at `info` level
**File:** `backend/src/services/purchaseOrder.service.ts` — `assignAccountCode`  
**Issue:** `logger.info('Account code assigned...', { id, accountCode: accountData.accountCode, assignedBy: userId })` writes the account code value to the log. While not PII, this is financial metadata that some audit policies prefer to keep out of operational logs.  
**Suggestion:** Log only `{ id, assignedBy: userId }` and omit the value; the history record already stores it.

#### O-3 — Startup env var warnings not present in reviewed files
**Reference:** Spec section 5.1 recommends adding `logger.warn` calls in `server.ts` when `FINANCE_NOTIFY_EMAIL` or `DOS_NOTIFY_EMAIL` are unset. This is out of scope for the three reviewed files but remains unimplemented. Low-priority — the guards at call-sites handle the missing-var case correctly.

---

## Detailed Compliance Checklist

| Check | Status |
|---|---|
| **Gap 1**: Supervisor receives submit email (not requestor) | ✅ |
| **Gap 2a**: Self-supervisor detected when `supervisorId === requestorId` | ✅ |
| **Gap 2b**: Self-supervisor detected when no supervisor record exists | ✅ |
| **Gap 2c**: Bypass transitions to `purchasing_approved` (not `submitted`) | ✅ |
| **Gap 2d**: Two history entries created atomically | ✅ |
| **Gap 2e**: Bypass history note matches spec text exactly | ✅ |
| **Gap 2f**: `FINANCE_NOTIFY_EMAIL` used on bypass | ✅ |
| **Gap 3a**: L3 approve → `FINANCE_NOTIFY_EMAIL` | ✅ |
| **Gap 3b**: L4 approve → `DOS_NOTIFY_EMAIL` | ✅ |
| **Gap 3c**: L5 approve → no forward (correct) | ✅ |
| **Gap 3d**: Forward notification is ADDITIONAL, not replacing requestor notification | ✅ |
| **Gap 4**: Denial routes to requestor (unchanged) | ✅ |
| No `console.log` | ✅ |
| No PII in logger calls | ✅ |
| All sends fire-and-forget | ✅ |
| Env var guard before each env-based send | ✅ |
| No hardcoded recipient email addresses | ✅ |
| All DB ops via Prisma typed API | ✅ |
| `po.User` null-guarded everywhere | ✅ |
| Build: zero TypeScript errors | ✅ |
| Supervisor lookup failure → graceful degradation | ⚠️ R-1 |
| Explicit return type on `submitPurchaseOrder` | ⚠️ R-2 |
