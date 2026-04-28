# User Sync Progress UI — Specification

## 1. Current State

### Exact API Endpoints for Manual Sync

| Method | Path | Handler |
|--------|------|---------|
| POST | `/admin/sync-users/all` | Calls `syncService.syncAllUsers()` — fetches ALL enabled Entra users |
| POST | `/admin/sync-users/staff` | Calls `syncService.syncGroupUsers(ENTRA_ALL_STAFF_GROUP_ID)` |
| POST | `/admin/sync-users/students` | Calls `syncService.syncGroupUsers(ENTRA_ALL_STUDENTS_GROUP_ID)` |
| POST | `/admin/sync-users/group/:groupId` | Calls `syncService.syncGroupUsers(groupId)` |
| GET | `/admin/sync-status` | Returns DB-aggregate status (see below) |

All routes are prefixed under the Express router mounted at `/admin`. All require `authenticate` + `requireAdmin` middleware.

### Current SyncResult Response Shape

```typescript
// What the POST /sync-users/* endpoints currently return:
{
  success: boolean;   // always true on happy path
  message: string;    // e.g. "Synced 312 users from Entra ID"
  count: number;      // users.length from the returned array
}
```

The frontend `SyncResult` interface in `adminService.ts` matches exactly.

**Critical gap:** The backend `syncAllUsers()` and `syncGroupUsers()` methods silently catch
per-user errors in a `try/catch` inside their for-loops and `loggers.userSync.error(...)` them —
they do NOT count errors, and the HTTP response never surfaces how many users failed.
The service returns only the successfully synced users array; failures are invisible to the caller.

### Is Sync Synchronous or Fire-and-Forget?

**Fully synchronous.** The route handlers do:

```typescript
const users = await syncService.syncAllUsers();   // blocks until every user is done
res.json({ success: true, message: `Synced ${users.length} users`, count: users.length });
```

The HTTP response is only sent AFTER all users have been processed. The sync is NOT queued,
NOT background-jobbed, and NOT streamed.

### How Long Does Sync Actually Run?

This is the core performance problem. For `syncAllUsers()`:

1. One paginated Graph API call to fetch all enabled user IDs (`/users?$filter=accountEnabled eq true`)
2. For **each** user, two additional sequential Graph API calls:
   - `GET /users/{entraId}` — profile fields (displayName, mail, jobTitle, officeLocation, etc.)
   - `GET /users/{entraId}/transitiveMemberOf` — group memberships (nested)
3. One DB `upsert` per user (Prisma transaction with permission sync inside)
4. One final DB `updateMany` to deactivate stale users

For an organization with, say, 300 staff + 500 students = 800 users, that is 1,600 Graph API
calls made serially (no concurrency — plain `for` loop). At ~150ms avg per Graph call, that
is roughly **4+ minutes** of wall-clock time before the HTTP response is sent. For larger
orgs this could exceed Node.js/reverse-proxy TCP timeout limits (typically 60–120s).

`syncGroupUsers()` (staff or students only) is the same pattern but scoped to one group,
so it is proportionally shorter but still serial Graph calls per member.

### Metrics/Counts Tracked During Sync

Currently tracked (in logger only, not in response):
- `totalUsers` / `memberCount` — group member count at start
- `syncedUsers` — count of successful individual syncs
- `failedUsers` — `allUsers.length - syncedUsers.length` (computed at end, logged only)
- `deactivatedCount` — bulk deactivation count (logged only)
- `duration` — ms elapsed (logged at end)

**Not in HTTP response at all:** error count, deactivated count, failed user IDs, duration.

### Current User Feedback

```typescript
// Users.tsx handleSync()
mutation.mutate(undefined, {
  onSuccess: (data) => {
    alert(data.message);   // e.g. native browser alert: "Synced 312 users from Entra ID"
  },
  onError: (error: any) => {
    alert(error.response?.data?.message || 'Sync failed. ...');
  },
});
```

- A native `window.alert()` dialog — blocks the browser tab
- The sync button is `disabled` during the mutation's pending state (only feedback while running)
- No progress bar, no live counter, no status text, no error breakdown

### getSyncStatus Endpoint — What It Returns

`GET /admin/sync-status` queries the local DB (no Graph API calls) and returns:

```typescript
{
  totalUsers: number;           // prisma.user.count()
  activeUsers: number;          // prisma.user.count({ where: { isActive: true } })
  lastSyncedAt: Date | null;    // most recent user.lastSync
  lastSyncedUser: string | null;// email of that user
  roleBreakdown: Array<{
    role: string;               // 'ADMIN' | 'USER'
    count: number;
  }>;
  groupsConfigured: {           // 16 boolean flags — one per ENTRA_*_GROUP_ID env var
    admin: boolean;
    technologyDirector: boolean;
    directorOfSchools: boolean;
    financeDirector: boolean;
    spedDirector: boolean;
    maintenanceDirector: boolean;
    transportationDirector: boolean;
    afterschoolDirector: boolean;
    nurseDirector: boolean;
    supervisorsOfInstruction: boolean;
    foodServicesSupervisor: boolean;
    financePOEntry: boolean;
    principals: boolean;
    vicePrincipals: boolean;
    allStaff: boolean;
    allStudents: boolean;
  };
}
```

Note: The frontend `SyncStatus` interface in `adminService.ts` only declares 8 of these 16
boolean flags under `groupsConfigured` — the interface is stale/partial relative to the
actual backend response.

---

## 2. All Files Involved

### Backend files to modify

| Path | Role |
|------|------|
| `C:\Tech-V2\backend\src\services\userSync.service.ts` | Core sync logic — `syncAllUsers()`, `syncGroupUsers()`, `syncUser()` |
| `C:\Tech-V2\backend\src\routes\admin.routes.ts` | Route handlers for all `/admin/sync-users/*` endpoints |

### Frontend files to modify

| Path | Role |
|------|------|
| `C:\Tech-V2\frontend\src\services\adminService.ts` | `SyncResult` interface + sync API call functions |
| `C:\Tech-V2\frontend\src\pages\Users.tsx` | `handleSync()` callback; replaces `alert()` with dialog trigger |

### Frontend files to create (new)

| Path | Role |
|------|------|
| `C:\Tech-V2\frontend\src\components\admin\SyncResultDialog.tsx` | New dialog component displaying sync results table |

### Frontend files likely involved (query/hook layer)

| Path | Role |
|------|------|
| `C:\Tech-V2\frontend\src\hooks\mutations\useAdminMutations.ts` | TanStack mutation hooks (`useSyncAllUsers`, etc.) — no change needed unless `SyncResult` type widens |
| `C:\Tech-V2\frontend\src\hooks\queries\useAdmin.ts` | `useSyncStatus` query — no change needed |

---

## 3. Recommended Approach

### Decision: Single-Response with Enhanced Payload + Result Dialog

**Chosen approach: (b) Single-Response** — enhance the sync endpoints to return a richer
result object that includes counts of added, updated, errors, and deactivated users in a
single HTTP response, then display it in a modal dialog after the mutation resolves.

### Justification

**Why not SSE (option c):**
SSE requires a persistent HTTP connection and streaming infrastructure. The existing Express
app has no SSE routes. TanStack Query's `useMutation` does not natively support streaming
responses — integrating SSE would require bypassing the mutation layer entirely, using
`useEffect` + `EventSource` manually, plus a new `/admin/sync-users/all/stream` route.
This is significant scope for a feature that may only be used occasionally by admins.

**Why not Polling (option a):**
Polling via `/admin/sync-status` would require the sync to run in a true background job
(e.g., a worker thread, BullMQ queue, or detached async task) so the HTTP POST returns
immediately with a job ID. The current architecture has no job queue. The sync writes
`user.lastSync` per user, so polling `getSyncStatus` would show `lastSyncedAt` advancing,
but it cannot provide error counts, per-user state, or a definitive completion signal
without a job registry. This adds the most backend complexity.

**Why Single-Response works:**
The main concern with Single-Response is timeout. For `syncAllUsers()` on a large org this
is a real risk. The fix is to add a server-side timeout guard (e.g., process chunks with
periodic yields) OR simply document that admins should prefer the scoped syncs (staff-only
or student-only) which are much faster. The response is already awaited — no architecture
change is needed, only enriching the return payload. TanStack `useMutation.onSuccess(data)`
already receives the full response, making the dialog trivial to wire up.

The tradeoff: if a sync takes >2 minutes and the client disconnects or the proxy times out,
the operation still completes on the server (it just orphans the response). The admin can
check `/admin/sync-status` afterward to confirm. This is acceptable given the low frequency
of manual syncs.

---

## 4. Backend Changes Needed

### 4.1 `C:\Tech-V2\backend\src\services\userSync.service.ts`

**Change:** Modify `syncAllUsers()` and `syncGroupUsers()` to return a structured result
object instead of a raw user array. Track added, updated, errors, and deactivated counts
during iteration.

**New return type interface (define in this file and export):**

```typescript
export interface SyncOperationResult {
  added: number;          // users created (upsert hit the create branch)
  updated: number;        // users updated (upsert hit the update branch)
  errors: number;         // per-user sync attempts that threw
  deactivated: number;    // DB users deactivated because absent from Entra list (syncAllUsers only)
  totalProcessed: number; // total Entra users iterated (excluding pre-skipped disabled)
  durationMs: number;     // wall-clock ms for the entire operation
  failedEntraIds: string[]; // redacted partial list of entraIds that errored (max 20)
}
```

**How to detect add vs update:** Currently `prisma.user.upsert()` does not return whether it
created or updated. Change the upsert to a two-step: `findUnique` first, then `create` or
`update`. If `findUnique` returns null → added; else → updated. Alternatively, check
`user._count` or compare against a pre-fetched ID set. The simplest approach: before the
loop, fetch a `Set<string>` of existing `entraId` values from the DB
(`prisma.user.findMany({ select: { entraId: true } })`), then check membership per user.

**Changes to `syncAllUsers()`:**
- Before the user loop: fetch existing entraId set from DB
- In the loop: catch errors → increment `errors`, push redacted ID to `failedEntraIds` (cap at 20)
- Track `added` and `updated` using the pre-fetched set
- After the deactivation `updateMany`: capture `deactivated.count`
- Return `SyncOperationResult` instead of `any[]`

**Changes to `syncGroupUsers(groupId)`:**
- Same error tracking, added/updated tracking
- No deactivation step (group syncs don't deactivate)
- Return `SyncOperationResult`

**`syncUser()` change:** Make it return an object `{ user, isNew: boolean }` so callers can
count adds vs updates without a separate DB query.

### 4.2 `C:\Tech-V2\backend\src\routes\admin.routes.ts`

**Change:** Update all three sync route handlers to use the new `SyncOperationResult` return
type and return the full detail in the HTTP response.

**New HTTP response shape for `POST /admin/sync-users/*`:**

```typescript
export interface SyncResultResponse {
  success: boolean;
  message: string;              // human-readable summary (kept for backward compat)
  count: number;                // total synced (added + updated) — kept for backward compat
  detail: {
    added: number;
    updated: number;
    errors: number;
    deactivated: number;        // 0 for staff/students/group syncs
    totalProcessed: number;
    durationMs: number;
    failedEntraIds: string[];   // redacted, max 20 entries
  };
}
```

**Example updated handler for `POST /admin/sync-users/all`:**

```typescript
router.post('/sync-users/all', async (req: Request, res: Response) => {
  try {
    const graphClient = await createGraphClient();
    const syncService = new UserSyncService(prisma, graphClient);
    const result = await syncService.syncAllUsers();  // now returns SyncOperationResult

    res.json({
      success: true,
      message: `Synced ${result.added + result.updated} users (${result.added} added, ${result.updated} updated, ${result.errors} errors, ${result.deactivated} deactivated)`,
      count: result.added + result.updated,
      detail: result,
    });
  } catch (error: any) {
    loggers.admin.error('Sync all users failed', { error });
    res.status(500).json({ error: 'Sync failed', message: error.message });
  }
});
```

Apply the same pattern to `POST /admin/sync-users/staff`, `POST /admin/sync-users/students`,
and `POST /admin/sync-users/group/:groupId`.

---

## 5. Frontend Changes Needed

### 5.1 `C:\Tech-V2\frontend\src\services\adminService.ts`

**Change:** Update `SyncResult` interface to include the new `detail` field. Keep `success`,
`message`, and `count` for backward compatibility.

```typescript
export interface SyncResultDetail {
  added: number;
  updated: number;
  errors: number;
  deactivated: number;
  totalProcessed: number;
  durationMs: number;
  failedEntraIds: string[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  count: number;
  detail?: SyncResultDetail;    // optional — safe if backend not yet updated
}
```

Also update `SyncStatus.groupsConfigured` to reflect the actual 16 boolean fields the
backend already returns (add: `technologyDirector`, `financeDirector`, `spedDirector`,
`maintenanceDirector`, `transportationDirector`, `afterschoolDirector`, `nurseDirector`,
`supervisorsOfInstruction`, `foodServicesSupervisor`, `financePOEntry`, `vicePrincipals`).

### 5.2 `C:\Tech-V2\frontend\src\pages\Users.tsx`

**Changes:**
1. Add state for the result dialog:
   ```typescript
   const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
   const [syncResultOpen, setSyncResultOpen] = useState(false);
   const [syncResultType, setSyncResultType] = useState<'all' | 'staff' | 'students'>('all');
   ```

2. Replace `alert(data.message)` in `handleSync()` with dialog trigger:
   ```typescript
   const handleSync = (syncType: 'all' | 'staff' | 'students') => {
     const mutation = syncType === 'all' ? syncAllMutation
       : syncType === 'staff' ? syncStaffMutation
       : syncStudentMutation;

     setSyncResultType(syncType);
     mutation.mutate(undefined, {
       onSuccess: (data) => {
         setSyncResult(data);
         setSyncResultOpen(true);
       },
       onError: (error: any) => {
         setSyncResult({
           success: false,
           message: error.response?.data?.message || 'Sync failed. Please check if group IDs are configured.',
           count: 0,
         });
         setSyncResultOpen(true);
       },
     });
   };
   ```

3. Add the `<SyncResultDialog>` component below the existing sync button panel JSX:
   ```tsx
   <SyncResultDialog
     open={syncResultOpen}
     result={syncResult}
     syncType={syncResultType}
     onClose={() => setSyncResultOpen(false)}
   />
   ```

4. Add a loading indicator inside the sync card while a mutation is pending (add alongside
   existing `disabled` button logic):
   ```tsx
   {(syncAllMutation.isPending || syncStaffMutation.isPending || syncStudentMutation.isPending) && (
     <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', color: 'var(--slate-500)', fontSize: '0.875rem' }}>
       <span className="spinner-sm" />
       Syncing users from Entra ID, please wait…
     </div>
   )}
   ```

### 5.3 New Component: `C:\Tech-V2\frontend\src\components\admin\SyncResultDialog.tsx`

**Component design: Dialog (modal)**

Rationale: The existing codebase uses the same inline-CSS card/modal pattern as seen in
`PermissionModal` and `SupervisorModal` in `Users.tsx` — a fixed-position overlay with a
centered card and a close button. No MUI is used in this project; all UI is custom CSS
classes (`card`, `btn`, `badge`, `badge-success`, `badge-error`). A dialog fits this
pattern and avoids a Drawer's navigation-association semantics. The result is a one-time
display after completion, not an ongoing sidebar.

**Full component:**

```tsx
import React from 'react';
import { SyncResult } from '../../services/adminService';

interface SyncResultDialogProps {
  open: boolean;
  result: SyncResult | null;
  syncType: 'all' | 'staff' | 'students';
  onClose: () => void;
}

const syncTypeLabel: Record<'all' | 'staff' | 'students', string> = {
  all:      'Full Entra Sync',
  staff:    'Staff Sync',
  students: 'Student Sync',
};

export const SyncResultDialog: React.FC<SyncResultDialogProps> = ({
  open, result, syncType, onClose,
}) => {
  if (!open || !result) return null;

  const d = result.detail;
  const durationSec = d ? (d.durationMs / 1000).toFixed(1) : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '480px', maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>
            {syncTypeLabel[syncType]} — {result.success ? 'Complete' : 'Failed'}
          </h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Status badge */}
        <div style={{ marginBottom: '1rem' }}>
          <span className={`badge ${result.success ? 'badge-success' : 'badge-error'}`}>
            {result.success ? 'Success' : 'Error'}
          </span>
          {durationSec && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: 'var(--slate-500)' }}>
              Completed in {durationSec}s
            </span>
          )}
        </div>

        {/* Summary message */}
        <p style={{ marginBottom: '1rem', color: 'var(--slate-700)' }}>{result.message}</p>

        {/* Detail counts table — only shown when backend returns detail */}
        {d && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <tbody>
              {[
                { label: 'Users Added',          value: d.added,          variant: d.added > 0 ? 'badge-success' : null },
                { label: 'Users Updated',         value: d.updated,        variant: null },
                { label: 'Errors',               value: d.errors,         variant: d.errors > 0 ? 'badge-error' : null },
                { label: 'Deactivated',           value: d.deactivated,    variant: d.deactivated > 0 ? 'badge-error' : null },
                { label: 'Total Processed',       value: d.totalProcessed, variant: null },
              ].map(({ label, value, variant }) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--slate-200)' }}>
                  <td style={{ padding: '0.5rem 0', color: 'var(--slate-600)', fontSize: '0.875rem' }}>{label}</td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                    {variant
                      ? <span className={`badge ${variant}`}>{value}</span>
                      : <strong>{value}</strong>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Failed user IDs (if any) */}
        {d && d.failedEntraIds && d.failedEntraIds.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>
              Failed Entra IDs (first {d.failedEntraIds.length}, redacted):
            </p>
            <div style={{
              background: 'var(--slate-100)',
              borderRadius: '4px',
              padding: '0.5rem',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              maxHeight: '120px',
              overflowY: 'auto',
              color: 'var(--slate-600)',
            }}>
              {d.failedEntraIds.map((id, i) => <div key={i}>{id}</div>)}
            </div>
          </div>
        )}

        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SyncResultDialog;
```

**What the dialog shows:**
- Header: sync type label + success/failure
- Status badge (badge-success / badge-error) + duration in seconds
- Human-readable summary message (backward-compatible with pre-detail response)
- Counts table: Added / Updated / Errors / Deactivated / Total Processed
- Collapsible list of failed Entra IDs (redacted by backend, max 20)
- Close button

---

## 6. Implementation Steps

1. **Backend — `userSync.service.ts`:**
   Define and export the `SyncOperationResult` interface near the top of the file.

2. **Backend — `userSync.service.ts`:**
   Modify `syncUser()` to return `{ user: any; isNew: boolean }` by checking
   whether the record existed before upsert (pre-fetch `findUnique` or check against
   pre-built Set).

3. **Backend — `userSync.service.ts`:**
   Refactor `syncAllUsers()`:
   - Pre-fetch all existing `entraId` values into a `Set<string>`
   - Replace `users.push(user)` with tracking of `added`/`updated`/`errors`/`failedEntraIds`
   - Capture `deactivated.count` from the final `updateMany`
   - Return `SyncOperationResult` (remove the `any[]` return type)

4. **Backend — `userSync.service.ts`:**
   Refactor `syncGroupUsers()` with the same error/add/update tracking; return
   `SyncOperationResult` (no deactivation step for group syncs — `deactivated: 0`).

5. **Backend — `admin.routes.ts`:**
   Update `POST /admin/sync-users/all` handler to use `SyncOperationResult`, build the
   richer `SyncResultResponse`, and respond with `detail` included.

6. **Backend — `admin.routes.ts`:**
   Apply the same response shape to `POST /admin/sync-users/staff`,
   `POST /admin/sync-users/students`, and `POST /admin/sync-users/group/:groupId`.

7. **Frontend — `adminService.ts`:**
   Add `SyncResultDetail` interface and update `SyncResult` to include `detail?`.
   Update `SyncStatus.groupsConfigured` to declare all 16 boolean flags the backend
   already returns.

8. **Frontend — Create `SyncResultDialog.tsx`:**
   Create `C:\Tech-V2\frontend\src\components\admin\SyncResultDialog.tsx` with the
   full component body from Section 5.3.

9. **Frontend — `Users.tsx`:**
   Add the three new state variables: `syncResult`, `syncResultOpen`, `syncResultType`.

10. **Frontend — `Users.tsx`:**
    Replace the `alert(data.message)` and `alert(error...)` calls in `handleSync()`
    with `setSyncResult` + `setSyncResultOpen(true)` for both success and error paths.

11. **Frontend — `Users.tsx`:**
    Import `SyncResultDialog` and render it inside the component return, below the
    existing sync panel card.

12. **Frontend — `Users.tsx`:**
    Add pending-state loading text inside the sync card while any sync mutation
    `isPending` is true.

13. **Manual QA:** Test all three sync types (all / staff / students). Verify:
    - Dialog opens on success with correct counts
    - Dialog opens on error with failure message
    - `deactivated` only shows non-zero for "all" syncs
    - Duration rounds to one decimal second
    - Dialog closes on background click and Close button
    - Sync button re-enables after mutation settles

14. **Optional follow-up:** If sync timeout is observed in production (full org sync > 60s),
    add a server-sent timeout guard in `syncAllUsers()` or migrate to a background job
    (BullMQ) with a polling endpoint. This is out of scope for this iteration.

---

## 7. Security Considerations

### Authentication and Authorization

- All `/admin/sync-*` endpoints already apply both `authenticate` (JWT/session check) and
  `requireAdmin` (role === 'ADMIN' check) middleware via `router.use()` at the top of
  `admin.routes.ts`. No changes needed here.
- The new `SyncResultDialog` is frontend-only and carries no auth surface.
- The enhanced `SyncResultResponse.detail.failedEntraIds` field returns **redacted** Entra
  Object IDs (handled by `redactEntraId()` already used throughout the service). Ensure
  the route handlers pass IDs through `redactEntraId()` before populating `failedEntraIds`.

### Data Exposure Concerns

- `failedEntraIds` in the response should always be passed through `redactEntraId()` to
  avoid leaking full Entra Object IDs to the browser layer. The existing utility already
  masks these for logging; apply the same to the HTTP response.
- The `SyncResultResponse` does not expose email addresses, display names, or passwords.
  `count`, `added`, `updated`, `errors`, `deactivated` are aggregate integers — safe.
- `durationMs` exposes internal timing. Acceptable for admin-only endpoints; not a
  meaningful timing-attack vector for this use case.
- The frontend dialog is only rendered inside the admin-gated `/users` page (the component
  confirms `currentUser.roles.includes('ADMIN')` and redirects otherwise).

### Rate Limiting Considerations

- Manual sync endpoints make a large number of Microsoft Graph API calls. Microsoft Graph
  enforces throttling at the tenant level. If throttled, Graph returns HTTP 429.
  The current `syncUser()` does not handle 429 with retry/backoff — it throws and the
  error is counted. A follow-up improvement would add exponential backoff with jitter for
  Graph 429 responses.
- There is no rate limiting on the `/admin/sync-users/*` endpoints themselves. An admin
  could trigger multiple concurrent full syncs (e.g., double-clicking), which would
  multiply Graph API calls. Mitigation: disable sync buttons client-side while any
  mutation `isPending` (already done for the triggering button; extend to all three sync
  buttons while any one is pending).
- Consider adding a server-side debounce guard (e.g., check `lastSyncedAt` and reject
  if a sync completed within the last 60 seconds) to prevent accidental rapid re-triggers.
