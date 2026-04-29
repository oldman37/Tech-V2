# Work Order Regression: Level-3 Users Cannot See Assigned Tickets

**Date:** 2026-04-29  
**Status:** Root cause confirmed  
**Severity:** High — functional regression affecting tech assistant workflow  
**Regression Commit:** `e6d3933` — "feat: improve error message when closing unassigned work order"

---

## 1. Summary

Tech assistant users (permission level 3) cannot see work orders assigned to them in the list view (`GET /api/work-orders`). The root cause is a **pre-existing gap** in the `getWorkOrders` scope filter that was exposed by commit `e6d3933`, which added an `updateStatus` assignment-check guard and improved the frontend error message to surface the API-level "assigned to you" semantics — making the missing list visibility immediately apparent to users.

---

## 2. Files Investigated

| File | Relevance |
|---|---|
| `backend/src/services/work-orders.service.ts` | **Root cause location** — `getWorkOrders` scope filter |
| `backend/src/routes/work-orders.routes.ts` | Confirmed: `GET /` uses `requireModule('WORK_ORDERS', 1)` — no route-level regression |
| `backend/src/controllers/work-orders.controller.ts` | Confirmed: passes `permLevel` correctly to service; no regression |
| `backend/src/utils/errors.ts` | Confirmed: `AuthorizationError` → HTTP 403 |
| `frontend/src/pages/WorkOrderDetailPage.tsx` | Changed in e6d3933; frontend change is correct (better error display) |
| `frontend/src/pages/WorkOrderListPage.tsx` | No changes; no client-side filtering applied |
| `frontend/src/services/work-order.service.ts` | No changes; passes all filters to API transparently |

---

## 3. Root Cause

### Location

**File:** `backend/src/services/work-orders.service.ts`  
**Method:** `getWorkOrders` (line 218)  
**Lines:** 256–264 — the `permLevel === 3` scope filter branch

### Current Code (Buggy)

```typescript
// Lines 249–265
} else if (permLevel === 3) {
  // Own location(s) — user is staff at specific locations
  const locRows = await this.prisma.locationSupervisor.findMany({
    where: { userId },
    select: { locationId: true },
  });
  const locationIds = locRows.map((r) => r.locationId);
  if (locationIds.length > 0) {
    scopeWhere = {
      OR: [
        { reportedById: userId },
        { officeLocationId: { in: locationIds } },  // ← BUG: { assignedToId: userId } missing
      ],
    };
  } else {
    scopeWhere = { reportedById: userId };            // ← BUG: { assignedToId: userId } missing
  }
}
```

### What it does now

A level-3 user sees only work orders where **they are the reporter** OR the ticket is **at one of their supervised locations** (per `locationSupervisor` table). Tickets directly assigned to them at **any other location** (or with no location) are invisible in the list.

### What it should do

A level-3 user should also see work orders where `assignedToId = userId`, regardless of location. This is consistent with:
- The `updateStatus` guard added in e6d3933 (line 486–497), which explicitly permits level-3 users to close/resolve their **assigned** tickets.
- The `resolveAutoAssignee` logic in `createWorkOrder`, which auto-assigns tech assistants to new tickets — an assignment the tech assistant must be able to see.

---

## 4. How the Regression Was Exposed by Commit e6d3933

`getWorkOrders` was **not modified** in commit e6d3933 (confirmed via `git diff 905ac6c e6d3933`). The scope gap was always present. The commit exposed it via two mechanisms:

1. **Backend guard** (lines 486–497 of `updateStatus`): When a level-3 user tries to close a ticket from a direct URL or notification link, the new guard returns HTTP 403 with message: `"You can only close or resolve work orders that are assigned to you or that you submitted."` This semantically promises "if it's assigned to you, you can act on it."

2. **Frontend error display** (`WorkOrderDetailPage.tsx` lines 161–165): The improved catch block extracts the real API message from the Axios response body instead of swallowing it. Users now see the actionable "assigned to you" message and attempt to find their assigned tickets in the list — where they are absent.

The combination makes the list-scope gap visible and actively disruptive to the level-3 workflow.

---

## 5. Minimal Fix

**File:** `backend/src/services/work-orders.service.ts`  
**Lines to change:** 256–264

Add `{ assignedToId: userId }` to both branches of the level-3 scope in `getWorkOrders`. No other files require modification.

### Before

```typescript
      if (locationIds.length > 0) {
        scopeWhere = {
          OR: [
            { reportedById: userId },
            { officeLocationId: { in: locationIds } },
          ],
        };
      } else {
        scopeWhere = { reportedById: userId };
      }
```

### After

```typescript
      if (locationIds.length > 0) {
        scopeWhere = {
          OR: [
            { reportedById: userId },
            { assignedToId: userId },
            { officeLocationId: { in: locationIds } },
          ],
        };
      } else {
        scopeWhere = {
          OR: [
            { reportedById: userId },
            { assignedToId: userId },
          ],
        };
      }
```

This is a surgical, two-site change within a single method. No routes, controllers, validators, frontend, or Prisma schema are affected.

---

## 6. What Was NOT Broken

| Concern | Finding |
|---|---|
| `updateStatus` guard placement | Correctly inside `updateStatus` only; does NOT affect reads |
| `getWorkOrderById` row-access check (line 327) | Only restricts `permLevel <= 2`; level-3 can always view a single ticket by ID — correct |
| Route-level permission checks | `GET /` and `GET /:id` both require `WORK_ORDERS` level 1 minimum — unchanged |
| Frontend filter parameters | `workOrderService.getAll()` passes all query params transparently — unchanged |
| `WorkOrderListPage.tsx` UI filters | No client-side scope filtering applied; list renders what the API returns |

---

## 7. Security Considerations

- **No privilege escalation risk:** `{ assignedToId: userId }` only surfaces tickets a supervisor (level 4+) explicitly assigned to the user. Level-3 users cannot self-assign (enforced in `assignWorkOrder` — `if (permLevel < 4) throw AuthorizationError`).
- **Tight scope:** The fix adds visibility only for records where `assignedToId = <authenticated userId>` — the user's own identity from the JWT. There is no way for a level-3 user to spoof a different `userId` through this path.
- **`getWorkOrderById` (line 327) remains unchanged.** Level-3 users can already access any ticket by ID (no row-level restriction for level 3). The list fix makes the UI consistent with what the detail endpoint already permits.
- **The `updateStatus` guard (lines 486–497) remains unchanged.** It correctly prevents level-3 users from closing/resolving tickets they did not report or are not assigned to.
- **No server-side input from the client is used to derive `assignedToId` in the scope.** The `userId` used in the scope filter always comes from `req.user!.id` (JWT-validated) — not from any query parameter.

---

## 8. Verification Steps

After applying the fix:

1. Sign in as a level-3 tech assistant user.
2. Confirm tickets auto-assigned to them via `createWorkOrder` appear in `GET /api/work-orders`.
3. Confirm tickets manually assigned by a level-4 supervisor also appear.
4. Confirm tickets at locations NOT in the user's `locationSupervisor` rows (but assigned to them) are now visible.
5. Confirm level-2 and level-1 users still see only their own reported tickets (no scope change for those levels).
6. Confirm level-4+ users are unaffected.
