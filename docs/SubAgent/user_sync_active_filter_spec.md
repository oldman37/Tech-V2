# User Sync Active Filter Specification
**Date:** April 8, 2026  
**Purpose:** Modify the Entra ID user sync to only sync users with `accountEnabled: true`, and deactivate users locally when they are disabled in Azure.

---

## 1. Current Sync Architecture Overview

The Tech-V2 system syncs users from Microsoft Azure/Entra ID using the Microsoft Graph API. Sync occurs in two contexts:

| Context | Trigger | Method | Entry Point |
|---|---|---|---|
| At login | User authenticates via OAuth | `auth.controller.ts` callback handler | `/auth/callback` |
| Admin sync (all users) | Admin POST request | `UserSyncService.syncAllUsers()` | `POST /api/admin/sync-users/all` |
| Admin sync (group) | Admin POST request | `UserSyncService.syncGroupUsers(groupId)` | `POST /api/admin/sync-users/staff`, `/students`, `/group/:id` |
| Admin re-sync (single user) | Admin POST request | Inline in admin route | `POST /api/admin/resync-permissions/:userId` |
| Manual script | Run directly via CLI | `syncAllUsers()` (via script) | `backend/scripts/sync-all-users.ts` |

---

## 2. All Files Involved in the Sync Process

| File | Role |
|---|---|
| `backend/src/services/userSync.service.ts` | Core sync logic — `syncUser()`, `syncAllUsers()`, `syncGroupUsers()`, `syncPermissionsForUser()`, `getRoleFromGroups()` |
| `backend/src/controllers/auth.controller.ts` | Login callback that upserts the user — hardcodes `isActive: true` |
| `backend/src/routes/admin.routes.ts` | Admin sync endpoints: `/sync-users/all`, `/sync-users/staff`, `/sync-users/students`, `/sync-users/group/:id`, `/resync-permissions/:userId` |
| `backend/src/services/cronJobs.service.ts` | Cron scheduler — only runs supervisor sync (NOT user sync); no user sync cron currently exists |
| `backend/scripts/sync-all-users.ts` | CLI script that calls `UserSyncService.syncAllUsers()` directly |
| `backend/prisma/schema.prisma` | User model with `isActive` and `entraId` fields |
| `backend/src/config/entraId.ts` | MSAL client + Graph client initialization |
| `backend/.env` | Entra credentials and group IDs |

---

## 3. Current Graph API Calls and Parameters

### 3.1 `syncUser(entraId)` — Individual User Sync
```
GET /users/{entraId}
  ?$select=id,displayName,givenName,surname,mail,jobTitle,department,
           officeLocation,physicalDeliveryOfficeName,usageLocation,accountEnabled

GET /users/{entraId}/transitiveMemberOf
  (selects: id — for group membership)
```
- **`accountEnabled` is fetched** ✅  
- **`accountEnabled` is stored** as `isActive` in the DB ✅  
- **No filter applied on whether the user is enabled** — disabled users are fully synced (upserted with `isActive: false`)

### 3.2 `syncAllUsers()` — Bulk Sync All Org Users
```
GET /users
  ?$select=id
  &$filter=accountEnabled eq true
```
- **Already filters to active users** ✅ (line 617 of `userSync.service.ts`)
- Fetches ONLY user IDs for enabled users, then calls `syncUser()` for each
- **Gap:** Users who were previously synced and are now disabled in Entra are NOT deactivated — their `isActive` remains `true` in the DB indefinitely ❌
- **Technical note:** The `$filter=accountEnabled eq true` advanced filter technically requires `ConsistencyLevel: eventual` header and `$count=true` for guaranteed behavior in Graph API v1.0. The current implementation does not include these — it may work but is not following the documented requirement.

### 3.3 `syncGroupUsers(groupId)` — Sync by Entra Group
```
GET /groups/{groupId}/members
  (no filter parameters, no $select)
```
- **No `accountEnabled` filter** ❌
- Returns ALL group members including disabled users
- Each member is passed to `syncUser()` which correctly sets `isActive: false` for disabled users
- Wasteful: generates unnecessary Graph API calls and DB writes for disabled users

### 3.4 `auth.controller.ts` — Login Callback (at login)
```
GET https://graph.microsoft.com/v1.0/me
  ?$select=id,displayName,userPrincipalName,mail,givenName,surname,jobTitle,department
```
- **`accountEnabled` is NOT fetched** ❌
- User upserted with `isActive: true` **hardcoded** ❌
- Since Entra itself blocks authentication for disabled accounts, this path is effectively unreachable by disabled users in production. However, it is still incorrect to hardcode `isActive: true`.

### 3.5 `resync-permissions/:userId` (Admin Route)
```
GET /users/{entraId}/transitiveMemberOf
  ?$select=id,displayName
```
- Only fetches group memberships to resync permissions
- Updates `role` and `lastSync` but does NOT fetch `accountEnabled`
- Does NOT update `isActive` ❌

---

## 4. Current Active/Inactive User Handling

| Scenario | Current Behavior |
|---|---|
| User enabled in Entra, synced via `syncAllUsers()` | `isActive: true` ✅ |
| User disabled in Entra, synced via `syncAllUsers()` | Never fetched (filtered out by `$filter=accountEnabled eq true`) — but DB record stays `isActive: true` if previously synced ❌ |
| User disabled in Entra, synced via `syncGroupUsers()` | `syncUser()` called → `isActive: false` set correctly ✅ |
| User logs in | `isActive: true` hardcoded regardless of Entra state ❌ |
| Admin runs `resync-permissions/:userId` | `isActive` not touched ❌ |

---

## 5. Proposed Changes

### Change 1: `syncAllUsers()` — Add Deactivation Step (CRITICAL)

**File:** `backend/src/services/userSync.service.ts`  
**Method:** `syncAllUsers()`

After syncing all active users, mark any DB users whose `entraId` was NOT in the active list as `isActive: false`.

**Current code (lines 611–652):**
```typescript
async syncAllUsers(): Promise<any[]> {
  const startTime = Date.now();
  loggers.userSync.info('Starting full user sync');

  let allUsers: any[] = [];
  let nextLink = '/users?$select=id&$filter=accountEnabled eq true';
  
  while (nextLink) {
    const response = await this.graphClient.api(nextLink).get();
    allUsers = allUsers.concat(response.value);
    nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('/v1.0')[1] : null;
    ...
  }

  const syncedUsers = [];
  for (const user of allUsers) {
    try {
      const syncedUser = await this.syncUser(user.id);
      syncedUsers.push(syncedUser);
    } catch (error) { ... }
  }

  loggers.userSync.info('Full user sync completed', { ... });
  return syncedUsers;
}
```

**Proposed addition** — append AFTER the sync loop, before the final log:
```typescript
  // Deactivate users in DB who are no longer enabled in Entra
  const activeEntraIds = allUsers.map((u: any) => u.id);
  if (activeEntraIds.length > 0) {
    const deactivated = await this.prisma.user.updateMany({
      where: {
        entraId: { notIn: activeEntraIds },
        isActive: true,
      },
      data: { isActive: false },
    });
    if (deactivated.count > 0) {
      loggers.userSync.info('Deactivated users not present in Entra active list', {
        deactivatedCount: deactivated.count,
      });
    }
  }
```

**Why:** This closes the "ghost active user" gap where a user disabled in Entra retains `isActive: true` in the local DB. The deactivation only runs when `activeEntraIds.length > 0` as a safety guard (prevents wiping everyone if the Graph call returns empty due to API error).

---

### Change 2: `syncGroupUsers()` — Skip Disabled Users (OPTIONAL EFFICIENCY)

**File:** `backend/src/services/userSync.service.ts`  
**Method:** `syncGroupUsers(groupId)`

Add `$select=id,accountEnabled` to the group members query and skip users where `accountEnabled` is false.

**Current code (lines 576–582):**
```typescript
let nextLink = `/groups/${groupId}/members`;
while (nextLink) {
  const response = await this.graphClient.api(nextLink).get();
  members = members.concat(response.value);
  nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('/v1.0')[1] : null;
}
```

**Proposed change:**
```typescript
let nextLink = `/groups/${groupId}/members?$select=id,accountEnabled`;
while (nextLink) {
  const response = await this.graphClient.api(nextLink).get();
  members = members.concat(response.value);
  nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('/v1.0')[1] : null;
}
```

Then in the sync loop:
```typescript
for (const member of members) {
  if (member['@odata.type'] === '#microsoft.graph.user') {
    // Skip disabled users — avoids unnecessary Graph API calls and DB writes
    if (member.accountEnabled === false) {
      loggers.userSync.debug('Skipping disabled group member', {
        memberId: redactEntraId(member.id),
      });
      continue;
    }
    try {
      const user = await this.syncUser(member.id);
      users.push(user);
    } catch (error) { ... }
  }
}
```

**Why:** Prevents disabled group members from being synced, saving Graph API quota and DB write operations. Uses `accountEnabled === false` (strict check) rather than `!member.accountEnabled` to handle the case where `accountEnabled` is undefined/null (e.g., for guest objects that are group members).

**Note on Graph API filter:** Using `$select=id,accountEnabled` on the members endpoint is reliable. Applying `$filter=accountEnabled eq true` directly on `/groups/{groupId}/members` requires consistency-level headers and is less universally supported. The `$select` approach is simpler and more compatible.

---

### Change 3: `auth.controller.ts` — Fetch and Use `accountEnabled` at Login

**File:** `backend/src/controllers/auth.controller.ts`  
**Method:** `callback`

Update the `/me` select to include `accountEnabled`, and use it for `isActive` instead of hardcoding `true`.

**Current code (around line 90):**
```typescript
const userInfoResponse = await fetch(
  'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail,givenName,surname,jobTitle,department',
  { headers: { 'Authorization': `Bearer ${response.accessToken}` } }
);
```

**Proposed change:**
```typescript
const userInfoResponse = await fetch(
  'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail,givenName,surname,jobTitle,department,accountEnabled',
  { headers: { 'Authorization': `Bearer ${response.accessToken}` } }
);
```

Then in the upsert (around lines 163–180), replace `isActive: true` with `isActive: userInfo.accountEnabled ?? true`:
```typescript
update: {
  ...
  isActive: userInfo.accountEnabled ?? true,
  lastLogin: new Date(),
},
create: {
  ...
  isActive: userInfo.accountEnabled ?? true,
  lastLogin: new Date(),
},
```

Also update the `GraphUser` type in `backend/src/types/microsoft-graph.types.ts` to include `accountEnabled?: boolean` if not already present.

**Why:** Defense in depth. While Entra blocks disabled accounts from authenticating in production, this ensures the DB `isActive` field accurately reflects the actual Entra state at the moment of login rather than always being `true`.

---

### Change 4: `resync-permissions/:userId` — Update `isActive` During Resync

**File:** `backend/src/routes/admin.routes.ts`  
**Route:** `POST /resync-permissions/:userId`

When resyncing a single user's permissions, also fetch `accountEnabled` and update `isActive`.

**Current code (around line 220):**
```typescript
await prisma.user.update({
  where: { id: userId as string },
  data: { role: roleMapping.role, lastSync: new Date() },
});
```

**Proposed change:**
```typescript
// Fetch user's accountEnabled status
const userDetails = await graphClient
  .api(`/users/${user.entraId}`)
  .select('accountEnabled')
  .get();

await prisma.user.update({
  where: { id: userId as string },
  data: { 
    role: roleMapping.role, 
    isActive: userDetails.accountEnabled ?? true,
    lastSync: new Date() 
  },
});
```

---

### Change 5: Fix `ConsistencyLevel` Header for `syncAllUsers()` (RELIABILITY)

**File:** `backend/src/services/userSync.service.ts`  
**Method:** `syncAllUsers()`

The `$filter=accountEnabled eq true` query is an advanced filter and technically requires the `ConsistencyLevel: eventual` header and `$count=true` parameter per Microsoft Graph documentation. The current implementation works in many environments but is not guaranteed.

**Current code:**
```typescript
let nextLink = '/users?$select=id&$filter=accountEnabled eq true';
while (nextLink) {
  const response = await this.graphClient.api(nextLink).get();
```

**Proposed change:**
```typescript
let nextLink = '/users?$select=id&$filter=accountEnabled eq true&$count=true';
while (nextLink) {
  const response = await this.graphClient
    .api(nextLink)
    .header('ConsistencyLevel', 'eventual')
    .get();
```

---

## 6. Implementation Steps Summary

**Priority order (highest to lowest):**

| # | Change | File | Priority | Risk |
|---|---|---|---|---|
| 1 | Add deactivation step to `syncAllUsers()` | `userSync.service.ts` | HIGH | Low — only marks inactive users who are absent from active list |
| 2 | Add `ConsistencyLevel: eventual` header to `syncAllUsers()` | `userSync.service.ts` | MEDIUM | None — makes existing filter more reliable |
| 3 | Skip disabled users in `syncGroupUsers()` | `userSync.service.ts` | MEDIUM | Low — uses `=== false` check, fallback is existing behavior |
| 4 | Fetch `accountEnabled` at login in `auth.controller.ts` | `auth.controller.ts` | LOW | Low — defense in depth, Entra blocks disabled logins anyway |
| 5 | Update `isActive` in `resync-permissions/:userId` | `admin.routes.ts` | LOW | Low — adds one extra Graph call per manual resync |

---

## 7. Edge Cases

### 7.1 User Disabled After Being Synced
**Scenario:** Admin syncs group or all users, then a user is disabled in Entra two days later.  
**Current behavior:** User remains `isActive: true` in DB until re-synced.  
**After Change 1:** Next `syncAllUsers()` run will deactivate them. Group syncs will no longer update them (after Change 2), but the `syncAllUsers()` run covers deactivation for all cases.  
**Recommendation:** Schedule a periodic `syncAllUsers()` cron job (daily or nightly) to keep the DB in sync. Currently no user-sync cron exists — only supervisor sync runs nightly.

### 7.2 Guest Users / Service Accounts
**Scenario:** Some group members may be Azure B2B guest accounts (`#microsoft.graph.user` type but with `accountEnabled` potentially absent).  
**Mitigation:** Change 2 uses `accountEnabled === false` (strict equality), so guests where `accountEnabled` is `undefined` or `null` will still be synced. The `syncUser()` call will set `isActive: graphUser.accountEnabled ?? true` pattern handles this.

### 7.3 Deactivation Safety Guard
**Scenario:** `syncAllUsers()` runs but Graph API returns an empty or truncated result due to a transient error.  
**Mitigation (Change 1):** The deactivation only runs if `activeEntraIds.length > 0`. If the API returns zero users (which would be abnormal), no deactivation occurs. Consider adding an additional guard: `if (activeEntraIds.length < 10) { log warning; skip deactivation }` for extra safety.

### 7.4 Re-enabled Users
**Scenario:** A user is disabled in Entra, deactivated in DB, then re-enabled in Entra.  
**Behavior:** On next `syncAllUsers()` run, the user will appear in the active list and `syncUser()` will upsert them with `isActive: true`. ✅ No special handling needed.

### 7.5 Users Synced via Group But Not in Org Users List
**Scenario:** A user is a guest or external member in a specific group but would not appear in `syncAllUsers()` (`/users` endpoint only returns local org members by default).  
**Risk:** Guest accounts synced via `syncGroupUsers()` would be deactivated by the `syncAllUsers()` deactivation step since their `entraId` would not be in the active list.  
**Mitigation:** Consider using `$filter=accountEnabled eq true&$filter=userType eq 'Member'` in `syncAllUsers()` to explicitly exclude guests, and handle them separately if needed.

### 7.6 Large Organizations — Pagination Correctness
**Current behavior:** `syncGroupUsers()` uses `.split('/v1.0')[1]` to strip the prefix from `@odata.nextLink`. This works when the next link is a full v1.0 URL.  
**Potential issue:** Works correctly in current implementation. No change needed.

---

## 8. Security Considerations

1. **Deactivation is non-destructive** — `isActive: false` prevents login but does not delete the user or their data. Audit trail preserved.

2. **Application roles depend on `isActive`** — Verify that the auth middleware (`authenticate` in `auth.ts`) checks `isActive` before granting access. If not, deactivating a user in the DB alone may not prevent JWT-based access until token expiry. Check `auth.middleware.ts` for an `isActive` check.

3. **JWT tokens remain valid** — A user who is deactivated in Entra and subsequently in the DB will still have a valid JWT until it expires (1 hour default). For high-security scenarios, consider token revocation or shorter JWT lifetime.

4. **App-level sync credentials** — `syncAllUsers()` and group sync use client credentials flow (app-only token). Ensure the app registration only has `User.Read.All` and `GroupMember.Read.All` permissions (read-only). Principle of least privilege.

5. **Guard against deactivating ALL users** — The `activeEntraIds.length > 0` guard in Change 1 prevents mass deactivation from an empty API response. Consider adding a minimum threshold guard for production safety.

---

## 9. Microsoft Graph API Reference

### Filter Active Users (All Org Users)
```
GET /v1.0/users?$select=id&$filter=accountEnabled eq true&$count=true
Headers: ConsistencyLevel: eventual
```
- Requires `ConsistencyLevel: eventual` + `$count=true` for advanced filter
- Source: [Microsoft Graph — List users with filter](https://learn.microsoft.com/en-us/graph/api/user-list)

### Filter Active Group Members
Option A — Select `accountEnabled` and filter in code (RECOMMENDED):
```
GET /v1.0/groups/{id}/members?$select=id,accountEnabled
```

Option B — Server-side filter (requires consistency-level header):
```
GET /v1.0/groups/{id}/members/microsoft.graph.user?$filter=accountEnabled eq true&$count=true
Headers: ConsistencyLevel: eventual
```
- Source: [Microsoft Graph — List group members](https://learn.microsoft.com/en-us/graph/api/group-list-members)

### `accountEnabled` Property
- Type: `Boolean | null`
- `true` — user can sign in
- `false` — user is disabled and cannot sign in
- `null` — may occur for synced objects; treat as enabled unless explicitly `false`
- Source: [Microsoft Graph User resource type](https://learn.microsoft.com/en-us/graph/api/resources/user)

---

## 10. Testing Recommendations

1. **Unit test deactivation logic** — Mock Graph API to return a list of 2 users; pre-seed DB with 3 users (2 active, 1 extra); verify the 3rd is deactivated after `syncAllUsers()`.

2. **Integration test `syncGroupUsers()` with disabled member** — Use a test group containing 1 disabled user; verify they are skipped (no DB upsert) and the skip is logged.

3. **Verify `ConsistencyLevel` header** — Run `syncAllUsers()` against a test tenant and confirm the Graph call returns results correctly with the header added.

4. **Test re-enable flow** — Disable a user in a test tenant, run sync, verify `isActive: false`; re-enable, run sync, verify `isActive: true`.

5. **Test login hardcoding guard** — Verify the updated `auth.controller.ts` callback includes `accountEnabled` in the `/me` select response and uses it.

6. **Regression test: manual permission overrides** — After sync, verify that manually-granted permissions (where `grantedBy` is an admin UUID) are not affected by the `isActive` changes.

7. **Load test deactivation query** — For an org with 1000+ users, test the `updateMany` with `notIn` clause for performance; add a DB index on `entraId` if not already present (already has `@unique` which implies an index in Prisma/Postgres).

---

## 11. Prisma Schema — Relevant Fields (No Schema Changes Required)

```prisma
model User {
  id          String   @id @default(uuid())
  entraId     String   @unique          // Entra Object ID — used as deactivation key
  email       String   @unique
  isActive    Boolean  @default(true)   // Maps to accountEnabled in Entra
  lastSync    DateTime @default(now())
  role        String   @default("USER")
  ...
}
```

The existing schema is sufficient. No migrations needed for any of the proposed changes.

---

## 12. Files Requiring Changes (Consolidated)

| File | Change(s) |
|---|---|
| `backend/src/services/userSync.service.ts` | Add deactivation step to `syncAllUsers()` (Change 1); add `ConsistencyLevel` header (Change 2); filter disabled users in `syncGroupUsers()` (Change 3) |
| `backend/src/controllers/auth.controller.ts` | Add `accountEnabled` to `/me` select; use it for `isActive` (Change 4) |
| `backend/src/routes/admin.routes.ts` | Fetch `accountEnabled` and update `isActive` in `resync-permissions/:userId` (Change 5) |
| `backend/src/types/microsoft-graph.types.ts` | Add `accountEnabled?: boolean` to `GraphUser` type if not already present |

No schema changes, no migration, no new dependencies required.
