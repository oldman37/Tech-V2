# SYNC_DISABLE_LABEL — Spec

## Problem

The "Pause Sync" / "Resume Sync" button labels imply a temporary suspension, which
understates the effect. When paused, the cron task is fully cancelled and no automatic
runs occur — functionally identical to "disabled." Users expect a clearer "Disable /
Enable" label.

## Solution

Rename three label strings in `ScheduleEditorCard` in
`frontend/src/pages/admin/ProvisioningPage.tsx`:

| Location | Before | After |
|---|---|---|
| Status chip label | `'Paused'` | `'Disabled'` |
| Toggle button text | `'Pause Sync'` | `'Disable Sync'` |
| Toggle button text (off state) | `'Resume Sync'` | `'Enable Sync'` |

No behaviour changes. No backend changes. No new dependencies.

## Files Changed

- `frontend/src/pages/admin/ProvisioningPage.tsx`

## Build command

```powershell
docker compose -f docker-compose.dev.yml build frontend
```
