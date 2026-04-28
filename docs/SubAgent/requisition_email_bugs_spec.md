# Requisition Email Bugs — Research Spec

**System:** Tech-V2 (Tech Department Management System)  
**Date:** March 23, 2026  
**Author:** Research SubAgent  
**Status:** Research Phase Complete — Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Bug 1 — Emailing ALL Supervisors](#3-bug-1--emailing-all-supervisors)
4. [Bug 2 — Changed Users Not Receiving Email](#4-bug-2--changed-users-not-receiving-email)
5. [Proposed Fixes](#5-proposed-fixes)
6. [Database Verification Queries](#6-database-verification-queries)
7. [Security Considerations](#7-security-considerations)

---

## 1. Executive Summary

Two distinct email bugs were identified in the requisition submission workflow:

| # | Issue | Root Cause | Severity |
|---|-------|-----------|----------|
| 1 | Every supervisor in the system receives email on any requisition submit | Controller broadcasts to ALL users holding a supervisor-level permission instead of only the specifically-assigned supervisor | High — generates email spam for every supervisor on every submission |
| 2 | Finance Director, Director of Schools, and PO Entry reassignees receive no email | `getEmailsByRequisitionLevel()` looks up users dynamically by their `user_permissions` records; if the new people don't have `REQUISITIONS` permission rows at the correct levels (or `isActive = false`), they are invisible to the lookup | High — workflow notifications fail silently |

---

## 2. Architecture Overview

### Email Flow Stack

```
user submits → POST /api/purchase-orders/:id/submit
                └── purchaseOrder.controller.ts  (submitPurchaseOrder handler)
                      ├── purchaseOrder.service.ts  (submitPurchaseOrder — supervisor lookup)
                      └── email.service.ts  (send functions + getEmailsByRequisitionLevel)
```

### Key Files

| File | Role |
|------|------|
| `backend/src/controllers/purchaseOrder.controller.ts` | HTTP handlers — decides WHO gets emailed at each workflow stage |
| `backend/src/services/purchaseOrder.service.ts` | Business logic — looks up the specific supervisor for a PO |
| `backend/src/services/email.service.ts` | Nodemailer transport + `getEmailsByRequisitionLevel()` lookup |
| `backend/src/middleware/permissions.ts` | Sets `req.user.permLevel` from `user_permissions` table |
| `backend/prisma/schema.prisma` | Data model: `User`, `Permission`, `UserPermission`, `LocationSupervisor`, `UserSupervisor` |

### Supervisor Resolution in `submitPurchaseOrder()` (service layer)

`purchaseOrder.service.ts` ~lines 506–580:

1. **Priority 1 — Location Supervisor**: If the PO has an `officeLocationId`, queries `LocationSupervisor` for the record with `isPrimary: true` for that location. Returns `supervisorEmail` (a single email address).
2. **Priority 2 — Personal Supervisor fallback**: Only used when `officeLocationId` is NULL. Queries `UserSupervisor` for the submitter's primary personal supervisor.
3. **Self-supervisor bypass**: If the located supervisor IS the submitter, sets `selfSupervisorBypass = true` and auto-advances to `supervisor_approved`.

The service returns `{ po, supervisorEmail, supervisorId, selfSupervisorBypass }`.

### Permission Lookup in `getEmailsByRequisitionLevel()` (email service)

`email.service.ts` lines 118–136:

```typescript
export async function getEmailsByRequisitionLevel(level: number): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      userPermissions: {
        some: {
          permission: {
            module: 'REQUISITIONS',
            level,           // exact level match
          },
        },
      },
    },
    select: { email: true },
  });
  return users.map((u) => u.email).filter(Boolean);
}
```

This queries the `users` → `user_permissions` → `permissions` join. It returns **every active user** who holds a `UserPermission` row pointing to a `Permission` row where `module = 'REQUISITIONS'` AND `level = <requested level>`.

---

## 3. Bug 1 — Emailing ALL Supervisors

### Exact Location

**File:** `backend/src/controllers/purchaseOrder.controller.ts`  
**Handler:** `submitPurchaseOrder` (lines ~120–155)

### Buggy Code Block

```typescript
// submitPurchaseOrder controller, ~lines 127–155

const { po, supervisorEmail, selfSupervisorBypass } =
  await service.submitPurchaseOrder(req.params.id as string, req.user!.id);

if (selfSupervisorBypass) {
  // Requestor is their own supervisor — notify Finance Director level users
  settingsService.getSettings().then((s) => {
    getEmailsByRequisitionLevel(s.financeDirectorApprovalLevel).then((emails) => {
      if (emails.length) {
        sendApprovalActionRequired(po as any, emails, 'Finance Director Approval').catch(() => {});
      }
    }).catch(() => {});
  }).catch(() => {});
} else {
  // Normal path — notify the requestor's primary supervisor
  if (supervisorEmail) {
    sendRequisitionSubmitted(po as any, supervisorEmail).catch(() => {}); // ✅ CORRECT
  }
  // ❌ BUG: Also notify ALL users with Supervisor permission (excluding the already-notified supervisor)
  settingsService.getSettings().then((s) => {
    getEmailsByRequisitionLevel(s.supervisorApprovalLevel).then((emails) => {
      const filtered = emails.filter((e) => e !== supervisorEmail);  // excludes ONE email
      if (filtered.length) {
        sendApprovalActionRequired(po as any, filtered, 'Supervisor Approval Required').catch(() => {});
      }
    }).catch(() => {});
  }).catch(() => {});
}
```

### Root Cause Analysis

The service layer (`submitPurchaseOrder`) correctly resolves the ONE specific supervisor for the PO (by location or personal assignment) and returns their email address. The controller then:

1. **Correctly** emails the specific supervisor via `sendRequisitionSubmitted`.
2. **Incorrectly** calls `getEmailsByRequisitionLevel(s.supervisorApprovalLevel)`, which returns every active user in the system with a REQUISITIONS level-3+ permission record. It then filters out the one already-notified supervisor but emails all remaining supervisors.

**Concrete Example:** In a district with 15 school principals all holding REQUISITIONS-level-3 permissions, a submission by a teacher at School A would email:
- School A's principal with `sendRequisitionSubmitted` ✅
- All 14 other principals with `sendApprovalActionRequired` ❌

### Why the Code Was Written This Way

The block appears to have been written as a "broadcast fallback" — the intent likely was "if no specific supervisor was found, fall back to emailing everyone at that level." However, it was implemented as an unconditional branch that runs **regardless** of whether a specific supervisor was found, meaning it always fires alongside the targeted email.

---

## 4. Bug 2 — Changed Users Not Receiving Email

### Exact Location

**File:** `backend/src/services/email.service.ts`, lines 118–136  
**Function:** `getEmailsByRequisitionLevel(level: number)`

**Also relevant:** `backend/src/controllers/purchaseOrder.controller.ts`, lines ~193–210 (all calls to `getEmailsByRequisitionLevel` for Finance Director, DOS, and PO Entry levels)

### Root Cause Analysis

`getEmailsByRequisitionLevel` is **architecturally correct** — it is a dynamic, database-driven lookup that does not hardcode user IDs or names. However, it depends on two conditions being true for a user to appear in the results:

#### Condition 1 — `user.isActive = true`
New users must be synced from Microsoft Entra ID before they appear in the `users` table. Until the Entra sync runs and creates/updates the user record with `isActive = true`, the query will never return them.

#### Condition 2 — A valid `UserPermission` row must exist
The new person must have a `user_permissions` row linking their `userId` to a `permissions` row where `module = 'REQUISITIONS'` AND `level = <N>`:

| Role | Required Level |
|------|---------------|
| Supervisor | `s.supervisorApprovalLevel` (default: 3) |
| Finance Director | `s.financeDirectorApprovalLevel` (default: 5) |
| Director of Schools | `s.dosApprovalLevel` (default: 6) |
| PO Entry | `4` (hardcoded in the controller at line ~207) |

If an admin updated role assignments through a UI panel that only modifies a `role` string field on the user (or an Entra group mapping), but did NOT update the `user_permissions` / `permissions` join table, the new users would be invisible to this query.

#### Condition 3 — `permission.isActive` not checked (latent bug)
The `getEmailsByRequisitionLevel` query does not filter `permission.isActive = true`. If the underlying `permissions` row was set to `isActive = false`, no user holding it would receive email. This condition is less likely but is a latent correctness bug.

#### Condition 4 — `userPermission.expiresAt` not checked (latent bug)
The `UserPermission` model has an `expiresAt` field. The permission middleware (`permissions.ts` lines ~98–103) correctly skips expired permissions when computing `permLevel`. However, `getEmailsByRequisitionLevel` does **not** filter out expired `UserPermission` rows — it would email users whose permissions have expired. This is a latent inconsistency (not causing Bug 2 but should be fixed).

### Most Likely Failure Scenario

When the admin replaced test users with real users for Finance Director, Director of Schools, and PO Entry:
- The old test users' `UserPermission` rows were deleted (or the old users were deactivated).
- The new users either:
  - **Were not synced from Entra** (`isActive = false` or absent from `users` table), OR
  - **Did not have `UserPermission` rows** at the correct REQUISITIONS levels assigned, OR
  - **Both**.

---

## 5. Proposed Fixes

### Fix 1 — Stop Broadcasting to All Supervisors

**File:** `backend/src/controllers/purchaseOrder.controller.ts`  
**Change:** In the `submitPurchaseOrder` handler's `else` (normal path) branch, remove the `getEmailsByRequisitionLevel(s.supervisorApprovalLevel)` broadcast block entirely.

**Before (buggy):**
```typescript
} else {
  // Normal path — notify the requestor's primary supervisor
  if (supervisorEmail) {
    sendRequisitionSubmitted(po as any, supervisorEmail).catch(() => {});
  }
  // ❌ DELETE THIS ENTIRE BLOCK:
  settingsService.getSettings().then((s) => {
    getEmailsByRequisitionLevel(s.supervisorApprovalLevel).then((emails) => {
      const filtered = emails.filter((e) => e !== supervisorEmail);
      if (filtered.length) {
        sendApprovalActionRequired(po as any, filtered, 'Supervisor Approval Required').catch(() => {});
      }
    }).catch(() => {});
  }).catch(() => {});
}
```

**After (fixed):**
```typescript
} else {
  // Normal path — notify ONLY the requestor's specific primary supervisor
  if (supervisorEmail) {
    sendRequisitionSubmitted(po as any, supervisorEmail).catch(() => {});
  }
  // No broadcast to all supervisors — the specific supervisor above is the correct recipient.
  // If no supervisor was found (supervisorEmail is null), no supervisor email is sent.
}
```

**Design note:** If a PO has no supervisor resolved (e.g., location has no primary supervisor and no personal supervisor is assigned), the system currently silently skips the notification. That is acceptable behavior since the PO is still submitted and will be visible in the approval queue. A future enhancement could alert an admin when no supervisor is found.

---

### Fix 2 — Add `permission.isActive` and `expiresAt` Filters to `getEmailsByRequisitionLevel`

**File:** `backend/src/services/email.service.ts`  
**Change:** Add filters to ensure only active, non-expired permissions are queried.

**Before:**
```typescript
export async function getEmailsByRequisitionLevel(level: number): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      userPermissions: {
        some: {
          permission: {
            module: 'REQUISITIONS',
            level,
          },
        },
      },
    },
    select: { email: true },
  });
  return users.map((u) => u.email).filter(Boolean);
}
```

**After:**
```typescript
export async function getEmailsByRequisitionLevel(level: number): Promise<string[]> {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      userPermissions: {
        some: {
          // Only unexpired permission grants
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
          permission: {
            module: 'REQUISITIONS',
            level,
            isActive: true,   // Only active permission definitions
          },
        },
      },
    },
    select: { email: true },
  });
  return users.map((u) => u.email).filter(Boolean);
}
```

This does not fix Bug 2 directly (which is an operational/data issue) but tightens the logic to match the behaviour already implemented in the permission middleware.

---

### Fix 3 — Operational: Assign Correct Permissions to New Users (Bug 2 Resolution)

The primary fix for Bug 2 is operational. After identifying the new users via the verification queries in Section 6:

1. **Ensure users are Entra-synced** — run the userSync service or trigger a manual sync so the new users appear in `users` with `isActive = true`.
2. **Assign REQUISITIONS permissions at the correct levels** — either through the admin UI or via the SQL in Section 6.

The required permission rows in the `permissions` table should already exist (they are seeded). Only the `user_permissions` join records need to be created for the new users.

---

### Fix 4 — Hardcoded Level 4 in `approvePurchaseOrder` Controller

**File:** `backend/src/controllers/purchaseOrder.controller.ts`, line ~207  
**Issue:** The PO Entry notification uses a hardcoded level `4` instead of a settings-driven value:

```typescript
} else if (po.status === 'dos_approved') {
  getEmailsByRequisitionLevel(4).then((emails) => {   // ← hardcoded 4
```

All other approval level lookups use `s.supervisorApprovalLevel`, `s.financeDirectorApprovalLevel`, `s.dosApprovalLevel` from settings. PO Entry should follow the same pattern if a `poEntryApprovalLevel` setting is ever added. For now, add a comment documenting the intentional hardcode or pull from a constant.

---

## 6. Database Verification Queries

Run these against the PostgreSQL database to verify current state before and after fixing Bug 2.

### Query A — Who holds REQUISITIONS permissions at each level?

```sql
SELECT
  u.email,
  u."isActive" AS user_active,
  p.module,
  p.level,
  p.name AS permission_name,
  p."isActive" AS perm_active,
  up."expiresAt",
  CASE WHEN up."expiresAt" IS NOT NULL AND up."expiresAt" < NOW()
       THEN 'EXPIRED' ELSE 'VALID' END AS grant_status
FROM user_permissions up
JOIN permissions p ON p.id = up."permissionId"
JOIN users u ON u.id = up."userId"
WHERE p.module = 'REQUISITIONS'
ORDER BY p.level, u.email;
```

Expected output after correct configuration:
- Level 3: site supervisors / principals
- Level 4: PO Entry staff
- Level 5: Finance Director
- Level 6: Director of Schools

### Query B — Are there new users without REQUISITIONS permissions?

```sql
-- Shows all active users who have NO REQUISITIONS permissions at all
SELECT u.id, u.email, u."firstName", u."lastName", u."isActive"
FROM users u
WHERE u."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up
    JOIN permissions p ON p.id = up."permissionId"
    WHERE up."userId" = u.id
      AND p.module = 'REQUISITIONS'
  )
ORDER BY u.email;
```

### Query C — What level do the current Finance Director / DOS / PO Entry hold?

```sql
-- Substitute actual email addresses
SELECT u.email, p.level, p.name, up."expiresAt"
FROM user_permissions up
JOIN permissions p ON p.id = up."permissionId"
JOIN users u ON u.id = up."userId"
WHERE p.module = 'REQUISITIONS'
  AND u.email IN (
    'finance.director@district.org',
    'director.of.schools@district.org',
    'po.entry@district.org'
  )
ORDER BY u.email, p.level;
```

### Query D — Assign missing REQUISITIONS permissions (template, fill in UUIDs)

```sql
-- Find the permission row IDs first:
SELECT id, module, level, name FROM permissions WHERE module = 'REQUISITIONS' ORDER BY level;

-- Then insert UserPermission records for the missing users:
INSERT INTO user_permissions ("id", "userId", "permissionId", "grantedAt", "grantedBy")
VALUES
  (gen_random_uuid(), '<new_finance_director_user_id>', '<permission_id_level_5>', NOW(), '<admin_user_id>'),
  (gen_random_uuid(), '<new_dos_user_id>',              '<permission_id_level_6>', NOW(), '<admin_user_id>'),
  (gen_random_uuid(), '<new_po_entry_user_id>',         '<permission_id_level_4>', NOW(), '<admin_user_id>');
```

### Query E — Verify email service would find them now

```sql
-- Simulates what getEmailsByRequisitionLevel(5) would return
SELECT u.email
FROM users u
WHERE u."isActive" = true
  AND EXISTS (
    SELECT 1 FROM user_permissions up
    JOIN permissions p ON p.id = up."permissionId"
    WHERE up."userId" = u.id
      AND p.module = 'REQUISITIONS'
      AND p.level = 5
      AND p."isActive" = true
      AND (up."expiresAt" IS NULL OR up."expiresAt" > NOW())
  );
```

---

## 7. Security Considerations

### Email Header Injection (Mitigated)
The email service uses `escapeHtml()` on all user-supplied strings embedded in HTML bodies. Subject lines use template literals with user data (`po.description`) but Nodemailer handles header encoding — no injection risk identified.

### Email Enumeration via Logs
`email.service.ts` line 72 redacts the local part of email addresses in logs:
```typescript
const redacted = recipients.map((e) => e.replace(/^[^@]*/, '***')).join(', ');
```
This is correct and should be preserved.

### Mass Email Denial of Service (Bug 1 IS a Secondary DoS Vector)
Bug 1 is not just a UX annoyance — if `getEmailsByRequisitionLevel(supervisorLevel)` returns 50 users and 20 requisitions are submitted simultaneously, the SMTP server receives 1,000 outbound emails. Fix 1 eliminates this risk.

### Permission Expiry Inconsistency (Latent)
The permission middleware (`permissions.ts`) correctly skips expired `userPermission` rows when computing `req.user.permLevel`. The `getEmailsByRequisitionLevel` function does NOT filter expired rows — a user with an expired permission could still receive email notifications. Fix 2 corrects this inconsistency.

### No Hardcoded User IDs or Entra Group IDs
The email lookup is fully dynamic through the `user_permissions` → `permissions` join. There are no hardcoded user IDs, Entra Object IDs, or email addresses found in the email-notification path. Bug 2 is purely operational (missing permission records / inactive users), not a code defect in the lookup mechanism itself.

---

## Summary

| Bug | File(s) | Lines | Root Cause | Fix Type |
|-----|---------|-------|-----------|----------|
| 1 — All supervisors emailed | `controllers/purchaseOrder.controller.ts` | ~144–152 | `getEmailsByRequisitionLevel` broadcast block runs unconditionally alongside targeted supervisor email | Code: delete the broadcast block |
| 2 — New role holders get no email | `services/email.service.ts` | ~118–136 | New users lack `isActive=true` and/or `UserPermission` rows at correct REQUISITIONS level | Operational: sync users + assign permissions; Code: add `isActive`/`expiresAt` guards |
| 2b — Hardcoded PO Entry level | `controllers/purchaseOrder.controller.ts` | ~207 | Level `4` hardcoded instead of settings-driven | Code: document or extract to constant |

**Files to Modify for Code Fixes:**
1. `c:\Tech-V2\backend\src\controllers\purchaseOrder.controller.ts` — remove broadcast block, add comment for hardcoded level 4
2. `c:\Tech-V2\backend\src\services\email.service.ts` — add `isActive` and `expiresAt` filters to `getEmailsByRequisitionLevel`
