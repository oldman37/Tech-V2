# PO Finance Director Approval — Bug Investigation & Fix Spec

**Date:** 2026-03-12  
**Reported by:** User `rdevices@ocboe.com` (Register Devices) – assigned "Director of Finance" on REQUISITIONS  
**Symptom:** PO in `supervisor_approved` status shows "Awaiting Finance Director Approval" but the Finance Director user apparently cannot approve it.

---

## 1. Executive Summary

The Finance Director approval step is broken because of a **permission level number mismatch** introduced when the PO workflow was refactored from a 5-level system (Sprint C-2) to a 6-level system. Any Finance Director user who was assigned to REQUISITIONS at the **old level 4** (the "Finance Director" slot under the original implementation) now has `permLevel = 4`, but both the backend service and the frontend UI require `permLevel >= 5` for the `supervisor_approved → finance_director_approved` transition.

Three additional defects compound the problem:
- **Dead code** (`APPROVAL_TRANSITIONS`) that misleads developers about the workflow logic.
- **Legacy DB permission records at levels 7–9** that duplicate existing names and create a security risk (over-privileged accidental assignments).
- **Stale repo memory** that still documents the original 5-level mapping (`5 = DOS`) rather than the current 6-level mapping (`5 = Director of Finance`, `6 = DOS`).

---

## 2. DB State (Verified 2026-03-12)

### 2.1 REQUISITIONS permissions in the database

| Level | Name in DB | Status |
|-------|-----------|--------|
| 1 | Viewer | ✅ Current |
| 2 | General User | ✅ Current |
| 3 | Supervisor | ✅ Current |
| 4 | PO Entry | ✅ Current |
| 5 | Director of Finance | ✅ Current |
| 6 | Director of Schools | ✅ Current |
| 7 | Supervisor | ⚠️ **Legacy duplicate** — same name as level 3 |
| 8 | Athletic Director | ⚠️ **Legacy** — no role in current workflow |
| 9 | General User | ⚠️ **Legacy duplicate** — same name as level 2 |

### 2.2 rdevices@ocboe.com current permissions

```
REQUISITIONS  level 5  "Director of Finance"  ← CORRECT
MAINTENANCE   level 1  "General User"
TECHNOLOGY    level 1  "General User"
```

`rdevices` is **correctly assigned** at this moment. The broader problem affects any Finance Director user who was assigned during the Sprint C-2 era when the Finance Director step used level 4.

---

## 3. Current Code Analysis

### 3.1 `backend/src/services/purchaseOrder.service.ts` — Workflow constants

```ts
// LIVE CODE — used by approvePurchaseOrder()
const STATUS_APPROVAL_REQUIREMENTS: Partial<Record<POStatus, { to: POStatus; requiredLevel: number }>> = {
  'submitted':                 { to: 'supervisor_approved',        requiredLevel: 3 },
  'supervisor_approved':       { to: 'finance_director_approved',  requiredLevel: 5 }, // ← requires 5
  'finance_director_approved': { to: 'dos_approved',               requiredLevel: 6 },
};

// DEAD CODE — defined but never referenced anywhere
const APPROVAL_TRANSITIONS: Record<number, { from: POStatus; to: POStatus }> = {
  3: { from: 'submitted',                 to: 'supervisor_approved' },
  5: { from: 'supervisor_approved',       to: 'finance_director_approved' },
  6: { from: 'finance_director_approved', to: 'dos_approved' },
  // Level 4 (PO Entry / Purchasing) does NOT advance via /approve
};
```

The approval service method enforces the check:

```ts
async approvePurchaseOrder(id, userId, permLevel, approveData) {
  const stageReq = STATUS_APPROVAL_REQUIREMENTS[po.status as POStatus];
  // ...
  if (permLevel < stageReq.requiredLevel) {
    throw new AuthorizationError(
      `This approval stage requires permission level ${stageReq.requiredLevel} or higher (your level: ${permLevel})`
    );
  }
  // ...
}
```

**For a `supervisor_approved` PO:** a user with `permLevel = 4` hits `4 < 5 = true` → **403 AuthorizationError**.

### 3.2 `backend/src/routes/purchaseOrder.routes.ts` — Approve route guard

```ts
router.post(
  '/:id/approve',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(ApproveSchema, 'body'),
  checkPermission('REQUISITIONS', 3),  // ← route-level minimum = 3
  purchaseOrderController.approvePurchaseOrder,
);
```

The route-level guard only requires **level 3**. A user with level 4 **passes the route guard** (4 ≥ 3) and `req.user.permLevel` is set to 4.  
The **service-level** guard then rejects them at `4 < 5 = true`.

This creates a confusing two-layer failure: the route admits the user; the service rejects them. The HTTP response is 403 but the error message "requires level 5 or higher (your level: 4)" distinguishes it from a route-level 403.

### 3.3 `backend/src/middleware/permissions.ts` — permLevel assignment

```ts
const highestLevel = userPermissions
  .filter(up => up.permission.module === module && (!up.expiresAt || up.expiresAt >= now))
  .reduce((max, up) => Math.max(max, up.permission.level), 0);

req.user!.permLevel = highestLevel || matchingPermission.permission.level;
```

`req.user.permLevel` is set to the **highest level** the user has for the module. If a user has only one REQUISITIONS permission (e.g., level 4), `permLevel = 4`.

### 3.4 `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` — Frontend visibility gate

```ts
const STATUS_MIN_LEVEL: Partial<Record<POStatus, number>> = {
  'submitted':                 3,
  'supervisor_approved':       5,  // ← Finance Director must have at least 5
  'finance_director_approved': 6,
};

const stageMinLevel = STATUS_MIN_LEVEL[po.status as POStatus] ?? Infinity;
const canActAtStage = permLevel >= stageMinLevel;
const canApprove = canActAtStage;

// Action panel — renders when canApprove = false:
{!canActAtStage && waitingLabel && po.status !== 'denied' && (
  <Alert severity="info">{waitingLabel}</Alert>
  // waitingLabel for 'supervisor_approved' = "Awaiting Finance Director Approval"
)}

// Approve button — renders when canApprove = true:
{canApprove && (
  <Button variant="contained" color="success" onClick={() => setApproveDialogOpen(true)}>
    Approve as Finance Director
  </Button>
)}
```

For `permLevel = 4`: `canApprove = 4 >= 5 = false` → **button hidden; banner shown**.  
For `permLevel = 5`: `canApprove = 5 >= 5 = true` → **button shown; banner hidden**.

### 3.5 `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` — Permission resolution

```ts
const reqPerm = userDetail?.permissions
  ?.filter((p) => p.module === 'REQUISITIONS')
  ?.sort((a, b) => b.level - a.level)?.[0];

const permLevel = reqPerm?.level ?? 0;
```

This reads `permission.level` from the `UserPermission → Permission` join. If the user is linked to the **level-4 permission record** ("PO Entry"), `permLevel = 4`. If linked to **level-5** ("Director of Finance"), `permLevel = 5`.

### 3.6 `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` — Pending tab filter

```ts
const STATUS_FOR_LEVEL: Partial<Record<number, POStatus>> = {
  3: 'submitted',               // Supervisor
  4: 'dos_approved',            // PO Entry — sees DOS-approved POs (for issuing)
  5: 'supervisor_approved',     // Finance Director — sees supervisor-approved POs
  6: 'finance_director_approved', // Director of Schools
};
```

A Finance Director at **level 4** would see `dos_approved` POs in the "Pending My Approval" tab (PO Entry queue), **not** `supervisor_approved` POs (Finance Director queue). The affected user couldn't even easily find the PO that needs their approval from the list view.

---

## 4. Root Cause — Timeline

### Sprint C-2 (completed 2026-03-10, per `/memories/repo/sprint-c2-po-backend.md`)

Original 5-level workflow:
```
Level 1 = Viewer
Level 2 = General User
Level 3 = Supervisor         → approves submitted → supervisor_approved
Level 4 = Finance Director   → approves supervisor_approved → finance_director_approved
Level 5 = Director of Schools → approves finance_director_approved → dos_approved
```

`PermissionLevel` type was `1 | 2 | 3 | 4 | 5`.  
Repo memory note: _"Workflow logic uses level numbers (3=supervisor, 4=purchasing, 5=DOS)"_.

### Post-Sprint C-2 Refactor (before 2026-03-12)

The workflow was refactored to insert a separate "PO Entry" function at level 4 (to separate purchasing data entry from financial approval authority):

```
Level 1 = Viewer
Level 2 = General User
Level 3 = Supervisor           → approves submitted → supervisor_approved
Level 4 = PO Entry             → no approve; issues PO number after DOS approval
Level 5 = Director of Finance  → approves supervisor_approved → finance_director_approved  ← NEW SLOT
Level 6 = Director of Schools  → approves finance_director_approved → dos_approved  ← SHIFTED +1
```

`PermissionLevel` type expanded to `1 | 2 | 3 | 4 | 5 | 6`.

**What the seed did:** The seed upserts by `{ module_level: { module, level } }`. It:
- **Renamed** the level-4 record's `name` to `"PO Entry"` (was previously something like "Finance Director" or the legacy label).
- **Created** level-5 `"Director of Finance"` and level-6 `"Director of Schools"`.

**What the seed did NOT do:** It did not touch existing `UserPermission` rows. Any user whose `userPermission.permissionId` pointed to the level-4 Permission record continued to have `permLevel = 4` — now labeled "PO Entry" — and lost Finance Director approval rights.

### Gap: Missing Data Migration

No migration script re-assigned existing Finance Director users from the old level-4 permission to the new level-5 permission. This is the **root cause** of the reported issue.

---

## 5. Mismatch Summary Table

| Layer | Expected | Actual (affected user) | Result |
|-------|----------|------------------------|--------|
| DB `Permission.level` for "Director of Finance" | 5 | 5 (correct after re-seed) | ✅ |
| **User's `UserPermission` level** | **5** | **4** (old link not updated) | ❌ |
| `STATUS_APPROVAL_REQUIREMENTS['supervisor_approved'].requiredLevel` | 5 | 5 | ✅ |
| Backend service check: `permLevel >= 5` | true | `4 >= 5 = false` | ❌ 403 |
| Frontend: `canApprove = permLevel >= 5` | true | `4 >= 5 = false` | ❌ hidden |
| List tab filter `STATUS_FOR_LEVEL[4]` | `supervisor_approved` | `dos_approved` | ❌ wrong tab |

---

## 6. Additional Defects

### 6.1 Dead code: `APPROVAL_TRANSITIONS` constant

Defined in `purchaseOrder.service.ts` but **never referenced**. The actual approval logic uses `STATUS_APPROVAL_REQUIREMENTS`. The dead constant misleads readers about which mapping is authoritative.

```ts
// DEAD — remove entirely
const APPROVAL_TRANSITIONS: Record<number, { from: POStatus; to: POStatus }> = {
  3: { from: 'submitted',                 to: 'supervisor_approved' },
  5: { from: 'supervisor_approved',       to: 'finance_director_approved' },
  6: { from: 'finance_director_approved', to: 'dos_approved' },
};
```

### 6.2 Legacy permission levels 7, 8, 9 — security risk

The DB still contains:
- Level 7: `"Supervisor"` — duplicates the name of level 3
- Level 8: `"Athletic Director"` — maps to no workflow action
- Level 9: `"General User"` — duplicates the name of level 2

These appear in the **Edit Permissions dropdown** via `GET /api/users/permissions`. An admin can accidentally select:
- `"General User" (level 9)` instead of `"General User" (level 2)` → gives the user `permLevel = 9`, which passes ALL permission checks (`9 >= 6 >= 5 >= 3 >= 2 >= 1`). A regular employee gets full Director of Schools approval rights. **This is a critical privilege escalation risk.**
- `"Supervisor" (level 7)` instead of `"Supervisor" (level 3)` → gives `permLevel = 7`; user can approve at all stages including Finance Director and DOS.

### 6.3 UX: Permission loading flash

`useRequisitionsPermLevel` returns `permLevel: 0` while `isLoading: true`. During that window (first navigation, no cache), `canActAtStage = false` and the "Awaiting Finance Director Approval" info banner flashes visible for a fraction of a second before the button appears. This is not a functional bug but can confuse users into thinking they lack access.

### 6.4 Stale repo memory

`/memories/repo/sprint-c2-po-backend.md` documents: _"Workflow logic uses level numbers (3=supervisor, 4=purchasing, 5=DOS)"_. This is **incorrect for the current codebase** (4=PO Entry, 5=Finance Director, 6=DOS) and will mislead future agents and developers.

---

## 7. Proposed Fixes

### Fix 1 — Data Migration: Re-assign Finance Director Users (REQUIRED)

Run a one-time script to find all users with REQUISITIONS level 4 who should be Finance Director level 5, and update their `UserPermission` to point to the level-5 permission record.

**File:** `backend/scripts/migrate-finance-director-level.ts` (new file)

```ts
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Find the old level-4 and new level-5 REQUISITIONS permission records
  const level4Perm = await prisma.permission.findUnique({
    where: { module_level: { module: 'REQUISITIONS', level: 4 } },
  });
  const level5Perm = await prisma.permission.findUnique({
    where: { module_level: { module: 'REQUISITIONS', level: 5 } },
  });

  if (!level4Perm || !level5Perm) {
    console.error('Could not find level 4 or level 5 REQUISITIONS permission records.');
    process.exit(1);
  }

  console.log(`Level 4: "${level4Perm.name}" (id: ${level4Perm.id})`);
  console.log(`Level 5: "${level5Perm.name}" (id: ${level5Perm.id})`);

  // Find users currently assigned to level 4 REQUISITIONS
  const affected = await prisma.userPermission.findMany({
    where: { permissionId: level4Perm.id },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });

  console.log(`\nFound ${affected.length} user(s) with REQUISITIONS level 4:`);
  affected.forEach((up) => {
    console.log(`  - ${up.user.email} (${up.user.firstName} ${up.user.lastName})`);
  });

  if (affected.length === 0) {
    console.log('No migration needed.');
    return;
  }

  // IMPORTANT: Review the list above before proceeding.
  // Not all level-4 users should be promoted — PO Entry staff should remain at level 4.
  // This script is a diagnostic tool; manual review + targeted upsert is recommended.
  //
  // To promote a specific user (replace USER_ID):
  //
  // await prisma.userPermission.updateMany({
  //   where: { userId: 'USER_ID', permissionId: level4Perm.id },
  //   data:  { permissionId: level5Perm.id },
  // });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

> **Manual review is required.** Level-4 users include both PO Entry staff (should stay at 4) and any Finance Director users incorrectly left at the old level (should be promoted to 5). Admin must decide per-user which group each person belongs to.

### Fix 2 — Remove/Deactivate Legacy Permission Levels 7–9 (REQUIRED — Security)

**File:** `backend/prisma/seed.ts` — extend the existing permissions upsert loop to deactivate orphaned legacy levels.

```ts
// Add after the allPermissions upsert loop — deactivate legacy REQUISITIONS levels 7-9
console.log('Deactivating legacy REQUISITIONS permission levels 7, 8, 9...');
const deactivatedCount = await prisma.permission.updateMany({
  where: {
    module: 'REQUISITIONS',
    level: { in: [7, 8, 9] },
  },
  data: { isActive: false },
});
console.log(`✅ Deactivated ${deactivatedCount.count} legacy REQUISITIONS permission(s)`);
```

The `getAvailablePermissions()` service already filters `{ where: { isActive: true } }`, so once deactivated these records will no longer appear in the Edit Permissions dropdown.

Alternatively, add the deactivation SQL to a Prisma migration for an automated fix at deploy time.

### Fix 3 — Remove Dead `APPROVAL_TRANSITIONS` Code (LOW PRIORITY)

**File:** `backend/src/services/purchaseOrder.service.ts`

Delete lines 31–40 (the `APPROVAL_TRANSITIONS` constant). It is never referenced and its presence implies it is part of the approval logic when it is not.

```diff
- const APPROVAL_TRANSITIONS: Record<number, { from: POStatus; to: POStatus }> = {
-   3: { from: 'submitted',                 to: 'supervisor_approved' },
-   5: { from: 'supervisor_approved',       to: 'finance_director_approved' },
-   6: { from: 'finance_director_approved', to: 'dos_approved' },
-   // Level 4 (PO Entry / Purchasing) does NOT advance via /approve—they only issue via /issue
- };
```

### Fix 4 — Prevent UX Loading Flash (LOW PRIORITY)

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

Render the action panel with a loading skeleton while `useRequisitionsPermLevel` resolves, instead of defaulting to `permLevel = 0` which shows the wrong banner state:

```tsx
const { permLevel, isLoading: permLoading } = useRequisitionsPermLevel();
// ...
{permLoading ? (
  <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
) : (
  <>
    {!canActAtStage && waitingLabel && po.status !== 'denied' && (
      <Alert severity="info">{waitingLabel}</Alert>
    )}
    {canApprove && (
      <Button variant="contained" color="success" ...>
        {approveLabel}
      </Button>
    )}
  </>
)}
```

### Fix 5 — Update Repo Memory (REQUIRED)

**File:** `/memories/repo/sprint-c2-po-backend.md`

Replace the stale line:
```diff
- - Workflow logic uses level numbers (3=supervisor, 4=purchasing, 5=DOS) regardless of names.
+ - Workflow logic uses level numbers (3=supervisor, 5=finance_director, 6=DOS) regardless of names.
+ - Level 4 (PO Entry) does NOT have an /approve transition — they use /issue after DOS approval.
```

---

## 8. Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `backend/scripts/migrate-finance-director-level.ts` | Create: diagnostic + migration script | 🔴 Required |
| `backend/prisma/seed.ts` | Add deactivation of levels 7–9 | 🔴 Required (security) |
| `backend/src/services/purchaseOrder.service.ts` | Remove dead `APPROVAL_TRANSITIONS` constant | 🟡 Low |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Skeleton during permission load | 🟡 Low |
| `/memories/repo/sprint-c2-po-backend.md` | Correct stale level mapping | 🟡 Low |

---

## 9. Verification Steps

After applying fixes:

1. **Confirm DB cleanup:**
   ```sql
   SELECT level, name, "isActive" FROM permissions WHERE module = 'REQUISITIONS' ORDER BY level;
   ```
   Expected: levels 1–6 active, 7–9 inactive.

2. **Confirm rdevices level:**
   ```sql
   SELECT p.level, p.name
   FROM user_permissions up
   JOIN permissions p ON up."permissionId" = p.id
   JOIN users u ON up."userId" = u.id
   WHERE u.email = 'rdevices@ocboe.com' AND p.module = 'REQUISITIONS';
   ```
   Expected: `level = 5, name = 'Director of Finance'`.

3. **End-to-end test:**
   - Log in as `rdevices@ocboe.com`
   - Navigate to a PO in `supervisor_approved` status
   - Verify "Approve as Finance Director" button appears (NOT the "Awaiting Finance Director Approval" banner)
   - Click approve → PO transitions to `finance_director_approved` ✅

4. **Security test:**
   - Open User Management → Edit Permissions for any user
   - Verify REQUISITIONS dropdown shows only levels 1–6 (no level 7, 8, 9)

---

## 10. Security Considerations

| Concern | Severity | Mitigation |
|---------|----------|------------|
| Legacy levels 7–9 allow accidental privilege escalation (level-9 "General User" gets full DOS rights) | 🔴 HIGH | Fix 2: deactivate levels 7–9 |
| Finance Director (level 5) can call `/account` and `/issue` endpoints (≥ level 4) | 🟡 MEDIUM | Acceptable by design (FD oversees PO lifecycle); document explicitly |
| Service-level check `permLevel >= requiredLevel` allows higher-level users to approve lower stages | 🟢 LOW | Intended — admins (level 6) can approve at any stage |
| CSRF is correctly implemented: `exposedHeaders: ['X-CSRF-Token']` in CORS config and in-memory cache pattern | ✅ CORRECT | No action needed |
