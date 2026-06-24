# Provisioning Page — UX Improvement Ideas (Current State)

Based on a full audit of `ProvisioningPage.tsx` as of 2026-06-24.
Items 1–4 and 9 from the prior version of this doc are already implemented
(tenant switcher, schedule editor, disable threshold, email lists, pause/enable toggle).
This document captures the remaining gaps in the current page.

---

## 1. Top-of-Page Status Banner

**Problem:** You land on the page with no quick summary of current state. To know whether sync is enabled, what mode you're in, and when it last ran, you have to read three separate cards spread across the full page.

**Proposal:** A compact status row directly under the page title:

```
● Sync Enabled   |  Test Mode (no writes)  |  Test Tenant  |  Last run: 47 min ago · 2 created · 0 errors
```

Color-coded: green for safe (test mode), amber for test tenant + live, red for production tenant + live mode. Clicking "Last run" jumps to the audit log.

---

## 2. Promote Test Mode Out of the Run Job Card

**Problem:** The Test Mode toggle sits inside the "Run Job" card as though it's just a run option. But it now controls the cron schedule too. The current placement implies "this applies to the next manual run only" and a user could set it for one run and forget it still affects all cron jobs.

**Proposal:** Move the toggle to a top-level card or the status banner, with a clear label like "Global Test Mode — controls manual and scheduled runs." The Run Job card can show the current effective mode as read-only context, but not host the toggle.

---

## 3. Mask Passwords in the Password Card

**Problem:** The Password Config card displays the actual password in plain text:
```tsx
{config?.staffPassword ?? 'Not configured'}
```
This is a plaintext credential rendered in the browser DOM, visible in DevTools and screenshots.

**Proposal:** Show `••••••••` when a password is set, with an optional "reveal" eye icon for intentional display. The edit form already uses `type="password"` correctly — the read state should match.

---

## 4. Confirm Dialog for "Reject" on Pending Disable Batches

**Problem:** Approving a disable batch has a confirmation dialog. Rejecting does not — but rejecting is also a permanent action: the batch is deleted and those accounts remain enabled until they re-appear in a future run.

**Proposal:** Add a simple confirm dialog for Reject: *"Reject this batch? These X accounts will not be disabled. They will appear again in the next provisioning run if they are still absent from the SIS."*

---

## 5. Humanize Audit Log Action Labels

**Problem:** Action chips show raw enum strings (`DRY_RUN_CREATE`, `DISABLE_HELD`, `REENABLED`). These are readable to developers but cold for an admin checking whether provisioning is working.

**Proposal:** Map to plain-English labels in the chip. Keep the raw value in a tooltip.

| Raw value | Display label |
|---|---|
| `CREATED` | Created |
| `UPDATED` | Updated |
| `REENABLED` | Re-enabled |
| `DISABLED` | Disabled |
| `DISABLE_HELD` | Held for Approval |
| `FAILED` | Failed |
| `SKIPPED` | Skipped |
| `DRY_RUN_CREATE` | Would Create |
| `DRY_RUN_UPDATE` | Would Update |
| `DRY_RUN_DISABLE` | Would Disable |

---

## 6. Show Last Run Info on the Schedule Card

**Problem:** The Schedule card shows "Next scheduled run" but nothing about the last run. You have to scroll to the audit log to know if the most recent cron job succeeded.

**Proposal:** Add a "Last run" line below "Next scheduled run":
- `Last run: Jun 24 at 2:00 AM · 2 created · 0 errors · 18s`
- Or on failure: `Last run: Jun 24 at 2:00 AM · FAILED — see audit log`

The cron service already tracks `lastRunAt`, `lastRunDurationMs`, and `lastError` in memory on the `jobState` map. Surfacing those through the existing jobs/status API (or the config endpoint) would be low effort.

---

## 7. Remove or Explain the `TEST MODE ENV` Chip

**Problem:** The Run Job card shows a `TEST MODE ENV` chip when `testModeEnv` is true. Most admins won't know what this means. Since test mode is now DB-driven, the env var no longer controls runtime behavior — it only sets the seed default when the config row is first created.

**Proposal:** Remove the chip entirely. If keeping it for operator debugging, replace it with an info icon and tooltip: *"The PROVISIONING_TEST_MODE environment variable is set. It seeded the initial Test Mode value but has no further effect — use the toggle above to change the current setting."*

---

## 8. Smarter Save Schedule Button

**Problem:** The "Save Schedule" button is always active even when nothing has been changed from the saved value. Clicking it saves the same value back unnecessarily and gives no feedback that there's a pending change.

**Proposal:** Track whether the current UI selection differs from `config.syncSchedule`. Only enable Save when there is an actual pending change. When no change is pending, show the button as disabled or label it "No changes."

---

## 9. Collapse Rarely-Changed Config Cards

**Problem:** Password Config and Domain Config sit at the same visual weight as the Run Job card and audit log, but most admins will configure them once and never touch them again. They add scroll length without providing value on routine visits.

**Proposal:** Wrap these two cards (and optionally Tenant Switcher) in MUI `Accordion` components that start collapsed, with a one-line summary in the header:
- **Passwords:** `Staff: configured  ·  Student: configured`
- **UPN Domains:** `ocboe.com (staff)  ·  ocboe.com (student)`
- **Target Tenant:** `TEST TENANT`

---

## 10. Card Order Rethink

**Current order:**
Tenant Switcher → Run Job → Schedule → Safety → Pending Batches → Passwords → Domains → Audit Log

**Proposed order (most-used first):**
1. Status Banner *(new, see #1)*
2. Pending Disable Batches *(urgent — should be at top when present; invisible when not)*
3. Run Job
4. Audit Log
5. Schedule & Safety *(occasional changes)*
6. Configuration — collapsed accordion *(passwords, domains, tenant — set once)*

---

## 11. Clarify "Test Mode vs Test Tenant" Interaction

**Problem:** Two separate "test" concepts exist on different cards with no explanation of how they combine. An admin could wonder: "If I'm in test mode, why does the tenant selection matter?"

**Proposal:** A short callout blurb connecting the two, either as helper text on the Tenant Switcher card or as a tooltip on the mode toggle:

> *"Test Mode controls whether Entra writes happen (dry run). Test Tenant controls which Entra directory Graph reads from. You can combine them: a dry run against the test tenant simulates provisioning against test-tenant data without writing anything to either tenant."*

---

## 12. Disable Batch History

**Problem:** Once a batch is approved or rejected it disappears from the page. There is no way to see what was previously held and resolved. Useful for spotting patterns (e.g., the threshold fires every month-end because of roster changes).

**Proposal:** A collapsed "Batch History" section below the pending card — a table of the last 10 resolved batches: date, user type, account count, triggered by, resolved by, outcome (APPROVED / REJECTED).

---

## 13. Audit Log Search

**Problem:** As the log grows, finding a specific user or a specific run window requires paging through everything.

**Proposal:** A search field above the table that filters by UPN or employee ID. Either pass the value as a query param to the existing `GET /provisioning/audit` endpoint (adding an optional `search` param to the backend) or filter the current page client-side for a lower-effort version.

---

## Priority Summary

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 3 | Mask passwords | High (security) | Low |
| 4 | Confirm Reject dialog | High (safety) | Low |
| 2 | Promote Test Mode toggle | High | Low |
| 7 | Remove/fix TEST MODE ENV chip | Medium | Low |
| 5 | Humanize audit action labels | Medium | Low |
| 8 | Smarter Save Schedule button | Medium | Low |
| 1 | Status banner | High | Medium |
| 6 | Last run info on Schedule card | Medium | Medium |
| 9 | Collapse rarely-changed cards | Medium | Low |
| 10 | Card order rethink | Medium | Low |
| 11 | Clarify test mode vs tenant | Medium | Low |
| 12 | Disable batch history | Medium | Medium |
| 13 | Audit log search | Medium | High |
