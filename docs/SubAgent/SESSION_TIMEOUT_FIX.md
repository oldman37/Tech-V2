# Session Timeout Fix Specification

## Problem
Users are getting logged out while actively using the application (e.g., mid-workorder entry). The effective session timeout is ~15 minutes instead of the intended rolling 7-day window.

## Root Causes

### 1. Zod Validator Blocks Refresh Endpoint (CRITICAL)
`auth.routes.ts` applies `validateBody(RefreshTokenRequestSchema)` to `POST /auth/refresh-token`. The schema requires `{ refreshToken: string }` in the body. But the frontend sends an empty body `{}` (token is in the HttpOnly cookie). The Zod validation returns 400 before the controller ever runs. **Silent refresh NEVER works.**

### 2. Cookie maxAge / JWT Expiry Mismatch
Access token cookie `maxAge` is 15 minutes but JWT `expiresIn` is 1 hour. The cookie is deleted before the JWT expires, so the effective access token lifetime is 15 minutes.

### 3. No Proactive Token Refresh
Token refresh only happens reactively after a 401. If a user is filling out a form for 16+ minutes without any API calls, their next request fails, triggers refresh (which currently also fails due to #1), and logs them out.

### 4. Concurrent 401 Race Condition
If multiple requests fail with 401 simultaneously, each tries to refresh independently. With token rotation, the second refresh attempt may use an already-rotated token.

## Fixes

### Fix 1: Remove body validation from refresh endpoint
The refresh token comes from cookies, not the body. Remove the Zod body validator from the route.

### Fix 2: Align cookie maxAge with JWT expiry
Set access token cookie maxAge to 1 hour (matching JWT_EXPIRES_IN).

### Fix 3: Add proactive token refresh on frontend
Add a periodic check (every 5 minutes) that refreshes the token before it expires. Also refresh on user activity detection (mouse, keyboard, navigation).

### Fix 4: Queue concurrent refresh attempts
Use a promise-based lock so only one refresh request runs at a time. Other 401 interceptors wait for the result.
