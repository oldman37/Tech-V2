# SP-2 Spec — Work Order Level-3/4 Location Scoping on Direct Object Access

**Date:** 2026-06-10
**Audit Finding:** AUDIT.md SP-2
**Severity:** 🟡 Medium — horizontal privilege escalation between school staff

---

## Current State

The permission model documented in `work-orders.routes.ts`:

> Level 3 — View/update work orders **at their location(s)**
> Level 4 — Assign work orders; close any work order **at supervised locations**

`getWorkOrders` enforces this correctly via `scopeWhere` (location filter in the list query).

Three service methods do **not** enforce it:

| Method | Bug |
|---|---|
| `getWorkOrderById` (line 334) | Rejects only `permLevel <= 2` non-owners; level 3+ reads any ticket |
| `updateWorkOrder` (line 453) | Rejects only `permLevel < 3` non-owners; level 3+ edits any ticket |
| `updateStatus` (lines 488–540) | Only validates transition rules; never checks location scope |

A level-3 technician at School A can therefore read, edit, and status-transition work orders
belonging to School B — horizontal privilege escalation between peer locations.

## Scope

Backend-only. No frontend changes, no schema changes, no new dependencies.

Three service-layer methods in `backend/src/services/work-orders.service.ts`.

## Solution

Add a private async helper `assertTicketAccess` that mirrors the exact scope logic already
in `getWorkOrders`, then call it from all three affected methods.

### Scope rules (mirror of `getWorkOrders`)

| permLevel | Access rule |
|---|---|
| ≤ 2 | Reporter only |
| 3 | Reporter OR assignee OR ticket at supervised location |
| 4 | Ticket at supervised location (no reporter/assignee fallback); unrestricted if user has no supervised locations |
| ≥ 5 | Unrestricted |

Level 4 with no supervised locations falls through to unrestricted — matching the existing
`getWorkOrders` comment: *"If no locations, admin can still fall through to no extra scope."*

### Helper signature

```typescript
private async assertTicketAccess(
  ticket: { reportedById: string | null; assignedToId: string | null; officeLocationId: string | null },
  userId: string,
  permLevel: number,
): Promise<void>
```

Uses the existing `getSupervisedLocationIds` helper (already private on the class) — no duplicate
DB query logic.

## Implementation Plan

1. **Add `assertTicketAccess` private helper** after `assertValidTransition` in the helpers block.
   Uses `getSupervisedLocationIds` (already defined); throws `AuthorizationError` on scope violation.

2. **`getWorkOrderById`**: replace the single `if (permLevel <= 2 ...)` access check with
   `await this.assertTicketAccess(ticket, userId, permLevel)`.

3. **`updateWorkOrder`**: replace the single `if (permLevel < 3 ...)` access check with
   `await this.assertTicketAccess(ticket, userId, permLevel)`.

4. **`updateStatus`**: add `await this.assertTicketAccess(ticket, userId, permLevel)`
   immediately after the existing `this.assertValidTransition(...)` call.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Level-3 user locked out of legitimate ticket (edge case: no locationSupervisor row) | Low — same logic as list query, so if they can see it in the list they can access it | Existing `getWorkOrders` logic already enforces this; consistent behavior |
| Level-4 admin with no supervisor rows becomes more restricted | None — `locationIds.length === 0` path returns early (unrestricted) | Mirrors `getWorkOrders` explicitly |
| Extra DB query per request | Low — one indexed `locationSupervisor` lookup per call; most requests are level ≥ 5 admins (early return) | Acceptable for a security fix |
| `updateStatus` now also checks location — previously only transition rules mattered | Intentional — matches documented permission model | |
