# Work Order Assignment Email — Deep Link Spec

**Date:** 2026-04-29  
**Module:** Work Orders — Email Notifications  
**Scope:** Add a clickable deep link to the work order detail page inside assignment notification emails  

---

## 1. Executive Summary

Work order assignment emails are already sent via Nodemailer when a work order is created with an auto-assignee or when a work order is manually re-assigned. The email body is HTML but contains **no link** to the work order — only a prose recommendation to "log in to the system." Adding a deep link requires:

1. A new `APP_URL` environment variable in the backend.
2. Passing the work order database `id` (UUID) through to `sendWorkOrderAssigned`.
3. Inserting a styled anchor tag into the email HTML template.

The change is minimal and fully backward-compatible.

---

## 2. Current Email Sending Code — Exact Locations

### 2.1 Email Service (Template)

**File:** `backend/src/services/email.service.ts`  
**Lines:** 325–383

```typescript
export async function sendWorkOrderAssigned(
  workOrder: {
    workOrderNumber: string;
    department: string;
    priority: string;
    locationName?: string | null;
  },
  assigneeEmail: string,
  reportedByName: string,
): Promise<void> {
  const deptLabel = workOrder.department === 'TECHNOLOGY' ? 'Technology' : 'Maintenance';
  const deptColor = workOrder.department === 'TECHNOLOGY' ? '#1565C0' : '#E65100';

  await sendMail({
    to:      assigneeEmail,
    subject: `Work Order Assigned: ${workOrder.workOrderNumber}`,
    html: `
      <h2 style="color:${deptColor};">A ${escapeHtml(deptLabel)} Work Order Has Been Assigned to You</h2>
      <p>You have been assigned a new work order that requires your attention.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">Work Order #:</td>
            <td style="padding:4px 8px;">${escapeHtml(workOrder.workOrderNumber)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Department:</td>
            <td style="padding:4px 8px;">${escapeHtml(deptLabel)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Priority:</td>
            <td style="padding:4px 8px;">${escapeHtml(workOrder.priority)}</td></tr>
        ${workOrder.locationName ? `<tr><td style="padding:4px 8px;font-weight:bold;">Location:</td>
            <td style="padding:4px 8px;">${escapeHtml(workOrder.locationName)}</td></tr>` : ''}
        <tr><td style="padding:4px 8px;font-weight:bold;">Reported By:</td>
            <td style="padding:4px 8px;">${escapeHtml(reportedByName)}</td></tr>
      </table>
      <p style="margin-top:24px;">Please log in to the system to review the work order details and begin work.</p>
    `,
  });
}
```

**Key observation:** The `workOrder` object does not receive the database UUID (`ticket.id`). The function has no way to construct a URL. The closing paragraph is a generic "log in" message with no hyperlink.

---

### 2.2 Work Order Service — `sendAssignmentEmail` Helper

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** 161–193

```typescript
private async sendAssignmentEmail(
  workOrderId: string,       // ← UUID is already passed in here
  workOrderNumber: string,
  department: string,
  priority: string,
  officeLocationId: string | null,
  assigneeId: string,
  reportedById: string,
): Promise<void> {
  const [assignee, reporter, location] = await Promise.all([
    this.prisma.user.findUnique({ where: { id: assigneeId }, select: { email: true } }),
    this.prisma.user.findUnique({ where: { id: reportedById }, select: { displayName: true, firstName: true, lastName: true } }),
    officeLocationId ? this.prisma.officeLocation.findUnique({ where: { id: officeLocationId }, select: { name: true } }) : null,
  ]);

  if (!assignee?.email) return;

  const reporterName = (reporter?.displayName
    ?? `${reporter?.firstName ?? ''} ${reporter?.lastName ?? ''}`.trim())
    || 'Unknown';

  await sendWorkOrderAssigned(
    { workOrderNumber, department, priority, locationName: location?.name },
    assignee.email,
    reporterName,
  );
}
```

**Key observation:** `workOrderId` is the **first parameter** of `sendAssignmentEmail` but is **never forwarded** to `sendWorkOrderAssigned`. The UUID is already available — it just needs to be passed through.

---

### 2.3 Call Sites for `sendAssignmentEmail`

**Trigger 1 — Auto-assignment on creation**  
**File:** `backend/src/services/work-orders.service.ts`  
**Line:** 429

```typescript
this.sendAssignmentEmail(ticket.id, ticket.ticketNumber, data.department, data.priority ?? 'MEDIUM', data.officeLocationId ?? null, autoAssigneeId, reportedById).catch(() => {});
```

**Trigger 2 — Manual assignment (re-assign)**  
**File:** `backend/src/services/work-orders.service.ts`  
**Line:** 599

```typescript
this.sendAssignmentEmail(id, ticket.ticketNumber, ticket.department, ticket.priority, ticket.officeLocationId, data.assignedToId, userId).catch(() => {});
```

Both call sites already pass the UUID as the first argument. No changes needed here.

---

## 3. Frontend Work Order URL Pattern

**File:** `frontend/src/App.tsx`  
**Lines:** 166–175

```tsx
<Route
  path="/work-orders/:id"
  element={
    <ProtectedRoute>
      <AppLayout>
        <WorkOrderDetailPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

**Deep link URL pattern:** `{APP_URL}/work-orders/{ticket.id}`

Example: `https://tech.ocboe.com/work-orders/a1b2c3d4-e5f6-7890-abcd-ef1234567890`

The `:id` segment is the **database UUID** (e.g., `a1b2c3d4-...`), not the human-readable `ticketNumber` (e.g., `WO-2026-0001`). The `WorkOrderDetailPage` component fetches by UUID via `/api/work-orders/:id`.

---

## 4. Environment Variable — `APP_URL`

### 4.1 Current State

There is **no `APP_URL` or `FRONTEND_URL`** variable currently defined in the backend. The only related variable is:

| Variable | Current value (`.env`) | Purpose |
|---|---|---|
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed CORS origins (not suitable for link generation) |
| `SMTP_HOST` | `smtp.office365.com` | Email server |
| `SMTP_FROM` | `OCS Tech <ocstech@ocboe.com>` | Sender address |

`CORS_ORIGIN` must **not** be used for link construction — it is a security list that may contain multiple origins.

### 4.2 Required Addition

Add `APP_URL` to:

**`backend/.env`** (after the `CORS_ORIGIN` block):
```
# Frontend base URL — used to build deep links in notification emails
APP_URL=http://localhost:5173
```

**`backend/.env.example`** (after `CORS_ORIGIN` block, line ~41):
```
# Frontend base URL — used to build deep links in notification emails
APP_URL="http://localhost:5173"
```

**Production value:** `https://tech.ocboe.com` (or whatever the production deployment URL is).

---

## 5. Implementation Plan

### Step 1 — Add `APP_URL` to environment files

**File:** `backend/.env`  
After line 105 (`SMTP_FROM=...`), add:
```
APP_URL=http://localhost:5173
```

**File:** `backend/.env.example`  
After line 41 (`CORS_ORIGIN="http://localhost:5173"`), add:
```
# Frontend base URL — used to build deep links in notification emails
APP_URL="http://localhost:5173"
```

---

### Step 2 — Update `sendWorkOrderAssigned` signature and template

**File:** `backend/src/services/email.service.ts`  
**Target lines:** 325–383

**Change 1 — Add `workOrderId` to the parameter object:**

```typescript
// BEFORE
export async function sendWorkOrderAssigned(
  workOrder: {
    workOrderNumber: string;
    department: string;
    priority: string;
    locationName?: string | null;
  },

// AFTER
export async function sendWorkOrderAssigned(
  workOrder: {
    id: string;                  // ← ADD: database UUID for deep link
    workOrderNumber: string;
    department: string;
    priority: string;
    locationName?: string | null;
  },
```

**Change 2 — Build the deep link URL and insert it into the HTML:**

```typescript
// BEFORE (lines ~371–373):
      <p style="margin-top:24px;">Please log in to the system to review the work order details and begin work.</p>

// AFTER:
      ${appUrl ? `
      <p style="margin-top:24px;">
        <a href="${appUrl}/work-orders/${workOrder.id}"
           style="display:inline-block;padding:10px 20px;background-color:${deptColor};color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">
          View Work Order
        </a>
      </p>
      <p style="margin-top:8px;font-size:12px;color:#666;">
        Or copy this link: ${appUrl}/work-orders/${workOrder.id}
      </p>` : `
      <p style="margin-top:24px;">Please log in to the system to review the work order details and begin work.</p>`}
```

**At the top of the function body add:**

```typescript
  const appUrl = process.env.APP_URL?.replace(/\/$/, '') ?? '';
```

**Note:** The `escapeHtml` function must **not** be applied to the URL. The `ticket.id` is a UUID taken directly from Prisma (validated as UUID on insert), so it contains only `[a-f0-9-]` and is safe to embed in an `href` without escaping. The `appUrl` comes from `process.env.APP_URL` (trusted server config) and is trimmed to remove trailing slashes.

---

### Step 3 — Update the call site in `sendAssignmentEmail`

**File:** `backend/src/services/work-orders.service.ts`  
**Target lines:** 182–186

```typescript
// BEFORE
  await sendWorkOrderAssigned(
    { workOrderNumber, department, priority, locationName: location?.name },
    assignee.email,
    reporterName,
  );

// AFTER
  await sendWorkOrderAssigned(
    { id: workOrderId, workOrderNumber, department, priority, locationName: location?.name },
    assignee.email,
    reporterName,
  );
```

That is the **only** call site for `sendWorkOrderAssigned` in the codebase. The two upstream callers (lines 429 and 599) already supply `workOrderId` as the first argument — no further changes needed.

---

## 6. Complete Resulting Email HTML (After Change)

```html
<h2 style="color:#1565C0;">A Technology Work Order Has Been Assigned to You</h2>
<p>You have been assigned a new work order that requires your attention.</p>
<table style="border-collapse:collapse;width:100%;margin-top:16px;">
  <tr><td style="padding:4px 8px;font-weight:bold;">Work Order #:</td>
      <td style="padding:4px 8px;">WO-2026-0042</td></tr>
  <tr><td style="padding:4px 8px;font-weight:bold;">Department:</td>
      <td style="padding:4px 8px;">Technology</td></tr>
  <tr><td style="padding:4px 8px;font-weight:bold;">Priority:</td>
      <td style="padding:4px 8px;">HIGH</td></tr>
  <tr><td style="padding:4px 8px;font-weight:bold;">Location:</td>
      <td style="padding:4px 8px;">Smith Elementary</td></tr>
  <tr><td style="padding:4px 8px;font-weight:bold;">Reported By:</td>
      <td style="padding:4px 8px;">Jane Teacher</td></tr>
</table>
<p style="margin-top:24px;">
  <a href="https://tech.ocboe.com/work-orders/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
     style="display:inline-block;padding:10px 20px;background-color:#1565C0;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">
    View Work Order
  </a>
</p>
<p style="margin-top:8px;font-size:12px;color:#666;">
  Or copy this link: https://tech.ocboe.com/work-orders/a1b2c3d4-e5f6-7890-abcd-ef1234567890
</p>
```

---

## 7. Files Modified (Summary)

| File | Change |
|---|---|
| `backend/.env` | Add `APP_URL=http://localhost:5173` |
| `backend/.env.example` | Add `APP_URL="http://localhost:5173"` |
| `backend/src/services/email.service.ts` | Add `id` to `workOrder` param type; build `appUrl`; insert `<a>` into HTML body |
| `backend/src/services/work-orders.service.ts` | Forward `workOrderId` as `id` in the `sendWorkOrderAssigned` call (line ~183) |

---

## 8. Edge Cases

| Case | Handling |
|---|---|
| `APP_URL` not set in env | `appUrl` will be `''`. The ternary falls to the original prose message (no broken `<a href="">` is rendered). The email degrades gracefully. |
| `workOrder.id` is not a valid UUID | Not possible — Prisma auto-generates UUIDs and the value is read directly from the DB record. No validation needed. |
| Assignee is removed (unassigned) | `data.assignedToId` is `null` or `undefined`; the guard `if (data.assignedToId)` at line 598 prevents `sendAssignmentEmail` from being called. No email, no link. |
| `APP_URL` has trailing slash | Stripped with `.replace(/\/$/, '')` before interpolation, preventing double-slash in the URL. |
| Re-assignment fires for same user | No deduplication exists — if a work order is assigned back to the same person, they receive another email with a new link. This is the existing behavior; no new edge case introduced. |
| Email client does not render HTML | The plain-text version is not explicitly set. This is a pre-existing limitation. The fallback prose paragraph covers the no-`APP_URL` case, but a `text` property could be added to `sendMail` in a follow-up. |

---

## 9. Deep Link Best Practices (Reference)

1. **UUID-based routes over sequential IDs:** The frontend already uses the database UUID as the URL segment (React Router: `/work-orders/:id`). UUIDs are non-enumerable and prevent users from guessing adjacent record URLs — a security best practice for email-embedded links (OWASP A01 — Broken Access Control).

2. **Server-side access control on the route:** The linked page (`WorkOrderDetailPage`) is wrapped in `<ProtectedRoute>` which requires authentication. Even if a link leaks, the recipient must still authenticate. The backend API should enforce the same (it does via `requireModule` middleware). This is defense-in-depth.

3. **Graceful degradation with plain-text fallback:** Industry standard (e.g., MailChimp, SendGrid) is to include both `html` and `text` parts. For HTML-only emails, including a plain-text URL (`Or copy this link: ...`) below the button ensures the URL is accessible in plain-text email clients or screen readers.

---

## 10. Related Spec

- [workorder_close_error_spec.md](./workorder_close_error_spec.md) — Work order status transition authorization and frontend error display
