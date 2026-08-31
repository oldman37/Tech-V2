# Staff `department` = "Staff" — Review

## Spec Reference

`.github/docs/subagent_docs/STAFF_DEPARTMENT_STAFF_LABEL_spec.md`

## Files Reviewed

- `backend/src/services/userProvision.service.ts` (only file touched, as specced)

## Findings

1. **Spec Compliance** — both edits match the spec exactly: PASS 1 diff-and-patch,
   PASS 2 unconditional set. `employeeType` untouched, as required.
2. **Best Practices / Consistency** — identical shape to the adjacent `jobTitle` line
   in PASS 1 and the adjacent `employeeType`/`jobTitle` lines in PASS 2; no new
   abstractions for a two-line change.
3. **Completeness** — covers both the update path (existing staff accounts) and the
   create path (new staff accounts), so behavior is consistent regardless of when an
   account is first seen by the job.
4. **Security / Performance** — no new Graph calls, no new `$select` fields needed
   (`department` was already selected for both types), no new input surface.
5. **Risk** — confirmed low: user confirmed `department` is blank for staff today, and
   the live `staff.csv` has no department-shaped column that could conflict, unlike the
   `country`/ELL incident.
6. **Build** — `docker compose -f docker-compose.dev.yml build backend`: `tsc` compiled
   cleanly, image built successfully. **PASS.**

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

## Result: PASS — no refinement needed.
