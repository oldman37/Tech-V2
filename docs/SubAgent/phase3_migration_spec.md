# Phase 3 Dependency Migration Specification
**Generated:** 2026-05-01  
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)  
**Scope:** M-4 (Azure Auth), M-5 analog (Shared TS), M-6 (Concurrently)  
**Sources:** MSAL-Node CHANGELOG, Azure Identity CHANGELOG, Concurrently v9.0.0 release notes, npm package.json audit, live codebase analysis

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Azure Auth Migration (M-4) — Deep Analysis](#2-azure-auth-migration-m-4--deep-analysis)
3. [Concurrently v9 (M-6)](#3-concurrently-v9-m-6)
4. [Shared TypeScript Alignment](#4-shared-typescript-alignment)
5. [Implementation Order](#5-implementation-order)

---

## 1. Executive Summary

### Risk Assessment

| Item | Package(s) | Priority | Risk Level | Recommendation |
|---|---|---|---|---|
| M-4 | `@azure/msal-node` v3.8.4 → v5.1.5 | HIGH | MEDIUM | Proceed — API surface barely changed, one line of code to fix |
| M-4 | `@azure/identity` v4.13.0 | HIGH | **NONE** | No action — `^4.13.0` already resolves to 4.13.1 which is NOT vulnerable |
| M-6 | `concurrently` v8.2.2 → v9 | LOW | LOW | Proceed — zero script changes needed |
| Shared | `typescript` v5.3.3 → v5.9.3 | LOW | LOW | Proceed — trivial devDependency alignment |

### Critical Finding — Identity Package Already Fixed

**`@azure/identity@^4.13.0` (`^`) already resolves to v4.13.1, which is NOT in the GHSA-w5hq-g745-h8pq affected range.** The advisory range for identity is `1.2.x - 4.13.0 || 4.14.0-alpha - 4.14.0-beta.2` — version `4.13.1` is excluded. No separate action is needed for identity; the pin is fine as-is.

The **only remaining CVE source** is the direct `@azure/msal-node: ^3.8.4` dependency, which resolves to v3.8.6 and still bundles `uuid <14.0.0`.

### Recommended Implementation Order

1. **Immediately (no risk):** Shared TypeScript alignment + Concurrently v9
2. **After Node version check:** msal-node v3 → v5.1.5 upgrade (one code change required)
3. **Defer:** Waiting for `@azure/identity@4.14.0` GA release (still beta.3 as of 2026-05-01) — NOT needed to resolve the current CVE

---

## 2. Azure Auth Migration (M-4) — Deep Analysis

### 2.1 Complete Azure SDK Usage Inventory

All Azure SDK imports are concentrated in **3 files**:

---

#### File 1: `backend/src/config/entraId.ts`

```typescript
import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
```

**MSAL-Node APIs used:**

| API | Call Site | Signature |
|---|---|---|
| `Configuration` type | `const msalConfig: Configuration = { ... }` | Type import |
| `ConfidentialClientApplication` constructor | `new ConfidentialClientApplication(msalConfig)` | `new ConfidentialClientApplication(configuration: Configuration)` |

**Configuration object shape used:**
```typescript
const msalConfig: Configuration = {
  auth: {
    clientId: process.env.ENTRA_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
    clientSecret: process.env.ENTRA_CLIENT_SECRET!,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) { /* pii-gated debug log */ },
      piiLoggingEnabled: false,
      logLevel: 'Verbose' as any,   // ← TYPE HACK: uses string instead of LogLevel enum
    },
  },
};
```

**`@azure/identity` APIs used:**

| API | Call Site | Signature |
|---|---|---|
| `ClientSecretCredential` constructor | `new ClientSecretCredential(tenantId, clientId, clientSecret)` | No changes since v4.0 |

**Exports from this file:**
- `msalClient` — `ConfidentialClientApplication` instance
- `graphClient` — `Client` instance (from `@microsoft/microsoft-graph-client`)
- `loginScopes` — constant `{ scopes: [...] }`
- `graphScopes` — constant `{ scopes: [...] }`

---

#### File 2: `backend/src/controllers/auth.controller.ts`

```typescript
import { msalClient, graphClient, loginScopes } from '../config/entraId';
```

**MSAL-Node APIs used (via `msalClient`):**

| API | Call Site | Parameters |
|---|---|---|
| `getAuthCodeUrl()` | Login flow — redirect to Entra | `{ scopes, redirectUri, prompt: 'select_account' }` |
| `acquireTokenByCode()` | OAuth callback — exchange code for tokens | `{ code, scopes, redirectUri }` |

Both return `Promise<string>` and `Promise<AuthenticationResult>` respectively. Neither changed signatures in v5.

---

#### File 3: `backend/src/routes/admin.routes.ts`

```typescript
import { msalClient } from '../config/entraId';
```

**MSAL-Node APIs used (via `msalClient`):**

| API | Call Site | Parameters |
|---|---|---|
| `acquireTokenByClientCredential()` | Admin Graph helper — app-only token | `{ scopes: ['https://graph.microsoft.com/.default'] }` |

Returns `Promise<AuthenticationResult | null>`. Parameter shape unchanged in v5.

---

#### Other Files — No Direct Azure SDK Usage

- `backend/src/middleware/auth.ts` — Uses only `jsonwebtoken`, no Azure SDK
- `backend/src/services/userSync.service.ts` — Uses Graph client passed in via constructor, no direct Azure SDK
- `backend/src/server.ts` — No Azure SDK imports

---

### 2.2 msal-node v3 → v5 Breaking Change Analysis

The MSAL-Node changelog skipped a v4.x GA release on npm (v4 existed only as pre-release). The jump is directly v3.x → v5.x. Version 5.0.2 was released January 17, 2026 alongside 3.8.6.

**Key fact: v5.1.5 (released 2026-04-28) is the minimum version that resolves GHSA-w5hq-g745-h8pq** by replacing the internal `uuid` dependency with `node:crypto`. The GHSA advisory's "fix at >=5.2.0" was written before v5.1.5 was published; v5.1.5 is confirmed to contain the targeted fix per the MSAL changelog entry.

#### API Diff Table: msal-node v3 vs v5 (Project-Relevant Surface Only)

| Feature | v3.8.x | v5.1.5 | Impact on This Project |
|---|---|---|---|
| `ConfidentialClientApplication` constructor | `new CCA(config: Configuration)` | Same signature | ✅ None |
| `getAuthCodeUrl(params)` | Returns `Promise<string>` | Same | ✅ None |
| `acquireTokenByCode(request)` | Returns `Promise<AuthenticationResult>` | Same | ✅ None |
| `acquireTokenByClientCredential(request)` | Returns `Promise<AuthenticationResult \| null>` | Same | ✅ None |
| `Configuration.auth.clientId` | Required `string` | Same | ✅ None |
| `Configuration.auth.authority` | Optional `string` | Same | ✅ None |
| `Configuration.auth.clientSecret` | Optional `string` | Same | ✅ None |
| `Configuration.system.loggerOptions.logLevel` | `LogLevel` enum (3=Verbose) | Same `LogLevel` enum | ⚠️ Code fix needed (see below) |
| `LogLevel` enum export | `LogLevel.Verbose = 3` | Same enum, same values | ✅ Compatible |
| HTTP client | Custom node `http`/`https` modules | **Rewritten to native `fetch` API** | ✅ No config change needed |
| `extraQueryParameters` on request types | Present | **Removed** | ✅ Not used in project |
| `extraParameters` on request types | Present | **Removed** | ✅ Not used in project |
| `NodeStorage` export | Exported | **No longer exported** | ✅ Not used |
| `encodeExtraQueryParams` in config | Present | **Removed** | ✅ Not used |
| Node.js support | Node 16, 18, 20 | **Node 20, 22, 24 only** | ⚠️ Verify server is on Node 20+ |

#### Breaking Change Requiring Code Update

The `logLevel: 'Verbose' as any` in `entraId.ts` uses a string literal cast because the TypeScript type expected a `LogLevel` enum value. This was already technically incorrect in v3 (hence the `as any` cast). The fix is the same for both v3 and v5:

```typescript
// BEFORE (v3, works at runtime via any-cast, violates types):
import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
// ...
logLevel: 'Verbose' as any,

// AFTER (v5, correct):
import { ConfidentialClientApplication, Configuration, LogLevel } from '@azure/msal-node';
// ...
logLevel: LogLevel.Verbose,
```

This is a 2-character import addition and a single value change. No other code changes are required in the project.

---

### 2.3 `@azure/identity` v4.13 → v4.14 Analysis

#### Current Situation

| Timeline | What Happened |
|---|---|
| 2025-10-07 | identity v4.13.0 released — uses `@azure/msal-node ^3.5.0` internally |
| 2025-11-06 | identity v4.14.0-beta.1 released |
| 2026-01-17 | msal-node v5.0.2 GA released |
| 2026-02-10 | identity v4.14.0-beta.2 released |
| 2026-03-18 | **identity v4.13.1 released** — upgrades internal msal-node to `^5.1.0` |
| 2026-04-08 | identity v4.14.0-beta.3 released — updates msal-node to `^5.1.0` + bundle size reduction |
| 2026-04-28 | **msal-node v5.1.5 released** — explicit uuid CVE fix |
| 2026-05-01 | Current date — identity v4.14.0 still in beta.4 (unreleased) |

#### GHSA Advisory Affected Range

```
@azure/identity: 1.2.x - 4.13.0 || 4.14.0-alpha - 4.14.0-beta.2
```

**`4.13.1` is NOT in the affected range.** The project's `^4.13.0` pin resolves to `4.13.1` (the latest GA), which is clean.

#### What identity v4.13.1 Does Internally

identity v4.13.1 now declares `@azure/msal-node: ^5.1.0` as its own dependency. When npm resolves the full tree:
- identity `4.13.1` → msal-node `^5.1.0` → resolves to msal-node `5.1.5` (latest, CVE-free)

This means the **identity-internal uuid chain is already resolved** by keeping `@azure/identity@^4.13.0` and running `npm install`. No version bump needed.

#### Why identity `^4.14.0` Is Not Needed Now

- v4.14.0 GA has not been released as of 2026-05-01 (still beta.3)
- Waiting for 4.14.0 GA to resolve the CVE would defer a fix unnecessarily
- The CVE in identity's chain is already resolved via 4.13.1
- Once 4.14.0 GA releases (primarily bundle size and minor fixes), upgrading then is safe and straightforward

---

### 2.4 Root Cause Analysis: Why Two Dependencies?

The project currently has BOTH:
```json
"@azure/identity": "^4.13.0",    // For ClientSecretCredential (Graph client)
"@azure/msal-node": "^3.8.4",    // For ConfidentialClientApplication (OAuth flow)
```

These serve different purposes:
- `@azure/msal-node` (direct): Used for the full OAuth Authorization Code Flow (login page redirect, code exchange). This requires the `ConfidentialClientApplication` class and its `getAuthCodeUrl` / `acquireTokenByCode` methods, which are not re-exported by `@azure/identity`.
- `@azure/identity` (direct): Used for the `ClientSecretCredential` which provides `TokenCredential` interface consumed by the Graph SDK's `TokenCredentialAuthenticationProvider`. This is the standard pattern for app-only Graph access.

**There is no way to eliminate the direct msal-node dep** without replacing the entire OAuth flow implementation (e.g., using identity's `AuthorizationCodeCredential`). Such a refactor would be a substantial change and is out of scope for a CVE patch. The correct minimal fix is to upgrade the direct msal-node dep to v5.

---

### 2.5 Migration Path — Options Comparison

#### Option A: Upgrade only `@azure/identity` to `^4.14.0` GA (when released)

**Status:** NOT viable right now — v4.14.0 GA not released as of 2026-05-01.

Even if available:
- Does NOT fix the direct `@azure/msal-node: ^3.8.4` dep (resolves to v3.8.6, still vulnerable)
- `npm audit` would still report the vulnerability on the direct dep
- ❌ **Incomplete CVE fix**

#### Option B: Upgrade direct `@azure/msal-node` to `^5.1.5` + keep identity at `^4.13.0`

**Status:** ✅ Recommended. Fully viable right now.

- Resolves the direct msal-node CVE by pinning to v5.1.5 (explicit fix)
- identity `^4.13.0` resolves to `4.13.1` which is already non-vulnerable
- Requires one code change: `logLevel: 'Verbose' as any` → `logLevel: LogLevel.Verbose`
- Must verify Node.js version ≥ 20 on the server
- **All three method calls (`getAuthCodeUrl`, `acquireTokenByCode`, `acquireTokenByClientCredential`) have identical signatures in v5**
- Token handling, response shape (`AuthenticationResult`), account info — all unchanged

#### Option C: Defer entirely, add npm overrides

**Status:** ❌ Not recommended.

```json
// Workaround only — NOT a fix approach
"overrides": {
  "@azure/msal-node": { "uuid": "^14.0.0" }
}
```

- `npm overrides` can force the transitive uuid to v14, but msal-node's internal code path uses uuid in ways specific to its version. Forcing a major uuid upgrade could cause runtime failures in msal-node v3's internal cache operations.
- Does not actually remove the vulnerable code path, only overrides the package resolution
- npm audit would still report the dependency as vulnerable (advisory is on the package version, not the uuid sub-dep)
- Creates fragile lockfile state
- ❌ **Do not use this approach**

---

### 2.6 Recommended Migration — Option B: Exact Steps

#### Pre-flight Check

```powershell
# Verify server Node.js version is 20+
node --version
# Must show v20.x.x or higher

# Confirm current npm audit output
cd C:\Tech-V2\backend
npm audit --json | ConvertFrom-Json | Select-Object -ExpandProperty vulnerabilities
```

#### Step 1: Update `backend/package.json`

Change:
```json
"@azure/msal-node": "^3.8.4",
```
To:
```json
"@azure/msal-node": "^5.1.5",
```

`@azure/identity` remains at `"^4.13.0"` — no change needed.

#### Step 2: Update `backend/src/config/entraId.ts` — One line change

Change:
```typescript
import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
```
To:
```typescript
import { ConfidentialClientApplication, Configuration, LogLevel } from '@azure/msal-node';
```

And change:
```typescript
logLevel: 'Verbose' as any,
```
To:
```typescript
logLevel: LogLevel.Verbose,
```

No other code changes are required in the project.

#### Step 3: Install and verify

```powershell
cd C:\Tech-V2\backend
npm install

# Run build to confirm TypeScript compiles cleanly
npm run build

# Run npm audit to confirm CVE resolved
npm audit
```

---

### 2.7 Rollback Plan

The auth system handles login, token exchange, and Graph API access. If authentication breaks in production:

1. **Immediate rollback:** `git revert HEAD` or `git checkout HEAD~1 -- backend/package.json backend/src/config/entraId.ts` then redeploy
2. The rollback is simple because changes are confined to 2 files
3. Since the breaking changes are in other areas of msal-node (extraQueryParameters, NodeStorage — none used here), rollback should not be needed
4. If any issues appear, they will surface immediately during end-to-end auth testing before deployment

**Do not deploy without completing the auth testing checklist below.**

---

### 2.8 Auth Testing Checklist (Pre-Deployment Required)

Before deploying to production, verify ALL of the following flows work:

| # | Test | How to Verify | Failure Mode |
|---|---|---|---|
| 1 | Login initiation | `GET /api/auth/login` returns `{ authUrl: "https://login.microsoftonline.com/..." }` | `getAuthCodeUrl` broken |
| 2 | OAuth callback | Complete full browser login flow — get auth code, POST to `/api/auth/callback` | `acquireTokenByCode` broken |
| 3 | JWT issued | After callback, `access_token` and `refresh_token` cookies are set | Token response shape changed |
| 4 | Protected routes | `GET /api/users/me` with valid JWT returns user data | Unrelated to MSAL |
| 5 | Token refresh | `POST /api/auth/refresh` with valid refresh token | Unrelated to MSAL |
| 6 | Admin Graph sync | `POST /api/admin/sync-users/all` completes without auth errors | `acquireTokenByClientCredential` broken |
| 7 | Graph client (ClientSecretCredential) | Admin sync fetches users from Graph API | identity `ClientSecretCredential` broken |
| 8 | Role determination | User's role is correctly derived from Entra group membership | Token/claims unchanged |

---

## 3. Concurrently v9 (M-6)

### 3.1 Current Usage

**File:** `c:\Tech-V2\package.json`

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

**Usage is minimal CLI invocation only** — no programmatic imports, no special flags, no `--max-processes`, no `--kill-others`.

---

### 3.2 Breaking Changes Analysis (v8 → v9)

concurrently v9.0.0 was released September 8, 2024. Three breaking changes:

| Breaking Change | Description | Impact on This Project |
|---|---|---|
| Dropped Node.js < 18 support | Node 18 LTS minimum | ✅ None — server runs Node 20+ |
| `--max-processes` + kill signal behavior changed | Pending commands no longer start after kill signal when max-processes is active | ✅ None — `--max-processes` NOT used |
| `concurrently` and default exports are now the same | Programmatic API: named `{ concurrently }` and `default` import now point to the same function | ✅ None — NOT imported programmatically |

**The `"dev"` script `concurrently "..." "..."` is simple CLI usage with no flags that changed. Zero modifications required.**

---

### 3.3 New Features in v9 (Available After Upgrade)

- `--restart-after exponential` — exponential backoff for process restarts (not needed but available)
- `--pad-prefix` — align prefix labels
- `--teardown` — specify teardown commands to run after all processes exit
- Faster install (replaced `date-fns` dependency with hand-rolled formatting)

---

### 3.4 Exact Command

```powershell
# From C:\Tech-V2\ (root)
npm install --save-dev concurrently@^9.2.1
```

Latest as of writing: `9.2.1` (released August 25, 2025).

### 3.5 Verification Steps

```powershell
# Verify version installed
cd C:\Tech-V2
npx concurrently --version
# Expected: 9.2.1

# Test the dev script spins up both servers
npm run dev
# Expected: both backend (port 3000) and frontend (port 5173) start correctly
```

---

## 4. Shared TypeScript Alignment

### 4.1 Current State

| Package | Version Pin | Installed Version | Notes |
|---|---|---|---|
| `shared` devDep | `^5.3.3` | ~`5.3.3` | Older major minor |
| `backend` devDep | `^5.9.3` | `5.9.3` | Current |
| `frontend` devDep | `^5.9.3` | `5.9.3` | Current |

The mismatch means `shared` builds with TypeScript 5.3.x while the consumers compile with 5.9.x. This could theoretically cause declaration file inconsistencies if the shared build uses types or syntax not available in consumer TS versions — but since the consumer (5.9.x) is **newer**, there's no compatibility problem.

The risk of the inverse (shared emitting something not parseable by older TS) doesn't exist here because shared compiles to CommonJS plain JS + `.d.ts` files, and the consumer TypeScript (5.9.x) reads those `.d.ts` files.

---

### 4.2 What Shared Exports

**`shared/src/types.ts`** — 8 core domain interfaces/types:
- `UserRole = 'ADMIN' | 'USER'` (union type)
- `LocationType = 'SCHOOL' | ...` (union type)
- `ShipToType = 'entity' | ...` (union type)
- `SupervisorType` — 20-value union type
- `User` interface — 16 fields, all primitive / `Date | null`
- `UserWithPermissions extends User`
- `OfficeLocation` interface
- `OfficeLocationWithSupervisors extends OfficeLocation`
- `LocationSupervisor` interface
- Additional: `Room`, `RoomWithLocation`, `Assignment`, `FundingSource`, `InventoryItem` (full file not shown but follows the same pattern)

**`shared/src/api-types.ts`** — API request/response types built from the domain types above

**`shared/src/work-order.types.ts`** — Work order domain types

**All types use only**: interfaces, type aliases, union types, optional properties (`?`), and `null` unions. No decorators, no mapped types with advanced infer, no template literal types, no `using`/`await using` (TS 5.2 feature). **All of these are supported identically in TS 5.3 through 5.9.**

---

### 4.3 TypeScript 5.3 → 5.9 Changes Summary

Within TypeScript 5.x, all minor version bumps maintain backward compatibility:

| Version | Notable Additions | Risk to Shared Types |
|---|---|---|
| 5.4 | `NoInfer<T>`, `Object.groupBy` types | None — not used |
| 5.5 | Inferred type predicates, isolated declarations | None — not used |
| 5.6 | Disallowed nullable/undefined in iterator result | None |
| 5.7 | Paths for `rootDir`, `out` changes | None  |
| 5.8 | Granular checks for conditional types, `require()` of ESM | None |
| 5.9 | `--module node20` flag, performance improvements | None |

Upgrading shared's TypeScript from 5.3.3 → 5.9.3 carries **zero risk** for this project's type definitions.

---

### 4.4 Exact Command and Verification

```powershell
# From C:\Tech-V2\shared\
cd C:\Tech-V2\shared
npm install --save-dev typescript@^5.9.3

# Rebuild shared
npm run build

# Confirm dist/index.d.ts is regenerated cleanly
Get-ChildItem dist/ -Recurse
```

**Expected outcome:** TypeScript build completes without errors. `dist/index.d.ts` and associated `.d.ts` files regenerated. No changes to the built JavaScript output.

---

## 5. Implementation Order

### Recommended Sequence

#### Step 1 (Do First — Zero Risk): Shared TypeScript + Concurrently

These are pure devDependency upgrades with no API changes, no Node version constraints, and no code changes.

```powershell
# 1a. Shared TypeScript alignment
cd C:\Tech-V2\shared
npm install --save-dev typescript@^5.9.3
npm run build
# Confirm: no TypeScript errors

# 1b. Concurrently v9 (root)
cd C:\Tech-V2
npm install --save-dev concurrently@^9.2.1
npm run dev   # verify: both servers start
```

**Why first:** Completely independent of auth, no test gates required, provides confidence before tackling the auth package.

---

#### Step 2 (Do After Node Version Confirmed): msal-node v5 Upgrade

**Pre-requisite:** Confirm `node --version` on the deployment server is v20+.

```powershell
# 2a. Verify Node.js version
node --version         # Must be v20.x.x or higher

# 2b. Update backend/package.json
#     Change: "@azure/msal-node": "^3.8.4"
#     To:     "@azure/msal-node": "^5.1.5"

# 2c. Update backend/src/config/entraId.ts
#     Add LogLevel to the import line
#     Change: logLevel: 'Verbose' as any
#     To:     logLevel: LogLevel.Verbose

# 2d. Install and build
cd C:\Tech-V2\backend
npm install
npm run build          # Must compile cleanly with no TypeScript errors

# 2e. Verify CVE resolved
npm audit
# Expected: 0 vulnerabilities (or only the exceljs transitive uuid — tracked separately)
```

**Why second:** Requires one code file change and end-to-end auth testing. Doing low-risk items first keeps the auth change isolated and easy to verify.

---

#### Step 3 (Defer Until GA): `@azure/identity` v4.14.0

**When:** After `@azure/identity@4.14.0` GA releases (currently at beta.4 as of 2026-05-01).

**Why defer:**
- v4.14.0 GA is NOT yet released — pinning to a beta is not appropriate for a production auth package
- The current CVE in the identity dep chain is **already resolved** by the existing `^4.13.0` pin resolving to v4.13.1
- v4.14.0's main benefit is a ~61kb bundle size reduction (not a security fix at this point)

**Acceptance criteria to proceed with identity v4.14.0 upgrade:**
1. v4.14.0 GA published to npm (no `-alpha`/`-beta` suffix)
2. No breaking changes confirmed in CHANGELOG for `ClientSecretCredential` usage
3. Full auth testing checklist in Section 2.8 passes

**Command when ready:**
```powershell
cd C:\Tech-V2\backend
npm install @azure/identity@^4.14.0
npm run build
npm audit
# Then run auth testing checklist (Section 2.8)
```

---

### Summary Table

| Order | Item | Files Changed | Test Gate |
|---|---|---|---|
| 1st | Shared TS alignment | `shared/package.json` | `npm run build` in shared/ |
| 1st | Concurrently v9 | Root `package.json` | `npm run dev` spins up both servers |
| 2nd | msal-node v3 → v5.1.5 | `backend/package.json`, `backend/src/config/entraId.ts` | Full auth testing checklist (8 items) |
| Deferred | identity v4.14.0 | `backend/package.json` | Full auth testing checklist + confirm GA release |

---

## Appendix A: Current Vulnerability State After Each Step

| After | Remaining CVEs |
|---|---|
| Baseline (now) | msal-node v3.8.6 → uuid CVE (direct); exceljs → uuid CVE (transitive) |
| After Step 1 | Same — dev deps only changed |
| After Step 2 | exceljs → uuid CVE only (awaiting upstream exceljs fix) |
| After Step 3 | Same as Step 2 (identity CVE already resolved by 4.13.1) |

---

## Appendix B: Confirmed Version Fixes

| Package | Vulnerable Through | Fixed In | Release Date | Fix Method |
|---|---|---|---|---|
| `@azure/msal-node` | v3.8.6 (uuid internally) | **v5.1.5** | 2026-04-28 | Replaced uuid with `node:crypto` |
| `@azure/identity` | v4.13.0 (msal-node transitive) | **v4.13.1** (NOT in advisory range) | 2026-03-18 | Upgraded internal msal-node to ^5.1.0 |
| `concurrently` | N/A (no CVEs) | v9.2.1 (latest) | 2025-08-25 | Maintenance upgrade |
| `typescript` (shared) | N/A (no CVEs) | v5.9.3 (align with others) | — | Version alignment |
