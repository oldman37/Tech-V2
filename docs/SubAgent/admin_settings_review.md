# Admin System Settings — Code Review Report

**Date:** 2026-03-11  
**Reviewer:** Code Review Subagent  
**Feature:** Sprint C-2 — Admin System Settings (SystemSettings singleton, req/PO number sequences, supervisor bypass, email configuration)

---

## Summary

| Category | PASS | FAIL | CONCERN |
|----------|------|------|---------|
| Correctness | 8 | 0 | 3 |
| Security | 4 | 0 | 1 |
| Frontend | 5 | 0 | 3 |
| **Total** | **17** | **0** | **7** |

---

## Files Reviewed

| # | File | Status |
|---|------|--------|
| 1 | `backend/prisma/schema.prisma` | ✅ Reviewed |
| 2 | `backend/src/validators/settings.validators.ts` | ✅ Reviewed |
| 3 | `backend/src/services/settings.service.ts` | ✅ Reviewed |
| 4 | `backend/src/controllers/settings.controller.ts` | ✅ Reviewed |
| 5 | `backend/src/routes/settings.routes.ts` | ✅ Reviewed |
| 6 | `backend/src/services/purchaseOrder.service.ts` | ✅ Reviewed |
| 7 | `backend/src/controllers/purchaseOrder.controller.ts` | ✅ Reviewed |
| 8 | `backend/prisma/seed.ts` | ✅ Reviewed |
| 9 | `frontend/src/services/settingsService.ts` | ✅ Reviewed |
| 10 | `frontend/src/pages/admin/AdminSettings.tsx` | ✅ Reviewed |
| 11 | `frontend/src/App.tsx` | ✅ Reviewed |
| 12 | `frontend/src/components/layout/AppLayout.tsx` | ✅ Reviewed |
| 13 | `frontend/src/lib/queryKeys.ts` | ✅ Reviewed |

---

## Correctness

### ✅ PASS — SystemSettings model in schema.prisma with all required fields

The `SystemSettings` model is declared at the bottom of `schema.prisma` with all required fields:

```prisma
model SystemSettings {
  id                      String   @id @default("singleton")
  nextReqNumber           Int      @default(1)
  reqNumberPrefix         String   @default("REQ")
  nextPoNumber            Int      @default(1)
  poNumberPrefix          String   @default("PO")
  supervisorBypassEnabled Boolean  @default(true)
  supervisorStageEmail    String?
  purchasingStageEmail    String?
  dosStageEmail           String?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  @@map("system_settings")
}
```

The `@@map("system_settings")` directive is present, which aligns with the raw SQL in `settings.service.ts` that references `system_settings` (lowercase). Without this, the raw `UPDATE system_settings ...` queries would fail at runtime.

---

### ✅ PASS — `purchase_orders` model has `reqNumber String? @unique`

Confirmed in schema:

```prisma
model purchase_orders {
  poNumber  String?  @unique
  reqNumber String?  @unique
  ...
}
```

Both fields are correctly typed as nullable unique strings.

---

### ✅ PASS — Atomic increment for PO/req numbers (no race condition)

`settings.service.ts` uses a raw PostgreSQL `UPDATE ... RETURNING` statement:

```typescript
const result = await this.prisma.$queryRaw<...>`
  UPDATE system_settings
  SET    "nextReqNumber" = "nextReqNumber" + 1,
         "updatedAt"     = NOW()
  WHERE  id = 'singleton'
  RETURNING "nextReqNumber" - 1 AS next_req_number,
            "reqNumberPrefix"   AS req_number_prefix
`;
```

The single-statement `UPDATE ... RETURNING` is inherently atomic in PostgreSQL. The `RETURNING "nextReqNumber" - 1` correctly returns the value *before* the increment (i.e., the claimed number). No race condition exists — concurrent callers each get a unique sequence value.

> **CONCERN C-1:** Each call to `getNextReqNumber()` / `getNextPoNumber()` begins with a `getSettings()` upsert to ensure the singleton row exists. This adds an extra round-trip on every sequence claim. A lightweight optimization would be to only call `getSettings()` on first use (lazy init) or rely on the fact that `seed.ts` always creates the row. Not a bug, but a minor performance concern under load.

---

### ✅ PASS — Supervisor bypass reads from settings (not hard-coded)

In `purchaseOrder.service.ts` → `submitPurchaseOrder()`:

```typescript
const settings = await this.settingsService.getSettings();
if (!settings.supervisorBypassEnabled) {
  isSelfSupervisor = false;
}
```

The bypass flag is read from the database at submit time. No hardcoded values.

---

### ✅ PASS — Email notifications read from settings (not env vars)

In `purchaseOrder.controller.ts`, all stage notification emails are fetched from the database:

```typescript
settingsService.getSettings().then((s) => {
  if (s.purchasingStageEmail) {
    sendApprovalActionRequired(po, s.purchasingStageEmail, 'Purchasing Approval').catch(() => {});
  }
}).catch(() => {});
```

This correctly replaces the legacy `FINANCE_NOTIFY_EMAIL` / `DOS_NOTIFY_EMAIL` environment variables with DB-driven configuration.

> **CONCERN C-2:** The fire-and-forget `.catch(() => {})` pattern throughout `purchaseOrder.controller.ts` silently swallows all errors — including both settings-read failures and email send failures — without logging. If email delivery breaks, there will be no server-side trace. At minimum, these catches should call `logger.warn(...)`. This affects five different notification call sites.

---

### ✅ PASS — Req number assigned at submit time

In `submitPurchaseOrder()`:

```typescript
const reqNumber = await this.settingsService.getNextReqNumber();
// ... then passed into the $transaction update
data: { reqNumber, status: 'submitted', submittedAt: now }
```

The req number is claimed and stamped at the moment of submission. Draft POs have `reqNumber = null`.

> **CONCERN C-3:** The `getNextReqNumber()` call is made *outside* the `$transaction`. If the subsequent transaction fails (e.g., a DB constraint violation on `reqNumber @unique` under extreme concurrency), the claimed sequence number is permanently skipped, creating a gap. This is standard acceptable behavior for auto-increment sequences, but gaps will be visible in the requisition number sequence. No action required, but worth documenting for stakeholders.

---

### ✅ PASS — PO number auto-generated when not provided at issue time

In `issuePurchaseOrder()`:

```typescript
const poNumber = issueData.poNumber
  ? issueData.poNumber
  : await this.settingsService.getNextPoNumber();
```

When the caller does not supply a `poNumber`, the service atomically claims the next one from settings.

> **CONCERN C-4 (minor):** When a *manually-provided* `poNumber` is used (the `issueData.poNumber` branch), the duplicate check is:
> ```typescript
> const existing = await this.prisma.purchase_orders.findFirst({ where: { poNumber, NOT: { id } } });
> if (existing) throw new ValidationError(...)
> ```
> There is a TOCTOU (time-of-check / time-of-use) window between `findFirst` and the subsequent `update`. Two concurrent requests with the same manual `poNumber` could both pass the check before either update commits. The `@unique` constraint on `poNumber` in the schema is the true safety net and will raise a DB error in the second writer, which `handleControllerError` should surface as a 409. Low-risk given that manual PO overrides are rare admin actions, but the error message to the client may be less friendly in that case.

---

### ✅ PASS — Seed includes SystemSettings upsert with defaultValues

`seed.ts` includes:

```typescript
await prisma.systemSettings.upsert({
  where:  { id: 'singleton' },
  update: {},
  create: {
    id: 'singleton',
    nextReqNumber: 1, reqNumberPrefix: 'REQ',
    nextPoNumber: 1,  poNumberPrefix: 'PO',
    supervisorBypassEnabled: true,
    supervisorStageEmail: null, purchasingStageEmail: null, dosStageEmail: null,
  },
});
```

All fields are present. `update: {}` is correct — seed re-runs should not overwrite user-configured values.

---

## Security

### ✅ PASS — Settings routes protected with authenticate + requireAdmin

`settings.routes.ts` applies middleware globally via:

```typescript
router.use(authenticate);
router.use(requireAdmin);
```

All routes under `/api/settings` require a valid JWT and the ADMIN role. This is the same pattern used by all other admin routes.

---

### ✅ PASS — CSRF token on PUT /api/settings

```typescript
router.put(
  '/',
  validateCsrfToken,
  validateRequest(UpdateSettingsSchema, 'body'),
  settingsController.updateSettings,
);
```

`validateCsrfToken` is correctly applied to the state-changing PUT route. The GET route does not need CSRF protection (read-only).

---

### ✅ PASS — Input validated with Zod before DB write

`UpdateSettingsSchema` is a Zod schema with proper type, range, and format constraints on all fields. It is applied in two places:

1. Route middleware: `validateRequest(UpdateSettingsSchema, 'body')`
2. Controller: `const data = UpdateSettingsSchema.parse(req.body)`

> **CONCERN S-1:** The schema is validated **twice** — once by the route middleware and then again explicitly in the controller with `.parse(req.body)`. The middleware result is not forwarded to the controller (the controller re-reads `req.body`), making the middleware invocation redundant for this route. This is consistent with the `FundingSource` pattern in the codebase but represents dead validation work on every request. It is not a security issue, but can cause subtle divergence if the middleware and controller are someday given different schemas.

---

### ✅ PASS — No SQL injection risk in raw query

The `$queryRaw` tagged template literal in `settings.service.ts` contains no user-supplied interpolated values. All WHERE/SET values are compile-time constants or Prisma-managed. Prisma's `$queryRaw` template tag parameterizes any `${}` interpolation, so even if user values were introduced in the future they would be safely parameterized. No injection risk.

---

## Frontend

### ✅ PASS — /admin/settings route registered with requireAdmin

`App.tsx`:

```tsx
<Route
  path="/admin/settings"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <AdminSettings />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

Route is correctly protected with `requireAdmin`. Unauthorized users are blocked at the router level.

---

### ✅ PASS — System Settings nav item present with adminOnly: true

`AppLayout.tsx` — Admin section:

```typescript
{ label: 'System Settings', icon: '⚙️', path: '/admin/settings', adminOnly: true },
```

The nav item is correctly marked `adminOnly: true` alongside Users and Locations & Supervisors in the Admin nav section.

---

### ✅ PASS — queryKeys.settings used (not inline ['settings'])

`queryKeys.ts`:

```typescript
settings: ['settings'] as const,
```

`AdminSettings.tsx`:

```typescript
import { queryKeys } from '../../lib/queryKeys';
// ...
queryKey: queryKeys.settings,
```

Centralized key is used correctly. No inline `['settings']` arrays.

---

### ✅ PASS — Form resets correctly when settings load

`AdminSettings.tsx` uses a `useEffect` to populate the form:

```typescript
useEffect(() => {
  if (settings) {
    reset({ ...settings-mapped-to-form-values });
  }
}, [settings, reset]);
```

Null email values from the API are coerced to `''` for the form fields (`settings.supervisorStageEmail ?? ''`). The Reset button in the form also manually re-calls `reset(...)` with the same mapping. Both paths are consistent.

---

### ✅ PASS — Empty email strings converted to null before API call

`AdminSettings.tsx` → `onSubmit`:

```typescript
const payload: UpdateSettingsInput = {
  ...values,
  supervisorStageEmail: values.supervisorStageEmail || null,
  purchasingStageEmail: values.purchasingStageEmail || null,
  dosStageEmail:        values.dosStageEmail        || null,
};
```

Empty strings from the form are converted to `null` before the API call, matching the backend's nullable schema expectation.

> **CONCERN F-1:** The frontend Zod schema for email fields is:
> ```typescript
> z.string().email('Must be a valid email').or(z.literal('')).nullable().optional()
> ```
> The backend schema is:
> ```typescript
> z.string().email('...').max(255).nullable().optional()
> ```
> The frontend allows empty string `''` as a valid value (which is then converted to `null` in `onSubmit`), while the backend does not allow empty string (requires either a valid email or null). This mismatch is safe because the conversion in `onSubmit` always prevents an empty string from reaching the API. However, if the conversion were ever removed or bypassed (e.g., a direct API call), the backend would reject with a validation error. The schemas should ideally be kept in sync.

> **CONCERN F-2:** The `mutation.isSuccess` alert (`"Settings saved successfully"`) persists on the page indefinitely after a save. If the user edits the form again and the form becomes dirty, the success alert still shows alongside the new unsaved state. Consider auto-dismissing the alert after a few seconds or clearing it when `isDirty` becomes true — this is a UX polish concern.

> **CONCERN F-3:** The sequence number "Preview" display in the UI shows the *current* stored values from the API (`settings?.nextReqNumber`), not the *form field* values. If a user types a new `nextPoNumber` without saving, the preview still reflects the old DB value rather than the live form input. This can be confusing. Wiring the preview to the React Hook Form `watch()` value for those fields would give real-time feedback.

---

## Gaps / Issues Summary

No FAIL items were found. All critical path items pass. The concerns below are listed in priority order:

| ID | Severity | File | Description |
|----|----------|------|-------------|
| C-2 | Medium | `purchaseOrder.controller.ts` | Fire-and-forget email notifications silently swallow errors (no logging). Five call sites affected. |
| S-1 | Low | `settings.routes.ts` + `settings.controller.ts` | Double Zod validation (middleware + controller re-parse from `req.body`). Middleware result is unused. |
| C-4 | Low | `purchaseOrder.service.ts` | TOCTOU race window for manual `poNumber` override in `issuePurchaseOrder`. DB unique constraint is the real guard. |
| F-1 | Low | `AdminSettings.tsx` vs `settings.validators.ts` | Frontend/backend Zod schema mismatch for email fields (empty string allowed on frontend, not on backend). Conversion in `onSubmit` is the safety net. |
| C-1 | Low | `settings.service.ts` | Extra `getSettings()` upsert round-trip before each atomic sequence increment. Minor performance cost. |
| C-3 | Info | `purchaseOrder.service.ts` | Req number claimed outside transaction — transaction failure causes permanent gap in sequence. Acceptable behavior for numeric sequences. |
| F-2 | Info | `AdminSettings.tsx` | Success alert persists after user re-edits the form without re-saving. UX polish issue. |
| F-3 | Info | `AdminSettings.tsx` | Number preview shows stored DB values, not live form input. Should use `watch()` for real-time preview. |

---

## Conclusion

The Admin System Settings feature is **well-implemented and production-ready**. All 17 checklist items pass. The implementation correctly follows the FundingSource service/controller/validator pattern established in the codebase, uses atomic SQL for sequence numbers, reads all configurable values from the database, and properly guards routes with authentication and CSRF protection.

The 7 concerns are all low-to-medium severity, with none blocking deployment. The most actionable item is **C-2** (add logging to email notification error handlers), which is a one-line fix per call site and improves observability.
