# Work Order Permission Fix & Reopen Feature — Combined Spec

**Document:** `docs/SubAgent/workorder_permission_reopen_spec.md`  
**Date:** 2026-04-29  
**Status:** Ready for Implementation  
**Issues:** Issue 1 — Tech Assistant close permission; Issue 2 — Reopen work order flow

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Issue 1 — Root Cause Analysis](#2-issue-1--root-cause-analysis)
3. [Issue 2 — Root Cause Analysis](#3-issue-2--root-cause-analysis)
4. [State Machine Diagram](#4-state-machine-diagram)
5. [Permission Level Reference](#5-permission-level-reference)
6. [Implementation Plan — Issue 1](#6-implementation-plan--issue-1)
7. [Implementation Plan — Issue 2](#7-implementation-plan--issue-2)
8. [Security Considerations](#8-security-considerations)
9. [UI/UX Plan](#9-uiux-plan)
10. [Files Changed Summary](#10-files-changed-summary)

---

## 1. Executive Summary

Two bugs affect the work order system:

**Issue 1:** Tech assistants (Entra group `ENTRA_TECH_ASSISTANTS_GROUP_ID`, which maps to `WORK_ORDERS` level **3**) receive a 403 when attempting to close work orders. This is caused by two compounding restrictions in the service layer: `VALID_TRANSITIONS` requires `minLevel: 4` for `CLOSED` transitions from `OPEN`, `IN_PROGRESS`, and `ON_HOLD`; and a separate assignment check further blocks level-3 users from closing even `RESOLVED` tickets unless those tickets are assigned to them or submitted by them.

**Issue 2:** No reopen path exists. `VALID_TRANSITIONS` has `CLOSED: []` (empty — terminal state). There is no UI trigger and no backend transition for reopening a closed work order.

---

## 2. Issue 1 — Root Cause Analysis

### 2.1 Permission Level for Tech Assistants

File: `backend/src/utils/groupAuth.ts`, lines ~67–77

```typescript
WORK_ORDERS: [
  ['ENTRA_ADMIN_GROUP_ID',               5],
  ['ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID', 4],
  ['ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID',4],
  ['ENTRA_MAINTENANCE_ADMIN_GROUP_ID',   4],
  ['ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID', 4],
  ['ENTRA_PRINCIPALS_GROUP_ID',          3],
  ['ENTRA_VICE_PRINCIPALS_GROUP_ID',     3],
  ['ENTRA_TECH_ASSISTANTS_GROUP_ID',     3],   // ← level 3
  ['ENTRA_FINANCE_DIRECTOR_GROUP_ID',    2],
  ['ENTRA_ALL_STAFF_GROUP_ID',           2],
],
```

Tech assistants have `WORK_ORDERS` level **3**.

### 2.2 Route Gate — Passes for Level 3

File: `backend/src/routes/work-orders.routes.ts`, line ~110

```typescript
router.put(
  '/:id/status',
  validateRequest(WorkOrderIdParamSchema, 'params'),
  validateRequest(UpdateStatusSchema, 'body'),
  requireModule('WORK_ORDERS', 3),         // ← minLevel 3, tech assistants pass
  workOrdersController.updateStatus,
);
```

The `requireModule` gate is **not** the blocker. Level-3 users reach the controller.

### 2.3 Root Cause #1 — `VALID_TRANSITIONS` minLevel for CLOSED

File: `backend/src/services/work-orders.service.ts`, lines ~34–54

```typescript
const VALID_TRANSITIONS: Record<string, { to: TicketStatus; minLevel: number }[]> = {
  OPEN: [
    { to: 'IN_PROGRESS', minLevel: 3 },
    { to: 'CLOSED',      minLevel: 4 },   // ← BLOCKS level 3
  ],
  IN_PROGRESS: [
    { to: 'ON_HOLD',   minLevel: 3 },
    { to: 'RESOLVED',  minLevel: 3 },
    { to: 'CLOSED',    minLevel: 4 },     // ← BLOCKS level 3
  ],
  ON_HOLD: [
    { to: 'IN_PROGRESS', minLevel: 3 },
    { to: 'CLOSED',      minLevel: 4 },   // ← BLOCKS level 3
  ],
  RESOLVED: [
    { to: 'CLOSED',      minLevel: 3 },   // ← allowed, but see root cause #2
    { to: 'IN_PROGRESS', minLevel: 3 },
  ],
  CLOSED: [],
};
```

`assertValidTransition` (lines ~193–212) enforces these rules:

```typescript
private assertValidTransition(fromStatus, toStatus, permLevel): void {
  const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
  const rule    = allowed.find((t) => t.to === toStatus);

  if (!rule) {
    throw new ValidationError(`Cannot transition work order from ${fromStatus} to ${toStatus}`, 'status');
  }

  if (permLevel < rule.minLevel) {
    throw new AuthorizationError(
      'You do not have the required permissions to perform this action.',
    );
  }
}
```

A level-3 tech assistant trying to close an `OPEN`, `IN_PROGRESS`, or `ON_HOLD` ticket gets `AuthorizationError("You do not have the required permissions to perform this action.")` — exactly matching the reported symptom (user see "You do not have permission to update a ticket" as a paraphrase of this message).

### 2.4 Root Cause #2 — Assignment Check Blocks RESOLVED → CLOSED for Level 3

File: `backend/src/services/work-orders.service.ts`, lines ~483–499

```typescript
// Level-3 technicians may only close or resolve work orders assigned to them or that they reported.
if (
  permLevel === 3 &&
  (data.status === 'CLOSED' || data.status === 'RESOLVED') &&
  ticket.assignedToId !== null &&
  ticket.assignedToId !== userId &&
  ticket.reportedById !== userId
) {
  throw new AuthorizationError(
    'You can only close or resolve work orders that are assigned to you or that you submitted. '
    + 'Please contact a supervisor if this work order needs to be reassigned.',
  );
}
```

Even for the one transition that IS allowed at level 3 (`RESOLVED → CLOSED`), this guard blocks it for tickets assigned to someone else. Tech assistants should be able to close **any** ticket.

### 2.5 Summary of Dual-Blocker

| Transition | assertValidTransition gate | Assignment check gate |
|---|---|---|
| `OPEN → CLOSED` | **FAILS** (minLevel 4) | Never reached |
| `IN_PROGRESS → CLOSED` | **FAILS** (minLevel 4) | Never reached |
| `ON_HOLD → CLOSED` | **FAILS** (minLevel 4) | Never reached |
| `RESOLVED → CLOSED` | Passes (minLevel 3) | **FAILS** if assigned to someone else |

---

## 3. Issue 2 — Root Cause Analysis

### 3.1 Backend — CLOSED is a Terminal State

File: `backend/src/services/work-orders.service.ts`, line ~53

```typescript
CLOSED: [],   // no transitions — terminal state, no reopen possible
```

Any attempt to transition from `CLOSED` throws `ValidationError("Cannot transition work order from CLOSED to ...")`.

### 3.2 Backend — Partial Reopen Logic Exists for RESOLVED

The `updateStatus` method (lines ~503–512) already handles one partial reopen case:

```typescript
} else if (data.status === 'IN_PROGRESS' && ticket.status === 'RESOLVED') {
  // Reopen clears resolvedAt
  timestamps.resolvedAt = null;
}
```

This clears `resolvedAt` when going `RESOLVED → IN_PROGRESS`, but:
- There is no equivalent for `CLOSED → OPEN` (which would need `closedAt = null`)
- The `VALID_TRANSITIONS` table has no `CLOSED → *` entries

### 3.3 Frontend — Static Status List, No Reopen Button

File: `frontend/src/pages/WorkOrderDetailPage.tsx`, lines ~73–80

```typescript
const STATUSES: { value: WorkOrderStatus; label: string }[] = [
  { value: 'OPEN',        label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD',     label: 'On Hold' },
  { value: 'RESOLVED',    label: 'Resolved' },
  { value: 'CLOSED',      label: 'Closed' },
];
```

The dropdown is static and exhaustive — no state-aware filtering, no conditional "Reopen" trigger. When a ticket is CLOSED, clicking "Update Status" shows all five options, but every selection fails at the backend.

### 3.4 Frontend — WORK_ORDERS permLevel Not in Auth Store

File: `frontend/src/store/authStore.ts`, lines ~14–24

```typescript
permLevels?: {
  TECHNOLOGY: number;
  MAINTENANCE: number;
  REQUISITIONS: number;
  // WORK_ORDERS is NOT stored
  ...
}
```

The frontend auth store does not carry `WORK_ORDERS` permLevel, so button visibility cannot be gated by permission level without either: (a) adding it to the auth store's `permLevels`, or (b) inferring it from group membership using the same logic as `derivePermLevelFrontend` in `frontend/src/utils/groupAuth.ts`.

---

## 4. State Machine Diagram

### 4.1 Current State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
     [create]       ▼                                         │ level 4
    ────────► ┌───────────┐ ──level 3──► ┌─────────────┐ ────┘
              │   OPEN    │              │ IN_PROGRESS  │
              └───────────┘             └─────────────┘
                    │ level 4               │ level 3      │ level 4
                    │                       ▼              │
                    │              ┌──────────────┐        │
                    │              │   ON_HOLD    │        │
                    │              └──────────────┘        │
                    │                       │ level 3      │
                    │         level 3       ▼              │
                    │    ┌─────────────► ┌──────────┐ ─────┘
                    │    │               │ RESOLVED │
                    │    │               └──────────┘
                    │    │                    │ level 3
                    │    │                    ▼
                    └────┴──────────────► ┌────────┐
                         level 4          │ CLOSED │ (terminal — no exits)
                                          └────────┘
```

### 4.2 Proposed State Machine (after both fixes)

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
     [create]       ▼                                         │ level 3 (CHANGED)
    ────────► ┌───────────┐ ──level 3──► ┌─────────────┐ ────┘
              │   OPEN    │◄─────────────│ IN_PROGRESS  │
              └───────────┘  [REOPEN]    └─────────────┘
                    ▲   │ level 3 (CHANGED)    │ level 3      │ level 3 (CHANGED)
                    │   │                      ▼              │
                    │   │             ┌──────────────┐        │
                    │   │             │   ON_HOLD    │        │
                    │   │             └──────────────┘        │
                    │   │                      │ level 3      │
                    │   │      level 3         ▼              │
                    │   │  ┌─────────────► ┌──────────┐ ──────┘
                    │   │  │               │ RESOLVED │
                    │   │  │               └──────────┘
                    │   │  │                    │ level 3
                    │   │  │                    ▼
                    │   └──┴──────────────► ┌────────┐
                    │      level 3           │ CLOSED │
                    │      (CHANGED)         └────────┘
                    │                            │
                    └────────────────────────────┘
                            CLOSED → OPEN
                            level 3 [NEW — REOPEN]
```

**New transition:** `CLOSED → OPEN` at `minLevel: 3`  
**Changed transitions:** `OPEN → CLOSED`, `IN_PROGRESS → CLOSED`, `ON_HOLD → CLOSED` all lowered from `minLevel: 4` to `minLevel: 3`

---

## 5. Permission Level Reference

| Group | WORK_ORDERS Level | Can Close Any? (proposed) | Can Reopen? (proposed) |
|---|---|---|---|
| All Staff | 2 | No — view/create only | No |
| Tech Assistants | **3** | **Yes** | **Yes** |
| Principals | 3 | Yes | Yes |
| Vice Principals | 3 | Yes | Yes |
| Technology Director | 4 | Yes | Yes |
| Maintenance Directors / Admin | 4 | Yes | Yes |
| Director of Schools | 4 | Yes | Yes |
| Admin (ENTRA_ADMIN_GROUP) | 5 | Yes | Yes |

Principals and vice principals are at level 3 as well. Granting close/reopen to level 3 means principals also gain this ability — this is intentional and correct given the role hierarchy.

---

## 6. Implementation Plan — Issue 1

### Step 1: Lower CLOSED minLevel in VALID_TRANSITIONS

**File:** `backend/src/services/work-orders.service.ts`

**Change:** Lower `minLevel` for all `CLOSED` transitions from `4` to `3`.

```typescript
// BEFORE
OPEN: [
  { to: 'IN_PROGRESS', minLevel: 3 },
  { to: 'CLOSED',      minLevel: 4 },
],
IN_PROGRESS: [
  { to: 'ON_HOLD',   minLevel: 3 },
  { to: 'RESOLVED',  minLevel: 3 },
  { to: 'CLOSED',    minLevel: 4 },
],
ON_HOLD: [
  { to: 'IN_PROGRESS', minLevel: 3 },
  { to: 'CLOSED',      minLevel: 4 },
],

// AFTER
OPEN: [
  { to: 'IN_PROGRESS', minLevel: 3 },
  { to: 'CLOSED',      minLevel: 3 },   // changed
],
IN_PROGRESS: [
  { to: 'ON_HOLD',   minLevel: 3 },
  { to: 'RESOLVED',  minLevel: 3 },
  { to: 'CLOSED',    minLevel: 3 },     // changed
],
ON_HOLD: [
  { to: 'IN_PROGRESS', minLevel: 3 },
  { to: 'CLOSED',      minLevel: 3 },   // changed
],
```

### Step 2: Remove the Assignment Check for Level-3 Close

**File:** `backend/src/services/work-orders.service.ts`, `updateStatus` method (~line 483)

**Change:** Delete the entire assignment check guard block. Level-3 users should close or resolve **any** ticket without restriction.

```typescript
// REMOVE this entire block:
if (
  permLevel === 3 &&
  (data.status === 'CLOSED' || data.status === 'RESOLVED') &&
  ticket.assignedToId !== null &&
  ticket.assignedToId !== userId &&
  ticket.reportedById !== userId
) {
  logger.warn('Unauthorized work order close/resolve attempt', { ticketId: id, userId });
  throw new AuthorizationError(
    'You can only close or resolve work orders that are assigned to you or that you submitted...',
  );
}
```

Also remove the `logger.warn` import of 'Unauthorized work order close/resolve attempt' if it becomes unused (verify — logger is used elsewhere in the file so just the warn call is removed).

### Step 3: Update Route Comment

**File:** `backend/src/routes/work-orders.routes.ts`, JSDoc at top (~line 1–11)

Update the comment to reflect the new level assignments:

```typescript
// Level 3 — View/update/close work orders at their location(s); add internal comments
// Level 4 — Assign work orders; manage supervised locations
```

---

## 7. Implementation Plan — Issue 2

### Step 1: Add CLOSED → OPEN Transition

**File:** `backend/src/services/work-orders.service.ts`

**Change:** Add a `REOPEN` transition from `CLOSED`:

```typescript
// BEFORE
CLOSED: [],

// AFTER
CLOSED: [
  { to: 'OPEN', minLevel: 3 },
],
```

### Step 2: Clear closedAt on Reopen in updateStatus

**File:** `backend/src/services/work-orders.service.ts`, `updateStatus` method (~line 503–514)

**Change:** Add a reopen branch that clears `closedAt`:

```typescript
// BEFORE
const timestamps: { resolvedAt?: Date | null; closedAt?: Date | null } = {};

if (data.status === 'RESOLVED') {
  timestamps.resolvedAt = now;
} else if (data.status === 'CLOSED') {
  timestamps.closedAt = now;
} else if (data.status === 'IN_PROGRESS' && ticket.status === 'RESOLVED') {
  // Reopen clears resolvedAt
  timestamps.resolvedAt = null;
}

// AFTER
const timestamps: { resolvedAt?: Date | null; closedAt?: Date | null } = {};

if (data.status === 'RESOLVED') {
  timestamps.resolvedAt = now;
} else if (data.status === 'CLOSED') {
  timestamps.closedAt = now;
} else if (data.status === 'IN_PROGRESS' && ticket.status === 'RESOLVED') {
  // Reopen from RESOLVED clears resolvedAt
  timestamps.resolvedAt = null;
} else if (data.status === 'OPEN' && ticket.status === 'CLOSED') {
  // Reopen from CLOSED clears closedAt
  timestamps.closedAt = null;
}
```

### Step 3: Add WORK_ORDERS permLevel to Frontend Auth Store

**File:** `frontend/src/store/authStore.ts`

**Change:** Add `WORK_ORDERS` to the `permLevels` interface so the frontend can gate UI elements:

```typescript
// BEFORE
permLevels?: {
  TECHNOLOGY: number;
  MAINTENANCE: number;
  REQUISITIONS: number;
  ...
}

// AFTER
permLevels?: {
  TECHNOLOGY: number;
  MAINTENANCE: number;
  REQUISITIONS: number;
  WORK_ORDERS: number;    // add this
  ...
}
```

**Verify** this field is populated when the auth response is received (check the login/token endpoint response shape and where `setUser` is called). If the backend's `/api/auth/me` or login response does not yet include `WORK_ORDERS` in `permLevels`, the backend needs to be updated to include it.

### Step 4: Filter Status Options by Current State in Frontend Dialog

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`

**Change:** Replace the static `STATUSES` constant with a computed list based on `workOrder.status`, mirroring the backend state machine:

```typescript
// Add a client-side transition map (mirrors VALID_TRANSITIONS on backend)
const ALLOWED_NEXT_STATUSES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN:        ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'CLOSED'],
  ON_HOLD:     ['IN_PROGRESS', 'CLOSED'],
  RESOLVED:    ['CLOSED', 'IN_PROGRESS'],
  CLOSED:      ['OPEN'],   // reopen only
};

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  OPEN:        'Open',
  IN_PROGRESS: 'In Progress',
  ON_HOLD:     'On Hold',
  RESOLVED:    'Resolved',
  CLOSED:      'Closed',
};
```

Then in the JSX status dialog `<Select>`, replace the static `STATUSES.map(...)` with:

```tsx
{(ALLOWED_NEXT_STATUSES[workOrder.status] ?? []).map((s) => (
  <MenuItem key={s} value={s}>
    {STATUS_LABELS[s]}
  </MenuItem>
))}
```

And update `openStatusDialog` to initialize `newStatus` to the first allowed next status rather than the current status to avoid a no-op default:

```typescript
const openStatusDialog = () => {
  if (workOrder) {
    const options = ALLOWED_NEXT_STATUSES[workOrder.status] ?? [];
    setNewStatus(options[0] ?? workOrder.status);
  }
  setStatusNote('');
  setStatusError(null);
  setStatusOpen(true);
};
```

### Step 5: Add Dedicated "Reopen" Button for CLOSED Tickets

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`

In the header action buttons area (near the "Update Status" button), add a dedicated Reopen button that is only shown when `workOrder.status === 'CLOSED'`. This provides a direct, unambiguous one-click reopen path:

```tsx
{/* Add alongside existing action buttons */}
{workOrder.status === 'CLOSED' && (
  <Button
    variant="outlined"
    color="warning"
    startIcon={<RestoreIcon />}
    onClick={handleReopen}
    size="small"
    disabled={updateStatus.isPending}
  >
    Reopen
  </Button>
)}
```

Add the `RestoreIcon` import from `@mui/icons-material/Restore`.

Add the handler:

```typescript
const handleReopen = async () => {
  if (!id) return;
  try {
    await updateStatus.mutateAsync({ id, status: 'OPEN', notes: 'Work order reopened' });
  } catch (err: unknown) {
    const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    // Surface error — reuse statusError state for simplicity
    setStatusError(apiMessage ?? 'Unable to reopen work order. Please try again.');
    setStatusOpen(false);
  }
};
```

Display `statusError` outside the dialog so reopen errors are visible without opening the dialog. The existing `{statusError && <Alert ...>}` in the dialog already handles this if we optionally render it in the main page body as well.

### Step 6: Update the Reopen Button Visibility Logic (Optional — permLevel gate)

If `WORK_ORDERS` is added to the auth store (Step 3 above), gate both the "Update Status" and "Reopen" buttons by permLevel >= 3:

```typescript
const workOrdersPermLevel = user?.permLevels?.WORK_ORDERS ?? 0;
const canChangeStatus = isAdmin || workOrdersPermLevel >= 3;

// In JSX:
{canChangeStatus && (
  <Button variant="outlined" startIcon={<SwapHorizIcon />} onClick={openStatusDialog}>
    Update Status
  </Button>
)}
{canChangeStatus && workOrder.status === 'CLOSED' && (
  <Button variant="outlined" color="warning" startIcon={<RestoreIcon />} onClick={handleReopen}>
    Reopen
  </Button>
)}
```

---

## 8. Security Considerations

### 8.1 Who Can Reopen?

Proposed: `minLevel: 3` for `CLOSED → OPEN` (same as closing).

**Rationale:**
- A tech assistant who closes a ticket should be able to reopen it if they made a mistake.
- Principals and vice principals at level 3 can also reopen — this is appropriate since they can close tickets.
- Level 2 all-staff cannot reopen (they cannot close either — consistent).
- No privilege escalation risk: reopening a ticket restores it to `OPEN` which any level-2+ user could already see and interact with.

**Considered alternative — restrict reopen to level 4:**  
This would prevent tech assistants from reopening, requiring a supervisor to act. This may be appropriate in workflows where a supervisor must approve all reopens. However, given the task requirement says tech assistants should be able to manage work orders fully, `minLevel: 3` is the correct choice.

### 8.2 Audit Trail

`TicketStatusHistory` records every transition including reopens. The `changedById` and `notes` fields provide a full audit trace. No additional audit logging is needed.

### 8.3 Data Integrity — closedAt Clearing

When reopening (`CLOSED → OPEN`), `closedAt` must be set to `null` to reflect the ticket is no longer closed. Similarly `resolvedAt` should be cleared if the ticket was resolved before closure. The proposed change to `updateStatus` (Implementation Step 2) handles `closedAt`. Verify whether `resolvedAt` should also be cleared on reopen from CLOSED:

- If ticket went `RESOLVED → CLOSED`, it has both `resolvedAt` and `closedAt` set.
- On reopen (`CLOSED → OPEN`), both should be cleared.
- Update the timestamp block to also set `resolvedAt = null` when reopening from CLOSED.

Revised timestamp block:

```typescript
} else if (data.status === 'OPEN' && ticket.status === 'CLOSED') {
  timestamps.closedAt = null;
  timestamps.resolvedAt = null;  // clear both on full reopen
}
```

### 8.4 No Breaking Changes to Authorization Hierarchy

Lowering close from `minLevel: 4` to `minLevel: 3` does not elevate anyone above their existing capabilities — level 4 supervisors continue to work as before, and level 3 users gain the close right they were intended to have per the route comment (`Level 3 — View/update work orders at their location(s)`).

---

## 9. UI/UX Plan

### 9.1 Current State Dialog Flow

User clicks "Update Status" → dialog opens with full flat list of all 5 statuses → user can pick any status (including current one) → backend rejects invalid transitions → error shown in dialog.

**Problems:**
- All 5 statuses always shown regardless of current state (confusing when ticket is CLOSED)
- No "Reopen" concept — user has to know to pick "Open" from the dropdown
- Dialog default is set to current status — user always has to change it (minor UX issue)

### 9.2 Proposed Dialog Flow

**For non-CLOSED tickets:**
- "Update Status" button opens dialog
- Dropdown shows only **valid next statuses** based on current state (computed from `ALLOWED_NEXT_STATUSES`)
- Default selected is the first valid next status
- Notes field remains
- Backend still validates — frontend filter is a UX aid, not a security boundary

**For CLOSED tickets:**
- "Reopen" button appears in the header action area (warning color to signal it's a state-change)
- Clicking "Reopen" directly submits `{ status: 'OPEN', notes: 'Work order reopened' }` — no dialog needed
- "Update Status" button is hidden when ticket is CLOSED (or it opens the dialog which only shows "Open")  
- Error is surfaced above the action buttons if reopen fails

### 9.3 Button State Reference

| Ticket Status | "Update Status" button | "Reopen" button |
|---|---|---|
| OPEN | Visible | Hidden |
| IN_PROGRESS | Visible | Hidden |
| ON_HOLD | Visible | Hidden |
| RESOLVED | Visible | Hidden |
| CLOSED | Hidden (or shows only OPEN option) | **Visible** |

### 9.4 Status Dropdown Options by Current State

| Current Status | Options shown in dropdown |
|---|---|
| OPEN | In Progress, Closed |
| IN_PROGRESS | On Hold, Resolved, Closed |
| ON_HOLD | In Progress, Closed |
| RESOLVED | Closed, In Progress |
| CLOSED | (no dropdown — use Reopen button instead) |

---

## 10. Files Changed Summary

| File | Change Type | Issue |
|---|---|---|
| `backend/src/services/work-orders.service.ts` | Modify `VALID_TRANSITIONS` — lower CLOSED minLevel to 3 | #1 |
| `backend/src/services/work-orders.service.ts` | Remove assignment check guard block in `updateStatus` | #1 |
| `backend/src/services/work-orders.service.ts` | Add `CLOSED → OPEN` to `VALID_TRANSITIONS` | #2 |
| `backend/src/services/work-orders.service.ts` | Add `closedAt = null` and `resolvedAt = null` on reopen in `updateStatus` | #2 |
| `backend/src/routes/work-orders.routes.ts` | Update JSDoc comment to reflect level-3 close capability | #1 |
| `frontend/src/store/authStore.ts` | Add `WORK_ORDERS: number` to `permLevels` interface | #2 |
| `frontend/src/pages/WorkOrderDetailPage.tsx` | Replace static `STATUSES` with `ALLOWED_NEXT_STATUSES` map | #1 + #2 |
| `frontend/src/pages/WorkOrderDetailPage.tsx` | Add `handleReopen` handler | #2 |
| `frontend/src/pages/WorkOrderDetailPage.tsx` | Add "Reopen" button (visible only when `CLOSED`) | #2 |
| `frontend/src/pages/WorkOrderDetailPage.tsx` | Gate "Update Status" / "Reopen" by permLevel >= 3 | #1 + #2 |

---

*End of specification. Ready for implementation subagent.*
