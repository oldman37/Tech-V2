# Provisioning UPN Domain Selection — Spec

## Problem

UPN domains (`ocboe.com`, `students.ocboe.com`) are hardcoded in `upnGenerator.ts`.
When running against a test Entra tenant, those domains are not verified there, so
Graph rejects account creation with "domain portion of UPN is invalid."

## Solution

Store `staffUpnDomain` and `studentUpnDomain` in `provisioning_config` (defaults to
production values). Add a `GET /api/provisioning/domains` endpoint that fetches
verified domains from whichever tenant is active (test or prod). Frontend shows two
dropdowns populated from that live domain list, each saving to the config row.

## Changes

### Backend

1. **Migration** `20260617130000_add_provisioning_upn_domains`
   ```sql
   ALTER TABLE "provisioning_config"
     ADD COLUMN "staffUpnDomain"   TEXT NOT NULL DEFAULT 'ocboe.com',
     ADD COLUMN "studentUpnDomain" TEXT NOT NULL DEFAULT 'students.ocboe.com';
   ```

2. **`schema.prisma`** — add two fields with defaults to `ProvisioningConfig`

3. **`upnGenerator.ts`** — add `domain` parameter to `resolveStaffUpn` and
   `resolveStudentUpn`; remove module-level `STAFF_DOMAIN`/`STUDENT_DOMAIN` constants

4. **`userProvision.service.ts`**
   - Export `buildProvisioningGraphClient`
   - Export `getProvisioningDomains()` — calls `GET /domains?$filter=isVerified eq true` on the
     active tenant's Graph client; returns `string[]` of domain IDs sorted default-first
   - `getOrSeedConfig()` returns domains in its result
   - `runForType` reads `config.staffUpnDomain` / `config.studentUpnDomain` and passes
     them to `fetchEntraUsersByUpnDomain` (replacing the hardcoded domain) and to
     `resolveStaffUpn`/`resolveStudentUpn`

5. **`provisioning.validators.ts`** — add optional `staffUpnDomain` / `studentUpnDomain`
   string fields to `UpdateProvisioningConfigSchema`; relax the `.refine` to require at
   least one of all four optional fields

6. **`provisioning.controller.ts`**
   - `getDomains` handler — calls `getProvisioningDomains()`, returns `{ domains: string[] }`
   - `getConfig` — include `staffUpnDomain`, `studentUpnDomain` in response
   - `updateConfig` — persist domain fields when present

7. **`provisioning.routes.ts`** — add `GET /domains` (read-only, no CSRF needed)

### Frontend

8. **`provisioningService.ts`** — add `getDomains()`, update `ProvisioningConfig` type

9. **`queryKeys.ts`** — add `provisioning.domains()`

10. **`ProvisioningPage.tsx`** — new `DomainConfigCard` below `PasswordConfigCard`:
    - Fetches domains from `GET /provisioning/domains`
    - Two Select dropdowns: "Staff UPN domain" + "Student UPN domain"
    - Pre-selected from current config values
    - Save button → `PATCH /provisioning/config`

## No New Dependencies
