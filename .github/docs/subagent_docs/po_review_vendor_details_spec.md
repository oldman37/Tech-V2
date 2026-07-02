# PO Wizard Review Step — Show Full Vendor Details — Spec

Status: DRAFT (Phase 1)
Feature: Follow-up to `po_new_vendor_request_spec.md`. Step 3 ("Review") of the PO
requisition wizard currently shows only the vendor's name; the user wants the full
vendor contact/address details shown there too, for every PO (not just new-vendor
requests).

## 1. Current State

`RequisitionWizard.tsx` Step 3 (`activeStep === 2`, ~line 883-925) renders a summary grid
with Vendor, Ship To, Department/School/Program, and Notes. The Vendor cell
(~line 889-892) only renders:

```tsx
<Typography variant="caption" color="text.secondary">Vendor</Typography>
<Typography>{selectedVendor?.name ?? '—'}</Typography>
```

Step 1 ("Details") already has a fuller vendor-details box (~line 622-661) that
conditionally renders `selectedVendor.address`, city/state/zip, `phone`, `fax`,
`contactName`, `email` — all already available on the same `selectedVendor` state used
by Step 3. No new data fetching is needed; this is a display-only addition reusing state
that already exists in the component.

## 2. Change

Replace the Step 3 Vendor cell's single `<Typography>{selectedVendor?.name}</Typography>`
with the name plus the same conditional detail lines Step 1 already shows (address,
city/state/zip, phone, fax, contact name, email) — styled as compact
`variant="caption" color="text.secondary"` lines, matching the convention already used on
the saved PO detail page (`PurchaseOrderDetail.tsx` lines 473-492) for the same purpose.

This applies uniformly to every vendor (existing or newly requested) since it just reads
whatever fields are populated on `selectedVendor`.

## 3. Implementation

Single file: `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`, Step 3 Vendor
cell only. No backend, schema, or dependency changes.

## 4. Risks

None — read-only rendering of data already loaded into component state. No new
permissions, no new endpoints, no migration.

## 5. Verification

- `docker compose -f docker-compose.dev.yml build frontend` (tsc + vite build) must pass.
- Manual check: fields present on the vendor show; fields absent (null) are simply
  omitted, matching the existing Step 1 / PO detail page convention.
