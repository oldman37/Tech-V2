# Spec — Incident & damage-reporting fixes (3 bugs)

Date: 2026-10-28. Source: three bug reports attached to the session
(`Bug_incidents-list-search-server-side.md`, `Bug_incident-wizard-out-for-repair-prompt.md`,
`Bug_single-source-damage-reporting.md`). Verified against this working tree (master @ 18de7fe,
clean): **none of the three fixes are present.**

## Research note

No new dependencies. Every change reuses a pattern already in this repo, so per the
Dependency & Documentation Policy no external doc verification is required:

| Pattern | In-repo source copied |
|---|---|
| Prisma `contains` + `mode: 'insensitive'` OR-search | `backend/src/services/repairTicket.service.ts` `getAll` |
| URL-seeded 300 ms debounced search + page reset | `frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx` |
| Out-for-repair lookup + shared dialog | `frontend/src/pages/DeviceManagement/QuickCheckPage.tsx` + `DeviceOutForRepairDialog` |

---

## Bug 1 — Incidents search only matches the loaded page

**Current state.** `IncidentsPage.tsx` fetches `{ page, pageSize }` and `.filter()`s the 25 rows in
the browser. `ListIncidentsQuerySchema` has no `search`; `damageIncident.service.ts` `getAll` builds
`where` from status/severity/equipmentId/userId/intent/workflowStep only. The controller casts
`req.query` (doesn't consume parsed output), so Zod transforms are inert.

**Change.**
1. Validator: `search: z.string().max(100).optional()` (no `.trim()`: it would be inert, see above).
2. Service `getAll`: split `search` on whitespace, drop empties; when ≥1 token add
   `AND: tokens.map(t => ({ OR: [incidentNumber, equipment.assetTag, user.firstName, user.lastName] }))`
   with `contains` / `mode: 'insensitive'`. Absent/blank search ⇒ identical `where` to today.
   `count` already shares `where`.
3. Page: add debounced copy seeded from the URL value, put it in the query key (still under
   `['damage-incidents', 'list', …]`), send `search: debouncedSearch.trim() || undefined`, delete the
   client `.filter()`, reset `page` to `'0'` on change.

`equipment` and `user` are nullable relations; a relation filter on a null relation simply doesn't
match, which is the correct OR behaviour.

## Bug 2 — Incident wizard doesn't prompt when replacement device is out for repair

**Current state.** `WizardStep4DeviceExchange.tsx` submits the exchange directly. Backend already
throws `DEVICE_IN_REPAIR` (`damageIncident.service.ts:614`), so the user only sees a red banner.

**Change (frontend only, one file).** Make `handleCompleteExchange` async: after validation, when a
replacement is being checked out, call
`repairTicketService.getAll({ equipmentId, status: 'sent_to_vendor', limit: 1 })` (same query as
Quick Check). Ticket found ⇒ show `DeviceOutForRepairDialog`; Mark Returned ⇒ run exchange; Cancel ⇒
close. Lookup error ⇒ fall through (backend still enforces). `isBusy` includes the lookup.

**Report-only:** the replacement picker filters `status: 'active'`; sending a ticket to the vendor
sets equipment to `in_repair`, so most such devices may not appear in the picker at all.

## Bug 3 — Single source of truth for damage reporting

Rule: checked-out device ⇒ Create Incident on the Checkouts page; not checked out ⇒ Report Damage in
the inventory drawer (repair ticket). Frontend only; backend keeps accepting `damaged`.

| File | Change |
|---|---|
| `pages/DeviceManagement/QuickCheckPage.tsx` | Remove `Damaged` from both condition selects; remove `createDamageIncident` state/reset/payload, `shouldCreateIncident` summary field + alert; drop `Checkbox`/`FormControlLabel` imports if orphaned. Keep charger-invoice flow. |
| `components/inventory/EquipmentDetailDrawer.tsx` | Active-checkout branch opens an info dialog ("This device is checked out — report damage from the Checkouts page.") instead of navigating; remove `useNavigate`/`navigate` if orphaned. Update header comment accordingly. |
| `CheckoutForm`, `BulkCheckinPage`, `BulkCheckoutPage`, `ReturnCartDialog`, `ReturnCartItemDialog`, `CartAssignmentWizardPage` | Delete the `Damaged` option (create-only forms). |
| `EditAssignmentDialog`, `CartMetadataForm`, `InventoryFormDialog` (Status) | Keep the option in the source list; filter at render so `damaged` shows only when the **loaded record** (`assignment.checkoutCondition`, `cart.checkoutCondition`, `item?.status`) is `damaged`. Guarding on the loaded record, not current state, lets a user switch away and back. Zod enum unchanged. |

**Leave alone:** `CheckinForm` (sanctioned path), wizard Device Exchange step + `wizardSchemas`,
`EquipmentSearch` filters, `ConditionChip` and display-only uses.

---

## Configuration / schema

None. No Prisma schema change, no migration, no env vars, no new routes (auth/CSRF unaffected).

## Validation commands (approved)

- `scripts/preflight.ps1` — mobile-table guard, backend image build (shared tsc → prisma generate →
  backend tsc), frontend image build (tsc + vite build), backend vitest in the `backend-test`
  container against the isolated `db-test` database.
- Read-only greps for orphaned references.

## Risks

- `contains` on joined tables sequential-scans; fine at current scale.
- Bulk check-in can no longer record a damaged return — incident must be filed from Checkouts first.
- Drawer branch depends on the async assignment lookup; a click before it loads falls to the
  repair-ticket dialog (pre-existing behaviour).
- No changelog/version bump — release decision is the user's.

---

## Addendum — follow-up items (user decisions 2026-10-28)

User asked to fix the "found but not fixed" items. Decisions taken via question:
picker → **leave as-is**; bulk check-in → **Report Damage link into the prefilled wizard**;
version → **bump to 1.9.10**.

### A. Invoices page — client-side search + cosmetic pagination
`InvoicesPage.tsx` sends only `status`/`overdueOnly`; `page`/`rows` never reach the request, so
paging always shows the newest 25 and search filters only those. Fix mirrors Bug 1:
- `ListInvoicesQuerySchema`: `search: z.string().max(100).optional()`.
- `invoice.service.ts` `getAll`: AND-of-ORs over `invoiceNumber`, `recipientEmail`, `recipientName`,
  `user.firstName`, `user.lastName` (fields the old client filter used), `contains` /
  `mode: 'insensitive' as const`.
- Page: send `page: page + 1`, `limit: pageSize`, debounced `search`; key `['invoices', query]`
  (prefix unchanged). Both search inputs (mobile `MobileFilterBar`, desktop `TextField`) use the
  debounced handler; delete the client `.filter()`.

### B. Wizard picker — no change (user decision)
Stays `status: 'active'`; the out-for-repair dialog is a race guard only.

### C. Bulk check-in — Report Damage
Scan card gets a "Report Damage" button navigating to
`/incidents/new?equipmentId&userId&assignmentId&damageDate=<today local>` with
`state: { returnTo: '/device-management/checkouts/bulk-checkin' }`, i.e. exactly the Checkouts
page's Create Incident link. The wizard's exchange step performs the check-in. Session log resets on
return (page remounts), same as any navigation away.

### D. Drawer race
Disable the drawer's Report Damage button while the `['device', id, 'assignments']` query is
loading, so the checked-out decision is never made on an empty list.

### E. Shared out-for-repair lookup
Add `repairTicketService.getActiveTicket(equipmentId)` (the `sent_to_vendor`, `limit: 1`,
`items[0] ?? null` query) and use it at all four call sites (QuickCheck, CheckoutScan,
BulkCheckout, wizard). Per-page state is left alone: two sites are declarative (`useQuery` +
resolved flag) and two imperative, so a single hook would not fit both without reshaping them.

### F. Version 1.9.10
`version` in root, backend, frontend, shared `package.json` (lock file has no version entries for
these, verified by grep) + new `1.9.10` entry at the top of `frontend/src/changelog.ts` covering
both rounds of fixes.
