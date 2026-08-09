# Review: Bump to v1.8.0

## Files Reviewed
- `backend/package.json`, `frontend/package.json`, `shared/package.json` — version fields
- `frontend/src/changelog.ts` — new entry

## Compliance
- All three workspace `package.json` versions bumped `1.7.5` → `1.8.0`; root
  `package.json` correctly left untouched, matching the established convention
  (verified against the `1.7.5` and `1.7.0` release precedents).
- New `1.8.0` changelog entry prepended above the `1.7.5` entry, with a `highlights`
  array (icon/title/body, matching the `1.7.0`/`1.7.5` format) for the three new
  features built this session (Quick Fix, edit/delete work order posts, move device
  between carts), and a `changes` list covering those plus the admin toggle, and the
  four bug fixes (scanner dropped characters, back-to-top overlap, Active Checkouts
  column squeezing, cart move/return leaving a stale record) — past-tense, user-facing
  style consistent with existing entries.
- Minor (not patch) bump is correct: `WhatsNewDialog.tsx`'s `isFeatureRelease` check
  triggers the popup on any major/minor increase, and this release ships three new
  user-facing features, not just fixes.
- `backend/src/services/userProvision.service.ts`'s uncommitted ELL/country-attribute
  changes were deliberately excluded from the changelog entry, per prior session notes
  that the feature is blocked on a missing SIS export column and not ready to announce.

## Build Validation

```
scripts/preflight.ps1:
1/2 backend build   → PASS (shared build log confirms "@mgspe/shared-types@1.8.0")
2/2 frontend build  → PASS
backend tests       → PASS (7 files, 47 tests)
All preflight checks passed. Exit code 0.
```

## Result: **APPROVED**
