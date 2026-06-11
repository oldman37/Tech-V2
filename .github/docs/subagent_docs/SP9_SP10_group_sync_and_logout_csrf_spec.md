# SP-9 / SP-10 — Force Group Re-Sync + Logout CSRF Guard

**Date:** 2026-06-11
**Findings:** SP-9 🔵 (Informational), SP-10 🔵 (Low)
**Phase:** 1 (Research & Specification)

---

## SP-9 — Force Group Re-Sync Admin Endpoint

### Current State

`backend/src/controllers/auth.controller.ts` (lines 497–538) implements the
ARCH-3 group-membership cache:

```typescript
const cacheAge = user.groupsLastSyncedAt
  ? Date.now() - user.groupsLastSyncedAt.getTime()
  : Infinity;
const cacheIsStale = cacheAge >= cacheTtlMs;   // default TTL: 30 min

if (!cacheIsStale && user.cachedGroups.length > 0) {
  // Use cached groups
} else {
  // Fetch fresh from Graph, update DB
}
```

Setting `groupsLastSyncedAt = null` makes `cacheAge = Infinity`, which causes
`cacheIsStale = true` and forces a fresh Graph fetch on the user's **next
token refresh** (every ~25 minutes).

There is currently no admin endpoint to trigger this reset for a specific user.
An admin needing urgent permission revocation beyond `isActive = false` has no
way to shorten the 30-minute cache window for a targeted user.

### Fix

Add `POST /api/admin/users/:userId/force-group-sync` to `admin.routes.ts`.

The route:
1. Validates `:userId` as a UUID
2. Confirms the user exists (returns 404 if not)
3. Sets `groupsLastSyncedAt = null` on the user row
4. Returns `{ success: true, message }`

The route is covered by the existing `router.use(authenticate)`,
`router.use(requireAdmin)`, and `router.use(validateCsrfToken)` guards at the
top of `admin.routes.ts` — no additional auth plumbing needed.

### Implementation

In `backend/src/routes/admin.routes.ts`, add inline after the existing user-sync
routes (before the cron-jobs section):

```typescript
const forceGroupSyncParamSchema = z.object({
  userId: z.string().uuid(),
});

router.post('/users/:userId/force-group-sync', async (req: AuthRequest, res: Response) => {
  const parsed = forceGroupSyncParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  const { userId } = parsed.data;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { groupsLastSyncedAt: null },
    });
    loggers.admin.info('Force group re-sync requested', {
      targetUserId: userId,
      targetEmail: user.email,
      requestedBy: req.user?.email,
    });
    res.json({ success: true, message: `Group cache cleared for ${user.email}. Groups will re-sync on next token refresh.` });
  } catch (error) {
    loggers.admin.error('Force group re-sync failed', { error, userId });
    handleControllerError(error, res);
  }
});
```

---

## SP-10 — Add `validateCsrfToken` to Logout Route

### Current State

`backend/src/routes/auth.routes.ts`:

```typescript
router.post('/logout', authController.logout);
```

`POST /api/auth/logout` has no CSRF guard. The impact is limited to
forced-logout (nuisance) and `SameSite=Lax` on the access cookie already
blocks most cross-site POST paths. The audit calls this a 1-line fix that
makes the mutation surface uniform.

### Safety Analysis

- By the time a user can call logout, at least one authenticated GET has
  fired `provideCsrfToken` (global middleware), setting the CSRF cookie and
  the `X-CSRF-Token` response header. The frontend reads and stores this.
- Access token lifetime is 1h; CSRF cookie lifetime is 24h. There is no
  realistic path where a valid session exists but no CSRF cookie is set.
- SP-8 clears the CSRF cookie on logout. The `clearCsrfToken` call is in the
  **handler**, which runs after `validateCsrfToken` — so the validation reads
  the old token before the handler clears it. Ordering is correct.

### Fix

In `backend/src/routes/auth.routes.ts`:
- Import `validateCsrfToken` from `'../middleware/csrf'`
- Change: `router.post('/logout', authController.logout)`
- To:     `router.post('/logout', validateCsrfToken, authController.logout)`

---

## Dependencies

No new dependencies. No Prisma schema changes.

---

## Build Commands

- `docker compose -f docker-compose.dev.yml build backend` — backend only
- Frontend unchanged
