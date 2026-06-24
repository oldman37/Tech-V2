# Spec: Provisioning Page Low-Effort UX Improvements

**Date:** 2026-06-24
**File affected:** `frontend/src/pages/admin/ProvisioningPage.tsx` only
**Backend changes:** None
**New dependencies:** None (all MUI components already in the installed stack)

---

## Items in Scope

| # | Item |
|---|------|
| 2 | Promote Test Mode toggle to its own card (global scope) |
| 3 | Mask passwords — show •••••••• instead of plaintext |
| 4 | Confirm dialog before rejecting a disable batch |
| 5 | Humanize audit log action labels |
| 7 | Remove the confusing TEST MODE ENV chip |
| 8 | Disable "Save Schedule" button when no change is pending |
| 9 | Collapse rarely-changed config cards (passwords, domains) into Accordions |
| 10 | Reorder page cards |
| 11 | Add explanatory blurb connecting Test Mode and Test Tenant concepts |

---

## Architecture Notes

All changes are confined to `ProvisioningPage.tsx`. No API surface changes.
No new npm packages. Uses only MUI components already installed:
- `Accordion`, `AccordionSummary`, `AccordionDetails` — already in MUI v7
- `ExpandMoreIcon` — already in `@mui/icons-material`
- `Visibility`, `VisibilityOff` — already in `@mui/icons-material`
- `InputAdornment` — already in MUI v7

---

## Item 2 — Promote Test Mode Toggle

**Current:** `testMode` state + `saveTestModeMutation` + toggle JSX live inside `RunJobCard`.

**Change:**
- Extract into a new `TestModeCard` component rendered directly above `RunJobCard`.
- `TestModeCard` fetches config itself (same query key, cached), owns the toggle + mutation.
- Remove toggle, `saveTestModeMutation`, `handleTestModeChange`, and `initializedRef` from `RunJobCard`.
- `RunJobCard` reads `testMode` from `config.testMode` (already fetched there) as read-only; derives `isTestMode` from config for the alert display and passes it to `runMutation`.
- Card label: "Run Mode" with subtitle "Controls both manual and scheduled runs."
- The four-state alert (DRY RUN / LIVE → TEST / PRODUCTION) stays in `RunJobCard` as it is specific to running.

---

## Item 3 — Mask Passwords

**Current:** `PasswordConfigCard` displays `config?.staffPassword` and `config?.studentPassword` as plain text.

**Change:**
- Add `showStaffPw` and `showStudentPw` boolean state (default `false`).
- Replace plain `<Typography>` with:
  - `••••••••` when password is set and not revealed
  - Actual value when revealed
  - `Not configured` when not set (no reveal button)
- Add `<IconButton>` with `<VisibilityIcon>` / `<VisibilityOffIcon>` next to each password row.
- Import `Visibility`, `VisibilityOff` from `@mui/icons-material`.

---

## Item 4 — Confirm Dialog for Reject

**Current:** Reject button calls `rejectMutation.mutate(batch.id)` directly.

**Change:**
- Add `rejectConfirmId: string | null` state (default `null`).
- Reject button sets `rejectConfirmId = batch.id` instead of mutating.
- Add a `Dialog` (can be a single dialog outside the map loop, driven by `rejectConfirmId`):
  - Title: "Reject Disable Batch?"
  - Body: "These accounts will not be disabled. They will reappear in the next provisioning run if they are still absent from the SIS export."
  - Actions: Cancel + "Reject" (outlined, default color)
- On confirm: `rejectMutation.mutate(rejectConfirmId)` then clear state.

---

## Item 5 — Humanize Audit Action Labels

**Current:** `<Chip label={row.action} .../>` shows raw enum string.

**Change:**
- Add `actionLabel(action: string): string` function mapping raw → human label:

  | Raw | Label |
  |-----|-------|
  | CREATED | Created |
  | UPDATED | Updated |
  | REENABLED | Re-enabled |
  | DISABLED | Disabled |
  | DISABLE_HELD | Held for Approval |
  | FAILED | Failed |
  | SKIPPED | Skipped |
  | DRY_RUN_CREATE | Would Create |
  | DRY_RUN_UPDATE | Would Update |
  | DRY_RUN_DISABLE | Would Disable |
  | (default) | raw value |

- Wrap chip in `<Tooltip title={row.action}>` so raw value is still accessible.
- Change chip label to `actionLabel(row.action)`.

---

## Item 7 — Remove TEST MODE ENV Chip

**Current:** `RunJobCard` renders `{config?.testModeEnv && <Chip label="TEST MODE ENV" .../>}` in the card header.

**Change:** Remove the chip entirely. The testModeEnv value is now only relevant as the seed default when the config row is first created; the DB config value (controlled via the new TestModeCard) is authoritative at runtime.

---

## Item 8 — Smarter Save Schedule Button

**Current:** "Save Schedule" button is always enabled.

**Change:**
- Compute `hasPendingChange: boolean` in `ScheduleEditorCard`:
  - If `selectedOverride` is not null and differs from `presetLabel` → true
  - If `selectedOverride === 'Custom…'` (or current is custom) and `cronFieldValue` differs from `currentCron` → true
  - Otherwise false
- Disable the Save button when `!hasPendingChange && !updateMutation.isPending`.
- No label change needed.

---

## Item 9 — Collapse Rarely-Changed Cards

**Change:**
- Wrap `PasswordConfigCard` in an `Accordion` with summary showing password status.
- Wrap `DomainConfigCard` in an `Accordion` with summary showing current domains.
- `TenantSwitcherCard` stays as a full card (it's a safety-critical setting that should always be visible).
- Both accordions start collapsed (`defaultExpanded={false}`).
- Import `Accordion`, `AccordionSummary`, `AccordionDetails` from `@mui/material` and `ExpandMoreIcon` from `@mui/icons-material`.
- Accordion summaries are read-only and derived from the same config query (already cached).

---

## Item 10 — Reorder Cards

**New page order in `ProvisioningPage`:**
1. `TenantSwitcherCard`
2. `TestModeCard` *(new, extracted from RunJobCard)*
3. `RunJobCard`
4. `PendingDisablesCard`
5. `ScheduleEditorCard`
6. `SafetySettingsCard`
7. Passwords accordion
8. Domains accordion
9. `AuditLogSection`

---

## Item 11 — Clarify Test Mode vs Test Tenant

**Change:** Add a `<Typography variant="body2">` blurb to `TenantSwitcherCard` (below the existing description, above the Divider):

> "Test Mode (below) controls whether Entra writes happen. This setting controls *which* tenant is read from. Combined: a dry run against the test tenant simulates provisioning using test-tenant data without writing to either tenant."

---

## Build Commands

- `docker compose -f docker-compose.dev.yml build frontend` — validates tsc + vite build

## Success Criteria

- Frontend Docker image builds with exit 0
- All 9 items visually present and functionally correct
- No TypeScript errors introduced
