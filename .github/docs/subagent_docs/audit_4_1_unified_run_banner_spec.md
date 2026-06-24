# Spec: §4.1 — Unified Run Banner

**Feature name:** audit_4_1_unified_run_banner
**Severity:** 🟠 High
**Effort:** Small

---

## Current State

`RunJobCard` shows mode and tenant in two disconnected places:

1. `{!testMode && Alert severity="error"}` (lines 641–646) — only visible in live mode.
2. `{config && Stack}` with a `Typography caption` (lines 696–709) — small text below the
   controls showing the target tenant and a test-mode note.

The dangerous combination (live mode + production tenant) requires the user to mentally
combine two separate visual signals. The safe state (dry run + test tenant) shows only a
tiny caption.

## Four State Matrix

| Test Mode | Target Tenant | Risk | Desired signal |
|-----------|---------------|------|----------------|
| ON  | TEST        | None | `info`    — "DRY RUN → TEST tenant" |
| ON  | PRODUCTION  | Low  | `warning` — "DRY RUN → PRODUCTION tenant" |
| OFF | TEST        | Low  | `warning` — "LIVE → TEST tenant" |
| OFF | PRODUCTION  | HIGH | `error`   — "LIVE → PRODUCTION" |

## Proposed Solution

Replace both existing blocks with a single `Alert` placed right after the `<Divider />`.
The severity and message encode both signals at once. Only rendered once `config` has
loaded (avoids pop-in flash).

```tsx
{config && (() => {
  const isProd = config.targetTenant === 'PRODUCTION';
  if (!testMode && isProd)
    return <Alert severity="error" ...>
      LIVE → PRODUCTION — creates, updates, and disables real Entra accounts.
    </Alert>;
  if (!testMode && !isProd)
    return <Alert severity="warning" ...>
      LIVE → TEST tenant — changes written to the test Entra tenant.
    </Alert>;
  if (testMode && isProd)
    return <Alert severity="warning" ...>
      DRY RUN → PRODUCTION tenant — no writes, but Graph reads use production.
    </Alert>;
  return <Alert severity="info" ...>
    DRY RUN → TEST tenant — no changes will be made to Entra ID.
  </Alert>;
})()}
```

Remove:
- `{!testMode && <Alert severity="error">Live Mode is ON…</Alert>}` (lines 641–646)
- `{config && <Stack spacing={0.25}>…Typography captions…</Stack>}` (lines 696–709)

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/pages/admin/ProvisioningPage.tsx` | Replace two blocks with one unified `Alert` in `RunJobCard` |

## Build Commands

- `docker compose -f docker-compose.dev.yml build frontend`
