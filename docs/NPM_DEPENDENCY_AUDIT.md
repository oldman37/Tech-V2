# NPM Dependency Audit & Replacement Plan

> **PLAN ONLY — NO CHANGES IMPLEMENTED**
> This document is a security and maintenance audit. No `package.json` files have been modified and no packages have been installed or removed. All remediation steps require explicit team approval and testing in a development environment before execution.

---

**Date of Audit:** May 1, 2026
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)
**Project:** Tech-V2 (MGSPE) — Node.js/TypeScript Monorepo

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Audit Scope](#2-audit-scope)
3. [Findings by Severity](#3-findings-by-severity)
   - [3.1 CRITICAL](#31-critical--abandoned-with-active-security-cves)
   - [3.2 HIGH](#32-high--active-cves-or-officially-archived)
   - [3.3 MEDIUM](#33-medium--moderate-cves-or-significant-staleness)
   - [3.4 LOW](#34-low--minor-concerns)
4. [Complete Package Inventory](#4-complete-package-inventory)
5. [Prioritized Replacement Roadmap](#5-prioritized-replacement-roadmap)
6. [Migration Guides](#6-migration-guides)
7. [Security Notes](#7-security-notes)
8. [Commands Reference](#8-commands-reference)

---

## 1. Executive Summary

| Field | Value |
|---|---|
| **Date of Audit** | May 1, 2026 |
| **Total Package Entries Audited** | 65 (across 4 `package.json` files) |
| **`npm audit` Result** | 29 vulnerabilities — 13 moderate, 16 high |
| **Direct Dependencies Flagged** | 13 packages require action |
| **No Fix Available (npm audit)** | 1 package (`xlsx`) |

### Findings Summary

| Severity | Count | Packages |
|---|---|---|
| **CRITICAL** | 1 | `xlsx` (abandoned, active HIGH CVEs, no npm fix path) |
| **HIGH** | 4 | `multer`, `express-rate-limit`, `vite`, `ts-node-dev` |
| **MEDIUM** | 7 | `axios`, `nodemailer`, `uuid`, `@azure/msal-node`, `@azure/identity`, `@microsoft/microsoft-graph-client`, `concurrently` |
| **LOW** | 3 | `shared` TypeScript version misalignment, `@mui/lab` beta, duplicate `xlsx` in root `package.json` |

### Key Takeaways

- **`xlsx` is the highest-risk package** in the project. It was last published in March 2022, has active HIGH-severity CVEs with no fix on npm, and directly processes user-uploaded spreadsheet files — a production attack surface. Replacement with `exceljs` is the top priority.
- **Four packages have patches available immediately** via `npm install` with no API changes: `multer`, `express-rate-limit`, `nodemailer`, and `vite`.
- **`ts-node-dev` was officially archived** on December 19, 2025. `tsx` is already installed and in use — removal is a one-line operation.
- After completing Sprint 1 and Sprint 2 remediations, the vulnerability count is expected to drop from **29 to approximately 4–6**.

---

## 2. Audit Scope

### Package.json Files Audited

| File | Location | Role |
|---|---|---|
| `backend/package.json` | `c:\Tech-V2\backend\package.json` | Primary backend API (Express/Node.js/TypeScript) |
| `frontend/package.json` | `c:\Tech-V2\frontend\package.json` | React 19 SPA (Vite/MUI/TanStack) |
| `shared/package.json` | `c:\Tech-V2\shared\package.json` | Shared TypeScript type definitions |
| `package.json` (root) | `c:\Tech-V2\package.json` | npm workspace root, monorepo scripts |

### Methodology

| Tool / Method | Purpose |
|---|---|
| `npm audit` (run from project root) | Automated CVE detection against npm advisory database |
| Manual npm registry inspection | Verify publication dates, deprecation notices, maintenance status |
| GitHub repository review | Confirm archive status, commit activity, issue tracker health |
| Snyk security database cross-reference | Secondary CVE validation and severity scoring |
| Codebase grep search | Identify all usages of flagged packages for migration impact analysis |
| Spec file review | `c:\Tech-V2\docs\SubAgent\dependency_audit_spec.md` (pre-audit research) |

---

## 3. Findings by Severity

### 3.1 CRITICAL — Abandoned with Active Security CVEs

---

#### C-1: `xlsx` v0.18.5

| Field | Detail |
|---|---|
| **Package** | `xlsx` v0.18.5 |
| **Location** | `backend/package.json` (production), `package.json` (root, duplicate) |
| **Last npm Publish** | March 2022 — **4+ years ago**. v0.18.5 is the final npm release ever. |
| **GitHub Status** | Official GitHub repo redirected to self-hosted GitLab at `git.sheetjs.com`. Mirror frozen ~2 years ago. |
| **`npm audit fix`** | `No fix available` |

**CVEs:**

| CVE / Advisory | Severity | Type | Status |
|---|---|---|---|
| GHSA-5pgg-2g8v-p4x9 | HIGH | ReDoS (Regular Expression Denial of Service) | No npm fix |
| GHSA-4r6h-8v6p-xvw6 | HIGH | Prototype Pollution | No npm fix |

**Issue:** Both vulnerabilities are exploitable through malformed input files. Given the backend has a live endpoint that accepts user-uploaded `.xlsx` files (inventory import), this is a **direct, production-exposed attack surface**. An attacker who can upload a crafted spreadsheet can cause server-side denial of service (ReDoS) or pollute the Node.js prototype chain (Prototype Pollution), potentially leading to privilege escalation or unexpected behavior across unrelated request handlers.

**Codebase Usage:**

The package is actively used in three files:

| File | Usage |
|---|---|
| `backend/src/services/inventoryImport.service.ts` | Buffer parse via `XLSX.read()`, JSON extraction via `XLSX.utils.sheet_to_json()` — **production code, user-uploaded files** |
| `backend/scripts/read-inventory-excel.ts` | File read via `XLSX.readFile()` — utility script |
| `backend/scripts/read-excel.ts` | File read via `XLSX.readFile()` — utility script |

**Recommended Replacement:** [`exceljs`](https://github.com/exceljs/exceljs) — MIT licensed, 13k+ GitHub stars, actively maintained, full TypeScript support.

**Migration Complexity:** HIGH — The API differs significantly from `xlsx`. See [Section 6.1](#61-xlsx--exceljs-migration-guide) for detailed migration steps and code examples.

**Breaking Changes:**
- `exceljs` uses an async/streaming API vs. `xlsx`'s synchronous API
- Sheet access is via `workbook.worksheets[index]` or `workbook.getWorksheet(name)` rather than `workbook.Sheets[name]`
- JSON row extraction requires manual iteration (`worksheet.eachRow()`) or a helper function — no direct `sheet_to_json` equivalent
- File reading is `await workbook.xlsx.readFile()` vs `XLSX.readFile()`
- Buffer reading is `await workbook.xlsx.load(buffer)` vs `XLSX.read(buffer, { type: 'buffer' })`
- `cellDates: true` behavior must be replicated via row value type checking (`cell.type === ExcelJS.ValueType.Date`)

---

### 3.2 HIGH — Active CVEs or Officially Archived

---

#### H-1: `multer` v2.0.2

| Field | Detail |
|---|---|
| **Package** | `multer` v2.0.2 |
| **Location** | `backend/package.json` (production) |
| **CVEs** | GHSA-xf7r-hgr6-v32p, GHSA-v52c-386h-88mc, GHSA-5528-5vmv-3xc2 |
| **Affected Range** | `multer <= 2.1.0` |
| **Fix** | Update to `multer >= 2.1.1` |
| **`npm audit fix`** | Available — non-breaking |

**Issue:** All three CVEs are Denial of Service vulnerabilities triggered by malformed multipart upload requests: uncontrolled recursion, resource exhaustion, and incomplete request cleanup. The backend uses multer for purchase order attachments and equipment file uploads — direct exposure on production upload endpoints.

**Recommended Replacement:** Update in place — `multer@latest` (≥2.1.1). No API changes.

**Migration Complexity:** LOW

**Migration Steps:**
1. `cd backend && npm install multer@latest`
2. Rebuild backend: `npm run build`
3. Test all file-upload endpoints (inventory import, PO attachments)
4. Verify multipart form submissions complete without errors

**Breaking Changes:** None expected between 2.0.2 and 2.1.x.

---

#### H-2: `express-rate-limit` v8.2.1

| Field | Detail |
|---|---|
| **Package** | `express-rate-limit` v8.2.1 |
| **Location** | `backend/package.json` (production) |
| **CVE** | GHSA-46wh-pxpv-q5gq |
| **Affected Range** | `express-rate-limit 8.2.0 – 8.2.1` |
| **Fix** | Update to `express-rate-limit >= 8.2.2` |
| **`npm audit fix`** | Available — non-breaking |

**Issue:** IPv4-mapped IPv6 addresses (e.g., `::ffff:1.2.3.4`) are treated as distinct clients from their IPv4 equivalents, bypassing per-client rate limiting. This defeats brute-force protection on all rate-limited routes — including authentication endpoints.

**Recommended Replacement:** Update in place — `express-rate-limit@latest` (≥8.2.2). No API changes.

**Migration Complexity:** LOW

**Migration Steps:**
1. `cd backend && npm install express-rate-limit@latest`
2. Rebuild backend: `npm run build`
3. Verify rate limiting behavior on login/auth endpoints

**Breaking Changes:** None expected.

---

#### H-3: `vite` v7.3.1

| Field | Detail |
|---|---|
| **Package** | `vite` v7.3.1 |
| **Location** | `frontend/package.json` (devDependency) |
| **CVEs** | GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583 |
| **Affected Range** | `vite 7.0.0 – 7.3.1` |
| **Fix** | Update to `vite >= 7.3.2` |
| **`npm audit fix`** | Available — non-breaking |

**Issue:** Three separate HIGH vulnerabilities in Vite's dev server:
- Path traversal via `.map` source files  
- `server.fs.deny` bypass via URL query parameters
- Arbitrary file read via dev server WebSocket connection

Production risk is low since Vite is a dev tool and is not deployed. However, developers running `vite dev` on network-exposed machines (or in CI environments with an exposed host) are directly vulnerable. Should still be patched promptly.

**Migration Complexity:** LOW

**Migration Steps:**
1. `cd frontend && npm install vite@latest`
2. Run `npm run build` to verify the production build succeeds
3. Run `npm run dev` briefly to confirm dev server starts without issues

**Breaking Changes:** None expected (patch update within v7.x).

---

#### H-4: `ts-node-dev` v2.0.0

| Field | Detail |
|---|---|
| **Package** | `ts-node-dev` v2.0.0 |
| **Location** | `backend/package.json` (devDependency) |
| **Archive Date** | December 19, 2025 — **officially archived by the repository owner** |
| **Last Release** | v2.0.0 — May 26, 2022 (3+ years ago) |
| **CVE (transitive)** | GHSA — ReDoS and method injection via `picomatch <= 2.3.1` (pulled in by ts-node-dev) |

**Issue:** The repository is archived, meaning no security patches will ever be released. The package pulls in a vulnerable version of `picomatch` with high-severity ReDoS and method injection. Crucially, **`tsx` is already installed and actively used** — the `dev` script in `backend/package.json` already runs `tsx watch src/server.ts`, and all scripts in the `scripts/` directory use `tsx`. `ts-node-dev` is completely redundant dead weight.

**Recommended Replacement:** No replacement needed — `tsx` is already the active runner.

**Migration Complexity:** LOW

**Migration Steps:**
1. Verify no `package.json` scripts reference `ts-node-dev` or `tsnd` (none found in audit)
2. Verify no scripts in `backend/scripts/` use `ts-node-dev` (none found)
3. `cd backend && npm uninstall ts-node-dev`
4. Rebuild and test: `npm run build && npm run dev`

**Breaking Changes:** None — `tsx` is already the active runner.

---

### 3.3 MEDIUM — Moderate CVEs or Significant Staleness

---

#### M-1: `axios` v1.13.2

| Field | Detail |
|---|---|
| **Package** | `axios` v1.13.2 |
| **Location** | `frontend/package.json` (production) |
| **CVEs** | GHSA-3p68-rc4w-qgx5 (NO_PROXY bypass → SSRF), GHSA-fvcv-3m26-pcqx (header injection → cloud metadata exfiltration) |
| **Affected Range** | `axios 1.0.0 – 1.14.0` |
| **Fix** | Update to `axios >= 1.15.0` |
| **`npm audit fix`** | Available — non-breaking |

**Issue:** Both vulnerabilities require specific network conditions (proxy configurations or attacker-controlled headers). Frontend usage has lower direct exposure than server-side fetching, but patching is straightforward and eliminates the risk entirely. The `follow-redirects` transitive CVE (header leak, MODERATE) is also resolved by this update.

**Migration Complexity:** LOW

**Migration Steps:**
1. `cd frontend && npm install axios@latest`
2. Run `npm run build` to confirm the frontend compiles
3. Smoke-test authenticated API calls in a dev environment

**Breaking Changes:** None expected in minor update.

---

#### M-2: `nodemailer` v8.0.2

| Field | Detail |
|---|---|
| **Package** | `nodemailer` v8.0.2 |
| **Location** | `backend/package.json` (production) |
| **CVEs** | GHSA-c7w3-x93f-qmm8 (SMTP command injection via `envelope.size`), GHSA-vvjj-xcjg-gr5g (SMTP CRLF injection via transport name in EHLO/HELO) |
| **Affected Range** | `nodemailer <= 8.0.4` |
| **Fix** | Update to `nodemailer >= 8.0.5` |
| **`npm audit fix`** | Available — non-breaking |

**Issue:** If any email field (recipient name, subject line, attachment filename) is influenced by user-supplied input without sanitization, SMTP injection allows header manipulation or sending unauthorized email through the server's transport. This is a patch-level update with no API changes.

**Migration Complexity:** LOW

**Migration Steps:**
1. `cd backend && npm install nodemailer@latest`
2. Rebuild and test email-sending flows (notifications, PO emails if applicable)

**Breaking Changes:** None expected (patch update within 8.x).

---

#### M-3: `uuid` v13.0.0

| Field | Detail |
|---|---|
| **Package** | `uuid` v13.0.0 |
| **Location** | `backend/package.json` (production) |
| **CVE** | GHSA-w5hq-g745-h8pq (missing buffer bounds check in `v3`/`v5`/`v6` when `buf` parameter is provided) |
| **Affected Range** | `uuid < 14.0.0` |
| **Fix** | Update to `uuid@14` |
| **`npm audit fix`** | `--force` required — **breaking change** |

**Issue:** The vulnerability is only triggered when the optional `buf` parameter is passed to `uuid.v3()`, `uuid.v5()`, or `uuid.v6()`. If the project exclusively uses `uuid.v4()` without the `buf` parameter (check with `grep -r "v3\|v5\|v6\|buf" backend/src/`), the vulnerability is unexploitable at current usage. However, upgrading to v14 is still recommended.

**Important Side Effect:** `@azure/msal-node` and `@azure/identity` have their own internal copies of `uuid < 14.0.0`. Updating the direct `uuid` dependency in `backend/package.json` does **not** fix the azure packages' internal copies — those require their own updates (see M-4).

**Migration Complexity:** MEDIUM

**Migration Steps:**
1. Audit current `uuid` usage: `grep -r "uuid\|v3()\|v5()\|v6()" backend/src/`
2. Confirm no `buf` parameter is passed to any `uuid` function
3. `cd backend && npm install uuid@14 @types/uuid@14`
4. Rebuild (`npm run build`) and check for any import errors
5. Test any code paths that generate UUIDs

**Breaking Changes:**
```typescript
// v13 and earlier — import unchanged:
import { v4 as uuidv4 } from 'uuid';
const id = uuidv4(); // Still works in v14

// The ONLY breaking changes in v14:
// - Buffer-parameter usage of v3/v5/v6 (bounds behavior changed)
// - Some internal utility exports removed (not part of public API)
// Standard uuidv4() usage is fully compatible
```

---

#### M-4: `@azure/msal-node` v3.8.4 / `@azure/identity` v4.13.0

| Field | Detail |
|---|---|
| **Packages** | `@azure/msal-node` v3.8.4 and `@azure/identity` v4.13.0 |
| **Location** | `backend/package.json` (production) |
| **CVE (transitive)** | GHSA-w5hq-g745-h8pq via internal `uuid < 14.0.0` |
| **Fix for msal-node** | `@azure/msal-node >= 5.2.0` (2 major version jump: v3 → v5) |
| **Fix for identity** | `@azure/identity >= 4.14.0` GA when released |
| **`npm audit fix`** | Not automatically resolvable — major version jump |

**Issue:** Both Azure packages carry their own internal copies of `uuid < 14.0.0`. Actual exploitability requires passing the `buf` parameter internally within the Azure SDK — an unlikely internal usage pattern, making real-world exploit risk low. However, the CVE will persist in `npm audit` output until these packages are updated.

> **Caution:** Do not upgrade `@azure/msal-node` and `@azure/identity` in the same PR as other dependency changes. These packages control authentication for all users. Any authentication regression would be a Sev-1 incident.

**Migration Complexity:** HIGH

**Migration Steps:**
1. Review the [msal-node v3→v5 CHANGELOG](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/CHANGELOG.md) for all breaking changes
2. Update in a dedicated feature branch with full auth regression testing
3. `cd backend && npm install @azure/msal-node@latest`
4. Monitor [Azure Identity releases](https://github.com/Azure/azure-sdk-for-js/releases) for `@azure/identity@4.14.0` GA
5. Test: interactive login, token acquisition, Graph API calls, supervisor sync scripts

**Breaking Changes:** API changes between msal-node v3 → v5 must be researched in the official changelog before migration. Do not upgrade blindly.

---

#### M-5: `@microsoft/microsoft-graph-client` v3.0.7

| Field | Detail |
|---|---|
| **Package** | `@microsoft/microsoft-graph-client` v3.0.7 |
| **Location** | `backend/package.json` (production) |
| **Last npm Release** | September 19, 2023 (~2.5 years ago) |
| **Known CVEs** | None currently known |
| **GitHub Activity** | Dependabot security PRs only — no feature development since v3.0.7 |
| **Successor** | `@microsoft/msgraph-sdk` (Kiota-generated next-gen SDK, in active development) |

**Issue:** No immediate security risk. The package is functionally stable but receiving no new development. Microsoft is building a replacement Kiota-based SDK. No formal deprecation notice has been issued as of May 2026. No action required now — monitor for deprecation announcement.

**Migration Complexity:** HIGH (future)

See [Section 6.3](#63-microsoft-graph-client-v3--kiota-sdk-future-migration) for the forward-looking migration path.

---

#### M-6: `concurrently` v8.2.2

| Field | Detail |
|---|---|
| **Package** | `concurrently` v8.2.2 |
| **Location** | `package.json` (root, devDependency) |
| **Current Latest** | v9.2.1 (released August 25, 2025) |
| **Semver Gap** | One major version behind (`^8.2.2` vs v9.x) |
| **Known CVEs** | None |

**Issue:** No security risk. `concurrently` v9 is the current stable release. The only breaking change in v9 is dropped support for Node.js 18 LTS. Confirm the project runs on Node.js 20+ before upgrading.

**Migration Complexity:** LOW

**Migration Steps:**
1. Verify Node.js version: `node --version` (must be ≥20)
2. `npm install concurrently@latest --save-dev` (from project root)
3. Test `npm run dev` (which runs both backend and frontend concurrently)

**Breaking Changes:** None if Node.js ≥20. Dropped Node.js 18 support only.

---

### 3.4 LOW — Minor Concerns

| # | Package | Location | Issue | Recommended Action |
|---|---|---|---|---|
| L-1 | `typescript` v5.3.3 | `shared/package.json` | Older pin than backend/frontend (both use `^5.9.3`). Only affects shared type compilation, no runtime impact. | Align to `^5.9.3` in a maintenance PR |
| L-2 | `xlsx` v0.18.5 (duplicate) | `package.json` (root) | Duplicate of the backend's `xlsx` entry. Creates confusion in the npm workspace. Remove after CRITICAL C-1 replacement is complete. | `npm uninstall xlsx` from root (post C-1) |
| L-3 | `@mui/lab` v7.0.1-beta.22 | `frontend/package.json` | Beta package — some components may graduate to `@mui/material` core in MUI v8. No CVEs; functional risk only. | Monitor MUI v8 changelog for component graduation |

#### Transitive-Only Vulnerabilities (Resolved by Parent Updates)

These packages are **not** directly declared in any project `package.json`. They exist as transitive dependencies. **No direct action is required** — fixing the parent package listed in the "Resolves Via" column is sufficient.

| Vulnerable Transitive Package | Severity | Parent to Update | Resolves Via |
|---|---|---|---|
| `path-to-regexp` 8.0.0–8.3.0 | HIGH (ReDoS) | `express` (transitive chain) | `npm audit fix` |
| `rollup` 4.0.0–4.58.0 | HIGH (path traversal) | `vite` (H-3 fix) | Fix H-3 |
| `follow-redirects` ≤1.15.11 | MODERATE (header leak) | `axios` (M-1 fix) | Fix M-1 |
| `hono` ≤4.12.13 | HIGH (XSS, cache deception, traversal) | `prisma` (auto-update) | `npm audit fix` |
| `@hono/node-server` ≤1.19.12 | HIGH (static path bypass) | `prisma` (auto-update) | `npm audit fix` |
| `defu` ≤6.1.4 | HIGH (prototype pollution) | `prisma` (auto-update) | `npm audit fix` |
| `effect` <3.20.0 | HIGH (context leak) | `prisma` (auto-update) | `npm audit fix` |
| `lodash` ≤4.17.23 | HIGH (prototype pollution) | `prisma` → `chevrotain` | `npm audit fix` |
| `picomatch` ≤2.3.1 | HIGH (ReDoS, method injection) | `ts-node-dev` (H-4 removal) + `vite` fix | Fix H-3 + H-4 |
| `minimatch` ≤3.1.3 | HIGH (ReDoS) | Various transitive | `npm audit fix` |
| `brace-expansion` <1.1.13 | MODERATE (hang/OOM) | Various transitive | `npm audit fix` |
| `postcss` <8.5.10 | MODERATE (XSS) | Various transitive | `npm audit fix` |
| `yaml` 1.0.0–1.10.2 / 2.0.0–2.8.2 | MODERATE (stack overflow) | `cosmiconfig` (transitive) | `npm audit fix` |

> **Note on `inflight`:** The `inflight` package was renamed to `inflight-DEPRECATED-DO-NOT-USE` in 2024 and is formally deprecated. It does not appear as a **direct** dependency in this project and exists only as a deep transitive dependency. No direct action required.

---

## 4. Complete Package Inventory

### Backend (`backend/package.json`) — Production Dependencies

| Package | Current Version | Target Version | Status | Priority |
|---|---|---|---|---|
| `@azure/identity` | `^4.13.0` | `>=4.14.0 GA` | ⚠️ CVE (transitive uuid) | MEDIUM (M-4) |
| `@azure/msal-node` | `^3.8.4` | `>=5.2.0` | ⚠️ CVE (transitive uuid) | MEDIUM (M-4) |
| `@microsoft/microsoft-graph-client` | `^3.0.7` | Monitor | ⚠️ Stale (no releases since Sep 2023) | MEDIUM (M-5) |
| `@prisma/adapter-pg` | `^7.2.0` | Current | ✅ Up to date | — |
| `@prisma/client` | `^7.2.0` | Current | ✅ Up to date (transitive issues, fixable) | LOW |
| `@types/multer` | `^2.0.0` | Current | ✅ Up to date | — |
| `cookie-parser` | `^1.4.7` | Current | ✅ Up to date | — |
| `cors` | `^2.8.5` | Current | ✅ Up to date | — |
| `csv-parse` | `^6.1.0` | Current | ✅ Up to date | — |
| `dotenv` | `^17.2.3` | Current | ✅ Up to date | — |
| `express` | `^5.2.1` | Current | ✅ Up to date | — |
| `express-rate-limit` | `^8.2.1` | `>=8.2.2` | 🔴 CVE — rate limit bypass | HIGH (H-2) |
| `helmet` | `^8.1.0` | Current | ✅ Up to date | — |
| `jsonwebtoken` | `^9.0.3` | Current | ✅ Up to date | — |
| `morgan` | `^1.10.1` | Current | ✅ Up to date | — |
| `multer` | `^2.0.2` | `>=2.1.1` | 🔴 CVE — file upload DoS (3 CVEs) | HIGH (H-1) |
| `node-cron` | `^4.2.1` | Current | ✅ Up to date | — |
| `nodemailer` | `^8.0.2` | `>=8.0.5` | 🟠 CVE — SMTP injection (2 CVEs) | MEDIUM (M-2) |
| `pdfkit` | `^0.17.2` | Current | ✅ Up to date | — |
| `pg` | `^8.16.3` | Current | ✅ Up to date | — |
| `prisma` | `^7.2.0` | Current | ✅ Up to date (transitive fixable) | LOW |
| `uuid` | `^13.0.0` | `14.0.0` | 🟠 CVE — bounds check (breaking upgrade) | MEDIUM (M-3) |
| `winston` | `^3.19.0` | Current | ✅ Up to date | — |
| `winston-daily-rotate-file` | `^5.0.0` | Current | ✅ Up to date | — |
| `xlsx` | `^0.18.5` | **Replace with `exceljs`** | 🚨 CRITICAL — abandoned, 2 HIGH CVEs, no npm fix | CRITICAL (C-1) |
| `zod` | `^4.3.6` | Current | ✅ Up to date | — |

### Backend (`backend/package.json`) — Dev Dependencies

| Package | Current Version | Target Version | Status | Priority |
|---|---|---|---|---|
| `@types/cookie-parser` | `^1.4.10` | Current | ✅ Up to date | — |
| `@types/cors` | `^2.8.19` | Current | ✅ Up to date | — |
| `@types/express` | `^5.0.6` | Current | ✅ Up to date | — |
| `@types/jsonwebtoken` | `^9.0.10` | Current | ✅ Up to date | — |
| `@types/morgan` | `^1.9.10` | Current | ✅ Up to date | — |
| `@types/node` | `^25.0.6` | Current | ✅ Up to date | — |
| `@types/node-cron` | `^3.0.11` | Current | ✅ Up to date | — |
| `@types/nodemailer` | `^7.0.11` | Current | ✅ Up to date | — |
| `@types/pdfkit` | `^0.17.5` | Current | ✅ Up to date | — |
| `@types/pg` | `^8.16.0` | Current | ✅ Up to date | — |
| `@types/uuid` | `^10.0.0` | `^14.0.0` | 🟠 Update alongside uuid v14 | MEDIUM (M-3) |
| `ts-node-dev` | `^2.0.0` | **Remove** | 🔴 ARCHIVED Dec 2025, redundant (`tsx` present) | HIGH (H-4) |
| `tsx` | `^4.21.0` | Current | ✅ Active runner, already in use | — |
| `typescript` | `^5.9.3` | Current | ✅ Up to date | — |
| `vitest` | `^4.0.17` | Current | ✅ Up to date | — |

### Frontend (`frontend/package.json`) — Production Dependencies

| Package | Current Version | Target Version | Status | Priority |
|---|---|---|---|---|
| `@emotion/react` | `^11.14.0` | Current | ✅ Up to date | — |
| `@emotion/styled` | `^11.14.1` | Current | ✅ Up to date | — |
| `@hookform/resolvers` | `^5.2.2` | Current | ✅ Up to date | — |
| `@mui/icons-material` | `^7.3.8` | Current | ✅ Up to date | — |
| `@mui/lab` | `^7.0.1-beta.22` | Monitor MUI v8 | ⚠️ Beta — watch for component graduation | LOW (L-3) |
| `@mui/material` | `^7.3.8` | Current | ✅ Up to date | — |
| `@mui/x-data-grid` | `^8.27.1` | Current | ✅ Up to date | — |
| `@tanstack/react-query` | `^5.90.16` | Current | ✅ Up to date | — |
| `@tanstack/react-query-devtools` | `^5.91.3` | Current | ✅ Up to date | — |
| `axios` | `^1.13.2` | `>=1.15.0` | 🟠 CVE — SSRF / header injection (2 CVEs) | MEDIUM (M-1) |
| `react` | `^19.2.3` | Current | ✅ Up to date | — |
| `react-dom` | `^19.2.3` | Current | ✅ Up to date | — |
| `react-hook-form` | `^7.71.2` | Current | ✅ Up to date | — |
| `react-router-dom` | `^7.12.0` | Current | ✅ Up to date | — |
| `zod` | `^4.3.6` | Current | ✅ Up to date | — |
| `zustand` | `^5.0.10` | Current | ✅ Up to date | — |

### Frontend (`frontend/package.json`) — Dev Dependencies

| Package | Current Version | Target Version | Status | Priority |
|---|---|---|---|---|
| `@types/react` | `^19.2.8` | Current | ✅ Up to date | — |
| `@types/react-dom` | `^19.2.3` | Current | ✅ Up to date | — |
| `@vitejs/plugin-react` | `^5.1.2` | Current | ✅ Up to date | — |
| `typescript` | `^5.9.3` | Current | ✅ Up to date | — |
| `vite` | `^7.3.1` | `>=7.3.2` | 🔴 CVE — dev server path traversal + bypass (3 CVEs) | HIGH (H-3) |

### Shared (`shared/package.json`) — Dev Dependencies

| Package | Current Version | Target Version | Status | Priority |
|---|---|---|---|---|
| `typescript` | `^5.3.3` | `^5.9.3` | ⚠️ Version misalignment with backend/frontend | LOW (L-1) |

### Root (`package.json`)

| Package | Current Version | Target Version | Status | Priority |
|---|---|---|---|---|
| `concurrently` | `^8.2.2` | `^9.2.1` | ⚠️ One major version behind (no CVEs) | MEDIUM (M-6) |
| `xlsx` | `^0.18.5` | **Remove** | 🚨 Duplicate of backend entry — remove after C-1 | LOW (L-2) |

---

## 5. Prioritized Replacement Roadmap

### Sprint 1 (Immediate — Week 1): Critical & High

**Goal:** Eliminate all direct-dependency CVEs with available fixes and remove the abandoned `ts-node-dev`. Expected vulnerability count reduction: from 29 to approximately 10–12.

---

#### Task 1.1 — Replace `xlsx` with `exceljs` (CRITICAL C-1)

| Field | Value |
|---|---|
| **Estimated Time** | 4–6 hours (includes migration and testing) |
| **Risk** | High — API change, requires careful migration |
| **Files to Modify** | `backend/src/services/inventoryImport.service.ts`, `backend/scripts/read-inventory-excel.ts`, `backend/scripts/read-excel.ts`, `backend/package.json`, `package.json` (root) |

See full migration guide in [Section 6.1](#61-xlsx--exceljs-migration-guide).

```bash
cd backend
npm uninstall xlsx
npm install exceljs
npm install --save-dev @types/exceljs   # if needed; exceljs ships its own types

# After code migration:
npm run build
# Test inventory import endpoint with a real .xlsx file
```

**Verification:**
- Upload a `.xlsx` file to the inventory import endpoint
- Confirm `npm audit` no longer reports `xlsx` CVEs
- Run any existing tests: `npm test`

---

#### Task 1.2 — Update `multer` to ≥2.1.1 (HIGH H-1)

| Field | Value |
|---|---|
| **Estimated Time** | 15 minutes |
| **Risk** | Low — patch update, no API changes |

```bash
cd backend
npm install multer@latest
npm run build
```

**Verification:** Test a file upload request end-to-end. Confirm `npm audit` no longer reports the three multer CVEs.

---

#### Task 1.3 — Update `express-rate-limit` to ≥8.2.2 (HIGH H-2)

| Field | Value |
|---|---|
| **Estimated Time** | 10 minutes |
| **Risk** | Low — patch update, no API changes |

```bash
cd backend
npm install express-rate-limit@latest
npm run build
```

**Verification:** Confirm rate limiting still activates correctly on auth routes. Check `npm audit`.

---

#### Task 1.4 — Remove `ts-node-dev` (HIGH H-4)

| Field | Value |
|---|---|
| **Estimated Time** | 5 minutes |
| **Risk** | Minimal — `tsx` already replaces it entirely |

```bash
# Confirm no scripts reference ts-node-dev or tsnd:
grep -r "ts-node-dev\|tsnd" backend/package.json backend/scripts/

cd backend
npm uninstall ts-node-dev
npm run build
npm run dev   # Confirm tsx watch still starts correctly
```

**Verification:** Dev server starts normally. `npm run dev` works. The `picomatch` HIGH CVE disappears from `npm audit`.

---

#### Task 1.5 — Update `nodemailer` to ≥8.0.5 (MEDIUM M-2, promoted to Sprint 1)

| Field | Value |
|---|---|
| **Estimated Time** | 10 minutes |
| **Risk** | Low — patch update, no API changes |

```bash
cd backend
npm install nodemailer@latest
npm run build
```

---

#### Task 1.6 — Run `npm audit fix` (Transitive Cleanup)

After completing Tasks 1.1–1.5, run from the project root to clean up all resolvable transitive vulnerabilities:

```bash
cd c:\Tech-V2
npm audit fix
npm audit
```

**Expected result:** Most or all of the `hono`, `defu`, `effect`, `lodash`, `postcss`, `brace-expansion`, `yaml`, `minimatch`, and `path-to-regexp` transitive advisories should be resolved.

---

### Sprint 2 (Short-term — Weeks 2–4): Medium Priority

**Goal:** Resolve remaining CVEs that are non-breaking minor/patch updates. Expected vulnerability count after Sprint 1 + Sprint 2: **4–6 remaining** (only azure/uuid breaking-change items).

---

#### Task 2.1 — Update `vite` to ≥7.3.2 (HIGH H-3)

| Field | Value |
|---|---|
| **Estimated Time** | 15 minutes |
| **Risk** | Low — patch update in v7.x |

```bash
cd frontend
npm install vite@latest
npm run build
npm run dev   # Verify dev server starts
```

---

#### Task 2.2 — Update `axios` to ≥1.15.0 (MEDIUM M-1)

| Field | Value |
|---|---|
| **Estimated Time** | 15 minutes |
| **Risk** | Low — minor update, no API changes |

```bash
cd frontend
npm install axios@latest
npm run build
```

---

#### Task 2.3 — Update `uuid` to v14 (MEDIUM M-3)

| Field | Value |
|---|---|
| **Estimated Time** | 30–45 minutes (includes usage audit) |
| **Risk** | Medium — major version with breaking buffer API |

```bash
# Step 1: Audit current usage before upgrading
grep -r "v3\|v5\|v6\|uuid.*buf" c:\Tech-V2\backend\src\

# Step 2: If only v4() is used without buf param, proceed:
cd backend
npm install uuid@14
npm install --save-dev @types/uuid@14   # update types to match

npm run build
```

**Verification:** All UUID generation still works. No TypeScript compilation errors.

---

#### Task 2.4 — Update `concurrently` to v9 (MEDIUM M-6)

| Field | Value |
|---|---|
| **Estimated Time** | 10 minutes |
| **Risk** | Low — verify Node.js ≥20 first |

```bash
node --version   # Must be >= 20.x

cd c:\Tech-V2
npm install concurrently@latest --save-dev
npm run dev   # Test concurrent backend+frontend startup
```

---

### Sprint 3 (Maintenance — Ongoing): Low Priority & Monitoring

---

#### Task 3.1 — Align `shared` TypeScript to `^5.9.3` (LOW L-1)

| Field | Value |
|---|---|
| **Estimated Time** | 5 minutes |
| **Risk** | Minimal — dev-only change |

```bash
cd shared
npm install typescript@^5.9.3 --save-dev
npm run build
```

---

#### Task 3.2 — Remove Duplicate `xlsx` from Root `package.json` (LOW L-2)

**Prerequisite:** Complete Task 1.1 (xlsx → exceljs replacement in backend).

```bash
cd c:\Tech-V2
npm uninstall xlsx
```

---

#### Task 3.3 — Monitor and Plan `@azure/msal-node` + `@azure/identity` Upgrade (MEDIUM M-4)

| Field | Value |
|---|---|
| **Estimated Time** | 2–4 hours (research + testing) |
| **Risk** | High — authentication system |

- Track `@azure/msal-node` v5 changelog for breaking changes between v3 → v5
- Monitor `@azure/identity` for v4.14.0 GA release
- Plan a dedicated authentication regression test suite before upgrading
- Do not combine with any other changes

---

#### Task 3.4 — Monitor `@microsoft/microsoft-graph-client` for Deprecation (MEDIUM M-5)

- Watch [microsoftgraph/msgraph-sdk-javascript](https://github.com/microsoftgraph/msgraph-sdk-javascript) for a formal deprecation notice
- When `@microsoft/msgraph-sdk` (Kiota-based) reaches GA and a deprecation notice is issued, begin migration planning
- No action required today

---

#### Task 3.5 — Monitor `@mui/lab` Beta Status (LOW L-3)

- Review MUI v8 release notes for components graduating from `@mui/lab` to `@mui/material` core
- Components that graduate will need import path updates: `@mui/lab/X` → `@mui/material/X`
- No action required today

---

## 6. Migration Guides

### 6.1 `xlsx` → `exceljs` Migration Guide

#### Overview

| Attribute | `xlsx` (current) | `exceljs` (target) |
|---|---|---|
| License | Apache 2.0 | MIT |
| Last npm Release | March 2022 (abandoned) | Actively maintained |
| TypeScript Support | `@types/xlsx` (separate) | Built-in types |
| API Style | Synchronous | Async / Promise-based |
| Buffer Reading | `XLSX.read(buf, { type: 'buffer' })` | `await workbook.xlsx.load(buf)` |
| File Reading | `XLSX.readFile(path)` | `await workbook.xlsx.readFile(path)` |
| Sheet Names | `workbook.SheetNames[]` | `workbook.worksheets.map(ws => ws.name)` |
| Get Worksheet | `workbook.Sheets[name]` | `workbook.getWorksheet(name)` |
| JSON Conversion | `XLSX.utils.sheet_to_json(sheet)` | Manual `worksheet.eachRow()` or helper |

#### Installation

```bash
cd backend
npm uninstall xlsx
npm install exceljs
# exceljs ships its own TypeScript declarations — no @types/exceljs needed
```

Also remove from root:
```bash
cd c:\Tech-V2
npm uninstall xlsx
```

---

#### API Mapping Table

| `xlsx` API | `exceljs` Equivalent | Notes |
|---|---|---|
| `import * as XLSX from 'xlsx'` | `import ExcelJS from 'exceljs'` | Named default import |
| `XLSX.read(buf, { type: 'buffer', cellDates: true })` | `await workbook.xlsx.load(buf)` | Async; dates are native JS Date objects automatically |
| `XLSX.readFile(filePath)` | `await workbook.xlsx.readFile(filePath)` | Async |
| `workbook.SheetNames` | `workbook.worksheets.map(ws => ws.name)` | Returns `string[]` |
| `workbook.Sheets[sheetName]` | `workbook.getWorksheet(sheetName)` | Returns `ExcelJS.Worksheet \| undefined` |
| `workbook.SheetNames.find(fn)` | `workbook.worksheets.find(ws => fn(ws.name))?.name` | Find by name |
| `XLSX.utils.sheet_to_json(sheet, { raw: false, defval: null })` | Custom helper (see below) | No direct equivalent |

---

#### Code Migration: `inventoryImport.service.ts`

**Before (using `xlsx`):**

```typescript
// backend/src/services/inventoryImport.service.ts
import * as XLSX from 'xlsx';

private async parseExcelFile(fileBuffer: Buffer): Promise<ExcelRowData[]> {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false, cellDates: true });

    let sheetName = workbook.SheetNames[0];
    const targetSheet = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('non-disposed') ||
      name.toLowerCase().includes('equipment')
    );
    if (targetSheet) {
      sheetName = targetSheet;
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ExcelRowData>(worksheet, {
      raw: false,
      defval: null,
    });

    logger.info('Excel sheet parsed', { sheetName, rowCount: rows.length });
    return rows;
  } catch (error) {
    logger.error('Failed to parse Excel file', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
  }
}
```

**After (using `exceljs`):**

```typescript
// backend/src/services/inventoryImport.service.ts
import ExcelJS from 'exceljs';

private async parseExcelFile(fileBuffer: Buffer): Promise<ExcelRowData[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    // Find target sheet by name, fall back to first sheet
    let worksheet = workbook.worksheets.find(ws =>
      ws.name.toLowerCase().includes('non-disposed') ||
      ws.name.toLowerCase().includes('equipment')
    ) ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new ValidationError('No worksheets found in the uploaded file.');
    }

    const sheetName = worksheet.name;

    // Extract header row (row 1) to build column name map
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString() ?? '';
    });

    // Iterate data rows (row 2 onward) and build ExcelRowData objects
    const rows: ExcelRowData[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const rowData: ExcelRowData = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (!header) return;

        let value: string | number | Date | null = null;
        if (cell.value !== null && cell.value !== undefined) {
          if (cell.value instanceof Date) {
            value = cell.value; // Already a Date object
          } else if (typeof cell.value === 'object' && 'richText' in (cell.value as object)) {
            // Rich text cell
            value = (cell.value as ExcelJS.CellRichTextValue).richText
              .map(r => r.text)
              .join('');
          } else if (typeof cell.value === 'object' && 'result' in (cell.value as object)) {
            // Formula cell — use the cached result
            value = (cell.value as ExcelJS.CellFormulaValue).result as number | string | null;
          } else {
            value = cell.value as string | number;
          }
        }

        (rowData as Record<string, unknown>)[header] = value;
      });

      rows.push(rowData);
    });

    logger.info('Excel sheet parsed', { sheetName, rowCount: rows.length });
    return rows;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error('Failed to parse Excel file', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
  }
}
```

---

#### Code Migration: `read-inventory-excel.ts` and `read-excel.ts` (Scripts)

**Before (using `xlsx`):**

```typescript
import * as XLSX from 'xlsx';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'docs', 'Inventory - 02-03-2026.xlsx');

const workbook = XLSX.readFile(excelFilePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);
console.log(`Total rows: ${data.length}`);
```

**After (using `exceljs`):**

```typescript
import ExcelJS from 'exceljs';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'docs', 'Inventory - 02-03-2026.xlsx');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelFilePath);

const worksheet = workbook.worksheets[0];
const sheetName = worksheet.name;

// Build headers from row 1
const headerRow = worksheet.getRow(1);
const headers: string[] = [];
headerRow.eachCell((cell, colNumber) => {
  headers[colNumber] = cell.value?.toString() ?? '';
});

// Extract data rows
const data: Record<string, unknown>[] = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const rowData: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    rowData[headers[colNumber]] = cell.value;
  });
  data.push(rowData);
});

console.log(`Total rows: ${data.length}`);
console.log(JSON.stringify(data.slice(0, 5), null, 2));
```

> **Note:** The scripts use top-level `await` which requires `"type": "module"` in the package.json or execution via `tsx` (which already supports top-level await). Since `tsx` is the project's active runner for all scripts, this works without changes.

---

#### Testing Checklist After xlsx → exceljs Migration

- [ ] Upload a real `.xlsx` inventory file through the web UI — confirm data parses correctly
- [ ] Upload a file with the "Non-disposed Equipment" sheet named specifically — confirm sheet detection works
- [ ] Upload a malformed file — confirm the error message returns correctly
- [ ] Run `tsx scripts/read-inventory-excel.ts` — confirm output matches expected row count
- [ ] Run `tsx scripts/read-excel.ts` — confirm output matches expected rows
- [ ] Run `npm audit` — confirm `xlsx` CVEs no longer appear
- [ ] Run `npm run build` — confirm TypeScript compiles without errors

---

### 6.2 `ts-node-dev` → Verify `tsx` is Correctly Configured

Since `ts-node-dev` was the original TypeScript dev runner before it was archived, this section confirms that `tsx` is already fully in place and no `ts-node-dev` configuration lingers.

#### Current State Verification

```bash
# Confirm tsx is installed and being used
cat backend/package.json | grep -E "tsx|ts-node-dev"

# Expected output:
# "dev": "tsx watch src/server.ts"          ← tsx already active
# "ts-node-dev": "^2.0.0"                  ← only in devDependencies, not in any script

# Confirm no script references tsnd or ts-node-dev:
grep -r "tsnd\|ts-node-dev" backend/package.json backend/scripts/
# Expected: no matches (other than the devDependency declaration itself)
```

#### Removal Checklist

- [ ] Verify `package.json` `scripts` section — confirm all entries use `tsx`, not `ts-node-dev` or `tsnd`
- [ ] Verify no `.env` files or Docker configurations pass `ts-node-dev` as a startup command
- [ ] Check `Dockerfile` in backend — confirm it does not reference `ts-node-dev` in any `CMD` or `RUN` instruction
- [ ] Run `npm uninstall ts-node-dev` from `backend/`
- [ ] Confirm `npm run dev` (`tsx watch src/server.ts`) still starts the server correctly
- [ ] Confirm all `tsx scripts/*.ts` commands still execute correctly

#### Why `tsx` is the Correct Choice

| Feature | `ts-node-dev` (archived) | `tsx` (active) |
|---|---|---|
| Maintenance Status | Archived Dec 2025 | Actively maintained |
| TypeScript Support | Full | Full |
| ESM Support | Limited | Full |
| Watch Mode | `tsnd --watch` | `tsx watch` |
| Script Execution | `ts-node-dev script.ts` | `tsx script.ts` |
| Already in Use | Script only (no longer active) | `dev` script + all `backend/scripts/` |
| Transitive CVEs | `picomatch` ReDoS | None known |

---

### 6.3 `@microsoft/microsoft-graph-client` v3 → Kiota SDK (Future Migration)

#### Current State

`@microsoft/microsoft-graph-client` v3.0.7 is the **currently recommended stable SDK** from Microsoft as of May 2026. No deprecation notice has been issued. The package still receives security monitoring via Dependabot. There are **no CVEs** against this package today.

The package is used in the backend for Microsoft Graph API calls — primarily for Entra ID user sync, supervisor lookups, and profile data retrieval.

#### Why This Is on the Radar

Microsoft has been developing a next-generation SDK built with [Kiota](https://github.com/microsoft/kiota), the API client generator. The new SDK is published under `@microsoft/msgraph-sdk`. As of May 2026:
- `@microsoft/msgraph-sdk` is available on npm but not yet announced as the official replacement
- The v3.x SDK has received no feature updates since September 2023
- When a formal deprecation notice is published, migration becomes urgent

#### Future Migration Trigger

Begin migration planning when **any** of the following occur:
1. Microsoft publishes an official deprecation notice in the [microsoft-graph-client repository](https://github.com/microsoftgraph/msgraph-sdk-javascript)
2. An npm deprecation tag is added to `@microsoft/microsoft-graph-client`
3. A CVE is filed against `@microsoft/microsoft-graph-client`

#### High-Level Migration Path (When Triggered)

```typescript
// BEFORE (current — microsoft-graph-client v3):
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});
const graphClient = Client.initWithMiddleware({ authProvider });
const users = await graphClient.api('/users').get();

// AFTER (future — Kiota SDK @microsoft/msgraph-sdk):
import { Client } from '@microsoft/msgraph-sdk';
// Kiota-generated SDK uses type-safe method chains instead of .api() string paths
// Migration guide: https://github.com/microsoftgraph/msgraph-sdk-javascript
```

> This migration is HIGH complexity due to the API paradigm shift from string-based `.api('/users')` to Kiota's generated type-safe method chains. A full migration guide will need to be written when the trigger conditions are met.

---

## 7. Security Notes

### Documentation Scope

> **This document is a plan only.** No `package.json` files have been modified. No packages have been installed or removed. All commands shown are for reference and require explicit team approval before execution.

### Testing Requirements

All upgrades listed in this plan **must be tested in a development environment before being applied to production**. The recommended process:

1. Create a feature/dependency-upgrade branch
2. Apply the changes from a single sprint (do not batch multiple sprints)
3. Run the full build: `npm run build` in all affected workspaces
4. Run the test suite: `npm test`
5. Perform manual end-to-end testing of affected features
6. Deploy to staging and validate
7. Only then merge and deploy to production

### Packages Requiring Schema or API Changes (Not Just `npm install`)

| Package | Why It's More Than `npm install` |
|---|---|
| `xlsx` → `exceljs` | Full API rewrite of all parsing code; async paradigm change; no drop-in replacement |
| `uuid` v13 → v14 | Verify `buf` parameter usage; `@types/uuid` must also be updated |
| `@azure/msal-node` v3 → v5 | Multi-major version jump; auth flow changes must be tested against Entra ID |
| `@azure/identity` → v4.14.0 GA | Partner upgrade to msal-node; test token acquisition end-to-end |

### Authentication Package Warning

`@azure/msal-node` and `@azure/identity` are the authentication backbone of the application. Any regression introduced by upgrading these packages would result in a complete authentication failure for all users. These packages must be upgraded:
- In a dedicated branch, never combined with other dependency changes
- During a low-traffic window
- With an immediate rollback plan ready

### On `npm audit fix --force`

Do **not** run `npm audit fix --force` globally without reviewing the output first. The `--force` flag applies all breaking major version upgrades automatically and can introduce compilation errors or runtime failures. Use targeted `npm install package@version` commands as specified in the sprint tasks instead.

---

## 8. Commands Reference

A consolidated quick-reference of all commands, organized by workspace location. Run only after team approval and in a development environment first.

---

### Backend (`c:\Tech-V2\backend\`)

```bash
cd c:\Tech-V2\backend

# Sprint 1 — Critical & High (Week 1)
npm uninstall xlsx                           # C-1: Remove abandoned xlsx
npm install exceljs                          # C-1: Install replacement
npm install multer@latest                    # H-1: Fix 3 DoS CVEs
npm install express-rate-limit@latest        # H-2: Fix rate limit bypass CVE
npm install nodemailer@latest                # M-2 (promoted): Fix SMTP injection CVEs
npm uninstall ts-node-dev                    # H-4: Remove archived package

# Sprint 2 — Medium (Weeks 2-4)
npm install uuid@14                          # M-3: Fix bounds-check CVE (review usage first)
npm install --save-dev @types/uuid@14        # M-3: Update types to match

# Sprint 3 — Maintenance (Ongoing)
npm install @azure/msal-node@latest          # M-4: Auth upgrade (ISOLATED branch only)
npm install @azure/identity@latest           # M-4: Auth upgrade (ISOLATED branch only)
```

---

### Frontend (`c:\Tech-V2\frontend\`)

```bash
cd c:\Tech-V2\frontend

# Sprint 2 — Medium (Weeks 2-4)
npm install vite@latest                      # H-3: Fix 3 dev-server CVEs
npm install axios@latest                     # M-1: Fix SSRF/header injection CVEs
```

---

### Shared (`c:\Tech-V2\shared\`)

```bash
cd c:\Tech-V2\shared

# Sprint 3 — Maintenance (Ongoing)
npm install typescript@^5.9.3 --save-dev    # L-1: Align TypeScript version
```

---

### Root (`c:\Tech-V2\`)

```bash
cd c:\Tech-V2

# Sprint 1 — After individual package fixes
npm audit fix                                # Clean up all resolvable transitive CVEs

# Sprint 2 — Medium (Weeks 2-4)
npm install concurrently@latest --save-dev  # M-6: Update to v9 (requires Node >=20)

# Sprint 3 — After xlsx replacement is verified
npm uninstall xlsx                           # L-2: Remove duplicate root entry

# Verify after each sprint
npm audit
```

---

### Verification Commands

```bash
# Full vulnerability report after all Sprint 1+2 fixes:
cd c:\Tech-V2
npm audit

# Expected result after Sprint 1+2:
# 4-6 remaining (only azure/uuid breaking-change items and any unfixable transitive remainders)

# Rebuild all workspaces to confirm no TypeScript errors:
cd backend && npm run build
cd ../frontend && npm run build
cd ../shared && npm run build

# Run backend tests:
cd backend && npm test
```

---

*Document generated: May 1, 2026 | Auditor: GitHub Copilot (Claude Sonnet 4.6) | Status: PLAN ONLY — NO CHANGES IMPLEMENTED*
