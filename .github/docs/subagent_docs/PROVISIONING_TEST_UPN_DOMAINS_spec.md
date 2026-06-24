# Spec: Per-Tenant UPN Domain Configuration

**Feature name:** PROVISIONING_TEST_UPN_DOMAINS
**Date:** 2026-06-17

---

## Current State

`ProvisioningConfig` stores a single `staffUpnDomain` and `studentUpnDomain`.
`runForType` always uses those fields when calling `fetchEntraUsersByUpnDomain`
and when generating new UPNs via `resolveStaffUpn` / `resolveStudentUpn`.

When the user switches `targetTenant` to `TEST`, the same production UPN domains
are used to query the test Entra tenant. If the test tenant uses a different
domain (e.g. `@test.ocboe.com` vs `@ocboe.com`), the Graph query returns no
results and provisioning silently treats every SIS user as a CREATE candidate.

## Problem

There is no way to configure UPN domains per target tenant. Switching to the
TEST tenant should query and generate UPNs under the test tenant's domain, not
the production domain.

## Proposed Solution

Add two nullable fields to `ProvisioningConfig`:
- `testStaffUpnDomain String?` — UPN domain for staff when targeting the TEST tenant
- `testStudentUpnDomain String?` — UPN domain for students when targeting the TEST tenant

At job time (`getOrSeedConfig`), compute the *effective* domain based on the
stored `targetTenant`:

```ts
const effectiveStaffDomain = (config.targetTenant === 'TEST' && config.testStaffUpnDomain)
  ? config.testStaffUpnDomain
  : config.staffUpnDomain;
```

`runForType` receives the already-resolved domains — no changes needed there.

The `DomainConfigCard` gains two additional selectors (Staff/Student test domain)
shown only when `hasFullTestCreds` is true, under a "Test Tenant Domains" subheading.

## Implementation Steps

| Step | File | Change |
|------|------|--------|
| 1 | `backend/prisma/schema.prisma` | Add `testStaffUpnDomain String?`, `testStudentUpnDomain String?` to `ProvisioningConfig` |
| 2 | `backend/prisma/migrations/20260617120000_add_test_upn_domains/migration.sql` | `ALTER TABLE provisioning_config ADD COLUMN ...` |
| 3 | `backend/src/services/userProvision.service.ts` | `getOrSeedConfig()`: compute effective domains; include raw test fields in return |
| 4 | `backend/src/controllers/provisioning.controller.ts` | `getConfig`: expose `testStaffUpnDomain`, `testStudentUpnDomain`; `updateConfig`: upsert them |
| 5 | `backend/src/validators/provisioning.validators.ts` | Add the two new optional string fields; update the `refine` guard |
| 6 | `frontend/src/services/provisioningService.ts` | Add fields to `ProvisioningConfig` and `UpdateProvisioningConfigInput` |
| 7 | `frontend/src/pages/admin/ProvisioningPage.tsx` | Extend `DomainConfigCard` with test-tenant domain selectors |

## Schema Change

```prisma
model ProvisioningConfig {
  id                  String   @id @default("singleton")
  staffPassword       String
  studentPassword     String
  staffUpnDomain      String   @default("ocboe.com")
  studentUpnDomain    String   @default("students.ocboe.com")
  testStaffUpnDomain  String?
  testStudentUpnDomain String?
  targetTenant        String   @default("TEST")
  disableThreshold    Int      @default(50)
  reportEmails        String?
  adminEmails         String?
  updatedAt           DateTime @default(now()) @updatedAt
  updatedBy           String?

  @@map("provisioning_config")
}
```

## Migration SQL

```sql
ALTER TABLE "provisioning_config"
  ADD COLUMN "testStaffUpnDomain"  TEXT,
  ADD COLUMN "testStudentUpnDomain" TEXT;
```

## `getOrSeedConfig` Return Shape

```ts
{
  staffPassword:        string;
  studentPassword:      string;
  staffUpnDomain:       string;   // effective — already resolved for targetTenant
  studentUpnDomain:     string;   // effective — already resolved for targetTenant
  targetTenant:         'PRODUCTION' | 'TEST';
  disableThreshold:     number;
  adminEmails:          string[] | undefined;
}
```

Effective domain logic (inside `getOrSeedConfig`, after config row is loaded):

```ts
const staffUpnDomain = (config.targetTenant === 'TEST' && config.testStaffUpnDomain)
  ? config.testStaffUpnDomain
  : config.staffUpnDomain;
const studentUpnDomain = (config.targetTenant === 'TEST' && config.testStudentUpnDomain)
  ? config.testStudentUpnDomain
  : config.studentUpnDomain;
```

## `getConfig` Response Additions

```ts
testStaffUpnDomain:  config?.testStaffUpnDomain  ?? null,
testStudentUpnDomain: config?.testStudentUpnDomain ?? null,
```

(Production domains already present as `staffUpnDomain`/`studentUpnDomain`.)

## Validator Additions

```ts
testStaffUpnDomain:   z.string().min(1).optional(),
testStudentUpnDomain: z.string().min(1).optional(),
```

Also add them to the `refine` guard so saving either alone is valid.

## `updateConfig` Upsert Additions

```ts
create: {
  ...
  testStaffUpnDomain:   data.testStaffUpnDomain,
  testStudentUpnDomain: data.testStudentUpnDomain,
},
update: {
  ...(data.testStaffUpnDomain  !== undefined ? { testStaffUpnDomain:  data.testStaffUpnDomain  } : {}),
  ...(data.testStudentUpnDomain !== undefined ? { testStudentUpnDomain: data.testStudentUpnDomain } : {}),
},
```

## DomainConfigCard UI

When `config.hasFullTestCreds` is true, render a second row below the production
domain selectors:

```
── Production Domains ──────────────
  [Staff UPN Domain ▾]   [Student UPN Domain ▾]

── Test Tenant Domains ─────────────
  [Test Staff Domain ▾]  [Test Student Domain ▾]
  Caption: "Used when target tenant is TEST"
```

Both rows use the same `domains` dropdown list from `getDomains`.
If test creds are not configured, the Test Tenant Domains section is hidden
(test domains cannot be used anyway).

## Build Commands

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`

## Risks

- Existing rows: both new columns default to `NULL` → `getOrSeedConfig` falls
  back to production domains. No data loss, no breaking change.
- If user switches to TEST but leaves test domains blank, the service falls
  back to production domains (same behaviour as before). The UI should note
  this in the helper text.
