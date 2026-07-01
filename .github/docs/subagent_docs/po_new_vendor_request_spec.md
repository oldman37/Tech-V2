# PO New Vendor Request — Spec

Status: DRAFT (Phase 1 — Research & Specification)
Feature: "Request New Vendor" button on the PO Requisition wizard, with a pending-approval
review queue for admins and an email notification when a request comes in.

---

## 1. Current State Analysis

- **Vendors** are a standalone lookup table (`vendors` in `backend/prisma/schema.prisma:812`):
  `id, name (unique), contactName, email, phone, address, city, state, zip, fax, website,
  isActive, createdAt, updatedAt` + relations to `purchase_orders`, `equipment`, `RepairTicket`.
- Vendor CRUD lives in `backend/src/controllers/referenceData.controller.ts`
  (`getVendors`, `getVendor`, `createVendor`, `updateVendor`, `deleteVendor`) and
  `backend/src/routes/referenceData.routes.ts`. **Creating/editing a vendor currently
  requires `requireModule('TECHNOLOGY', 2)`** — a permission level ordinary requisition
  submitters (`REQUISITIONS` module) do not have.
- Admin vendor management UI is the "Vendors" tab of
  `frontend/src/pages/ReferenceDataManagement.tsx` (`VendorsTab`, route
  `/reference-data?tab=vendors`), backed by `vendorsService` in
  `frontend/src/services/referenceDataService.ts`.
- The PO requisition form (`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`) has a
  required vendor `Autocomplete` (Step 1, ~lines 500–540) backed by
  `GET /vendors?limit=5000&isActive=true`. `vendorId` is a required field
  (`CreatePurchaseOrderSchema`); the wizard will not let the user advance past Step 1
  without picking an existing, active vendor (`trigger(['vendorId'])`,
  `RequisitionWizard.tsx:251`). **There is currently no way for a requisition submitter to
  add a vendor that isn't already in the list** — the "No vendors found — add them in
  Reference Data" helper text (`RequisitionWizard.tsx:518`) points at a page they don't
  have permission to use.
- Email notifications for PO/field-trip/transportation workflows all go through
  `backend/src/services/email.service.ts`, which wraps every send in
  `enqueueEmail()` (via `emailQueue.service.ts`) and never throws — email failures are
  logged, not fatal. The existing `sendProvisioningDisableAlert()` function
  (`email.service.ts:1603`) is the closest precedent for what we need: it reads a
  comma-separated recipient list from an env var (`PROVISIONING_ADMIN_EMAIL`), no-ops with
  a warning log if unset, and builds an HTML alert with an action link back into the app.
- `req.user` (set by `authenticate` middleware, `backend/src/middleware/auth.ts:6-16`)
  carries `id`, `email`, `name` — enough to attribute a vendor request to its requester
  without any new lookups.

## 2. Problem Definition

A requisitioner filling out a PO sometimes needs to buy from a vendor that isn't in the
system yet. Today they're blocked — they have no permission to create vendors, and the
wizard requires a valid `vendorId` to proceed. We want:

1. A button on the PO Requisition wizard (Step 1, near the vendor picker) that lets the
   requester submit a **new vendor request** (name + optional contact details) without
   needing `TECHNOLOGY` module access.
2. The requester's *own* PO can use that vendor immediately (so they aren't blocked
   waiting on approval) — but the vendor must **not** appear in anyone else's vendor
   dropdown, or the general active-vendor list, until an admin reviews and approves it.
3. An email notification to the admin so they know a new vendor is waiting for review.
4. A small admin-side "pending vendor requests" queue (Reference Data → Vendors tab) with
   Approve / Reject actions.

This is the "Pending review queue" design (confirmed with the user over the "immediate +
notify" alternative) — it requires a schema change, unlike the simpler alternative.

## 3. Proposed Solution Architecture

### 3.1 Schema change (`backend/prisma/schema.prisma`, `vendors` model)

Add three columns, all additive/nullable-or-defaulted so existing rows are unaffected:

```prisma
model vendors {
  id               String            @id @default(uuid())
  name             String            @unique
  contactName      String?
  email            String?
  phone            String?
  address          String?
  city             String?
  state            String?
  zip              String?
  fax              String?
  website          String?
  isActive         Boolean           @default(true)
  pendingApproval  Boolean           @default(false)   // NEW
  requestedByName  String?                              // NEW
  requestedByEmail String?                              // NEW
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  purchase_orders  purchase_orders[]
  equipment        equipment[]
  repairTickets    RepairTicket[]
}
```

`requestedByName`/`requestedByEmail` are stored as plain denormalized strings (not a
relation to `users`) — this is a point-in-time record of who asked, doesn't need to survive
a user being deleted, and avoids adding a new named Prisma relation for a single, one-off
use case.

Manual migration file (per project convention — the container runs `prisma migrate deploy`
on startup, so this file must exist in the same commit as the schema edit):

```
backend/prisma/migrations/<YYYYMMDDHHmmss>_add_vendor_pending_approval/migration.sql
```

```sql
-- Add pending-approval workflow columns to vendors
-- Requester-submitted vendors start pendingApproval = true so they're excluded from the
-- default vendor list (used by the PO wizard's vendor Autocomplete) until an admin
-- reviews and approves them. requestedBy* fields let the admin queue attribute the
-- request without a new FK relation to users.
ALTER TABLE "vendors" ADD COLUMN "pendingApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN "requestedByName" TEXT;
ALTER TABLE "vendors" ADD COLUMN "requestedByEmail" TEXT;
```

### 3.2 Backend

**`backend/src/validators/referenceData.validators.ts`**
- Reuse the existing `CreateVendorSchema` for the request body — no new validator needed
  (same shape: `name` required, everything else optional).
- Extend `GetVendorsQuerySchema` with an optional `pendingApproval: z.coerce.boolean().optional()`
  filter, so the same `GET /vendors` endpoint can serve both "normal active list" and
  "admin's pending queue" callers.

**`backend/src/controllers/referenceData.controller.ts`**
- `getVendors`: when `pendingApproval` is *not* supplied in the query, default the where
  clause to `pendingApproval: false` (today's behavior, preserved) so the PO wizard's
  vendor Autocomplete never sees unapproved vendors. When the caller explicitly passes
  `pendingApproval=true`, return just the pending queue (used by the new admin UI).
- New `requestNewVendor(req, res)`:
  - Parse body with `CreateVendorSchema`.
  - `prisma.vendors.create({ data: { ...data, pendingApproval: true, requestedByName: req.user!.name, requestedByEmail: req.user!.email } })`.
  - Catch Prisma `P2002` (unique `name` violation) → respond `409` with a friendly message
    ("A vendor with this name already exists — search for it in the vendor list.").
  - Fire `sendVendorRequestNotification(vendor, req.user!)` (awaited, but the email
    function itself never throws — matches the rest of the codebase's non-blocking email
    pattern).
  - Respond `201` with the created vendor so the frontend can select it immediately for
    the current PO.
- New `approveVendorRequest(req, res)`: `prisma.vendors.update({ where: { id }, data: { pendingApproval: false } })`. 404 if not found.
- New `rejectVendorRequest(req, res)`: only allowed while `pendingApproval === true`
  (400 otherwise, to prevent accidentally hard-deleting a real, already-approved vendor
  via the wrong endpoint); hard `prisma.vendors.delete()` since a rejected request was
  never a real vendor.

**`backend/src/routes/referenceData.routes.ts`**
```ts
router.post('/vendors/request-new', requireModule('REQUISITIONS', 2), requestNewVendor);
router.post('/vendors/:id/approve',  requireModule('TECHNOLOGY', 2),  approveVendorRequest);
router.post('/vendors/:id/reject',   requireModule('TECHNOLOGY', 2),  rejectVendorRequest);
```
- `request-new` uses `REQUISITIONS` level 2 — the same permission level that gates
  creating/editing/submitting a PO (`purchaseOrder.routes.ts`), so any user who can build a
  requisition can request a vendor.
- `approve`/`reject` use `TECHNOLOGY` level 2 — the same gate as the existing vendor CRUD
  routes, so only current vendor-list admins can approve/reject.

**`backend/src/services/email.service.ts`**
- New `sendVendorRequestNotification(vendor, requester)` modeled directly on
  `sendProvisioningDisableAlert()` (`email.service.ts:1603-1665`):
  - Recipients from `process.env.VENDOR_REQUEST_ADMIN_EMAIL`, comma-separated,
    trimmed/filtered — same parsing as `PROVISIONING_ADMIN_EMAIL`.
  - If unset, `loggers.email.warn(...)` and return — never blocks vendor creation.
  - HTML body: vendor fields submitted (name, contact, email, phone, address/city/state/zip,
    fax, website), requester name + email, and a link to
    `${APP_URL}/reference-data?tab=vendors` for review.
  - Subject: `New Vendor Request Pending Approval: <vendor name>`.
  - Uses the existing `escapeHtml()` helper for every interpolated value (XSS precedent
    already established in this file).

### 3.3 Frontend

**`frontend/src/services/referenceDataService.ts`**
- Extend the `Vendor` interface: `pendingApproval: boolean; requestedByName: string | null; requestedByEmail: string | null;`.
- `vendorsService.getAll(params)`: add optional `pendingApproval` to the params type so it
  can request the pending queue.
- `vendorsService.requestNew(data)` → `POST /vendors/request-new`.
- `vendorsService.approve(id)` → `POST /vendors/:id/approve`.
- `vendorsService.reject(id)` → `POST /vendors/:id/reject`.

**`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`**
- Add a text button ("Vendor not listed? Request a new vendor") directly under the vendor
  `Autocomplete` in Step 1 (~`RequisitionWizard.tsx:540`, next to the "No vendors found —
  add them in Reference Data" helper text — that helper text should be simplified/removed
  since the new button replaces the dead-end pointer to a page the user can't access).
- New `Dialog` (same pattern as the existing "disregard" dialog in this file) with a small
  form: `name` (required), `contactName`, `email`, `phone`, `address`, `city`, `state`,
  `zip` — a practical subset of `CreateVendorSchema`'s fields; enough for the requester to
  fill in from a quote/invoice, with fax/website left for the admin to complete on
  approval.
- On submit: `useMutation` calling `vendorsService.requestNew(...)`.
  - Success: set `selectedVendor` + `setValue('vendorId', vendor.id, { shouldValidate: true })`
    so the current PO uses the new vendor immediately; close the dialog; show a success
    `Alert`/snackbar ("Vendor request sent — an admin will review it. You can continue with
    this vendor on your purchase order now.").
  - `409` (duplicate name): show the error inline in the dialog ("A vendor with this name
    already exists — search for it in the list above instead.") rather than closing.

**`frontend/src/pages/ReferenceDataManagement.tsx` (`VendorsTab`)**
- Add a "Pending Vendor Requests" section above the main vendor table, loaded via
  `vendorsService.getAll({ pendingApproval: true, limit: 5000 })`.
- Each row shows the submitted vendor fields plus `requestedByName` / `requestedByEmail`,
  with **Approve** and **Reject** actions (`vendorsService.approve`/`reject`, reload list on
  success; confirm before reject since it's a hard delete).
- Main vendor table/query is unchanged (still just active, approved vendors).

### 3.4 Configuration

Add to both `.env.example` (root) and `backend/.env.example`, documented the same way as
`PROVISIONING_ADMIN_EMAIL`:

```
# Comma-separated list of admin email(s) notified when a requisitioner submits a new
# vendor request via the PO wizard. If unset, requests are still created (pending
# approval) but no notification email is sent.
VENDOR_REQUEST_ADMIN_EMAIL=admin@ocboe.com
```

The user's actual `.env` value (e.g. their own address) is their responsibility to set —
not part of this change.

## 4. Implementation Steps

1. Edit `schema.prisma` (`vendors` model) + hand-write the migration SQL file (Section 3.1).
2. Backend: validators → controller (`requestNewVendor`, `approveVendorRequest`,
   `rejectVendorRequest`, updated `getVendors`) → routes → `email.service.ts`
   (`sendVendorRequestNotification`).
3. Frontend: `referenceDataService.ts` types/service methods → `RequisitionWizard.tsx`
   button + dialog + mutation → `ReferenceDataManagement.tsx` pending-queue section.
4. `.env.example` / `backend/.env.example` documentation for `VENDOR_REQUEST_ADMIN_EMAIL`.
5. Rebuild `shared` first only if shared types change (they don't here — `Vendor` is a
   frontend-local interface, not part of `@mgspe/shared-types`).

## 5. Dependencies

None new. Reuses `nodemailer`/`emailQueue.service.ts` (already installed and wired up),
existing Zod (`CreateVendorSchema`), existing Prisma client, existing MUI components
(`Dialog`, `TextField`, `Button`, `Alert`) already imported in the touched files.

## 6. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Vendor name uniqueness collision on request | Catch Prisma `P2002`, return `409` with a message pointing the user back to the search box. |
| Pending vendor accidentally visible to other requesters | `GET /vendors` defaults to `pendingApproval: false` unless the caller explicitly asks for the pending queue — the PO wizard's existing query is unaffected. |
| Requester's own PO breaks because their vendor is "not approved yet" | Not applicable — the vendor row is real and FK-valid the moment it's created; `pendingApproval` only affects list *filtering*, not referential integrity. The requester's PO detail view already does `vendors: true` (full include), unaffected by the new columns. |
| Admin never sees the email (delivery failure, unset env var) | Non-blocking by design (matches every other `send*` function in `email.service.ts`); mitigated further by the persistent pending-queue UI in Reference Data, which doesn't depend on email at all. |
| Reject endpoint used to delete a real, already-approved vendor by mistake | Guarded: `rejectVendorRequest` only hard-deletes when `pendingApproval === true`; otherwise `400`. |
| New Prisma columns break existing vendor rows/queries | All three columns are additive with safe defaults (`pendingApproval` defaults `false`, matching current behavior for every existing row); no backfill needed. |
| CSRF on new POST routes | Already covered — `referenceData.routes.ts` applies `validateCsrfToken` to the whole router. |

## 7. Open Items for Phase 2

- Exact wording/styling of the "pending" badge/section in `VendorsTab` (cosmetic — implementer's judgment, matching existing tab conventions).
- Whether `approveVendorRequest` should also let the admin edit fields in the same call, or
  require using the existing `updateVendor` PUT first and `approve` as a separate click.
  Recommendation: keep them separate (approve = one-click flip; edits go through the
  existing, already-built vendor edit dialog) — simplest option, no new form needed.
