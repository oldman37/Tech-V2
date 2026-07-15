# Field Trip Bus/Driver Daily Quota — Review

## Scope Reviewed

All files listed in the Phase 2 implementation, against `field_trip_bus_quota_spec.md`:

- `backend/prisma/schema.prisma` (+ migration `20260715130000_add_bus_quota_acknowledged`)
- `backend/src/validators/fieldTrip.validators.ts`
- `backend/src/services/fieldTrip.service.ts`
- `frontend/src/types/fieldTrip.types.ts`
- `frontend/src/components/FieldTripDatePicker.tsx`
- `frontend/src/components/DashboardFieldTripCalendar.tsx`
- `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`

## Findings

1. **Specification Compliance** — Matches the spec: `getDateCounts` scoped to `transportationNeeded: true`;
   new `isBusQuotaFull`/`checkBusQuota` helpers; hard block wired into both `submit()` and `resubmit()` with
   `excludeId` correctly applied only on the resubmit path (where the trip's own `NEEDS_REVISION` row already
   counts toward the day); calendar components no longer block clicking a full date; request form disables
   the "Yes" bus option and gates progression on the acknowledgment checkbox only when the date is actually
   at quota.
2. **Best Practices** — Day-span counting logic was factored into a single `accumulateDateCounts()` helper
   shared by `getDateCounts()` and `isBusQuotaFull()` instead of duplicating the loop, avoiding the drift risk
   the spec flagged. `ValidationError` reused consistently for both new rejection paths (bus-needed-on-full-day,
   and unacknowledged-alternate-transportation-on-full-day).
3. **Consistency** — The acknowledgment checkbox reuses the exact `FormControlLabel`/`Checkbox` convention now
   established three times in this codebase (`DeviceActionConfirmDialog.tsx`, the prior board-approval
   checkbox, and this one). The `eslint-disable-next-line react-hooks/exhaustive-deps` comment on the new
   auto-flip `useEffect` matches the existing convention already used elsewhere in this same file and three
   other frontend files.
4. **Maintainability** — `BUS_QUOTA_PER_DAY` is a single named constant on the backend; the frontend's
   `MAX_TRIPS_PER_DAY = 8` constants in the two calendar components remain the single source for the client
   display value (unchanged from before, still describes the same real limit — no magic-number drift
   introduced).
5. **Completeness** — Both original requirements are satisfied end-to-end:
   - Point 1 ("blocks scheduling that way"): the "Yes" radio is disabled once the selected date is at quota,
     and an explanatory `FormHelperText` is shown.
   - Point 2 ("click I am driving/other transportation"): a required checkbox appears exactly when
     `!transportationNeeded && isBusQuotaFull`, gating Next/Submit, and is independently re-enforced
     server-side in `submit()`/`resubmit()` — not just a client-side suggestion.
6. **Performance** — `isBusQuotaFull` issues one extra `findMany` per submit/resubmit call, filtered and
   indexed the same way as the existing `getDateCounts` query (`status`, and now `transportationNeeded` — both
   plain equality/`notIn` filters on indexed/scalar columns); negligible cost, no N+1 pattern.
7. **Security** — No new mutating routes; reuses the existing `submit`/`resubmit` endpoints already behind
   CSRF/auth middleware. No new user-controlled data reaches raw SQL or HTML — `busQuotaAcknowledged` is a
   plain boolean persisted via Prisma.
8. **API Currency** — No new external dependency; only in-repo Zod/Prisma/MUI/TanStack Query patterns already
   used throughout this exact file were touched.
9. **Build Validation:**

   Command: `docker compose -f docker-compose.dev.yml build backend`
   Result: **SUCCESS** — `tsc` compiled cleanly, `prisma generate` regenerated the client with
   `busQuotaAcknowledged` on `FieldTripRequest`, image built and exported.

   Command: `docker compose -f docker-compose.dev.yml build frontend`
   Result: **SUCCESS** — `tsc` compiled cleanly (new `busQuotaAcknowledged` field across
   `CreateFieldTripDto`/`FieldTripRequest`/`FormState`, new `useQuery`/`useEffect` in
   `FieldTripRequestPage.tsx`, and the calendar wording/logic changes all type-check), `vite build` succeeded.
   (Pre-existing bundle-size/dynamic-import warnings are unrelated to this change.)

## Notes (non-blocking)

- A small race window exists if two submissions for the same date land concurrently right at the boundary
  (both could pass the check before either commits). This is explicitly accepted in the spec's Risks section
  as consistent with the existing informal cap's behavior, and downstream human approval still catches
  over-quota days in practice.

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

## Result: PASS
