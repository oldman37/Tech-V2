# Tech-V2 Dependency Audit Specification
**Generated:** 2026-05-01  
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)  
**Scope:** All package.json files in the Tech-V2 monorepo  
**npm audit result:** 29 vulnerabilities (13 moderate, 16 high) at time of audit  
**npm audit result (current):** 6 vulnerabilities remaining (all moderate — uuid/azure transitive chain, prisma transitive)

---

## Table of Contents
1. [Full Dependency Inventory](#1-full-dependency-inventory)
2. [Categorized Findings](#2-categorized-findings)
3. [Recommended Replacements & Migration Notes](#3-recommended-replacements--migration-notes)
4. [Prioritized Action Plan](#4-prioritized-action-plan)

---

## 1. Full Dependency Inventory

### 1.1 Backend (`c:\Tech-V2\backend\package.json`)

#### Production Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| `@azure/identity` | `^4.13.0` | Azure auth |
| `@azure/msal-node` | `^3.8.4` | MSAL for Node.js |
| `@microsoft/microsoft-graph-client` | `^3.0.7` | MS Graph API wrapper |
| `@prisma/adapter-pg` | `^7.2.0` | Prisma PostgreSQL adapter |
| `@prisma/client` | `^7.2.0` | Prisma ORM client |
| `@types/multer` | `^2.0.0` | Types for multer |
| `cookie-parser` | `^1.4.7` | Cookie parsing middleware |
| `cors` | `^2.8.5` | CORS middleware |
| `csv-parse` | `^6.1.0` | CSV parser |
| `dotenv` | `^17.2.3` | Environment variables |
| `express` | `^5.2.1` | Web framework |
| `express-rate-limit` | ~~`^8.2.1`~~ → `^8.4.1` | Rate limiting — ✅ Updated |
| `helmet` | `^8.1.0` | HTTP security headers |
| `jsonwebtoken` | `^9.0.3` | JWT handling |
| `morgan` | `^1.10.1` | HTTP request logger |
| `multer` | ~~`^2.0.2`~~ → `^2.1.1` | Multipart file upload — ✅ Updated |
| `node-cron` | `^4.2.1` | Cron job scheduling |
| `nodemailer` | ~~`^8.0.2`~~ → `^8.0.7` | Email sending — ✅ Updated |
| `pdfkit` | `^0.17.2` | PDF generation |
| `pg` | `^8.16.3` | PostgreSQL client |
| `prisma` | `^7.2.0` | Prisma ORM CLI |
| `uuid` | `^13.0.0` | UUID generation |
| `winston` | `^3.19.0` | Logging |
| `winston-daily-rotate-file` | `^5.0.0` | Log rotation |
| ~~`xlsx`~~ | ~~`^0.18.5`~~ | ~~Excel file processing~~ — ✅ Removed, replaced by `exceljs` |
| `exceljs` | `^4.4.0` | Excel file processing — ✅ Added |
| `zod` | `^4.3.6` | Schema validation |

#### Dev Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| `@types/cookie-parser` | `^1.4.10` | Types |
| `@types/cors` | `^2.8.19` | Types |
| `@types/express` | `^5.0.6` | Types |
| `@types/jsonwebtoken` | `^9.0.10` | Types |
| `@types/morgan` | `^1.9.10` | Types |
| `@types/node` | `^25.0.6` | Node.js types |
| `@types/node-cron` | `^3.0.11` | Types |
| `@types/nodemailer` | `^7.0.11` | Types |
| `@types/pdfkit` | `^0.17.5` | Types |
| `@types/pg` | `^8.16.0` | Types |
| `@types/uuid` | `^10.0.0` | Types |
| ~~`ts-node-dev`~~ | ~~`^2.0.0`~~ | ~~**ARCHIVED** - TS dev runner~~ — ✅ Removed |
| `tsx` | `^4.21.0` | TypeScript executor (active) |
| `typescript` | `^5.9.3` | TypeScript compiler |
| `vitest` | `^4.0.17` | Test runner |

---

### 1.2 Frontend (`c:\Tech-V2\frontend\package.json`)

#### Production Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| `@emotion/react` | `^11.14.0` | MUI emotion CSS-in-JS |
| `@emotion/styled` | `^11.14.1` | MUI emotion styled components |
| `@hookform/resolvers` | `^5.2.2` | React Hook Form schema resolvers |
| `@mui/icons-material` | `^7.3.8` | MUI icon library |
| `@mui/lab` | `^7.0.1-beta.22` | MUI incubator (beta) |
| `@mui/material` | `^7.3.8` | MUI component library |
| `@mui/x-data-grid` | `^8.27.1` | MUI data grid |
| `@tanstack/react-query` | `^5.90.16` | Server state management |
| `@tanstack/react-query-devtools` | `^5.91.3` | Query devtools |
| `axios` | ~~`^1.13.2`~~ → `^1.15.2` | HTTP client — ✅ Updated |
| `react` | `^19.2.3` | React core |
| `react-dom` | `^19.2.3` | React DOM |
| `react-hook-form` | `^7.71.2` | Form management |
| `react-router-dom` | `^7.12.0` | Client-side routing |
| `zod` | `^4.3.6` | Schema validation |
| `zustand` | `^5.0.10` | Client state management |

#### Dev Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| `@types/react` | `^19.2.8` | React types |
| `@types/react-dom` | `^19.2.3` | React DOM types |
| `@vitejs/plugin-react` | `^5.1.2` | Vite React plugin |
| `typescript` | `^5.9.3` | TypeScript compiler |
| `vite` | ~~`^7.3.1`~~ → `^8.0.10` | Build tool / dev server — ✅ Updated |

---

### 1.3 Shared (`c:\Tech-V2\shared\package.json`)

#### Dev Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| `typescript` | `^5.3.3` | TypeScript compiler — older pin than backend/frontend |

> **Note:** `shared` has no runtime dependencies. The TypeScript version pinned here (`^5.3.3`) is older than backend/frontend (`^5.9.3`). Should be aligned but is a LOW concern since it only affects the shared type build.

---

### 1.4 Root (`c:\Tech-V2\package.json`)

#### Production Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| ~~`xlsx`~~ | ~~`^0.18.5`~~ | ~~**DUPLICATE** — also pinned in backend~~ — ✅ Removed |

#### Dev Dependencies

| Package | Version Pinned | Notes |
|---|---|---|
| `concurrently` | `^8.2.2` | Run multiple scripts concurrently |

> **Note:** `xlsx` is pinned in both the root `package.json` and `backend/package.json`. The root copy is unnecessary and creates confusion since the npm workspace structure means it can be deduplicated.

---

## 2. Categorized Findings

### CRITICAL — No Automated Fix Available

---

#### ~~C-1: `xlsx` v0.18.5 (backend + root)~~ ✅ COMPLETED — Replaced with `exceljs` on 2026-05-01

| Field | Detail |
|---|---|
| **CVEs** | GHSA-5pgg-2g8v-p4x9 (HIGH, ReDoS), GHSA-4r6h-8v6p-xvw6 (HIGH, Prototype Pollution) |
| **npm status** | Last published: March 2022 (4+ years ago). Version 0.18.5 is **the last npm release ever**. |
| **GitHub status** | GitHub repo redirected to self-hosted GitLab at `git.sheetjs.com`. GitHub mirror frozen 2 years ago. No npm releases since. |
| **Snyk score** | 52/100 — INACTIVE maintenance, SECURITY ISSUES FOUND |
| **`npm audit fix`** | `No fix available` — the npm registry has no patched version |
| **Risk** | Any input processed via `xlsx` (uploaded spreadsheets, CSV imports) can trigger Prototype Pollution or cause server DoS via ReDoS. This is a **direct attack surface** given the project handles file uploads. |

**Action required:** Replace `xlsx` with an actively maintained alternative. See Section 3.

---

### HIGH — Direct Dependencies with Active CVEs, Automated Fix Available

---

#### ~~H-1: `multer` v2.0.2 (backend)~~ ✅ COMPLETED — Updated to v2.1.1 on 2026-05-01

| Field | Detail |
|---|---|
| **CVEs** | GHSA-xf7r-hgr6-v32p, GHSA-v52c-386h-88mc, GHSA-5528-5vmv-3xc2 (all HIGH, Denial of Service) |
| **Affected range** | `multer <=2.1.0` |
| **Fix** | Update to `multer >=2.1.1` |
| **`npm audit fix`** | Available (non-breaking) |
| **Risk** | All three vulnerabilities allow DoS: uncontrolled recursion, resource exhaustion, and incomplete cleanup from malformed multipart uploads. The backend accepts file uploads (purchase orders, equipment attachments) — direct exposure. |

---

#### ~~H-2: `express-rate-limit` v8.2.1 (backend)~~ ✅ COMPLETED — Updated to v8.4.1 on 2026-05-01

| Field | Detail |
|---|---|
| **CVE** | GHSA-46wh-pxpv-q5gq (HIGH) |
| **Affected range** | `express-rate-limit 8.2.0 - 8.2.1` |
| **Fix** | Update to `express-rate-limit >=8.2.2` |
| **`npm audit fix`** | Available (non-breaking) |
| **Risk** | IPv4-mapped IPv6 addresses (e.g., `::ffff:1.2.3.4`) bypass per-client rate limiting. This defeats brute-force protection on login endpoints and sensitive API routes. |

---

#### ~~H-3: `vite` v7.3.1 (frontend devDependency)~~ ✅ COMPLETED — Updated to v8.0.10 on 2026-05-01

| Field | Detail |
|---|---|
| **CVEs** | GHSA-4w7w-66w2-5vf9 (HIGH, path traversal in `.map` files), GHSA-v2wj-q39q-566r (HIGH, `server.fs.deny` bypass via query params), GHSA-p9ff-h696-f583 (HIGH, arbitrary file read via dev server WebSocket) |
| **Affected range** | `vite 7.0.0 - 7.3.1` |
| **Fix** | Update to `vite >=7.3.2` |
| **`npm audit fix`** | Available (non-breaking) |
| **Risk** | Dev-server only during development. Low production risk (not deployed), but developers running `vite dev` locally or in CI against a network-exposed dev server are vulnerable. Should still be addressed promptly. |

---

#### ~~H-4: `ts-node-dev` v2.0.0 (backend devDependency)~~ ✅ COMPLETED — Removed on 2026-05-01

| Field | Detail |
|---|---|
| **Status** | **Repository officially archived by owner on December 19, 2025.** |
| **Last release** | v2.0.0 — May 26, 2022 (3+ years ago). |
| **CVEs** | Transitive: `picomatch <=2.3.1` (HIGH ReDoS, method injection) pulled in by ts-node-dev |
| **Superseded by** | `tsx` — already installed as a devDependency in this project and used for all script execution |
| **Risk** | Archived package pulling in vulnerable transitive dependencies. Since `tsx` is already present and used (e.g., `tsx watch src/server.ts` in `scripts.dev`), `ts-node-dev` is completely redundant. |

---

### MEDIUM — Direct Dependencies with Moderate CVEs or Significant Staleness

---

#### ~~M-1: `axios` v1.13.2 (frontend)~~ ✅ COMPLETED — Updated to v1.15.2 on 2026-05-01

| Field | Detail |
|---|---|
| **CVEs** | GHSA-3p68-rc4w-qgx5 (MODERATE, NO_PROXY hostname normalization bypass → SSRF), GHSA-fvcv-3m26-pcqx (MODERATE, header injection chain → cloud metadata exfiltration) |
| **Affected range** | `axios 1.0.0 - 1.14.0` |
| **Fix** | Update to `axios >=1.15.0` |
| **`npm audit fix`** | Available (non-breaking) |
| **Risk** | Both vulnerabilities require specific network conditions (proxy configurations or attacker-controlled headers). SSRF risk is more relevant in server-side contexts; frontend usage has lower direct exposure but should still be patched. |

---

#### ~~M-2: `nodemailer` v8.0.2 (backend)~~ ✅ COMPLETED — Updated to v8.0.7 on 2026-05-01

| Field | Detail |
|---|---|
| **CVEs** | GHSA-c7w3-x93f-qmm8 (MODERATE, SMTP command injection via `envelope.size`), GHSA-vvjj-xcjg-gr5g (MODERATE, SMTP CRLF injection via transport name in EHLO/HELO) |
| **Affected range** | `nodemailer <=8.0.4` |
| **Fix** | Update to `nodemailer >=8.0.5` |
| **`npm audit fix`** | Available (non-breaking) |
| **Risk** | If any email content is influenced by user input (recipient names, subject lines, attachment filenames), SMTP injection could allow header manipulation or sending unauthorized emails. |

---

#### ~~M-3: `uuid` v13.0.0 (backend)~~ ✅ COMPLETED — Updated to v14.0.0 on 2026-05-01

| Field | Detail |
|---|---|
| **CVE** | GHSA-w5hq-g745-h8pq (MODERATE, missing buffer bounds check in v3/v5/v6 when `buf` param is provided) |
| **Affected range** | `uuid <14.0.0` |
| **Fix** | Update to `uuid@14.0.0` |
| **`npm audit fix --force`** | Available but **breaking change** — v14 changes the import API |
| **Risk** | Moderate. Only triggered when the optional `buf` parameter is passed to `v3()`, `v5()`, or `v6()`. If the project only calls `uuid.v4()` without `buf`, the vulnerability is not triggered. Review usage before upgrading. |
| **Side effect** | `@azure/msal-node` and `@azure/identity` transitively depend on `uuid <14.0.0`. Updating the direct dependency does NOT fix the azure packages' internal copy — they must be updated separately (see M-4). `exceljs` also has an internal transitive dependency on `uuid <14.0.0` — awaiting upstream exceljs fix. |

---

#### M-4: `@azure/msal-node` v3.8.4 / `@azure/identity` v4.13.0 (backend)

| Field | Detail |
|---|---|
| **CVE (via transitive uuid)** | GHSA-w5hq-g745-h8pq (MODERATE) through `uuid <14.0.0` |
| **Affected range** | `@azure/msal-node <=5.1.4`, `@azure/identity 1.2.x - 4.13.0 \|\| 4.14.0-alpha - 4.14.0-beta.2` |
| **Fix** | `@azure/msal-node` → update to `>=5.2.0` (2 major versions jump); `@azure/identity` → update to `>=4.14.0` GA when released |
| **`npm audit fix`** | Not automatically resolvable (major version jumps for msal-node) |
| **Risk** | Transitive through internal uuid usage in the azure SDK. Actual exploitability requires passing the `buf` parameter which is an unlikely internal usage. Medium migration effort due to possible API changes in msal-node v4/v5. |

---

#### M-5: `@microsoft/microsoft-graph-client` v3.0.7 (backend)

| Field | Detail |
|---|---|
| **Status** | Last npm release: September 19, 2023 (1.5+ years ago with no follow-on releases). |
| **GitHub activity** | Dependabot security PRs only; no feature development since v3.0.7. |
| **Successor** | Microsoft is building a Kiota-generated SDK: `@microsoft/msgraph-sdk` (next generation). However, the v3.x SDK still receives security monitoring. No formal deprecation notice has been issued. |
| **Risk** | No known CVEs. The risk is forward-looking: the package will receive less attention as the new SDK matures. Not an immediate concern but worth tracking. |

---

#### M-6: `concurrently` v8.2.2 (root devDependency)

| Field | Detail |
|---|---|
| **Status** | Latest release is v9.2.1 (August 25, 2025). Package is actively maintained. |
| **Semver gap** | One major version behind (`^8.2.2` → v9.x). |
| **Breaking changes** | v9 dropped support for Node.js 18 LTS. Check Node version before upgrading. |
| **CVEs** | None known. |
| **Risk** | Low. Migration is straightforward once Node version compatibility is confirmed. |

---

### LOW — Transitive-Only Vulnerabilities (Resolved by Parent Updates)

These packages are NOT directly declared in any project `package.json`. They are transitive dependencies. Fixing the parent package resolves the issue without direct action.

| Vulnerable Package | Severity | Parent to Update | Resolves Via |
|---|---|---|---|
| `path-to-regexp` 8.0.0-8.3.0 | HIGH (ReDoS) | `express` (transitive) | `npm audit fix` |
| `rollup` 4.0.0-4.58.0 | HIGH (path traversal) | `vite` (update per H-3) | Fix H-3 |
| `follow-redirects` ≤1.15.11 | MODERATE (header leak) | `axios` (fix per M-1) | Fix M-1 |
| `hono` ≤4.12.13 | HIGH (XSS, cache deception, traversal) | `prisma` (auto-update) | `npm audit fix` |
| `@hono/node-server` ≤1.19.12 | HIGH (static path bypass) | `prisma` (auto-update) | `npm audit fix` |
| `defu` ≤6.1.4 | HIGH (prototype pollution) | `prisma` (auto-update) | `npm audit fix` |
| `effect` <3.20.0 | HIGH (context leak) | `prisma` (auto-update) | `npm audit fix` |
| `lodash` ≤4.17.23 | HIGH (prototype pollution) | `prisma`→`chevrotain` | `npm audit fix` |
| `picomatch` ≤2.3.1 | HIGH (ReDoS, method injection) | `ts-node-dev` (remove per H-4), `vite` | Fix H-4 + H-3 |
| `minimatch` ≤3.1.3 | HIGH (ReDoS) | Transitive | `npm audit fix` |
| `brace-expansion` <1.1.13 | MODERATE (hang/OOM) | Transitive | `npm audit fix` |
| `postcss` <8.5.10 | MODERATE (XSS) | Transitive | `npm audit fix` |
| `yaml` 1.0.0-1.10.2 / 2.0.0-2.8.2 | MODERATE (stack overflow) | `cosmiconfig` (transitive) | `npm audit fix` |

> **Note on `inflight`:** While `inflight` package is formally deprecated (repo renamed to `inflight-DEPRECATED-DO-NOT-USE` in 2024), it does not appear as a **direct** dependency in this project. It exists as a deep transitive dependency. No direct action required.

---

## 3. Recommended Replacements & Migration Notes

### 3.1 ~~`xlsx` → `exceljs`~~ ✅ COMPLETED 2026-05-01

**Why:** `xlsx` has no npm fix available, has active HIGH CVEs, and is effectively abandoned on npm (4+ years, no fix path). It cannot be safely used for user-uploaded file processing.

**Recommended replacement:** [`exceljs`](https://github.com/exceljs/exceljs)
- MIT licensed, actively maintained, 13k+ stars
- Full read/write support for `.xlsx`, `.csv`, rich formatting, styles, formulas
- TypeScript types included (`@types/exceljs` available)
- API is more verbose but well-documented

**Migration effort: HIGH**

API is significantly different from `xlsx`:

```typescript
// BEFORE (xlsx):
import XLSX from 'xlsx';
const workbook = XLSX.readFile('file.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

// AFTER (exceljs):
import ExcelJS from 'exceljs';
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('file.xlsx');
const worksheet = workbook.worksheets[0];
const data: any[] = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1) data.push(row.values);
});
```

Search for all usages of `xlsx` in the backend before migrating:
```
grep -r "xlsx\|XLSX\|readFile\|sheet_to_json\|write\|writeFile" backend/src/ backend/scripts/
```

**Steps:**
1. `npm uninstall xlsx` in both `backend/` and root
2. `npm install exceljs` in `backend/`
3. Update all import/require usages
4. Test all export (PO PDFs, inventory exports) and import (CSV/XLSX upload) flows

---

### 3.2 ~~`ts-node-dev` → Remove (use `tsx` already present)~~ ✅ COMPLETED 2026-05-01

**Why:** Repo archived December 19, 2025. `tsx` is already installed and actively used for all dev scripts (e.g., `tsx watch src/server.ts`). `ts-node-dev` is dead weight pulling in vulnerable transitive deps.

**Migration effort: LOW**

The project already uses `tsx` for the `dev` script. Simply removing `ts-node-dev` requires no code changes:

```bash
cd backend && npm uninstall ts-node-dev
```

Verify no scripts reference `tsnd` or `ts-node-dev` directly before removing.

---

### 3.3 ~~`multer` → Update to ≥2.1.1~~ ✅ COMPLETED 2026-05-01 (v2.1.1)

**Migration effort: LOW**

```bash
cd backend && npm install multer@latest
```

No API changes expected between `2.0.2` and `2.1.1`. Verify all file upload endpoints function normally after update.

---

### 3.4 ~~`express-rate-limit` → Update to ≥8.2.2~~ ✅ COMPLETED 2026-05-01 (v8.4.1)

**Migration effort: LOW**

```bash
cd backend && npm install express-rate-limit@latest
```

Patch-level fix only. No API changes.

---

### 3.5 ~~`vite` → Update to ≥7.3.2~~ ✅ COMPLETED 2026-05-01 (v8.0.10)

**Migration effort: LOW**

```bash
cd frontend && npm install vite@latest
```

Patch/minor update. Dev-server vulnerabilities are fixed. Run `npm run build` and `npm run dev` to verify.

---

### 3.6 ~~`axios` → Update to ≥1.15.0~~ ✅ COMPLETED 2026-05-01 (v1.15.2)

**Migration effort: LOW**

```bash
cd frontend && npm install axios@latest
```

Minor update, no API changes. Fixes SSRF/header injection in proxy edge cases.

---

### 3.7 ~~`nodemailer` → Update to ≥8.0.5~~ ✅ COMPLETED 2026-05-01 (v8.0.7)

**Migration effort: LOW**

```bash
cd backend && npm install nodemailer@latest
```

Patch update, no API changes. Fixes SMTP injection via CRLF sequences.

---

### 3.8 `uuid` → Update to v14 (breaking)

**Migration effort: MEDIUM**

v14 changes the import pattern:

```typescript
// BEFORE (uuid v13 and earlier):
import { v4 as uuidv4 } from 'uuid';
const id = uuidv4();

// AFTER (uuid v14):
// Import is the same BUT v6/v7 APIs may differ
// Check if buf parameter is used anywhere — that's the vulnerable path
import { v4 as uuidv4 } from 'uuid';
const id = uuidv4(); // still works
```

Audit all usages: `grep -r "uuid" backend/src/` and check if `buf` option is ever passed. If not, the vulnerability is unexploitable in this project at current usage, but upgrading is still recommended.

```bash
cd backend && npm install uuid@14 @types/uuid@14
```

---

### 3.9 `@azure/msal-node` + `@azure/identity` Update Path

**Migration effort: HIGH**

`@azure/msal-node` v3.x → v5.x is a multi-major-version jump. The `@azure/identity` v4.14.0 GA release is needed to resolve the azure-level audit flag.

**Recommended approach:**
1. Check [msal-node changelog](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/CHANGELOG.md) for breaking changes between v3 → v5
2. Test authentication flow thoroughly in a dev environment before deploying
3. Monitor `@azure/identity` for v4.14.0 GA release

> **Caution:** Do not upgrade `@azure/msal-node` and `@azure/identity` in the same PR as other changes. These packages control authentication for all users.

---

### 3.10 `@microsoft/microsoft-graph-client` — Monitor for Deprecation

No action required today. The `@microsoft/microsoft-graph-client` v3.0.7 is still the latest stable version. Microsoft's next-generation Kiota-based SDK (`@microsoft/msgraph-sdk`) is in development. Track [microsoftgraph/msgraph-sdk-javascript](https://github.com/microsoftgraph/msgraph-sdk-javascript) for a deprecation notice.

---

### 3.11 `concurrently` → Update to v9 (root)

**Migration effort: LOW**

```bash
npm install concurrently@latest --save-dev
```

Ensure Node.js version is ≥20 (v9 dropped Node 18 support). No API changes for the usage pattern in root `package.json`.

---

### 3.12 `shared/package.json` TypeScript Alignment

**Migration effort: LOW**

Pin `shared` TypeScript to match backend/frontend:

```json
// shared/package.json
"devDependencies": {
  "typescript": "^5.9.3"
}
```

---

### 3.13 ~~Remove Duplicate `xlsx` from Root `package.json`~~ ✅ COMPLETED 2026-05-01

**Migration effort: LOW**

Once xlsx is replaced in the backend (section 3.1), remove the duplicate root dependency:

```bash
# From project root
npm uninstall xlsx
```

---

## 4. Prioritized Action Plan

### Phase 1 — Immediate (This Sprint) — Security Critical

These are direct CVEs affecting production attack surfaces. Address before next deployment.

| Priority | Package | Action | Command | Effort | Status |
|---|---|---|---|---|---|
| 1 | `xlsx` | **Replace with `exceljs`** | See 3.1 | HIGH | ✅ Done |
| 2 | `multer` | Update to ≥2.1.1 | `npm install multer@latest` in backend/ | LOW | ✅ Done |
| 3 | `express-rate-limit` | Update to ≥8.2.2 | `npm install express-rate-limit@latest` in backend/ | LOW | ✅ Done |
| 4 | `nodemailer` | Update to ≥8.0.5 | `npm install nodemailer@latest` in backend/ | LOW | ✅ Done |
| 5 | `ts-node-dev` | Remove (archived, `tsx` already present) | `npm uninstall ts-node-dev` in backend/ | LOW | ✅ Done |

After items 2–5: run `npm audit fix` from the project root to clean transitive issues (path-to-regexp, brace-expansion, yaml, picomatch, hono, defu, effect, postcss, rollup).

---

### Phase 2 — Short Term (Next Sprint) — Security Medium

| Priority | Package | Action | Effort | Status |
|---|---|---|---|---|
| 6 | `vite` | Update to ≥7.3.2 | LOW | ✅ Done (v8.0.10) |
| 7 | `axios` | Update to ≥1.15.0 | LOW | ✅ Done (v1.15.2) |
| 8 | `uuid` | Audit buf-param usage, then update to v14 | MEDIUM | ✅ Done (v14.0.0) |

---

### Phase 3 — Medium Term (Next Month) — Maintenance & Stability

| Priority | Package | Action | Effort | Status |
|---|---|---|---|---|
| 9 | `@azure/msal-node` + `@azure/identity` | Research v5 + v4.14.0 GA migration path; plan with testing window | HIGH | ⬜ Pending |
| 10 | `concurrently` | Update to v9 in root (verify Node version) | LOW | ⬜ Pending |
| 11 | `shared` TypeScript | Align to `^5.9.3` | LOW | ⬜ Pending |
| 12 | Root `xlsx` | Remove duplicate entry (after Phase 1 xlsx replacement) | LOW | ✅ Done |

---

### Phase 4 — Long Term — Forward-Looking

| Package | Watch For | Trigger |
|---|---|---|
| `@microsoft/microsoft-graph-client` | Official deprecation notice + Kiota SDK GA | GitHub release or npm deprecation tag |
| `@prisma/client` + `prisma` | Prisma 8 release (transitive hono/defu fixes confirmed) | Check `npm audit` after each prisma major |
| `@mui/lab` v7-beta | Components graduating to `@mui/material` core | MUI v8 changelog |

---

## Quick Fix Commands

Run these in sequence after validating in a dev environment:

```bash
# Phase 1 (backend)
cd backend
npm install multer@latest express-rate-limit@latest nodemailer@latest
npm uninstall ts-node-dev

# Phase 2 (frontend)
cd ../frontend
npm install vite@latest axios@latest

# Transitive cleanup (from root)
cd ..
npm audit fix

# Verify
npm audit
```

**Expected result after Phase 1+2 fixes:** Reduction from 29 vulnerabilities to approximately 4–6 (only the azure/uuid breaking-change items and any unfixable transitive remainders).

**✅ ACTUAL RESULT (2026-05-01):** Reduced from **29 → 6 vulnerabilities**. All Phase 1 and Phase 2 items are complete. Remaining 6 are moderate transitive-only (uuid inside `@azure/msal-node`, uuid inside `exceljs`, and prisma transitives — all require upstream package releases or breaking major version jumps).

---

*This spec was generated by auditing `package.json` files, running `npm audit`, and cross-referencing npm registry data, GitHub repository status, and Snyk security database as of 2026-05-01.*
