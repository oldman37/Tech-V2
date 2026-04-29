# Work Order Close/Complete Authorization Error — Research Spec

**Date:** 2026-04-29  
**Module:** Work Orders (Maintenance & Technology)  
**Scope:** Backend authorization check + frontend error display for close/complete status transitions  

---

## 1. Executive Summary

When a user attempts to close or complete a work order, the system enforces permission-level gates at two layers (route middleware and service state-machine). However, **there is no assignment-based authorization check** — any user with sufficient permission level can close any work order regardless of whether it is assigned to them. Additionally, when a permission error *is* thrown, the frontend **swallows the server error message entirely** and replaces it with the generic string `"Failed to update status."`, giving users no actionable information.

---

## 2. Current State — Exact File Locations

### 2.1 State Machine (Valid Transitions)

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** 33–51

```typescript
const VALID_TRANSITIONS: Record<string, { to: TicketStatus; minLevel: number }[]> = {
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
  RESOLVED: [
    { to: 'CLOSED',      minLevel: 3 },
    { to: 'IN_PROGRESS', minLevel: 3 },
  ],
  CLOSED: [],
};
```

**Key observation:** Closing a RESOLVED work order requires only level 3. No check verifies whether the calling user is the assigned worker.

---

### 2.2 Route — Status Transition Endpoint

**File:** `backend/src/routes/work-orders.routes.ts`  
**Lines:** 108–117

```typescript
router.put(
  '/:id/status',
  validateRequest(WorkOrderIdParamSchema, 'params'),
  validateRequest(UpdateStatusSchema, 'body'),
  requireModule('WORK_ORDERS', 3),
  workOrdersController.updateStatus,
);
```

The `requireModule('WORK_ORDERS', 3)` middleware gate fires **before** the controller. If a user's computed level is < 3, the response is:

```json
HTTP 403  { "error": "Forbidden", "message": "Requires WORK_ORDERS level 3" }
```

Source: `backend/src/utils/groupAuth.ts` — `requireModule` function, line ~151.

---

### 2.3 Controller — updateStatus Handler

**File:** `backend/src/controllers/work-orders.controller.ts`  
**Lines:** 119–130

```typescript
export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data      = UpdateStatusSchema.parse(req.body);
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;

    const ticket = await service.updateStatus(req.params.id as string, data, userId, permLevel);
    res.json(mapTicket(ticket));
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

The controller passes `userId` and `permLevel` through to the service but performs no authorization logic itself.

---

### 2.4 Service — updateStatus Method

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** 473–525

```typescript
async updateStatus(id, data, userId, permLevel) {
  const ticket = await this.prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError('Work order', id);

  this.assertValidTransition(ticket.status, data.status, permLevel);
  // ... update logic ...
}
```

**No assignment check is present.** The method only calls `assertValidTransition`.

---

### 2.5 Service — assertValidTransition (The Authorization Gate)

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** 192–213

```typescript
private assertValidTransition(fromStatus: string, toStatus: string, permLevel: number): void {
  const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
  const rule    = allowed.find((t) => t.to === toStatus);

  if (!rule) {
    throw new ValidationError(
      `Cannot transition work order from ${fromStatus} to ${toStatus}`,
      'status',
    );
  }

  if (permLevel < rule.minLevel) {
    throw new AuthorizationError(
      `Permission level ${rule.minLevel}+ required to move work order to ${toStatus}`,
    );
  }
}
```

**Current error message (backend → HTTP 403):**
```json
{
  "error": "FORBIDDEN",
  "message": "Permission level 3+ required to move work order to CLOSED"
}
```

This message exposes internal permission-level nomenclature (a security concern) and is not user-friendly.

---

### 2.6 Error Class

**File:** `backend/src/utils/errors.ts`  
**Lines:** 48–52

```typescript
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}
```

The `handleControllerError` utility in `backend/src/utils/errorHandler.ts` (lines 14–21) passes `error.message` directly through to the response body — meaning whatever string is in the `AuthorizationError` constructor reaches the client.

---

### 2.7 Frontend — handleStatusSubmit (Error Is Swallowed)

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`  
**Lines:** 158–167

```typescript
const handleStatusSubmit = async () => {
  if (!id) return;
  setStatusError(null);
  try {
    await updateStatus.mutateAsync({ id, status: newStatus, notes: statusNote || undefined });
    setStatusOpen(false);
  } catch {
    setStatusError('Failed to update status.');   // ← line 165: hardcoded generic string
  }
};
```

The `catch` block uses no parameter, discarding the `AxiosError` entirely. The `error.response?.data?.message` from the API is never read.

---

### 2.8 Frontend — Error Display in Status Dialog

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`  
**Line:** 467

```tsx
{statusError && <Alert severity="error">{statusError}</Alert>}
```

This renders inside the `<DialogContent>` of the Update Status dialog. It will only ever show `"Failed to update status."` regardless of the root cause.

---

## 3. Identified Gaps

| # | Gap | Location | Severity |
|---|-----|----------|----------|
| G1 | No assignment check — any level 3+ user can close any RESOLVED work order | `work-orders.service.ts` line 482 | Medium |
| G2 | Backend error message exposes internal permission-level numbers | `work-orders.service.ts` line 209 | Low—Medium |
| G3 | Frontend swallows all API errors; user sees only `"Failed to update status."` | `WorkOrderDetailPage.tsx` line 165 | High (UX) |
| G4 | `requireModule` 403 message also exposes internal module/level naming | `groupAuth.ts` line ~151 | Low |

---

## 4. Proposed Solution

### 4.1 Backend — Add Assignment Check to updateStatus

For **level 3 users** attempting to mark a work order CLOSED or RESOLVED, verify they are either the assigned worker or the reporter. Level 4+ users (supervisors/admins) can close any work order in their scope without this restriction.

**File to modify:** `backend/src/services/work-orders.service.ts`  
**Insert after line 482** (after `assertValidTransition` call), within `updateStatus`:

```typescript
// Level-3 users may only close/resolve work orders assigned to them or reported by them
if (
  permLevel === 3 &&
  (data.status === 'CLOSED' || data.status === 'RESOLVED') &&
  ticket.assignedToId !== userId &&
  ticket.reportedById !== userId
) {
  throw new AuthorizationError(
    'You can only close or resolve work orders that are assigned to you.',
  );
}
```

**Security note:** This message does NOT reveal who the work order IS assigned to — it only states the rule. The HTTP response will be 403 `FORBIDDEN`.

---

### 4.2 Backend — User-Friendly Error Message in assertValidTransition

Replace the technical message with plain language.

**File to modify:** `backend/src/services/work-orders.service.ts`  
**Line 209** — change:

```typescript
// BEFORE
`Permission level ${rule.minLevel}+ required to move work order to ${toStatus}`

// AFTER
`You do not have permission to change this work order's status to ${toStatus.toLowerCase().replace('_', ' ')}.`
```

This removes the internal permission-level number from the response while remaining accurate and actionable.

---

### 4.3 Frontend — Surface API Error Message in Status Dialog

Replace the hardcoded generic catch string with a helper that extracts the server's `message` field from Axios errors, with a safe fallback.

**File to modify:** `frontend/src/pages/WorkOrderDetailPage.tsx`  
**Lines 162–167** — change:

```typescript
// BEFORE
const handleStatusSubmit = async () => {
  if (!id) return;
  setStatusError(null);
  try {
    await updateStatus.mutateAsync({ id, status: newStatus, notes: statusNote || undefined });
    setStatusOpen(false);
  } catch {
    setStatusError('Failed to update status.');
  }
};

// AFTER
const handleStatusSubmit = async () => {
  if (!id) return;
  setStatusError(null);
  try {
    await updateStatus.mutateAsync({ id, status: newStatus, notes: statusNote || undefined });
    setStatusOpen(false);
  } catch (err: unknown) {
    const apiMessage =
      (err as any)?.response?.data?.message;
    setStatusError(
      typeof apiMessage === 'string' && apiMessage.length > 0
        ? apiMessage
        : 'Unable to update the work order status. Please try again or contact your supervisor.',
    );
  }
};
```

**Rationale:**  
- Uses the server-provided message when available (actionable, specific, safe after fix 4.2)  
- Falls back to a helpful, non-technical string — never an empty UI or a raw "null"  
- Does not expose stack traces or internal codes to the user (those only appear in `development` mode on the backend)

---

### 4.4 Proposed Final User-Facing Error Messages

| Scenario | HTTP Status | Message Displayed to User |
|----------|-------------|---------------------------|
| Level 1/2 user tries to change status | 403 | `"You do not have permission to change this work order's status."` (from requireModule; see 4.5) |
| Level 3 user tries to close a work order not assigned to/reported by them | 403 | `"You can only close or resolve work orders that are assigned to you."` |
| Level 3 user tries OPEN→CLOSED (requires level 4) | 403 | `"You do not have permission to change this work order's status to closed."` |
| API unreachable / 500 error | 500 / network | `"Unable to update the work order status. Please try again or contact your supervisor."` |

---

### 4.5 Optional — Improve requireModule 403 Message

**File to modify:** `backend/src/utils/groupAuth.ts`  
**Line ~151** — change:

```typescript
// BEFORE
message: `Requires ${module} level ${minLevel}`,

// AFTER
message: 'You do not have permission to perform this action.',
```

This prevents information leakage of internal module names and level numbers via network responses, while remaining appropriately vague (403 status code already communicates "forbidden").

---

## 5. Implementation Steps

| Step | File | Change | Priority |
|------|------|--------|----------|
| 1 | `backend/src/services/work-orders.service.ts` | Add assignment check after line 482 in `updateStatus` | High |
| 2 | `backend/src/services/work-orders.service.ts` | Update error message in `assertValidTransition` (line 209) | Medium |
| 3 | `frontend/src/pages/WorkOrderDetailPage.tsx` | Update `handleStatusSubmit` catch block (line 165) to extract API message | High |
| 4 | `backend/src/utils/groupAuth.ts` | Neutralize `requireModule` 403 message (line ~151) | Low |

Steps 1 and 3 address the highest-impact issues and can be implemented independently.

---

## 6. Security Considerations

- **Do not expose the assigned user's identity in the error message.** The proposed message `"You can only close or resolve work orders that are assigned to you."` makes this clear — it states the policy without naming who the work order _is_ assigned to.
- **Do not expose permission levels or internal module names** in HTTP responses. Levels like `"WORK_ORDERS level 3"` reveal the permission schema to any authenticated user with network inspection tools.
- **The fallback frontend message** should never include raw Axios error properties (`.stack`, `.config`, `.request`) — only the string `message` field from `response.data`.
- **403 vs 401:** The current use of 403 (`AuthorizationError`) is correct — the user is authenticated but lacks authorization. Do not change HTTP status codes.
- **No change to visibility scoping:** This spec does not alter what work orders a user can *read* — only what status transitions they can *perform*.

---

## 7. References / Best Practices Consulted

1. **OWASP Authorization Cheat Sheet** — "Do not expose internal permission structures in error messages." Recommends generic 403 messages that communicate denial without revealing system internals. https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
2. **Nielsen Norman Group — Error Message Guidelines** — "Error messages should state what went wrong, why, and what the user can do next." Purely generic messages ("Failed to update") fail the "what can I do next" requirement.
3. **Microsoft Fluent/MUI Design System** — Recommends surfacing API errors in contextual `<Alert severity="error">` within the dialog where the action was attempted, not toast-only or console-only.
4. **Atlassian Design System — Error Content Guidelines** — "Be specific and avoid jargon. Don't say 'Error 403' — explain the constraint in plain language."
5. **Enterprise UX Copy (Salesforce Lightning)** — Pattern: `"You don't have permission to [specific action]. Contact your administrator for access."` — names the action, avoids technical details, suggests a next step.
6. **Existing codebase pattern** — `purchaseOrder.service.ts` line 912 uses a similar level-check pattern: `"This approval stage requires permission level ${stageReq.requiredLevel} or higher (your level: ${permLevel})"` — this also has the same information-exposure problem and could be harmonized in a follow-up.

---

## 8. Out of Scope

- Changing which permission levels can perform which transitions (state machine redesign)
- Adding push notifications or email alerts when a close is rejected
- The `handleAssignSubmit` catch block also uses a generic `'Failed to assign work order.'` pattern (line ~181) — this is a related but separate issue

---

*Spec authored by: Research SubAgent | Spec file: `docs/SubAgent/workorder_close_error_spec.md`*
