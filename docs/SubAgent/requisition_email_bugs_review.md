# Requisition Email Bugs — Code Review

**System:** Tech-V2 (Tech Department Management System)  
**Date:** March 23, 2026  
**Author:** Review SubAgent  
**Spec:** `docs/SubAgent/requisition_email_bugs_spec.md`  
**Status:** PASS

---

## Overall Assessment: PASS

All three specified fixes are correctly implemented, no regressions detected, security standards are maintained, and the backend compiles cleanly.

---

## Summary Score Table

| Criterion | Result | Grade |
|-----------|--------|-------|
| Bug 1 — Broadcast block removed | Fully removed | A |
| Bug 2 — Active/non-expired permission filters added | Correct Prisma query | A |
| Fix 3 — Hardcoded level 4 comment | Present with doc reference | A |
| No regressions — downstream approval chain emails | All notification paths intact | A |
| Security — auth middleware, log redaction, HTML escaping | All preserved | A |
| Code quality — TypeScript, no `any`, structured logger | Compliant | A |
| Build result | SUCCESS (0 errors, 0 warnings) | A |
| **Overall** | | **A** |

---

## Build Result: SUCCESS

```
> tech-v2-backend@1.0.0 build
> tsc
```

Exit code 0. No TypeScript compilation errors or warnings.

---

## Detailed Findings

### Bug 1 — Broadcast Block Removed ✅

**File:** `backend/src/controllers/purchaseOrder.controller.ts`, `submitPurchaseOrder` handler

The entire secondary broadcast block that called `getEmailsByRequisitionLevel(s.supervisorApprovalLevel)` and emailed all remaining supervisors has been removed. The `else` branch now contains only the targeted supervisor notification:

```typescript
} else {
  // Normal path — notify ONLY the requestor's specific primary supervisor.
  // Do NOT broadcast to all users at the supervisor approval level.
  if (supervisorEmail) {
    sendRequisitionSubmitted(po as any, supervisorEmail).catch(() => {});
  }
}
```

- The comment explicitly explains the intent (no broadcast).
- The guard `if (supervisorEmail)` correctly handles the edge case where no supervisor is resolved — silent skip is the documented acceptable behaviour per the spec.
- `settingsService.getSettings()` is no longer called in this branch, eliminating the async fire-and-forget chain that previously ran unconditionally.

### Bug 2 — Active/Non-Expired Filters Added ✅

**File:** `backend/src/services/email.service.ts`, `getEmailsByRequisitionLevel()`

Both conditions from the spec are present in the Prisma query:

```typescript
const now = new Date();
const users = await prisma.user.findMany({
  where: {
    isActive: true,
    userPermissions: {
      some: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
        permission: {
          module: 'REQUISITIONS',
          level,
          isActive: true,
        },
      },
    },
  },
  select: { email: true },
});
```

- `isActive: true` on `permission` ensures deactivated permission definitions are excluded.
- The `expiresAt` OR clause (`null` or future date) precisely mirrors the logic in `permissions.ts` middleware, closing the inconsistency identified in the spec.
- `user.isActive: true` was already present and is retained.
- The inline comment (`// Exclude expired permission grants — matches permission middleware behaviour`) correctly documents the intent.

### Fix 3 — Hardcoded Level 4 Comment ✅

**File:** `backend/src/controllers/purchaseOrder.controller.ts`, `approvePurchaseOrder` handler

The comment reads:
```typescript
// Level 4 = PO Entry approval level (see docs/PERMISSIONS_AND_ROLES.md)
getEmailsByRequisitionLevel(4).then((emails) => {
```

This satisfies the spec requirement. The reference to the permissions documentation makes the hardcoded value discoverable and provides context for a future developer who might add a `poEntryApprovalLevel` setting.

---

## Regression Analysis

### Multi-Stage Approval Chain — All Paths Verified

| Event | Recipient | Method | Status |
|-------|-----------|--------|--------|
| PO submitted (normal) | Specific assigned supervisor | `sendRequisitionSubmitted` | ✅ Intact |
| PO submitted (self-supervisor bypass) | Finance Director level users | `sendApprovalActionRequired` | ✅ Intact |
| Supervisor approves → `supervisor_approved` | Finance Director level users | `sendApprovalActionRequired` | ✅ Intact |
| Finance Director approves → `finance_director_approved` | DOS level users | `sendApprovalActionRequired` | ✅ Intact |
| DOS approves → `dos_approved` | PO Entry level users (level 4) | `sendApprovalActionRequired` | ✅ Intact |
| Any approval | Requestor | `sendRequisitionApproved` | ✅ Intact |
| Rejection | Requestor | `sendRequisitionRejected` | ✅ Intact |
| PO issued | Requestor | `sendPOIssued` | ✅ Intact |

Removing the broadcast block has zero impact on the downstream approval chain: Finance Director, Director of Schools, and PO Entry notifications are triggered from `approvePurchaseOrder`, not from `submitPurchaseOrder`.

---

## Security Review

| Item | Finding |
|------|---------|
| HTML injection in email bodies | `escapeHtml()` applied to all user-supplied fields (`description`, `poNumber`, `vendor.name`, `reason`, `stageName`) ✅ |
| Email enumeration in logs | Local parts redacted: `e.replace(/^[^@]*/, '***')` ✅ |
| SMTP credentials | Read from environment variables only; never logged ✅ |
| Authentication on PO endpoints | `req.user!.id` and `req.user!.permLevel` continue to be sourced from the auth middleware ✅ |
| No new sensitive data logged | The fixes add no logging beyond what was already present ✅ |

No security regressions or new issues introduced.

---

## Code Quality Review

| Item | Finding |
|------|---------|
| TypeScript strict mode | No type errors; build clean ✅ |
| New `any` types introduced | None — existing `po as any` casts are unchanged ✅ |
| Structured logger usage | `logger.info` / `logger.error` used; no `console.log` calls ✅ |
| Dead code | None remaining in the patched handlers ✅ |
| Async fire-and-forget pattern | Consistent with existing controller idiom (`.catch(() => {})`) ✅ |
| Comment quality | Comments explain *why*, not *what*; doc references included ✅ |

---

## Minor Observations (Non-Blocking)

1. **`filter(Boolean)` type narrowing**: `users.map((u) => u.email).filter(Boolean)` is a pre-existing pattern. If `email` is `string | null` in the Prisma model, TypeScript strict mode technically cannot narrow this to `string[]` without a typed predicate. However, since the build passes with zero errors, the schema declares `email` as a non-nullable `String`, making this a no-op that's harmless rather than a bug.

2. **`settingsService` not imported in `submitPurchaseOrder` else-branch**: By removing the broadcast block, `settingsService.getSettings()` is no longer called in the normal (`else`) path. The `settingsService` singleton is still required by `approvePurchaseOrder`, so the import remains correct. No orphaned code.

3. **Operational fix (Bug 2 root cause)**: The code fix closes the consistency gap, but the spec correctly notes that missing `UserPermission` records for new Finance Director / DOS / PO Entry users is an operational problem requiring data remediation. The database verification queries in the spec (Section 6) should be run post-deployment to confirm the correct users appear in `getEmailsByRequisitionLevel()` results.

---

## Files Reviewed

| File | Change Type | Verdict |
|------|-------------|---------|
| `backend/src/controllers/purchaseOrder.controller.ts` | Bug 1 removal + Fix 3 comment | PASS |
| `backend/src/services/email.service.ts` | Bug 2 permission filters | PASS |
