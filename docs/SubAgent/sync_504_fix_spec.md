# Spec: Fix 504 Timeout on Staff User Sync

## Problem

`POST /api/admin/sync-users/staff` returns HTTP 504 in production because:

1. **Nginx `proxy_read_timeout` is only 60 seconds** (`frontend/nginx.conf`)
2. **`syncGroupUsers()` and `syncAllUsers()` in `backend/src/services/userSync.service.ts` call `syncUser()` sequentially per member**, and each `syncUser()` makes 2 sequential Microsoft Graph API calls (`GET /users/{id}` and `GET /users/{id}/transitiveMemberOf`). For a large staff group (hundreds of users), this easily exceeds 60 seconds.

## Files to Modify

1. `c:\Tech-V2\frontend\nginx.conf`
2. `c:\Tech-V2\backend\src\services\userSync.service.ts`

## Required Changes

### 1. `frontend/nginx.conf`

In the `location /api/` block, increase the timeout values for long-running admin operations:

- Change `proxy_connect_timeout` from `60s` → `120s`
- Change `proxy_send_timeout` from `60s` → `300s`  
- Change `proxy_read_timeout` from `60s` → `300s`

### 2. `backend/src/services/userSync.service.ts`

Add a **concurrency-limited parallel processing** helper and use it in both `syncGroupUsers` and `syncAllUsers`.

#### Add a `runWithConcurrency` private helper method

Add this as a private method at the bottom of the class (before the closing `}`):

```typescript
/**
 * Run async tasks with a bounded concurrency limit.
 * Processes `tasks` in parallel but no more than `limit` at a time.
 */
private async runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const current = index++;
      try {
        const value = await tasks[current]();
        results[current] = { status: 'fulfilled', value };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
```

#### Refactor `syncGroupUsers` to use concurrency

Replace the `for (const member of members)` loop (and the variables `added`, `updated`, `errors`, `errorDetails` inside `syncGroupUsers`) with a concurrency-limited approach using `CONCURRENCY_LIMIT = 10`.

The loop currently looks like:
```typescript
for (const member of members) {
  if (member['@odata.type'] === '#microsoft.graph.user') {
    // Skip disabled users
    if (member.accountEnabled === false) { ... continue; }
    const isNew = !existingEntraIds.has(member.id);
    try {
      await this.syncUser(member.id);
      if (isNew) { added++; } else { updated++; }
    } catch (error) {
      errors++;
      if (errorDetails.length < 20) { errorDetails.push(...) }
      loggers.userSync.error(...)
    }
  }
}
```

Replace it with:
```typescript
const CONCURRENCY_LIMIT = 10;

const eligibleMembers = members.filter(
  (m) => m['@odata.type'] === '#microsoft.graph.user' && m.accountEnabled !== false
);

const tasks = eligibleMembers.map((member) => async () => {
  const isNew = !existingEntraIds.has(member.id);
  await this.syncUser(member.id);
  return isNew ? 'added' : 'updated';
});

const settled = await this.runWithConcurrency(tasks, CONCURRENCY_LIMIT);

for (let i = 0; i < settled.length; i++) {
  const result = settled[i];
  if (result.status === 'fulfilled') {
    if (result.value === 'added') { added++; } else { updated++; }
  } else {
    errors++;
    if (errorDetails.length < 20) {
      errorDetails.push({
        entraId: redactEntraId(eligibleMembers[i].id),
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
    loggers.userSync.error('Failed to sync group member', {
      groupId,
      memberId: redactEntraId(eligibleMembers[i].id),
      error: result.reason,
    });
  }
}
```

Also log skipped disabled users count separately (optional but nice):
```typescript
const skippedDisabled = members.filter(
  (m) => m['@odata.type'] === '#microsoft.graph.user' && m.accountEnabled === false
).length;
```

#### Refactor `syncAllUsers` to use concurrency

Replace the sequential loop in `syncAllUsers` similarly:

The loop currently:
```typescript
for (const user of allUsers) {
  const isNew = !existingEntraIds.has(user.id);
  try {
    await this.syncUser(user.id);
    if (isNew) { added++; } else { updated++; }
  } catch (error) {
    errors++;
    if (errorDetails.length < 20) { errorDetails.push(...) }
    loggers.userSync.error(...)
  }
}
```

Replace with:
```typescript
const CONCURRENCY_LIMIT = 10;

const tasks = allUsers.map((user) => async () => {
  const isNew = !existingEntraIds.has(user.id);
  await this.syncUser(user.id);
  return isNew ? 'added' : 'updated';
});

const settled = await this.runWithConcurrency(tasks, CONCURRENCY_LIMIT);

for (let i = 0; i < settled.length; i++) {
  const result = settled[i];
  if (result.status === 'fulfilled') {
    if (result.value === 'added') { added++; } else { updated++; }
  } else {
    errors++;
    if (errorDetails.length < 20) {
      errorDetails.push({
        entraId: redactEntraId(allUsers[i].id),
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
    loggers.userSync.error('Failed to sync user in bulk operation', {
      userId: redactEntraId(allUsers[i].id),
      error: result.reason,
    });
  }
}
```

## Expected Outcome

- With 10x concurrency, a sync of 500 users that previously took ~200s should complete in ~20s, well within the 300s timeout.
- The nginx timeout increase provides a larger safety buffer for very large syncs.
- Error handling and logging remain functionally identical.
- The `runWithConcurrency` helper is a private utility and does not affect the public API surface.
