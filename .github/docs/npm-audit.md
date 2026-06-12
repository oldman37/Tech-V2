# npm audit — Vulnerability Tracking

Generated: 2026-06-11  
Total: 18 vulnerabilities (3 critical, 5 high, 10 moderate)

---

## How to fix

Run inside the **running container** for the affected workspace, then rebuild the image:

```powershell
# Backend
docker exec tech-v2-backend-1 npm audit fix
docker compose -f docker-compose.dev.yml build backend

# Frontend
docker exec tech-v2-frontend-1 sh  # nginx — use build container instead:
docker compose -f docker-compose.dev.yml run --rm --entrypoint sh frontend-build
# then: npm audit fix

# Root (devDependencies only)
docker exec <root-container> npm audit fix
```

> For `--force` fixes: read the notes below before running. These involve breaking changes
> and require a full Phase 1–6 workflow.

---

## Group 1 — Safe to fix (`npm audit fix`, no breaking changes)

These can be fixed one at a time with a standard `npm audit fix` inside the relevant container.

| # | Package | Severity | Workspace | CVE summary |
|---|---------|----------|-----------|-------------|
| 1 | `vitest` ≥4.0.0 <4.1.0 | **Critical** | backend | Arbitrary file read/execute via Vitest UI server |
| 2 | `react-router` 7.0.0–7.14.2 | **High** | frontend | RCE via turbo-stream, open redirect, XSS, DoS |
| 3 | `axios` 1.0.0–1.15.2 | **High** | frontend | Proxy bypass, header injection, ReDoS, MitM |
| 4 | `fast-uri` ≤3.1.1 | **High** | transitive | Path traversal, host confusion via percent-encoding |
| 5 | `tmp` <0.2.6 | **High** | transitive | Path traversal via unsanitised prefix/postfix |
| 6 | `express-rate-limit` 8.0.1–8.5.0 | Moderate | backend | Depends on vulnerable `ip-address` (XSS) |
| 7 | `hono` ≤4.12.20 | Moderate | transitive (prisma) | CSS injection, JWT bypass, cache leakage, cookie injection |
| 8 | `qs` 6.11.1–6.15.1 | Moderate | transitive | DoS via stringify crash on null entries |
| 9 | `brace-expansion` 5.0.2–5.0.5 | Moderate | transitive (workbox/frontend) | DoS via large numeric range |

---

## Group 2 — Requires investigation (`--force` or manual upgrade)

Do **not** run `npm audit fix --force` blindly on these. Each has a note on the safe path.

### 2a. `shell-quote` 1.1.0–1.8.3 — **Critical** (root devDependency)

- **Via:** `concurrently@9.2.1` (root `package.json` — used only for the `dev` script)
- **Issue:** `quote()` does not escape newlines; arbitrary shell injection
- **Audit fix installs:** `concurrently@10.0.3` (major bump from 9.x)
- **Safe path:** Check concurrently v10 changelog for breaking changes. Since this is only used in the
  root `dev` script (`concurrently "npm run dev:backend" "npm run dev:frontend"`), a major bump is
  unlikely to break anything. Upgrade manually:
  ```
  # Update root package.json: "concurrently": "^10.0.3"
  # Then rebuild
  ```
- **Risk level if left:** Low — only exploitable if attacker controls the dev script arguments (local dev only).

---

### 2b. `uuid` <11.1.1 — Moderate (backend, via `exceljs`)

- **Via:** `exceljs@4.4.0` ships an old internal `uuid` dependency
- **Issue:** Missing buffer bounds check in v3/v5/v6
- **Audit fix installs:** `exceljs@3.4.0` — a **downgrade** (nonsensical; we use `^4.4.0`)
- **Safe path:** Check if exceljs has released a version ≥4.x that updated its internal uuid to ≥11.1.1.
  If so, bump `exceljs` in `backend/package.json`. If not, this is a transitive issue with no fix yet —
  track the exceljs GitHub issues and revisit when they release a fix.
- **Risk level if left:** Low — the uuid v3/v5/v6 buffer overread requires `buf` argument usage which
  exceljs likely does not exercise.

---

### 2c. `@hono/node-server` <1.19.13 — Moderate (backend, via `prisma`)

- **Via:** `prisma@7.x` → `@prisma/dev` → `@hono/node-server`
- **Issue:** Middleware bypass via repeated slashes in `serveStatic`
- **Audit fix installs:** `prisma@6.19.3` — a **major downgrade** (unacceptable; we depend on Prisma 7)
- **Safe path:** Update `prisma` to the latest stable 7.x release. `@prisma/dev` is an internal Prisma
  dev tooling package; a newer Prisma 7 patch should pull in a fixed `@hono/node-server`. Check
  `https://www.npmjs.com/package/prisma` for the latest 7.x version and bump `backend/package.json`.
- **Risk level if left:** Low — `@hono/node-server`'s `serveStatic` is not used in this app; it is
  only present as a transitive dev tooling dependency of Prisma itself.

---

## Status

| # | Package | Status | Notes |
|---|---------|--------|-------|
| 1 | vitest | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 2 | react-router | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 3 | axios | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 4 | fast-uri | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 5 | tmp | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 6 | express-rate-limit / ip-address | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 7 | hono | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 8 | qs | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 9 | brace-expansion | ✅ Fixed 2026-06-11 | `npm audit fix` + `--no-cache` rebuild |
| 2a | shell-quote / concurrently | ✅ Fixed 2026-06-11 | Bumped concurrently 9→10; Node 22 req met |
| 2b | uuid / exceljs | ⏳ Blocked | exceljs 4.4.0 is latest; no upstream fix yet — recheck on next exceljs release |
| 2c | @hono/node-server / prisma | ⏳ Blocked | prisma 7.8.0 is latest; waiting on Prisma to update @prisma/dev >0.24.8 |
