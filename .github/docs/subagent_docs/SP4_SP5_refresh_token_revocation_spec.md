# SP-4 / SP-5 Spec — Refresh Token Revocation & Dead Import Route

**Date:** 2026-06-10
**Audit Findings:** AUDIT.md SP-4, SP-5
**Severity:** SP-4 🟡 Medium, SP-5 ⚪ Quality

---

## SP-5 — Dead Endpoint (Quick Fix)

`GET /inventory/import` (line 246 of `inventory.routes.ts`) is registered after
`GET /inventory/:id` (line 116). Express matches `import` as the `:id` param, UUID
validation fails, and the endpoint returns 400 — it is unreachable.

**Fix:** Move the `GET /inventory/import` route block (plus its comment) to before
`GET /inventory/:id`, mirroring the existing note on `POST /inventory/bulk-delete`.

**Files touched:** `backend/src/routes/inventory.routes.ts` only.

---

## SP-4 — Refresh Token Revocation

### Current State

Refresh tokens are stateless JWTs signed with `JWT_REFRESH_SECRET`. On refresh the
old token is silently replaced but remains cryptographically valid until its 7-day
expiry. Logout only clears cookies; a stolen refresh token survives indefinitely.
There is no detection of the same token being used twice.

### Solution

Track every live refresh token by a `jti` (JWT ID) UUID stored in a new
`refresh_tokens` DB table. On rotation, revoke the old `jti` and issue a new one.
On logout, revoke all of the user's active tokens. If a revoked `jti` is presented
(reuse), revoke everything for that user — the classic stolen-token signal.

### Schema Change (requires user-run migration)

New model in `backend/prisma/schema.prisma`:

```prisma
model RefreshToken {
  jti       String    @id
  userId    String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
```

Add `refreshTokens RefreshToken[]` to the `User` model relation list.

**The user must run the migration after this commit:**
```
npx prisma migrate dev --name add_refresh_tokens
```

The Docker build runs `prisma generate` which will re-generate the client from the
updated schema — the controller TypeScript will compile against the new model types.
The migration itself does not run during the build; the running container needs it
applied before the new auth code is live.

### Type Changes (`backend/src/types/auth.types.ts`)

Add `jti: string` to `JWTRefreshTokenPayload`.
Update `isRefreshTokenPayload` to require `'jti' in payload` and
`typeof payload.jti === 'string'`.

### Controller Changes (`backend/src/controllers/auth.controller.ts`)

**Shared helper (module-level):**
```typescript
function parseExpiryMs(expiry: string): number {
  const m = /^(\d+)([smhdw])$/.exec(expiry);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const mul: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return n * (mul[m[2]] ?? 864e5);
}
```

**Callback handler** — after signing the refresh JWT, persist the `jti`:
1. Generate `jti = crypto.randomUUID()` before signing.
2. Add `jti` to `refreshTokenPayload`.
3. After cookies are set, persist:
   ```typescript
   await prisma.refreshToken.create({
     data: { jti, userId: user.id, expiresAt: new Date(Date.now() + parseExpiryMs(...)) },
   });
   ```

**refreshToken handler** — after `isRefreshTokenPayload(decoded)` passes:
1. Look up `prisma.refreshToken.findUnique({ where: { jti: decoded.jti } })`.
2. Not found → throw `AuthenticationError('Refresh token not recognized')`.
3. `revokedAt` is set → reuse detected → revoke all active tokens for user:
   ```typescript
   await prisma.refreshToken.updateMany({
     where: { userId: decoded.id, revokedAt: null },
     data: { revokedAt: new Date() },
   });
   loggers.auth.warn('Refresh token reuse detected — all tokens revoked', { userId: decoded.id });
   throw new AuthenticationError('Refresh token has been revoked');
   ```
4. Valid → revoke old `jti`, generate new `jti`, add to new payload, sign, set cookie,
   persist new row.

**logout handler** — before `res.clearCookie`, attempt to revoke:
```typescript
const rawRefreshToken = req.cookies.refresh_token;
if (rawRefreshToken) {
  try {
    const decoded = jwt.verify(rawRefreshToken, process.env.JWT_REFRESH_SECRET!);
    if (isRefreshTokenPayload(decoded)) {
      await prisma.refreshToken.updateMany({
        where: { userId: decoded.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch { /* expired or invalid token — nothing to revoke */ }
}
```

### Cron Cleanup (`backend/src/services/cronJobs.service.ts`)

Add a daily cleanup job (runs at 3 AM) that hard-deletes rows that are both:
- revoked OR expired
- older than 7 days (grace period)

```typescript
await prisma.refreshToken.deleteMany({
  where: {
    OR: [
      { revokedAt: { not: null, lte: new Date(Date.now() - 7 * 864e5) } },
      { expiresAt: { lte: new Date(Date.now() - 7 * 864e5) } },
    ],
  },
});
```

---

## Implementation Plan

| Step | File | Action | Verify |
|---|---|---|---|
| 1 | `inventory.routes.ts` | Move `GET /import` before `GET /:id` | Route list order; comment matches |
| 2 | `schema.prisma` | Add `RefreshToken` model + User relation | Model compiles via `prisma generate` |
| 3 | `auth.types.ts` | Add `jti` to payload type and type guard | Type guard covers `jti` |
| 4 | `auth.controller.ts` | Callback: add `jti`, persist in DB | New token row created at login |
| 5 | `auth.controller.ts` | Refresh: validate, revoke, rotate with new `jti` | Reuse detection path present |
| 6 | `auth.controller.ts` | Logout: revoke all active tokens | `updateMany` call before `clearCookie` |
| 7 | `cronJobs.service.ts` | Add daily cleanup job | Job scheduled, query correct |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Migration not run before deploying new image | Document clearly in commit; auth refresh degrades gracefully — Prisma throws 500 until table exists; that's preferable to silent token acceptance |
| Existing users' refresh tokens (no `jti`) are rejected after deploy | Expected and correct: they re-authenticate at next access-token expiry. Not a silent breakage since a 401 on refresh redirects to login |
| DB query on every refresh adds latency | One indexed `jti` pk lookup — negligible |
| `parseExpiryMs` doesn't cover all jsonwebtoken formats (e.g. `604800`) | jsonwebtoken accepts numeric seconds; the env var in this project uses `'7d'` — helper covers the actual value |
