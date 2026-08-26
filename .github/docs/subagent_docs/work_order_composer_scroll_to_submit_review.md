# Review: Composer scrolls to submit button instead of status options

## Files reviewed
- `frontend/src/pages/WorkOrderDetailPage.tsx`

## Findings
- **Spec compliance**: the scroll target moved from the status-options `Box` to the
  composer's Cancel/submit row. `block: 'nearest'` and `behavior: 'smooth'` retained.
- **No dead code**: `statusFieldRef` is fully gone - `grep` returns zero hits. The renamed
  `composerSubmitRef` appears exactly three times (declaration, effect read, ref attachment),
  confirming a single attachment point.
- **Surgical**: the diff is the ref declaration, the effect body, one removed `ref=` and one
  added `ref=`. No chips, handlers, submit logic, `composerLabel`, `composerDisabled`, or
  styling touched. The status-fields `Box` keeps its identical `sx`.
- **Scope preserved**: still gated on `activeAction === 'status'`. Change Priority, Assign To
  and Request Input behave exactly as before - they never triggered this scroll.
- **Desktop safety**: `block: 'nearest'` is a no-op when the target is already fully visible,
  which is why this effect needs no viewport guard - the same reason the original had none.
- **Correct target availability**: the submit row renders unconditionally for every composer
  mode, so the ref is always attached when the effect fires; the effect runs after the DOM
  commits the newly expanded status fields, so the measured position is post-expansion.
- **Security / performance**: none - a single `scrollIntoView` on an existing effect.

## Build validation
`docker compose -f docker-compose.dev.yml build frontend` -> **EXIT=0**,
`grep -c "error TS"` = 0, `Image tech-v2-frontend Built`.
`frontend/tsconfig.json` sets `noUnusedLocals`, so an orphaned ref variable would have
failed this build.

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

## Not independently verified
The actual scroll position on a real mobile viewport. `tsc`/`vite build` confirm compilation,
not runtime scroll behaviour - this one is worth a quick check on a phone, since how much of
the status chip row stays visible depends on the device's viewport height.
