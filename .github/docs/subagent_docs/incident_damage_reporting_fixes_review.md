# Review — Incident & damage-reporting fixes (3 bugs)

Date: 2026-10-28. Spec: `incident_damage_reporting_fixes_spec.md`. Single-agent self-review.

**Result: PASS**: no CRITICAL issues; no refinement cycle needed.

## Files reviewed (15)

Backend: `validators/damageIncident.validators.ts`, `services/damageIncident.service.ts`.
Frontend: `pages/incidents/IncidentsPage.tsx`, `pages/DeviceManagement/wizard/WizardStep4DeviceExchange.tsx`,
`pages/DeviceManagement/QuickCheckPage.tsx`, `components/inventory/EquipmentDetailDrawer.tsx`,
`components/inventory/InventoryFormDialog.tsx`, `components/DeviceManagement/{CheckoutForm,EditAssignmentDialog,CartMetadataForm,ReturnCartDialog,ReturnCartItemDialog}.tsx`,
`pages/DeviceManagement/{BulkCheckinPage,BulkCheckoutPage,CartAssignmentWizardPage}.tsx`.

## Findings

**Spec compliance.** All three bugs implemented as specified. Bug 1 where clause is additive (empty
search ⇒ identical query); `count` shares `where`. Bug 2 uses the exact Quick Check lookup and
shared dialog. Bug 3 removes every create-path `Damaged` option; the three edit forms guard on the
loaded record (`assignment.checkoutCondition`, `cart.checkoutCondition`, `item?.status`).

**Orphans.** Grep confirms no remaining `createDamageIncident` / `shouldCreateIncident` / `Checkbox` /
`FormControlLabel` in QuickCheckPage; `WarningAmberIcon`, `Alert`, `navigate` still used there. No
`navigate`/`useNavigate` left in the drawer. All create-form defaults are `'good'`, never `'damaged'`.

**Remaining selectable `Damaged`** (all intentional): `CheckinForm` (sanctioned path), wizard Device
Exchange step, `EquipmentSearch` filters, and the three legacy-guarded edit forms.

**Security.** No new routes, permissions or middleware; `search` is length-capped and only reaches
Prisma `contains` (parameterized). Bug 2 lookup is advisory; backend `DEVICE_IN_REPAIR` guard
remains the enforcement.

**Performance.** `contains` on joined `equipment`/`users` sequential-scans; acceptable at current
scale. Bug 2 adds one small request per Complete Exchange with a replacement device.

**Consistency.** Debounce copied from `CheckedOutCartsPage.tsx`; search clause style from
`repairTicket.service.ts` (`as const` added because the literals sit inside a `.map` callback).

## Report-only findings (not fixed)

- **`pages/DeviceManagement/InvoicesPage.tsx:195`** has the same defect as Bug 1: paginated
  `['invoices', query]` fetch, then client-side `.filter()` on `search`.
- **Wizard picker unreachability:** replacement search filters `status: 'active'`, while sending a
  ticket to the vendor sets equipment to `in_repair`, so most out-for-repair devices won't appear in
  the picker and the new dialog only fires for devices whose status wasn't flipped.
- Bulk check-in can no longer record a damaged return; drawer branch depends on an async
  assignment lookup; out-for-repair lookup now copy-pasted in four places (hook extraction is a
  candidate follow-up); no changelog/version bump.

## Build validation

`scripts/preflight.ps1` run (first attempt aborted before compiling: the review harness wrapped it in
a PowerShell `*>&1` redirect, which under the script's `$ErrorActionPreference='Stop'` turned
docker's stderr progress into a terminating `NativeCommandError`. Re-run via
`powershell.exe -File scripts/preflight.ps1` with no in-process redirect):

```
==> Preflight 1/4: mobile table card-view guard
==> Preflight 2/4: backend image build (shared + prisma generate + backend tsc)
 Image tech-v2-backend Built
==> Preflight 3/4: frontend image build (tsc + vite build)
 ✓ built in 1.88s
 ✓ built in 846ms
 Image tech-v2-frontend Built
==> Preflight 4/4: backend integration tests (vitest run inside Docker)
 Test Files  14 passed (14)
      Tests  82 passed (82)
==> Cleaning up test-only containers (db-test)
All preflight checks passed.
EXIT=0
```

Not verified: behaviour in a browser (requires redeploying the containers, which is the user's call).

## Scores

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 95% | A |
| Functionality | 95% | A |
| Code Quality | 95% | A |
| Security | 100% | A |
| Performance | 90% | A- |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (97%)**

---

## Follow-up review — spec addendum items A–F

**Result: PASS.** Self-review of the changes made per the spec addendum.

- **A. Invoices.** `search` added to `ListInvoicesQuerySchema`; `invoice.service.ts` `getAll` uses the
  same AND-of-ORs shape as incidents over the five fields the old client filter used; empty search ⇒
  unchanged `where`. Page now sends `page`/`limit`, which also fixes pagination that previously never
  reached the request. Both mobile and desktop inputs use the debounced handler; client
  `.filter()` removed. Query key prefix `['invoices', …]` unchanged, so existing invalidations hold.
- **B. Picker.** Unchanged by user decision.
- **C. Bulk check-in.** Report Damage navigates to the same URL + `returnTo` state shape as the
  Checkouts page's Create Incident; `IncidentWizardPage` validates `returnTo` (must start with `/`,
  not `//`). Session log resets on return (page remounts). Expected, noted in spec.
- **D. Drawer.** Report Damage disabled while `assignmentsLoading`.
- **E. Shared lookup.** `repairTicketService.getActiveTicket` typed via `api.get<RepairTicketsResponse>`;
  grep confirms no remaining inline `sent_to_vendor` lookups in the four checkout paths.
- **F. Version.** 1.9.10 in all four `package.json`; lock files carry no workspace version (grep).
  Changelog entry keyed to `__APP_VERSION__` (from `frontend/package.json`). Note: `WhatsNewDialog`
  auto-opens only on a minor/major bump, so this patch release won't pop the dialog for users who
  already saw 1.9.x.

### Build validation

```
==> Preflight 1/4: mobile table card-view guard
==> Preflight 2/4: backend image build (shared + prisma generate + backend tsc)
 Image tech-v2-backend Built
==> Preflight 3/4: frontend image build (tsc + vite build)
 ✓ built in 1.38s
 ✓ built in 513ms
 Image tech-v2-frontend Built
==> Preflight 4/4: backend integration tests (vitest run inside Docker)
 Test Files  14 passed (14)
      Tests  82 passed (82)
==> Cleaning up test-only containers (db-test)
All preflight checks passed.
EXIT=0
```

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 95% | A |
| Functionality | 95% | A |
| Code Quality | 95% | A |
| Security | 100% | A |
| Performance | 90% | A- |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (97%)**
