# Investigation: Director of Finance Role Not Working in Purchase Order System

**Date:** 2026-03-13  
**Status:** Root Cause Identified  
**Severity:** High — Director of Finance users cannot perform financial approval step in PO workflow

---

## 1. Executive Summary

The "Director of Finance" role is not working in the Purchase Order system due to an **environment variable name mismatch** between the `.env` configuration file and the `userSync.service.ts` code. This prevents the Entra ID group-to-permission mapping from being loaded at startup, meaning users in the Director of Finance Entra group never receive REQUISITIONS level 5 permissions. As a result, these users are treated as basic staff (REQUISITIONS level 2 via All Staff group) and cannot see or perform the Finance Director approval step.

---

## 2. Root Cause Analysis

### Primary Root Cause: Environment Variable Name Mismatch

| Location | Variable Name | Value |
|---|---|---|
| `.env` (line 65) | `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | `5f8623ed-0afd-476d-838a-5da1730b3698` |
| `userSync.service.ts` (line 136) | `process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` | `undefined` (not found) |

The code expects `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` but the `.env` file defines `ENTRA_FINANCE_DIRECTOR_GROUP_ID`.

Because `process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` evaluates to `undefined`, the `if` guard on line 136 of `userSync.service.ts` is falsy, so the Director of Finance group-to-role mapping is **never registered** in the `groupRoleMappings` Map.

### Impact Chain

1. **At startup:** `UserSyncService` constructor reads `process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` → `undefined` → mapping skipped
2. **At login:** `getRoleFromGroups()` iterates `priorityOrder` array → `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` is `undefined` → no match for this group
3. **Permission sync:** User falls through to `ENTRA_ALL_STAFF_GROUP_ID` match → gets role `USER` with REQUISITIONS level 2 (General User)
4. **At login permission sync:** `syncPermissionsForUser()` writes REQUISITIONS level 2 to database for this user
5. **Backend API:** `checkPermission('REQUISITIONS', 3)` on the `/approve` route blocks the user (level 2 < 3)
6. **Frontend:** `useRequisitionsPermLevel()` fetches user detail, finds level 2 → `permLevel = 2`
7. **UI:** "Pending My Approval" tab requires `minPermLevel: 3` → hidden. Approve/Reject buttons require `canActAtStage` where `stageMinLevel` for `supervisor_approved` is 5 → not shown.

---

## 3. System Architecture Review

### 3.1 Permission Model

- **Permission table:** `module` (REQUISITIONS) × `level` (1-6) with descriptive names
- **UserPermission table:** Links User ↔ Permission, tracks `grantedBy` (SYSTEM vs admin UUID)
- **No separate "Role" entity** for Director of Finance — it's a permission *level* (REQUISITIONS level 5), not a user `role` field value
- User `role` field is binary: `ADMIN` or `USER` (the Director of Finance gets role = `USER`)

### 3.2 REQUISITIONS Permission Levels (from seed.ts)

| Level | Name | Description |
|---|---|---|
| 1 | Viewer | View own purchase orders only |
| 2 | General User | Create and manage own purchase orders |
| 3 | Supervisor | Approve/reject submitted POs |
| 4 | PO Entry | Assign account codes + issue final PO numbers |
| 5 | **Director of Finance** | Financial approval: supervisor_approved → finance_director_approved |
| 6 | Director of Schools | Final director approval: finance_director_approved → dos_approved |

### 3.3 PO Workflow

```
draft → submitted → supervisor_approved → finance_director_approved → dos_approved → po_issued
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          This step requires REQUISITIONS level 5
                                          (Director of Finance)
```

### 3.4 How Permissions Flow

1. **Login (auth.controller.ts):** User authenticates via Entra ID → groups fetched from MS Graph → `getRoleFromGroups(groupIds)` called → returns `RoleMapping` with `role` and `permissions[]`
2. **Sync (syncPermissionsForUser):** Permission mappings written to `user_permissions` table with `grantedBy = 'SYSTEM'`
3. **Backend middleware (permissions.ts):** `checkPermission('REQUISITIONS', N)` queries `user_permissions` → finds matching module/level → sets `req.user.permLevel` to highest level
4. **Frontend (useRequisitionsPermLevel):** Fetches full user detail via `GET /api/users/:id` → extracts REQUISITIONS permissions → returns highest level as `permLevel`
5. **UI gating:** Components use `permLevel` to show/hide tabs, buttons, and actions

---

## 4. Detailed File Analysis

### 4.1 Backend — `userSync.service.ts` (lines 135-143)

```typescript
// Director of Finance - Financial approval (dos_approved stage)
if (process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID) {  // ← reads undefined!
  this.groupRoleMappings.set(process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID, {
    role: 'USER',
    permissions: [
      { module: 'TECHNOLOGY', level: 2 },
      { module: 'MAINTENANCE', level: 2 },
      { module: 'REQUISITIONS', level: 5 },    // Director of Finance
    ],
  });
}
```

Also referenced in `priorityOrder` array (line 311):
```typescript
process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID,  // ← also undefined
```

### 4.2 `.env` File (line 65)

```env
ENTRA_FINANCE_DIRECTOR_GROUP_ID=5f8623ed-0afd-476d-838a-5da1730b3698
```

### 4.3 `.env.example` — Does NOT include ANY Entra group IDs beyond `ENTRA_ADMIN_GROUP_ID`

The .env.example file only has `ENTRA_ADMIN_GROUP_ID`, so the naming convention discrepancy was never caught during documentation review.

### 4.4 Backend — `purchaseOrder.service.ts` (lines 39-42)

The PO service correctly maps level 5 to the Finance Director approval:
```typescript
const STATUS_APPROVAL_REQUIREMENTS = {
  'submitted':                 { to: 'supervisor_approved',        requiredLevel: 3 },
  'supervisor_approved':       { to: 'finance_director_approved',  requiredLevel: 5 },  // ← correct
  'finance_director_approved': { to: 'dos_approved',               requiredLevel: 6 },
};
```

### 4.5 Frontend — `PurchaseOrderDetail.tsx` (lines 153-158)

```typescript
const STATUS_MIN_LEVEL: Partial<Record<POStatus, number>> = {
  'submitted':                 3,
  'supervisor_approved':       5,   // ← correctly requires level 5
  'finance_director_approved': 6,
};
```

### 4.6 Frontend — `PurchaseOrderList.tsx` (lines 93-99)

Pending Approval tab correctly maps level 5 to `supervisor_approved` status:
```typescript
const STATUS_FOR_LEVEL: Partial<Record<number, POStatus>> = {
  3: 'submitted',
  4: 'dos_approved',
  5: 'supervisor_approved',     // ← correct
  6: 'finance_director_approved',
};
```

---

## 5. What IS Working Correctly

- ✅ Prisma schema: No role-specific schema needed (permission-level based)
- ✅ Seed data: REQUISITIONS level 5 = "Director of Finance" correctly defined
- ✅ Backend routes: All PO routes use `checkPermission('REQUISITIONS', N)` correctly
- ✅ Backend service: `STATUS_APPROVAL_REQUIREMENTS` correctly maps level 5 to Finance Director step
- ✅ Backend permission middleware: Correctly queries `user_permissions` and sets `permLevel`
- ✅ Frontend hooks: `useRequisitionsPermLevel()` correctly finds highest REQUISITIONS level
- ✅ Frontend UI: All permission-level checks in PurchaseOrderList and PurchaseOrderDetail are correct
- ✅ Navigation: Purchase Orders nav item is NOT restricted to admin-only
- ✅ Routing: `/purchase-orders` routes use `<ProtectedRoute>` (not `requireAdmin`)
- ✅ `syncPermissionsForUser()`: Correctly writes SYSTEM permissions to database
- ✅ Frontend `roles.types.ts`: Level 5 correctly defined as "Director of Finance"

---

## 6. Fix Required

### Fix 1: Rename `.env` variable (RECOMMENDED)

In `backend/.env`, rename:
```diff
- ENTRA_FINANCE_DIRECTOR_GROUP_ID=5f8623ed-0afd-476d-838a-5da1730b3698
+ ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID=5f8623ed-0afd-476d-838a-5da1730b3698
```

**OR**

### Fix 2: Update code to match `.env` variable name

In `backend/src/services/userSync.service.ts`, change all 3 references:
- Line 136: `process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID`
- Line 137: `process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID`
- Line 311: `process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID`

### Recommendation

**Fix 1 is preferred** because the code naming convention (`ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID`) matches the pattern used for other directors (`ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID`) and is more descriptive. Changing the `.env` file is also a lower-risk change.

### Post-Fix Steps

1. Restart the backend server to reload environment variables
2. Have the Director of Finance user log out and log back in (triggers `syncPermissionsForUser()`)
3. Verify the user now has REQUISITIONS level 5 in the database
4. Verify the "Pending My Approval" tab appears and shows `supervisor_approved` POs
5. Verify the Approve/Reject buttons appear on POs in `supervisor_approved` status

---

## 7. Additional Recommendations

### 7.1 Update `.env.example`

Add all Entra group ID variables to `.env.example` so future deployments don't miss any:
```env
# Entra ID Group Mappings
ENTRA_ADMIN_GROUP_ID="admin-group-object-id"
ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID="dos-group-id"
ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID="finance-director-group-id"
ENTRA_PRINCIPALS_GROUP_ID="principals-group-id"
# ... etc
```

### 7.2 Add Startup Validation

Consider adding a startup check in `userSync.service.ts` that logs warnings for any expected `ENTRA_*_GROUP_ID` variables that are undefined:
```typescript
const expectedEnvVars = [
  'ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID',
  'ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID',
  // ... all group IDs
];
for (const v of expectedEnvVars) {
  if (!process.env[v]) {
    logger.warn(`Missing env var: ${v} — associated group mapping will be skipped`);
  }
}
```

### 7.3 No Hardcoded Role Issues Found

There are **no hardcoded role name checks** (like `role === 'Director of Finance'`) anywhere in the codebase. The system correctly uses numeric permission levels throughout. The only role string checks are `ADMIN` vs `USER` (the binary user.role field).

---

## 8. Files Examined

| File | Relevant Finding |
|---|---|
| `backend/.env` | `ENTRA_FINANCE_DIRECTOR_GROUP_ID` (wrong name) |
| `backend/.env.example` | Missing all group env vars except ADMIN |
| `backend/src/services/userSync.service.ts` | Expects `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` |
| `backend/src/services/purchaseOrder.service.ts` | Level 5 mapping correct |
| `backend/src/middleware/permissions.ts` | Permission check logic correct |
| `backend/src/middleware/auth.ts` | Auth middleware correct |
| `backend/src/controllers/auth.controller.ts` | Login flow + perm sync correct |
| `backend/src/controllers/purchaseOrder.controller.ts` | Controller logic correct |
| `backend/src/routes/purchaseOrder.routes.ts` | Route-level permission gates correct |
| `backend/src/services/user.service.ts` | findById returns permissions correctly |
| `backend/prisma/schema.prisma` | No role model needed; Permission model correct |
| `backend/prisma/seed.ts` | REQUISITIONS level 5 = Director of Finance (correct) |
| `frontend/src/store/authStore.ts` | Stores user with roles array |
| `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | Derives permLevel from user detail |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | Tab/filter gating correct |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Action button gating correct |
| `frontend/src/types/roles.types.ts` | Level config correct |
| `frontend/src/components/layout/AppLayout.tsx` | Nav not restricted |
| `frontend/src/components/ProtectedRoute.tsx` | No admin gate on PO routes |
| `frontend/src/App.tsx` | PO routes accessible to all authenticated users |
