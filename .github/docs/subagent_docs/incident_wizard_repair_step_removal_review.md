# Incident Wizard — Remove "Send to Repair" Step Review

## Scope Reviewed

- `frontend/src/components/incidents/IncidentWizard.tsx`
- `frontend/src/pages/DeviceManagement/wizard/wizardSchemas.ts`
- `frontend/src/pages/DeviceManagement/wizard/WizardStep3aRepair.tsx` (deleted)

Reviewed against `.github/docs/subagent_docs/incident_wizard_repair_step_removal_spec.md`.

## Findings

### Specification Compliance

- Accidental branch is now 3 steps (`Link & Date`, `Damage Details`, `Device Exchange`);
  intentional branch unchanged at 4 steps — matches spec.
- `accidentalSubmitMutation` no longer sends `vendorId`/`expectedReturnDate`/`repairNotes` and no
  longer calls `updateStatus('sent_to_vendor')`; repair ticket is created with only
  `{ equipmentId, damageIncidentId }`, defaulting to Prisma's `status: "pending"` — matches spec.
- `getInitialStep` is now intent-aware (`deviceExchangeStep = intent === 'intentional' ? 3 : 2`) —
  verified against all six reachable `workflowStep` values for both intents.
- 3+ incident consultation gate (`thresholdWarning`) is preserved: hoisted to component scope,
  rendered under Damage Details for the accidental branch (gating the new Submit button) and left
  in its original spot for the intentional branch (gating "Submit & Create Invoice", unchanged).
- `WizardStep3aRepair.tsx` deleted; `Step3aRepairSchema`/`Step3aValues` removed from
  `wizardSchemas.ts`; confirmed via repo-wide grep that no other file referenced either.
- No backend, Prisma, or shared-type changes — matches spec (frontend-only).

### Best Practices / Consistency

- New code follows the file's existing patterns: TanStack Query mutations, `dispatch`/reducer
  state shape, Zod-driven step validation, MUI component usage. No new abstractions introduced.
- Removed dead `vendorInfo` derived variable that was orphaned by deleting the only component that
  consumed it (surgical-changes requirement: only remove what the change itself orphaned).

### Functionality / Completeness

- Traced both mutation success paths (`accidentalSubmitMutation` → step 2 = Device Exchange;
  `intentionalSubmitMutation` → invoice dialog → `workflowMutation` → step 3 = Device Exchange).
- Traced resume path (`getInitialStep`) for an incident reopened from the incidents list at each
  `workflowStep` value, for both `intent` values.
- Traced the "3+ incidents" gate rendering and button-disabled logic for both branches; the
  underlying `incidentSummary` query, `notifyAdminMutation`, and rate-limiting logic in
  `userService`/backend are untouched.

### Security

- No new endpoints, no changes to authorization middleware, no change to what data crosses the
  request boundary other than *removing* fields (`vendorId`, `expectedReturnDate`, `repairNotes`)
  from the create-repair-ticket call — strictly a reduction in payload, not an expansion. No
  concern.

### Performance

- No new queries or N+1 patterns introduced; one fewer network call per accidental submission
  (`updateStatus` call removed).

### Build Validation

Command run (per spec's approved list):

```
docker compose -f docker-compose.dev.yml build frontend
```

Result: **SUCCESS**. `tsc && vite build` completed with no type errors
(`✓ built in 2.34s`, image `tech-v2-frontend` built). No warnings related to the changed files
(the only build warnings — chunk size and a dynamic/static import overlap for `api.ts` — are
pre-existing and unrelated to this change).

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

## Result (initial)

**PASS** — proceeded to Phase 6 Preflight.

## Addendum: live-testing bug found and fixed

During live dev-server testing (post-preflight), the accidental branch was found to skip Device
Exchange entirely: `accidentalSubmitMutation`'s `onSuccess` called `onCreated?.(incident)`
immediately after creating the incident, and `IncidentWizardPage.tsx` wires `onCreated` to
`navigate('/incidents/${incident.id}')` — unmounting the wizard before Device Exchange ever
rendered. This call existed at the same point in the pre-change code too (not introduced by this
refactor), but was never reached/noticed because it required completing the accidental flow all
the way through what used to be a 4th step.

**Fix**: removed the premature `onCreated?.(incident)` call from `accidentalSubmitMutation`'s
`onSuccess` (`IncidentWizard.tsx`). `onCreated` now fires exactly once, from
`WizardStep4DeviceExchange`'s `onFinish` — matching the intentional branch's existing behavior.
Query-cache invalidation in that same handler is untouched.

Verified live by the user after redeploying the frontend container: creating an accidental
incident now correctly lands on Device Exchange (check-in/check-out panels, device search) instead
of navigating away.

**Separately fixed** (infrastructure, discovered during this investigation, not part of the
original spec but blocking safe re-validation): `scripts/preflight.ps1`'s cleanup step ran
`docker compose --profile test down`, which — because `down` also matches default-profile
services — stopped and removed the persistent `backend`/`frontend`/`db` dev containers alongside
the test-only ones, on every preflight run. Named volumes were preserved (`down` without `-v`
doesn't touch them), so no data was lost, but it repeatedly disrupted live testing. Fixed by
scoping cleanup to `docker compose --profile test rm -f -s db-test` (`backend-test` already
self-removes via `run --rm`). Verified: persistent container start timestamps were identical
before and after a subsequent preflight run.

## Final Build Validation

- `docker compose -f docker-compose.dev.yml build frontend` — SUCCESS (validates the `onCreated`
  fix compiles cleanly).
- `scripts/preflight.ps1` (corrected) — SUCCESS: backend image build, frontend image build, and 38
  backend tests across 6 files all passed, exit code 0. Persistent dev containers confirmed
  untouched.

## Result (final)

**PASS** — ready for Phase 7.
