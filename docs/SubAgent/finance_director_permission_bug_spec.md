# Finance Director Permission Bug — Security Specification

> **Classification:** Critical Security Bug  
> **Status:** Open — Awaiting Fix  
> **Reported:** 2026-03-24  
> **Module:** REQUISITIONS — Purchase Order Approval Workflow  
> **Severity:** High — Privilege Escalation / Broken Access Control

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Context](#2-system-context)
3. [Bug Description](#3-bug-description)
4. [Root Causes (Detailed)](#4-root-causes-detailed)
5. [Evidence & Affected File Index](#5-evidence--affected-file-index)
6. [Expected vs Actual Behavior](#6-expected-vs-actual-behavior)
7. [Security Implications](#7-security-implications)
8. [Proposed Fixes](#8-proposed-fixes)
9. [Testing Plan](#9-testing-plan)
10. [Documentation Inconsistencies Found](#10-documentation-inconsistencies-found)

---

## 1. Executive Summary

The System Administrator role (mapped from Entra group `ENTRA_ADMIN_GROUP_ID`) — and any other user with `role = 'ADMIN'` (Technology Director, Director of Schools) — can perform the **"Approve as Finance Director"** purchase order approval action. This capability should be **exclusively available to members of the Finance Director Entra group** (`ENTRA_FINANCE_DIRECTOR_GROUP_ID`).

This is a **multi-layer privilege escalation bug**. The vulnerability exists independently on both the **backend** (`permissions.ts` middleware + `purchaseOrder.service.ts`) and the **frontend** (`useRequisitionsPermLevel.ts` hook + `PurchaseOrderDetail.tsx`). Any admin user can advance a PO from `supervisor_approved` → `finance_director_approved` without belonging to the Finance Director group.

The root cause is an **over-broad ADMIN bypass** in the permission middleware that grants `permLevel = 6` to all ADMIN users, combined with the Finance Director approval requiring only `permLevel >= 5`. Additionally, the System Admin group's Entra sync explicitly assigns `REQUISITIONS: level 6` in the database, compounding the issue even if the bypass were removed.

---

## 2. System Context

### Workflow Stages

```
draft → submitted → supervisor_approved → finance_director_approved → dos_approved → po_issued
                    ↑ Level ≥ 3           ↑ Level ≥ 5                ↑ Level ≥ 6
                    (Supervisor)          (Finance Director)          (Director of Schools)
```

### Permission Levels for REQUISITIONS Module

| Level | Role | Group |
|-------|------|-------|
| 2 | General Staff | All Staff |
| 3 | Supervisor | Principals, VPs, Directors |
| 4 | PO Entry | Finance PO Entry Staff |
| **5** | **Finance Director** | **`ENTRA_FINANCE_DIRECTOR_GROUP_ID`** |
| 6 | Director of Schools | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` |

The **Finance Director approval action** requires `permLevel >= 5`. Only users explicitly in the Finance Director Entra group should have this level. However, the ADMIN role bypass sets `permLevel = 6` for all admins, which also satisfies `>= 5`.

---

## 3. Bug Description

### What Happens

1. A System Administrator (member of `ENTRA_ADMIN_GROUP_ID`) views a PO in `supervisor_approved` status.
2. The frontend renders the **"Approve as Finance Director"** button because `permLevel = 6 >= 5`.
3. The administrator submits the approval.
4. The backend advances the PO to `finance_director_approved`.
5. No Finance Director group membership was ever verified at any layer.

### What Should Happen

- Only users in `ENTRA_FINANCE_DIRECTOR_GROUP_ID` (REQUISITIONS level 5) should see and be able to use the FD approval action.
- System Administrators, Technology Directors, and Director of Schools members must **not** be able to approve at the Finance Director stage unless they are **also** members of the Finance Director group.

---

## 4. Root Causes (Detailed)

### ROOT CAUSE 1 — Backend: ADMIN Bypass Sets `permLevel = 6` Unconditionally

**File:** `backend/src/middleware/permissions.ts`  
**Lines:** 56–64

```typescript
// ADMIN role has access to everything
if (userRole === 'ADMIN') {
  logger.debug('Admin access granted', {
    userId,
    module,
    requiredLevel,
  });
  req.user!.permLevel = 6;   // ← BUG: sets level 6 for ALL ADMIN users
  return next();
}
```

**Problem:** When any user with `role = 'ADMIN'` hits a route protected by `checkPermission`, the middleware:
1. Skips the database `UserPermission` lookup entirely.
2. Hard-codes `req.user.permLevel = 6`.
3. Calls `next()`.

The value `6` satisfies every `permLevel >= N` check for N ≤ 6, including the Finance Director check (`>= 5`). This affects **all three ADMIN-role groups**: System Admin, Technology Director, and Director of Schools.

**Contributing factor:** The `checkPermission` middleware is used for the `/:id/approve` route (`purchaseOrder.routes.ts` line ~127) with `checkPermission('REQUISITIONS', 3)`. This minimum level of 3 lets even supervisor-level users reach the controller, while the service differentiates by permLevel. The middleware's ADMIN bypass injects level 6, giving admins the authority of Finance Director and Director of Schools simultaneously.

---

### ROOT CAUSE 2 — Backend: `approvePurchaseOrder` Has No Group Membership Check

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Lines:** ~760–795 (the `approvePurchaseOrder` method)

```typescript
async approvePurchaseOrder(
  id: string,
  userId: string,
  permLevel: number,  // ← receives level 6 from ADMIN bypass; no groups param
  approveData?: ApproveDto,
) {
  // ...
  const stageReq = approvalRequirements[po.status as POStatus];
  // For supervisor_approved → finance_director_approved, requiredLevel = 5
  if (permLevel < stageReq.requiredLevel) {  // ← 6 < 5 = false → passes!
    throw new AuthorizationError(...);
  }
  // No Finance Director group membership check here
```

**Problem:** The service only checks `permLevel >= requiredLevel`. It does **not** verify that the approver is a member of the Finance Director Entra group. Since `permLevel = 6 >= 5`, admins pass this gate unchallenged.

The supervisor stage (lines ~790–803) has a location-based owner check:
```typescript
if (po.status === 'submitted' && po.officeLocationId) {
  const locSup = await this.prisma.locationSupervisor.findFirst({...});
  if (locSup && locSup.userId !== userId) {
    throw new AuthorizationError('Only the assigned supervisor...');
  }
}
```

But there is **no analogous check** for the Finance Director stage. The `req.user.groups` array (present in the JWT/`AuthRequest`) is never passed to or consulted by the service for the FD transition.

---

### ROOT CAUSE 3 — Frontend: `useRequisitionsPermLevel` Hook Hard-codes Level 6 for Admins

**File:** `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`  
**Lines:** 28–38

```typescript
const isAdmin = !!(user?.roles?.includes('ADMIN'));

// Skip network call for admins (they always have level 6)
const { data: userDetail, isLoading } = useQuery({
  queryKey: ['users', 'me'],
  queryFn: () => userService.getMe(),
  enabled: !!user?.id && !isAdmin,  // ← DB query skipped for admins
  staleTime: 0,
});

if (!user) return { permLevel: 0, isLoading: false, isAdmin: false };
if (isAdmin) return { permLevel: 6, isLoading: false, isAdmin: true };  // ← always 6
```

**Problem:** The hook explicitly returns `permLevel: 6` for any `ADMIN` user without ever querying the database. The comment says "Skip network call for admins (they always have level 6)" — but this assumption is incorrect. It conflates "admins have broad system access" with "admins have Finance Director authority." The result is that the UI shows the Finance Director approval button to all admins.

---

### ROOT CAUSE 4 — Frontend: `canApprove` in Detail Page Uses Only `permLevel` Threshold

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`  
**Lines:** ~143–171

```typescript
const STATUS_MIN_LEVEL: Partial<Record<POStatus, number>> = {
  'submitted':                 3,
  'supervisor_approved':       5,   // ← Finance Director threshold
  'finance_director_approved': 6,
};

const stageMinLevel = STATUS_MIN_LEVEL[po.status as POStatus] ?? Infinity;
const canActAtStage = permLevel >= stageMinLevel;   // 6 >= 5 → true for admins

// For supervisor stage: checks specific supervisor assignment.
// For Finance Director stage: NO group check — falls through to canActAtStage
const canApprove  = po.status === 'submitted' && assignedSupervisorId
  ? user?.id === assignedSupervisorId
  : canActAtStage;   // ← for supervisor_approved status, this is always canActAtStage
```

**Problem:** The ternary condition is:
- `(po.status === 'submitted' && assignedSupervisorId)` → `true`: check specific supervisor
- `else` → `canActAtStage`

When the PO is at `supervisor_approved` (the Finance Director stage), `po.status === 'submitted'` is **false**, so it evaluates to `canActAtStage = permLevel >= 5`. For admin users with `permLevel = 6`, `canApprove = true`. There is no check for Finance Director group membership; the condition is identical to what a legitimate Finance Director user would see.

The `approveLabel` variable is also derived purely from PO status:
```typescript
const APPROVE_ACTION_LABEL: Partial<Record<POStatus, string>> = {
  'submitted':                 'Approve as Supervisor',
  'supervisor_approved':       'Approve as Finance Director',  // ← label shown to admin
  'finance_director_approved': 'Approve as Director of Schools',
};
```

---

### ROOT CAUSE 5 — Data: System Admin Entra Group Mapped to REQUISITIONS Level 6

**File:** `backend/src/services/userSync.service.ts`  
**Lines:** ~152–158

```typescript
// System Admin - Full access to everything
addMapping('ENTRA_ADMIN_GROUP_ID', process.env.ENTRA_ADMIN_GROUP_ID, {
  role: 'ADMIN',
  permissions: [
    { module: 'TECHNOLOGY', level: 3 },
    { module: 'MAINTENANCE', level: 3 },
    { module: 'REQUISITIONS', level: 6 },   // ← triggers DB-level bypass too
  ],
});
```

**Problem:** Even if the `checkPermission` ADMIN bypass were removed and DB permissions were queried normally, System Admin users would still have `REQUISITIONS: level 6` in `user_permissions`, which satisfies the Finance Director check (`>= 5`). This is a defense-in-depth failure — the data layer independently introduces the same vulnerability.

There is no legitimate reason for System Administrators to perform Finance Director or Director of Schools approval actions. Their application management role (managing users, settings, syncing) requires `ADMIN` role for admin routes, not elevated REQUISITIONS workflow authority.

**Note:** The Director of Schools group is also mapped to `REQUISITIONS: level 6` and `role: ADMIN`. This means Director of Schools users are also affected by this bug. However, whether the Director of Schools should be able to approve at the Finance Director stage (skipping it) is a business decision — the bug report specifically calls out "System Administrator." The Director of Schools legitimately needs REQUISITIONS level 6 for the DOS approval stage, but arguably should NOT skip the Finance Director stage.

---

## 5. Evidence & Affected File Index

| # | File | Lines | Issue |
|---|------|-------|-------|
| 1 | `backend/src/middleware/permissions.ts` | 56–64 | ADMIN bypass sets `permLevel = 6` unconditionally |
| 2 | `backend/src/services/purchaseOrder.service.ts` | ~760–803 | `approvePurchaseOrder` lacks group membership check for FD stage |
| 3 | `backend/src/routes/purchaseOrder.routes.ts` | 127 | `/approve` route uses `checkPermission('REQUISITIONS', 3)` — minimum level only |
| 4 | `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | 28–38 | Hardcodes `permLevel: 6` for all ADMIN users; skips DB query |
| 5 | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | 143–171 | `canApprove` uses only `permLevel >= 5`; no group check |
| 6 | `backend/src/services/userSync.service.ts` | 152–158 | System Admin group mapped to `REQUISITIONS: level 6` |
| 7 | `backend/src/services/userSync.service.ts` | 160–167 | Director of Schools group mapped to `REQUISITIONS: level 6` + `role: ADMIN` |
| 8 | `docs/permission.md` | ~100-105 | Documents `permLevel = 5` for ADMIN bypass; actual code uses `6` |
| 9 | `docs/permission.md` | permission matrix row | Shows System Admin REQUISITIONS level as 5; actual is 6 |

---

## 6. Expected vs Actual Behavior

| User Type | Entra Group | Expected | Actual |
|-----------|-------------|----------|--------|
| Finance Director | `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | Sees + can submit "Approve as Finance Director" button | ✅ Correct |
| System Administrator | `ENTRA_ADMIN_GROUP_ID` | Does NOT see FD button | ❌ Sees and can use "Approve as Finance Director" |
| Technology Director | `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` | Does NOT see FD button | ❌ Sees and can use "Approve as Finance Director" |
| Director of Schools | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | Should only see DOS stage button | ❌ Can also skip to FD approval on supervisor_approved POs |
| Supervisor (level 3) | Various | Sees Supervisor Approve only | ✅ Correct |
| General Staff (level 2) | All Staff | No approval buttons | ✅ Correct |

### Backend API Behavior

A `POST /api/purchase-orders/:id/approve` request from an ADMIN user on a `supervisor_approved` PO:
- **Expected:** `403 Forbidden` — "This approval stage requires Finance Director group membership"
- **Actual:** `200 OK` — PO advances to `finance_director_approved`

---

## 7. Security Implications

### OWASP Top 10 Classification

- **A01:2021 — Broken Access Control:** A user can exercise functionality outside their intended permissions. System Admins can bypass the Finance Director approval step of the financial workflow without possessing the delegated financial authority.

### Business Impact

1. **Financial controls bypass:** The Finance Director approval step exists as a fiscal control checkpoint — ensuring that a qualified financial authority reviews and approves expenditures. A System Admin approving as Finance Director bypasses this control, potentially allowing POs to advance without proper financial review.

2. **Audit trail corruption:** The `requisitionStatusHistory` table will record the System Admin's user ID as having performed a "Finance Director Approved" transition, creating false records.

3. **Segregation of Duties violation:** Financial approval and IT system administration are meant to be separate roles. The bug allows a single person with admin access to also act as a financial approver.

4. **Cascading vulnerability:** The notification system sends emails to Finance Director permission holders when supervisor approval occurs (`purchaseOrder.controller.ts` line ~185). If an admin performs this step, Finance Directors are bypassed in the email chain too — they may never know a PO was advanced without their review.

### Affected Users (Role Scope)

All users whose JWT `roles[0]` = `'ADMIN'`. This includes members of:
- `ENTRA_ADMIN_GROUP_ID` (System Administrators)
- `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` (Technology Director)
- `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` (Director of Schools)

The Technology Director group is particularly notable: their Entra sync grants only `REQUISITIONS: 3` (supervisor level), but the ADMIN bypass overrides this with `permLevel = 6`.

---

## 8. Proposed Fixes

### Fix 1 — Critical Priority: Remove ADMIN Bypass `permLevel` Hardcoding

**File:** `backend/src/middleware/permissions.ts`  
**Lines:** 56–64

**Current code:**
```typescript
if (userRole === 'ADMIN') {
  logger.debug('Admin access granted', { userId, module, requiredLevel });
  req.user!.permLevel = 6;
  return next();
}
```

**Proposed change:**
```typescript
if (userRole === 'ADMIN') {
  logger.debug('Admin access granted', { userId, module, requiredLevel });
  // Do NOT short-circuit permLevel — still query DB so workflow logic
  // (e.g. Finance Director / DOS approval gates) uses real permission levels.
  // Fall through to the DB permission query below.
}
```

And after the DB query block, update the existing logic so ADMIN users that have no DB records still get a sensible default. The bypass ensures they pass the minimum-level gate for route access, but `req.user.permLevel` should reflect their actual DB permission level.

**Alternative (simpler) approach:** Instead of falling through to DB query, set a safe default level for the module:
```typescript
if (userRole === 'ADMIN') {
  // Grant admission to the route, but set permLevel from DB so workflow 
  // approval gates are respected
  const userPermissions = await prisma.userPermission.findMany({
    where: { userId },
    include: { permission: true },
  });
  const now = new Date();
  const activeModulePerms = userPermissions.filter(
    (up) => up.permission.module === module && (!up.expiresAt || up.expiresAt >= now)
  );
  const highest = activeModulePerms.reduce((max, up) => Math.max(max, up.permission.level), 0);
  req.user!.permLevel = highest;
  logger.debug('Admin access granted (DB-derived permLevel)', { userId, module, permLevel: highest });
  return next();
}
```

**Impact:** Admins still bypass the "do you have access to this route" gate (they always call `next()`), but their `permLevel` now reflects actual DB grants. Combined with Fix 3 below (correcting the DB grants), System Admins would get `permLevel = 3` for REQUISITIONS, which correctly gates them from Finance Director actions.

---

### Fix 2 — Critical Priority: Correct System Admin REQUISITIONS Level in Entra Sync

**File:** `backend/src/services/userSync.service.ts`  
**Lines:** 152–158

**Current code:**
```typescript
addMapping('ENTRA_ADMIN_GROUP_ID', process.env.ENTRA_ADMIN_GROUP_ID, {
  role: 'ADMIN',
  permissions: [
    { module: 'TECHNOLOGY', level: 3 },
    { module: 'MAINTENANCE', level: 3 },
    { module: 'REQUISITIONS', level: 6 },  // ← change this
  ],
});
```

**Proposed change:**
```typescript
addMapping('ENTRA_ADMIN_GROUP_ID', process.env.ENTRA_ADMIN_GROUP_ID, {
  role: 'ADMIN',
  permissions: [
    { module: 'TECHNOLOGY', level: 3 },
    { module: 'MAINTENANCE', level: 3 },
    { module: 'REQUISITIONS', level: 3 },  // Admins can view all + approve at supervisor stage; no financial authority
  ],
});
```

**Rationale:** System Administrators need to see all POs (`level >= 1`) and potentially approve at the supervisor stage if assigned as a primary supervisor (`level >= 3`). They do **not** need financial approval authority (`level 5`) or Director of Schools authority (`level 6`). Those authorities are explicitly granted via the Finance Director and Director of Schools Entra groups.

**Note on Director of Schools group:** The Director of Schools group has `role: 'ADMIN'` AND `REQUISITIONS: level 6`. With Fix 1 in place, DOS users would get `permLevel = 6` from the DB (legitimate). However, this also means DOS users could approve at the Finance Director stage (level >= 5). **Business decision required:** Should the Director of Schools be able to skip the Finance Director stage? If not, the approval service (Fix 4) should enforce explicit group membership.

---

### Fix 3 — Critical Priority: Remove ADMIN Shortcut in Frontend Hook

**File:** `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`  
**Lines:** 28–38

**Current code:**
```typescript
const { data: userDetail, isLoading } = useQuery({
  queryKey: ['users', 'me'],
  queryFn: () => userService.getMe(),
  enabled: !!user?.id && !isAdmin,  // ← skip DB for admins
  staleTime: 0,
});

if (!user) return { permLevel: 0, isLoading: false, isAdmin: false };
if (isAdmin) return { permLevel: 6, isLoading: false, isAdmin: true };  // ← always 6
```

**Proposed change:**
```typescript
const { data: userDetail, isLoading } = useQuery({
  queryKey: ['users', 'me'],
  queryFn: () => userService.getMe(),
  enabled: !!user?.id,  // Always query DB — even for admins
  staleTime: 0,
});

if (!user) return { permLevel: 0, isLoading: false, isAdmin: false };
// Do NOT short-circuit for isAdmin — let DB permissions determine level

if (isLoading) return { permLevel: 0, isLoading: true, isAdmin };
```

**Rationale:** The frontend should reflect actual database permissions, not assume all admins have level 6. After Fix 2, System Admin users will have `REQUISITIONS: 3` in the DB, so this hook will correctly return `permLevel = 3` for them. Finance Directors (non-admin) will correctly return `permLevel = 5`.

---

### Fix 4 — Defense-in-Depth: Add Group Membership Check in `approvePurchaseOrder`

**File:** `backend/src/services/purchaseOrder.service.ts`  
**File:** `backend/src/controllers/purchaseOrder.controller.ts`

This fix adds a second server-side gate specifically for the Finance Director and Director of Schools stages. Even if the permLevel check somehow passes (e.g. due to a manual DB override), group membership is a hard requirement.

**Controller change** — pass `groups` to the service:
```typescript
export const approvePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data    = ApproveSchema.parse(req.body);
    const userId  = req.user!.id;
    const permLvl = req.user!.permLevel ?? 1;
    const groups  = req.user!.groups ?? [];  // ← add this

    const po = await service.approvePurchaseOrder(
      req.params.id as string,
      userId,
      permLvl,
      groups,  // ← pass groups
      data,
    );
```

**Service change** — add group checks at sensitive stages:
```typescript
async approvePurchaseOrder(
  id: string,
  userId: string,
  permLevel: number,
  userGroups: string[],  // ← add parameter
  approveData?: ApproveDto,
) {
  // ... (existing PO fetch and stageReq lookup) ...

  if (permLevel < stageReq.requiredLevel) {
    throw new AuthorizationError(`Requires permission level ${stageReq.requiredLevel}`);
  }

  // Finance Director stage — require explicit group membership
  if (po.status === 'supervisor_approved') {
    const financeDirectorGroupId = process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID;
    const dosGroupId             = process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID;
    const isFinanceDirector      = financeDirectorGroupId && userGroups.includes(financeDirectorGroupId);
    const isDosApprover          = dosGroupId && userGroups.includes(dosGroupId);
    if (!isFinanceDirector && !isDosApprover) {
      throw new AuthorizationError(
        'Finance Director approval requires membership in the Finance Director group'
      );
    }
  }

  // Director of Schools stage — require explicit group membership
  if (po.status === 'finance_director_approved') {
    const dosGroupId    = process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID;
    const isDosApprover = dosGroupId && userGroups.includes(dosGroupId);
    if (!isDosApprover) {
      throw new AuthorizationError(
        'Director of Schools approval requires membership in the Director of Schools group'
      );
    }
  }
```

**Rationale:** This provides defense-in-depth. Even if Fixes 1–3 are ever regressed, the service layer will independently enforce group-level authorization for sensitive approval transitions.

---

### Fix 5 — Low Priority: Update `permission.md` Documentation

**File:** `docs/permission.md`

**Issues to correct:**
1. "ADMIN bypass — req.user.permLevel = 5" → should be corrected/removed after Fix 1
2. Permission matrix row for System Admin should show REQUISITIONS: 3 (after Fix 2)
3. The role system documented as 4-role (`ADMIN/MANAGER/TECHNICIAN/VIEWER`) when the actual code uses 2-role (`ADMIN/USER`); this should be reconciled

---

## 9. Testing Plan

### Automated Tests to Write

1. **Backend unit test: `approvePurchaseOrder` with ADMIN permLevel**
   - Given a PO at `supervisor_approved` status
   - When `approvePurchaseOrder` is called with `permLevel = 6` and `groups = []` (no FD group)
   - Then expect `AuthorizationError: Finance Director approval requires group membership`

2. **Backend integration test: approve route with ADMIN JWT**
   - POST `/api/purchase-orders/:id/approve` with a JWT where `roles = ['ADMIN']` and `groups` does NOT include `ENTRA_FINANCE_DIRECTOR_GROUP_ID`
   - PO is at `supervisor_approved` status
   - Expect `403 Forbidden`

3. **Backend integration test: approve route with Finance Director JWT**
   - POST `/api/purchase-orders/:id/approve` with a JWT where `groups` includes `ENTRA_FINANCE_DIRECTOR_GROUP_ID`
   - PO is at `supervisor_approved` status
   - Expect `200 OK`

4. **Frontend unit test: `useRequisitionsPermLevel` for ADMIN user**
   - Mock user with `roles: ['ADMIN']`, mock DB returning REQUISITIONS level 3
   - Expect `permLevel = 3`, NOT `6`

### Manual Regression Tests

| Test | Steps | Expected |
|------|-------|----------|
| Admin cannot see FD button | Login as System Admin; navigate to a `supervisor_approved` PO | "Approve as Finance Director" button NOT rendered |
| Admin blocked at API | System Admin submits POST to approve on `supervisor_approved` PO | `403` response |
| Finance Director can approve | Login as Finance Director member; navigate to same PO | FD approval button shown and functional |
| DOS approves at DOS stage only | Login as Director of Schools; view `supervisor_approved` PO | FD button NOT shown (DOS stage button shown when PO is at `finance_director_approved`) |

---

## 10. Documentation Inconsistencies Found

| Location | Issue | Correct Value |
|----------|-------|---------------|
| `docs/permission.md` — Key Design Principles table | States "ADMIN bypass — `req.user.permLevel = 5`" | Actual code sets `permLevel = 6` (see `permissions.ts` line 62) |
| `docs/permission.md` — Entra ID Group → Role → Module Permission Matrix | System Admin row shows REQUISITIONS = 5 | Actual `userSync.service.ts` maps System Admin to REQUISITIONS level 6 |
| `docs/permission.md` — Role Catalogue | Lists 4 roles: ADMIN, MANAGER, TECHNICIAN, VIEWER | Actual `userSync.service.ts` type is `type UserRole = 'ADMIN' \| 'USER'`; the DB `users.role` default is `"USER"`, not `"VIEWER"` |
| `docs/permission.md` — ADMIN Bypass description | "always gets `permLevel = 5`" | Should be `permLevel = 6`, or after fix: DB-derived level |
| `docs/PERMISSIONS_AND_ROLES.md` — Overview table | States "ADMIN bypass — `req.user.permLevel = 5`" | Actual code: `permLevel = 6` |

---

## Appendix A — Call Flow Trace (Bug Path)

```
[Login]
  Auth callback → userSyncService.getRoleFromGroups([admin_group_id])
    → { role: 'ADMIN', permissions: [{REQUISITIONS, 6}] }
  → user.role = 'ADMIN' stored in DB + JWT
  → syncPermissionsForUser → user_permissions row: REQUISITIONS level 6

[Page Load — PurchaseOrderDetail]
  useRequisitionsPermLevel()
    isAdmin = true (JWT roles includes 'ADMIN')
    → SKIP DB query
    → return { permLevel: 6 }  ← BUG
  po.status === 'supervisor_approved'
  STATUS_MIN_LEVEL['supervisor_approved'] = 5
  canActAtStage = 6 >= 5 = true  ← BUG
  canApprove = (status === 'submitted' && ...) ? ... : canActAtStage
            = false ? ... : true  = true  ← BUG
  → "Approve as Finance Director" button RENDERED

[Approve Button Click]
  POST /api/purchase-orders/:id/approve
  
  authenticate middleware
    → decodes JWT → req.user = { roles: ['ADMIN'], groups: ['admin_group_id'], ... }
  
  checkPermission('REQUISITIONS', 3)
    userRole = req.user.roles[0] = 'ADMIN'
    → ADMIN bypass triggered
    → req.user.permLevel = 6  ← BUG
    → next()
  
  purchaseOrderController.approvePurchaseOrder
    permLvl = req.user.permLevel = 6
    → service.approvePurchaseOrder(id, userId, 6, data)
  
  purchaseOrderService.approvePurchaseOrder
    po.status = 'supervisor_approved'
    stageReq = { to: 'finance_director_approved', requiredLevel: 5 }
    permLevel (6) < requiredLevel (5) = false → NO error thrown  ← BUG
    → po updated to 'finance_director_approved'  ← BREACH
```

---

## Appendix B — Fix Priority Summary

| Fix | Priority | Effort | Layer |
|-----|----------|--------|-------|
| Fix 1: Remove permLevel=6 hardcode in permissions.ts ADMIN bypass | **Critical** | Low | Backend middleware |
| Fix 2: Change System Admin REQUISITIONS level from 6 → 3 in userSync.service.ts | **Critical** | Low | Backend data sync |
| Fix 3: Remove `isAdmin` shortcut in useRequisitionsPermLevel.ts | **Critical** | Low | Frontend hook |
| Fix 4: Add group membership gate in approvePurchaseOrder service | **High** (defense-in-depth) | Medium | Backend service |
| Fix 5: Correct permission.md documentation | Low | Low | Documentation |

**Minimum viable fix:** Fixes 1 + 2 + 3 together close the vulnerability at all active layers.  
Fix 4 adds defense-in-depth and is strongly recommended to prevent regression.

---

*Spec created by Research Subagent — 2026-03-24*
