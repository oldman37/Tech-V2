# PO Approval Notification Routing — Implementation Spec

**Date:** 2026-03-11  
**Sprint:** C-3 (gap-fix)  
**Refs:** REC-7 (`sprint_c2_review.md`), Gaps 1–4 as described in request

---

## 1. Scope

This spec covers four known gaps in the purchase-order notification-routing system:

| Gap | ID | Summary |
|-----|----|---------|
| 1 | REC-7 | On submit, email goes to the requestor instead of their primary supervisor |
| 2 | Self-supervisor bypass | If the requestor's primary supervisor is themselves, skip `supervisor_approved` and transition directly to `purchasing_approved` |
| 3 | Forward notifications | When level 3 approves, notify level 4 (Finance). When level 4 approves, notify level 5 (DOS). |
| 4 | Denial notification | Requestor is correctly emailed on denial — **confirmed correct, no change needed** |

---

## 2. Workflow Reference

```
draft  ──[submit]──▶  submitted  ──[L3 approve]──▶  supervisor_approved
                                                           │
                                                   [L4 approve]
                                                           │
                                                           ▼
                                               purchasing_approved
                                                           │
                                                   [L5 approve]
                                                           │
                                                           ▼
                                                    dos_approved
                                                           │
                                                    [L5 issue]
                                                           │
                                                           ▼
                                                      po_issued

Any active status  ──[deny]──▶  denied

SELF-SUPERVISOR BYPASS (Gap 2):
draft  ──[submit (bypass)]──▶  [submitted + supervisor_approved auto]  ──▶  purchasing_approved
       (two history entries, single transaction)
```

---

## 3. Current State Analysis

### 3.1 Files Reviewed

| File | Role |
|------|------|
| `backend/src/controllers/purchaseOrder.controller.ts` | HTTP handlers; all email fire-and-forget calls |
| `backend/src/services/purchaseOrder.service.ts` | Business logic; state transitions; Prisma calls |
| `backend/src/services/email.service.ts` | Nodemailer wrappers; HTML templates |
| `backend/prisma/schema.prisma` | `UserSupervisor`, `purchase_orders`, `User`, `Permission` models |
| `backend/src/services/user.service.ts` | `getUserSupervisors()` showing existing Prisma pattern |

### 3.2 Schema — Relevant Models

**`UserSupervisor` (`user_supervisors` table):**
```prisma
model UserSupervisor {
  id           String   @id @default(uuid())
  userId       String                          // the employee
  supervisorId String                          // their supervisor
  locationId   String?
  isPrimary    Boolean  @default(false)        // ← primary supervisor flag
  assignedAt   DateTime @default(now())
  assignedBy   String?
  notes        String?
  supervisor   User     @relation("user_supervisors_supervisorIdTousers", ...)
  user         User     @relation("user_supervisors_userIdTousers",       ...)
  @@map("user_supervisors")
}
```

**`Permission` (`permissions` table):**
```prisma
model Permission {
  module          String    // e.g. "REQUISITIONS"
  level           Int       // 1–5; 3=supervisor, 4=purchasing/finance, 5=DOS
  @@unique([module, level])
  @@map("permissions")
}
```

**`UserPermission` (`user_permissions` table):** joins `User` → `Permission`.

**`User.permLevel`** is NOT stored directly on the `User` row. Permission level is resolved via `UserPermission → Permission` queries at request time and attached to `req.user.permLevel` by auth middleware.

### 3.3 Existing Email Helpers (email.service.ts)

| Function | Current Recipient | Template Subject |
|----------|------------------|-----------------|
| `sendRequisitionSubmitted(po, toEmail)` | Currently called with **requestor** email (BUG) | "Requisition Approval Required: …" (wording is already correct for a supervisor target) |
| `sendRequisitionApproved(po, toEmail, stageName)` | Requestor | "Requisition Approved (stageName): …" |
| `sendRequisitionRejected(po, toEmail, reason)` | Requestor | "Requisition Denied: …" ✓ |
| `sendPOIssued(po, toEmail)` | Requestor | "PO Issued: …" ✓ |

HTML escaping: `escapeHtml()` helper already implemented and applied to all user-supplied fields.  
PII in logs: Already redacted via `options.to.replace(/^[^@]*/, '***')`.

### 3.4 Notification Point Audit (current behaviour)

#### `submitPurchaseOrder` controller (~line 121)
```typescript
// CURRENT — BUG (Gap 1 & 2)
if (po.User?.email) {
  sendRequisitionSubmitted(po as any, po.User.email).catch(() => {});
  //                                 ^^^^^^^^^^^^^^ requestor — WRONG
}
```
- Sends "Awaiting Your Approval" to the requestor, who is the one who just submitted.
- Supervisor receives **nothing**.
- No self-supervisor detection.

#### `approvePurchaseOrder` controller (~line 138)
```typescript
// CURRENT — INCOMPLETE (Gap 3)
if (po.User?.email) {
  sendRequisitionApproved(po as any, po.User.email, stageLabels[permLevel] ?? 'Approved').catch(() => {});
  //                                 ^^^^^^^^^^^^^^ requestor only
}
```
- Correctly notifies requestor that their PO advanced.
- Does NOT notify the next approver in the chain.

#### `rejectPurchaseOrder` controller (~line 165)
```typescript
// CURRENT — CORRECT (Gap 4 ✓)
if (po.User?.email) {
  sendRequisitionRejected(po as any, po.User.email, data.reason).catch(() => {});
}
```
- Requestor receives denial email with reason. This is correct. **No change.**

#### `issuePurchaseOrder` controller (~line 179)
```typescript
// CURRENT — CORRECT ✓
if (po.User?.email) {
  sendPOIssued(po as any, po.User.email).catch(() => {});
}
```
- Requestor receives PO-issued confirmation. This is correct. **No change.**

---

## 4. Desired Behaviour Per Notification Point

| Event | Recipient(s) | Email Helper | Notes |
|-------|-------------|-------------|-------|
| Submit (normal path) | Primary supervisor | `sendRequisitionSubmitted` | Already has correct subject/body |
| Submit (self-supervisor bypass) | `FINANCE_NOTIFY_EMAIL` distribution | `sendApprovalActionRequired` (new) | Subject: "PO Requires Purchasing Approval" |
| L3 approve | Requestor (existing) + `FINANCE_NOTIFY_EMAIL` | `sendRequisitionApproved` + `sendApprovalActionRequired` (new) | Two separate fire-and-forget sends |
| L4 approve | Requestor (existing) + `DOS_NOTIFY_EMAIL` | `sendRequisitionApproved` + `sendApprovalActionRequired` (new) | Two separate fire-and-forget sends |
| L5 approve | Requestor only (existing) | `sendRequisitionApproved` | No next approver to notify |
| Deny (any stage) | Requestor | `sendRequisitionRejected` | ✓ Already correct |
| Issue PO | Requestor | `sendPOIssued` | ✓ Already correct |

---

## 5. Design Decisions

### 5.1 Next-Approver Notification Target: Environment Variables (not DB query)

**Decision:** Use two environment variables for distribution addresses:
- `FINANCE_NOTIFY_EMAIL` — notified on: (a) L3 approval, (b) self-supervisor bypass
- `DOS_NOTIFY_EMAIL` — notified on: L4 approval

**Rationale:**
- A DB query for "all users with REQUISITIONS level 4" is non-deterministic (0, 1, or N results). Sending to all of them is noisy; sending to none silently breaks the workflow.
- In district/municipality environments, Finance and DOS have shared distribution mailboxes that pre-exist any user record. This is the standard pattern in enterprise procurement systems (SAP Ariba, Coupa, Tyler Technologies Munis).
- Env vars are configurable without code changes; no PII at rest in code.
- If the env var is unset or empty, the forward notification is silently skipped (logged as a warning at startup) — workflow correctness is not impacted.

**Startup validation (recommended addition to `server.ts`):**
```typescript
if (!process.env.FINANCE_NOTIFY_EMAIL) {
  logger.warn('FINANCE_NOTIFY_EMAIL not configured — finance approval notifications will not be sent');
}
if (!process.env.DOS_NOTIFY_EMAIL) {
  logger.warn('DOS_NOTIFY_EMAIL not configured — DOS approval notifications will not be sent');
}
```

### 5.2 Supervisor Lookup Location: Service Layer

**Decision:** Move the supervisor lookup into `submitPurchaseOrder` in the service, not the controller.

**Rationale:** The self-supervisor bypass changes the state transition (business logic), which belongs in the service. The service already has a `prisma` instance. Keeping lookup and transition together avoids a round-trip: the controller would have to query the supervisor, pass it to the service, and then the service would also need it to decide the state. Coupling is reduced by having the service return the data the controller needs for email routing.

**Service return shape (modified):**
```typescript
// submitPurchaseOrder now returns:
{
  po:                  <full PO with User and vendors included>,
  supervisorEmail:     string | null,   // null if no supervisor or self-supervisor
  selfSupervisorBypass: boolean,        // true if bypass was applied
}
```

### 5.3 Self-Supervisor Bypass: Two History Entries, Single Transaction

**Decision:** On a self-supervisor bypass, create two `RequisitionStatusHistory` rows atomically:
1. `draft → submitted` (submitted by requestor at `now`)
2. `submitted → purchasing_approved` (auto-approved, `notes: 'supervisor_approved stage bypassed: requestor is their own primary supervisor'`, `changedById: requestorId`)

Final status written to `purchase_orders.status`: `'purchasing_approved'`.

**Rationale:**
- Preserves the full audit trail; auditors can see the bypass happened and why.
- Does not skip the `submittedAt` timestamp — that still gets written.
- Uses requestor's own ID on the auto-approval history entry (not a system user ID) to stay consistent with existing FK constraint (`changedById` references `User.id`).

---

## 6. Prisma Query Patterns

### 6.1 Primary Supervisor Lookup

```typescript
// Inside service.submitPurchaseOrder(), after confirming PO exists and is draft

const supervisorRecord = await this.prisma.userSupervisor.findFirst({
  where: { userId: po.requestorId, isPrimary: true },
  include: {
    supervisor: { select: { id: true, email: true } },
  },
});

const primarySupervisorId    = supervisorRecord?.supervisorId ?? null;
const primarySupervisorEmail = supervisorRecord?.supervisor.email ?? null;
```

### 6.2 Self-Supervisor Detection

```typescript
const isSelfSupervisor =
  !supervisorRecord ||                                  // no supervisor assigned
  supervisorRecord.supervisorId === po.requestorId;     // supervisor IS requestor
```

### 6.3 Normal Submit (no bypass)

```typescript
// Inside this.prisma.$transaction(async (tx) => { ... })
const record = await tx.purchase_orders.update({
  where: { id },
  data: { status: 'submitted', submittedAt: now, submittedDate: now },
  include: { User: { select: { id, firstName, lastName, email } }, vendors: true },
});

await tx.requisitionStatusHistory.create({
  data: {
    purchaseOrderId: id,
    fromStatus: 'draft',
    toStatus:   'submitted',
    changedById: userId,
    changedAt:   now,
  },
});

return record;
```

### 6.4 Self-Supervisor Bypass (two history entries)

```typescript
// Inside this.prisma.$transaction(async (tx) => { ... })
const record = await tx.purchase_orders.update({
  where: { id },
  data: {
    status:        'purchasing_approved',
    submittedAt:   now,
    submittedDate: now,
  },
  include: { User: { select: { id, firstName, lastName, email } }, vendors: true },
});

// History entry 1: draft → submitted
await tx.requisitionStatusHistory.create({
  data: {
    purchaseOrderId: id,
    fromStatus: 'draft',
    toStatus:   'submitted',
    changedById: userId,
    changedAt:   now,
  },
});

// History entry 2: submitted → purchasing_approved (auto-bypass)
await tx.requisitionStatusHistory.create({
  data: {
    purchaseOrderId: id,
    fromStatus: 'submitted',
    toStatus:   'purchasing_approved',
    changedById: userId,
    changedAt:   now,
    notes:
      'supervisor_approved stage bypassed: requestor is their own primary supervisor',
  },
});

return record;
```

---

## 7. Code-Level Changes

### 7.1 `email.service.ts` — New Helper

Add one new public function. Place it after `sendRequisitionApproved`, before `sendRequisitionRejected`.

**Signature:**
```typescript
export async function sendApprovalActionRequired(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string,
  stageName: string,   // e.g. 'Purchasing Approval' or 'Director of Services Approval'
): Promise<void>
```

**Template:**
```typescript
await sendMail({
  to:      toEmail,
  subject: `PO Approval Required (${stageName}): ${po.description}`,
  html: `
    <h2 style="color:#1565C0;">Purchase Requisition Awaiting ${escapeHtml(stageName)}</h2>
    <p>A purchase requisition has advanced to the <strong>${escapeHtml(stageName)}</strong>
       stage and requires your review and approval.</p>
    ${poDetailHtml(po)}
    <p style="margin-top:24px;">Please log in to the system to review and approve or deny this requisition.</p>
  `,
});
```

**No other changes to `email.service.ts`.** The existing `sendRequisitionSubmitted` subject ("Requisition Approval Required: …") is already correctly worded for supervisor notification and does not need to change.

### 7.2 `purchaseOrder.service.ts` — `submitPurchaseOrder` Method

**Current signature:** `async submitPurchaseOrder(id: string, userId: string)`  
**Current return:** full PO object (direct from `tx.purchase_orders.update`)

**New return type (inline interface, no import changes required):**
```typescript
async submitPurchaseOrder(id: string, userId: string): Promise<{
  po: Prisma.purchase_ordersGetPayload<{
    include: {
      User:    { select: { id: true; firstName: true; lastName: true; email: true } };
      vendors: true;
    };
  }>;
  supervisorEmail:      string | null;
  selfSupervisorBypass: boolean;
}>
```

**Full replacement logic for `submitPurchaseOrder` method body:**

```typescript
async submitPurchaseOrder(id: string, userId: string) {
  const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
  if (!po) throw new NotFoundError('Purchase order', id);

  if (po.requestorId !== userId) {
    throw new AuthorizationError('You can only submit your own purchase orders');
  }

  if (po.status !== 'draft') {
    throw new ValidationError(
      `Only draft purchase orders can be submitted. Current status: "${po.status}"`,
      'status',
    );
  }

  // --- Supervisor lookup ---
  const supervisorRecord = await this.prisma.userSupervisor.findFirst({
    where: { userId: po.requestorId, isPrimary: true },
    include: { supervisor: { select: { id: true, email: true } } },
  });

  const isSelfSupervisor =
    !supervisorRecord ||
    supervisorRecord.supervisorId === po.requestorId;

  const supervisorEmail = isSelfSupervisor
    ? null
    : (supervisorRecord!.supervisor.email ?? null);

  const now = new Date();

  if (isSelfSupervisor) {
    // --- Self-supervisor bypass: draft → purchasing_approved (two history entries) ---
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchase_orders.update({
        where: { id },
        data: {
          status:        'purchasing_approved',
          submittedAt:   now,
          submittedDate: now,
        },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus:      'draft',
          toStatus:        'submitted',
          changedById:     userId,
          changedAt:       now,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus:      'submitted',
          toStatus:        'purchasing_approved',
          changedById:     userId,
          changedAt:       now,
          notes:
            'supervisor_approved stage bypassed: requestor is their own primary supervisor',
        },
      });

      return updated;
    });

    logger.info('Purchase order submitted (self-supervisor bypass)', {
      id,
      submittedBy: userId,
      newStatus:   'purchasing_approved',
    });

    return { po: record, supervisorEmail: null, selfSupervisorBypass: true };

  } else {
    // --- Normal submit: draft → submitted ---
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchase_orders.update({
        where: { id },
        data: {
          status:        'submitted',
          submittedAt:   now,
          submittedDate: now,
        },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus:      'draft',
          toStatus:        'submitted',
          changedById:     userId,
          changedAt:       now,
        },
      });

      return updated;
    });

    logger.info('Purchase order submitted', { id, submittedBy: userId });

    return { po: record, supervisorEmail, selfSupervisorBypass: false };
  }
}
```

### 7.3 `purchaseOrder.controller.ts` — Import Changes

Add `sendApprovalActionRequired` to the existing named import from `email.service`:

```typescript
// Before:
import {
  sendRequisitionSubmitted,
  sendRequisitionApproved,
  sendRequisitionRejected,
  sendPOIssued,
} from '../services/email.service';

// After:
import {
  sendRequisitionSubmitted,
  sendRequisitionApproved,
  sendRequisitionRejected,
  sendPOIssued,
  sendApprovalActionRequired,
} from '../services/email.service';
```

### 7.4 `purchaseOrder.controller.ts` — `submitPurchaseOrder` Handler

**Full replacement for the `submitPurchaseOrder` handler:**

```typescript
/**
 * POST /api/purchase-orders/:id/submit
 */
export const submitPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { po, supervisorEmail, selfSupervisorBypass } =
      await service.submitPurchaseOrder(req.params.id as string, req.user!.id);

    if (selfSupervisorBypass) {
      // Requestor is their own supervisor — notify Finance instead
      const financeEmail = process.env.FINANCE_NOTIFY_EMAIL;
      if (financeEmail) {
        sendApprovalActionRequired(po as any, financeEmail, 'Purchasing Approval').catch(() => {});
      }
    } else {
      // Normal path — notify the requestor's primary supervisor
      if (supervisorEmail) {
        sendRequisitionSubmitted(po as any, supervisorEmail).catch(() => {});
      }
    }

    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### 7.5 `purchaseOrder.controller.ts` — `approvePurchaseOrder` Handler

Add forward notifications after the existing requestor notification. The existing `po` return shape already includes `po.User.email` — no service changes needed.

**Full replacement for the `approvePurchaseOrder` handler:**

```typescript
/**
 * POST /api/purchase-orders/:id/approve
 */
export const approvePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data    = ApproveSchema.parse(req.body);
    const userId  = req.user!.id;
    const permLvl = req.user!.permLevel ?? 1;

    const po = await service.approvePurchaseOrder(req.params.id as string, userId, permLvl, data);

    const stageLabels: Record<number, string> = {
      3: 'Supervisor Approved',
      4: 'Purchasing Approved',
      5: 'Director of Services Approved',
    };

    // Notify requestor of approval progress (existing behaviour, unchanged)
    if (po.User?.email) {
      sendRequisitionApproved(
        po as any,
        po.User.email,
        stageLabels[permLvl] ?? 'Approved',
      ).catch(() => {});
    }

    // Forward notification to next approver in chain (Gap 3)
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
    // permLvl === 5 (DOS approval): no next approver to forward to

    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### 7.6 No Changes Needed

- `rejectPurchaseOrder` controller — correct as-is (Gap 4 confirmed).
- `issuePurchaseOrder` controller — correct as-is.
- `email.service.ts` existing helpers — correct as-is (escaping already applied).
- `prisma/schema.prisma` — no migrations required; `UserSupervisor` model already present.

---

## 8. Environment Variables

Add to `.env` and deployment configuration:

```ini
# PO approval routing — distribution mailboxes for each approval tier
# If unset, forward notifications for that tier are silently skipped.
FINANCE_NOTIFY_EMAIL=finance@district.org
DOS_NOTIFY_EMAIL=dos@district.org
```

Document alongside existing `SMTP_*` variables in `.env.example` (create if it doesn't exist):

```ini
# Email transport
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@district.org
SMTP_PASS=
SMTP_FROM=noreply@district.org
# PO approval distribution lists (optional — forward notifications skipped if unset)
FINANCE_NOTIFY_EMAIL=finance@district.org
DOS_NOTIFY_EMAIL=dos@district.org
```

---

## 9. Security Considerations

### 9.1 No PII in Logs
- The `sendMail` helper already redacts email addresses to `***@domain.org` before logging. The new `sendApprovalActionRequired` uses the same `sendMail` helper — no additional code needed.
- Supervisor email is never logged by the controller. Only the boolean `selfSupervisorBypass` flag and the `id` / `submittedBy` are logged by the service (no email addresses).

### 9.2 XSS in Email Templates
- `sendApprovalActionRequired` uses `escapeHtml(stageName)` and delegates `po` fields to `poDetailHtml()` which also uses `escapeHtml`. Consistent with existing pattern.
- The `stageName` values passed from the controller are hardcoded string literals (`'Purchasing Approval'`, `'Director of Services Approval'`) — not user-supplied — but `escapeHtml()` is applied anyway for defence-in-depth.

### 9.3 Supervisor Email Not Validated
- The supervisor's email is taken directly from the database (`UserSupervisor → supervisor.email`). The `User.email` field is sourced from Microsoft Entra ID (Azure AD sync) and is not user-editable via this API. No additional validation is needed.

### 9.4 Unauthorized Status Transition via Bypass
- The self-supervisor bypass is only reachable through `submitPurchaseOrder`, which already enforces `po.requestorId !== userId` (only the requestor can submit their own PO). A level-1 user cannot fake a supervisor bypass to skip approval on another user's PO.
- The bypass does not bypass level 4 (purchasing) or level 5 (DOS) approval — it only skips the level 3 supervisor step.

### 9.5 No SSRF Risk
- Env var email addresses go to the Nodemailer SMTP transport, not to an HTTP endpoint. No SSRF exposure.

---

## 10. Risk & Fallback Behaviour

### Risk A: Requestor Has No Supervisor Assigned (`UserSupervisor` row absent)

| Condition | `supervisorRecord` | `isSelfSupervisor` | Behaviour |
|---|---|---|---|
| No `UserSupervisor` row where `isPrimary = true` | `null` | `true` | **Self-supervisor bypass** is applied. PO transitions to `purchasing_approved`. Finance is notified via `FINANCE_NOTIFY_EMAIL`. |

This is the safest fallback: the PO does not stall at `submitted` indefinitely waiting for a supervisor who will never receive an email. It routes forward to the finance stage which has a known distribution address.

**If `FINANCE_NOTIFY_EMAIL` is also unset:** PO still transitions to `purchasing_approved` correctly. No email is sent. The PO will be visible to level-4 users in the "Pending My Approval" tab (after REC-6 fix is applied). Workflow continues but without an email trigger.

### Risk B: `FINANCE_NOTIFY_EMAIL` / `DOS_NOTIFY_EMAIL` Not Configured

- Nodemailer is never called.
- No exception is thrown.
- The approval state transition has already been committed.
- Optional startup warning (`logger.warn`) recommended (see §5.1) so that ops teams are alerted immediately at deploy time, not silently at runtime.

### Risk C: Supervisor Has No Email Address

- `supervisorRecord.supervisor.email` is typed as `String` (non-nullable in the User model). Email sync from Entra ID guarantees it is populated for any active AD user who has been assigned as a supervisor. No null-guard is strictly required, but using `?? null` defensive assignment prevents any edge-case runtime crash from bad data.

### Risk D: Multiple `isPrimary = true` Records for One User

- This would be a data integrity issue (the schema does not enforce a unique constraint on `userId + isPrimary`). `findFirst` with `orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }]` (as used by `getUserSupervisors` in `user.service.ts`) would return the most-recently-assigned primary supervisor. For `submitPurchaseOrder`, using `findFirst` without explicit ordering is fine since the intent is to find *any* primary supervisor; in practice the first returned will do. The service uses `findFirst` with `where: { userId, isPrimary: true }`.

---

## 11. Summary of Changes per File

### `backend/src/services/email.service.ts`
- **Add**: `sendApprovalActionRequired(po, toEmail, stageName)` — new public function

### `backend/src/services/purchaseOrder.service.ts`
- **Modify**: `submitPurchaseOrder` — add supervisor lookup, self-supervisor bypass logic, enriched return type `{ po, supervisorEmail, selfSupervisorBypass }`

### `backend/src/controllers/purchaseOrder.controller.ts`
- **Modify**: import block — add `sendApprovalActionRequired`
- **Modify**: `submitPurchaseOrder` — destructure new return shape; route email to supervisor or Finance based on bypass flag
- **Modify**: `approvePurchaseOrder` — add forward notification block after requestor notification (level 3 → Finance, level 4 → DOS)

### Environment / Config
- **Add**: `FINANCE_NOTIFY_EMAIL` and `DOS_NOTIFY_EMAIL` to `.env` / `.env.example`

---

## 12. Gap 4 Confirmation: Denial Notification

**Gap 4 is already correctly implemented. No changes needed.**

```typescript
// rejectPurchaseOrder controller — CORRECT ✓
if (po.User?.email) {
  sendRequisitionRejected(po as any, po.User.email, data.reason).catch(() => {});
}
```

- Recipient: requestor (`po.User.email`) ✓
- Contains denial reason from `data.reason` ✓
- `sendRequisitionRejected` template applies `escapeHtml(reason)` ✓
- PII not logged ✓

---

## 13. Implementation Checklist

```
[ ] email.service.ts       — add sendApprovalActionRequired()
[ ] purchaseOrder.service.ts — modify submitPurchaseOrder (supervisor lookup + bypass)
[ ] purchaseOrder.controller.ts — modify import block
[ ] purchaseOrder.controller.ts — modify submitPurchaseOrder handler
[ ] purchaseOrder.controller.ts — modify approvePurchaseOrder handler
[ ] .env / .env.example    — add FINANCE_NOTIFY_EMAIL, DOS_NOTIFY_EMAIL
[ ] server.ts (optional)   — add startup warnings for unset env vars
[ ] TypeScript compile check (npx tsc --noEmit) — verify no type errors
```

---

*Spec produced by research subagent. Ready for implementation subagent.*
