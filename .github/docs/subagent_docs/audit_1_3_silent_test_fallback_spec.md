# Spec: §1.3 — Stop Silent TEST→PROD Fallback

**Feature name:** audit_1_3_silent_test_fallback
**Severity:** 🔴 Critical
**Effort:** Small

---

## Current State

`buildProvisioningGraphClient` in `userProvision.service.ts:105-119` falls back to the
production `graphClient` without any error or log when `targetTenant === 'TEST'` but one or
more of `PROVISIONING_TENANT_ID` / `PROVISIONING_CLIENT_ID` / `PROVISIONING_CLIENT_SECRET`
is absent from the environment:

```ts
if (targetTenant === 'TEST' && tenantId && clientId && clientSecret) {
  // test client built here
}
return { client: graphClient, isTestTenant: false };  // silent prod fallback
```

`getConfig` in `provisioning.controller.ts:99` only exposes:
```ts
testTenantId: process.env.PROVISIONING_TENANT_ID || null,
```
The frontend cannot distinguish "all three creds present" from "only tenant ID set."

`TenantSwitcherCard` at `ProvisioningPage.tsx:135` uses:
```ts
const hasTestCreds = Boolean(config?.testTenantId);
```
A partially-configured set (tenant ID present, client secret missing) shows no warning and
still silently falls back to the production client.

## Problem

- In **test mode + TEST tenant** with incomplete creds: the dry-run diff is computed against
  production users — misleading but harmless (no writes).
- In **live mode + TEST tenant** with incomplete creds: writes go to **production**. The
  TEST selection gives a false sense of safety.

## Proposed Solution

Four targeted changes — no schema migrations, no new dependencies.

### 1. `backend/src/controllers/provisioning.controller.ts` — `getConfig`

Add `hasFullTestCreds` to the response:

```ts
hasFullTestCreds: Boolean(
  process.env.PROVISIONING_TENANT_ID &&
  process.env.PROVISIONING_CLIENT_ID &&
  process.env.PROVISIONING_CLIENT_SECRET
),
```

### 2. `frontend/src/services/provisioningService.ts` — `ProvisioningConfig`

Add field:
```ts
hasFullTestCreds: boolean;
```

### 3. `frontend/src/pages/admin/ProvisioningPage.tsx` — `TenantSwitcherCard`

Replace:
```ts
const hasTestCreds = Boolean(config?.testTenantId);
```
With:
```ts
const hasFullTestCreds = Boolean(config?.hasFullTestCreds);
```

Update the existing body-text warning line that reads
`No test tenant credentials are configured...` to use `hasFullTestCreds` instead of
`hasTestCreds`.

Add a hard `Alert severity="error"` block below the `ToggleButtonGroup` that renders
**only** when `config?.targetTenant === 'TEST' && !hasFullTestCreds`:

```
Test tenant credentials are incomplete — PROVISIONING_TENANT_ID,
PROVISIONING_CLIENT_ID, and PROVISIONING_CLIENT_SECRET must all be set.
Until they are, any Graph call (read or write) uses the PRODUCTION tenant.
```

### 4. `backend/src/services/userProvision.service.ts` — `runProvisioningJob`

After the `buildProvisioningGraphClient` call (line 403), add a guard:

```ts
// If the DB says TEST but we got the prod client (incomplete creds), refuse to
// proceed with a live run — it would write to production silently.
if (config.targetTenant === 'TEST' && !isTestTenant && !isTestMode) {
  throw new Error(
    'Cannot run a live provisioning job: targetTenant is TEST but ' +
    'PROVISIONING_TENANT_ID / PROVISIONING_CLIENT_ID / PROVISIONING_CLIENT_SECRET ' +
    'are not all set. Set them in .env or switch targetTenant to PRODUCTION.'
  );
}

// In test mode with incomplete creds, reads still go to production — warn prominently.
if (config.targetTenant === 'TEST' && !isTestTenant && isTestMode) {
  loggers.server.warn(
    'Provisioning: TEST tenant selected but test credentials are incomplete — ' +
    'Graph reads will use the PRODUCTION tenant. No writes will occur (test mode).',
    { targetTenant: config.targetTenant }
  );
}
```

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/controllers/provisioning.controller.ts` | Add `hasFullTestCreds` to `getConfig` response |
| `frontend/src/services/provisioningService.ts` | Add `hasFullTestCreds: boolean` to `ProvisioningConfig` |
| `frontend/src/pages/admin/ProvisioningPage.tsx` | Replace `hasTestCreds`, add hard Alert in `TenantSwitcherCard` |
| `backend/src/services/userProvision.service.ts` | Guard after `buildProvisioningGraphClient` in `runProvisioningJob` |

## Build Commands

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`

## Risks

- None. All changes are additive (new field, new guard, new UI warning). The fallback
  behavior of `buildProvisioningGraphClient` itself is unchanged — only the callers now
  detect and respond to the incomplete-creds case.
