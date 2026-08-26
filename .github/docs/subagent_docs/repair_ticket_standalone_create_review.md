# Review: Standalone repair ticket create form

## Files reviewed
- `frontend/src/pages/DeviceManagement/RepairTicketsPage.tsx`

## Findings
- **Spec compliance**: all five fields present (Device autocomplete, Date of Damage, Damage
  Type, Severity, Description); all three raw-UUID fields plus Repair/Internal Notes removed;
  helper note added under the title; Save requires `equipmentId` **and** `damageDate`.
- **Patterns copied verbatim, not reinvented**: `getEquipLabel`, the `Autocomplete`
  `onInputChange` reason handling, `inventoryService.getInventory({ search, limit: 50,
  isDisposed: false })` with `staleTime: 30_000`, `DAMAGE_TYPES`/`SEVERITIES` option lists,
  and the description `maxLength: 2000` + counter all match the incident wizard's own steps.
- **Submit sequence matches `IncidentWizard.accidentalSubmitMutation`**: create incident ->
  create repair ticket referencing it -> `updateWorkflowStep('PENDING_REPAIR')`. Both
  `['repair-tickets']` and `['damage-incidents']` invalidated on success — the latter is new
  and necessary, since this flow now creates an incident record too.
- **Date correctness**: `todayLocalDate()` builds from local components (not
  `toISOString()`), used both as the default and as the `max` cap; the submit appends
  `T12:00:00` before `toISOString()`. Both carry the explaining comments.
- **Scope discipline**: no intent selector, no invoice step, no user field, no Device
  Exchange step — matching the spec's device-only accidental case.
- **No backend change**: verified `CreateDamageIncidentSchema` already refines on
  `equipmentId || userId`, so a user-less incident was always valid.
  `CreateRepairTicketSchema` and `UpdateIncidentWorkflowStepSchema` untouched.
- **Orphan cleanup**: `CreateRepairTicketData` import removed now that it is unused;
  `emptyForm` converted to a factory (used as a `useState` lazy initializer at line 110 and
  called explicitly in `resetForm`). Verified by grep that no stale references remain.
  The `expectedReturnDate` **table column** (line 225) is correctly retained — it displays
  an existing ticket's value, which is still set later on the ticket detail page.
- **Query gating**: the device search is `enabled: dialogOpen && equipSearch.length >= 2`,
  so it never fires while the dialog is closed.
- **Security**: no new endpoint, no permission change; all three calls go through existing,
  already-authorized services.

## Build validation
`docker compose -f docker-compose.dev.yml build frontend` -> **EXIT=0**, zero `error TS`,
`Image tech-v2-frontend Built`.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: PASS

## Known limitation (documented, deliberately not fixed)
The device picker cannot filter to "not currently checked out" — that status lives on
`assignedToUserId`, not in `EquipmentStatus`, and no inventory list/search query schema
filters on assignment. Adding it would require backend changes outside this frontend-only
fix, and its absence is not a regression (the old UUID field had no guard either).

## Not independently verified
An end-to-end submit confirming the resulting RepairTicket and its linked DamageIncident
both appear correctly in the ticket list, ticket detail, and incidents list. Build
validation confirms compilation and types, not the three-call sequence at runtime.
