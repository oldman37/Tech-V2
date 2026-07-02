# PO New Vendor Request — Review

Status: PASS
Reviewed against: `po_new_vendor_request_spec.md`

## 1. Specification Compliance

Implementation matches the spec exactly — "Pending review queue" design as confirmed with
the user:

- `vendors` model gained `pendingApproval`, `requestedByName`, `requestedByEmail`
  (schema.prisma:819-836) with additive migration
  `backend/prisma/migrations/20260702190154_add_vendor_pending_approval/migration.sql`.
- `GET /vendors` defaults to `pendingApproval: false` unless the caller explicitly asks
  for the pending queue (`referenceData.controller.ts` `getVendors`) — the PO wizard's
  existing Autocomplete query is unaffected and never sees unapproved vendors.
- `POST /vendors/request-new` (`REQUISITIONS` level 2 — same gate as creating/editing a
  PO) creates the vendor immediately and pending, then fires the notification email.
- `POST /vendors/:id/approve` / `POST /vendors/:id/reject` (`TECHNOLOGY` level 2 — same
  gate as existing vendor CRUD) flip the flag or hard-delete, per spec.
- `sendVendorRequestNotification` follows the `sendProvisioningDisableAlert` precedent
  exactly: comma-separated `VENDOR_REQUEST_ADMIN_EMAIL`, warn-and-noop if unset, never
  throws.
- Frontend: "Request a new vendor" button + dialog on `RequisitionWizard.tsx` Step 1;
  "Pending Vendor Requests" section with Approve/Reject on `ReferenceDataManagement.tsx`
  `VendorsTab`.
- `.env.example` (root) and `backend/.env.example` document the new var.

## 2. Best Practices / API Currency

No new dependencies — reuses Prisma 7, Zod, existing `nodemailer`/email-queue plumbing,
and MUI v7 components already used in both touched frontend files. No deprecated API
patterns introduced.

## 3. Consistency

- Controller error handling for the vendor-name unique constraint mirrors the existing
  `deleteVendor` pattern of catching a specific Prisma error code before falling through
  to `handleControllerError`.
- Email HTML follows the file's existing `escapeHtml()` + inline-table conventions.
- Frontend dialog fields/layout mirror the admin "Add Vendor" dialog already in
  `VendorsTab` (same field set minus fax/website, left for admin completion).
- Pending-queue UI reuses the file's existing vanilla CSS classes (`card`, `badge
  badge-error`, `btn btn-sm`) rather than introducing new styling.

## 4. Completeness

All spec sections implemented: schema/migration, validators, controller (4 new/changed
handlers), routes, email function, env docs, both frontend surfaces.

## 5. Security

- Authorization: `request-new` gated at `REQUISITIONS` level 2 (matches PO create/edit);
  `approve`/`reject` gated at `TECHNOLOGY` level 2 (matches existing vendor CRUD). No
  privilege escalation — a requisitioner cannot approve their own request or touch
  approved vendors via the new routes.
- CSRF: covered by the router-level `validateCsrfToken` already applied to all of
  `referenceData.routes.ts`.
- No Entra group IDs or raw Graph payloads introduced into any response.
- All user-supplied vendor fields are validated by the existing `CreateVendorSchema`
  (unchanged) and HTML-escaped before being interpolated into the notification email.
- `rejectVendorRequest` is guarded to only hard-delete while `pendingApproval === true`,
  preventing misuse against an already-approved vendor.

## 6. Performance

No N+1 queries introduced. `requestNewVendor`/`approveVendorRequest`/`rejectVendorRequest`
are each a single `findUnique` + single `create`/`update`/`delete`. Email send is
queued (`enqueueEmail`) and awaited but never blocks or fails the HTTP response on error.

## 7. Build Validation

Ran `scripts/preflight.ps1` (the project's defined Phase 6 gate) in full:

- **Backend image build** (shared `tsc` → `prisma generate` → backend `tsc`): PASS.
- **Frontend image build** (`tsc` → `vite build`): PASS. (Pre-existing bundle-size and
  dynamic-import warnings from Vite are unrelated to this change.)
- **Backend integration tests** (`prisma migrate deploy` + `vitest run` inside Docker):
  initially the `backend-test` image was stale (cached from before this session, so the
  first test run silently skipped the new migration). Rebuilt `backend-test` explicitly
  and re-ran — the new migration `20260702190154_add_vendor_pending_approval` applied
  cleanly (85 migrations found and applied, up from the prior 83), and all 5 test files /
  35 tests passed with no failures.

Full output: `scripts/preflight.ps1` exit code 0 on the final run.

## 8. Pre-existing Issues Noted (Not Introduced by This Change, Not Fixed)

- `backend/src/services/email.service.ts:156` and `:392` — implicit `any` on a
  pre-existing `.map((us) => ...)` callback in `buildApproverEmailSnapshot` /
  `buildFieldTripApproverSnapshot`. Unrelated to the touched code; did not modify per the
  surgical-changes rule (these lines predate this change and the `tsc` build still
  succeeds in Docker, so it isn't a build-blocking issue there — likely stricter
  IDE/editor TS settings than the container's `tsconfig.json`).
- `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` — multiple pre-existing
  "`inputProps` is deprecated" hints (MUI v7 favors `slotProps.htmlInput`) on lines that
  predate this change; not touched.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 95% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

## Result: PASS — proceeding to Phase 6 confirmation (already run above) and Phase 7.
