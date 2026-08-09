# Review: Barcode scanner drops characters in URL-backed search boxes

## Spec compliance

Matches `.github/docs/subagent_docs/SCANNER_DROPPED_CHARACTERS_spec.md` exactly:
`<BrowserRouter useTransitions={false}>` in `frontend/src/App.tsx`, with an
explanatory `//` comment block above the `App` function (not a JSX comment).
No other files touched.

## Best practices / consistency / maintainability

- Single-line, minimal-diff fix at the one place the router is configured —
  consistent with "surgical changes" principle; no adjacent code touched.
- Comment explains the failure mode, the strict `=== false` semantics, and the
  precondition (no lazy routes/Suspense) under which it's safe — protects
  against a future contributor removing the flag as a "stray prop".
- No new abstraction, no config flag, no speculative generality — matches
  Simplicity First.

## Completeness

All 20 `useFilterParams`-backed pages in this repo are fixed by this one
change (broader blast radius than the 11-page source repo, confirmed via
grep in Phase 1). No page-level changes needed or made.

## Performance

None — this returns router commits to their pre-v7-default synchronous
scheduling; no new work added, no regression surface.

## Security

None applicable — no auth, authorization, or data-boundary code touched.

## API currency

`useTransitions` verified against `package-lock.json`'s resolved
`react-router-dom` version (7.17.0, matching `^7.12.0` in `package.json`) via
the lock file, not just the version range. The frontend `tsc` build compiling
successfully against the installed type definitions is the authoritative
proof the prop exists at the installed version — see Build Validation below.

## Build validation

Commands run (both approved in the Phase 1 spec; no FORBIDDEN COMMANDS used):

```
docker compose -f docker-compose.dev.yml build frontend
```
Result: **pass**. `tsc && vite build` succeeded, 13016 modules transformed,
zero type errors. This is the meaningful check — `tsc` accepting
`useTransitions` on the installed `react-router-dom` types confirms the prop
exists at the resolved version, not just on `main`.

```
scripts/preflight.ps1
```
Result: **pass, exit code 0**. Backend image build succeeded; frontend image
build succeeded; backend test suite: 7 files, 47/47 tests passed. No test
targets this change specifically — as the spec noted, the defect depends on
real inter-event timing that jsdom cannot reproduce, so no automated test
was added or fabricated to claim coverage it doesn't have.

## Score table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | N/A | — |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Returns

- **PASS** — no refinement needed.
- Build result: preflight exit code 0 (backend build ✓, frontend build ✓,
  47/47 backend tests ✓).

## Verification still needed (manual, outside this workflow)

This fix cannot be proven by compile or automated test — it concerns *when*
React commits a state update under real hardware timing. Manual verification:
scan a multi-character asset tag into a `useFilterParams`-backed search box
(e.g. Active Checkouts) and confirm every character lands. Flagging this per
CLAUDE.md's requirement to report outcomes faithfully rather than overstate
what compile/test success actually proves.
