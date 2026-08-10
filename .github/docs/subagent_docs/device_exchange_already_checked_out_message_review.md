# Review: Surface "already checked out" errors on the Device Exchange checkout step

## Scope Reviewed

`frontend/src/pages/DeviceManagement/wizard/WizardStep4DeviceExchange.tsx` — the only file
modified.

## Specification Compliance

Matches the spec exactly: added a local `getApiErrorMessage` helper identical in shape to
the one already used in `EditAssignmentDialog.tsx`, `AssignChargerDialog.tsx`,
`QuickFixDialog.tsx`, `EditCartDialog.tsx`, and `ReturnCartItemDialog.tsx`, and used it in
`exchangeMutation.onError` to surface the backend's real message, falling back to the
original generic sentence when none is available. ✅

## Best Practices / Consistency

- Follows the codebase's established per-file `getApiErrorMessage` convention rather than
  introducing a new shared utility — consistent with 5 other components in the same
  directory doing the same thing independently. ✅
- No new dependencies, no version-sensitive API usage. ✅

## Maintainability

Small, self-contained change (12 lines added/changed). Readable, matches surrounding style
(same helper signature as siblings). ✅

## Completeness

All checkout entry points identified in Phase 1 research were checked; this was the only
one that swallowed the backend error message. No other files required changes:

- `CheckoutScanPage.tsx` / `CheckoutForm.tsx` — already correct (proactive route-around +
  reactive message surfacing).
- `BulkCheckoutPage.tsx` — already correct (proactive scan-first check).
- `QuickCheckPage.tsx` — already correct (proactive alert + hidden submit button).
- `CartAssignmentWizardPage.tsx` — already correct as of the same-day `api.ts` interceptor
  fix (commit `2978a5e`) that rewrites `err.message` to the backend body.
- `RoomCheckoutPage.tsx` — not applicable (no per-user checkout concept).

## Performance

No change — same single mutation call, no additional requests introduced. ✅

## Security

No change to auth, CSRF, or data exposure. The surfaced message is the same message the
backend already sends and that every other checkout page in this app already displays
verbatim (device status/condition/asset tag/assignee name — no Entra IDs or raw Graph
payloads involved). ✅

## API Currency

No external library API used beyond the existing Axios error shape (`error.response.data`)
already relied on throughout this codebase. ✅

## Build Validation

Command run (approved in spec, no FORBIDDEN COMMANDS, no database interaction):

```
docker compose -f docker-compose.dev.yml build frontend
```

Result: **SUCCESS**. `tsc && vite build` completed with no type errors; only pre-existing,
unrelated warnings (chunk-size warning, dynamic-import-vs-static-import note for
`api.ts` — both present before this change and orthogonal to it). Image built and exported
successfully.

## Score Table

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

## Result

**PASS** — no refinement cycle needed.
