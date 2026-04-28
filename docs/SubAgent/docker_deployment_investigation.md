# Docker Deployment Investigation — Tech-V2

**Date:** 2026-04-28  
**Scope:** Full audit of Docker deployment configuration for `schoolworks.ocboe.com`  
**Investigator:** GitHub Copilot (research-only task)

---

## Table of Contents

1. [Files Reviewed](#files-reviewed)
2. [Critical Issues](#critical-issues)
3. [Warnings](#warnings)
4. [Info / Looks Correct](#info--looks-correct)
5. [Missing Files](#missing-files)
6. [Recommended Action Plan](#recommended-action-plan)

---

## Files Reviewed

### `docker-compose.yml`
- Four services: `db`, `backend`, `frontend`, `certbot`
- `db` uses `postgres:16-alpine` with healthcheck on `pg_isready`
- `backend` depends on `db` with `condition: service_healthy` — correct startup order without wait-for-it scripts
- `backend` uses `expose: "3000"` (internal only, not mapped to host) — correct security posture
- `frontend` maps `80:80` and `443:443` to host
- All `JWT_SECRET` and `DB_PASSWORD` use `?:` mandatory syntax — will fail fast if unset
- **ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID** is passed to both backend environment AND frontend build args
- `certbot` runs on a 12-hour renewal loop using `entrypoint` override

### `backend/Dockerfile`
- Two-stage build: `builder` (Node 20 alpine) → `production` (Node 20 alpine)
- Runs `npm ci` then `npx prisma generate` in both stages (builder for build, production for runtime client)
- Copies `prisma.config.ts` into both stages
- Creates non-root `appuser:appgroup` and chowns `/app`
- HEALTHCHECK hits `http://localhost:3000/health` — matches the `/health` endpoint in `server.ts`
- CMD: `node dist/server.js` — matches `tsconfig.json` `outDir: ./dist` and `rootDir: ./src`
- Build script copies `src/assets/fonts/FreestyleScript.ttf` — **file exists** at that path

### `frontend/Dockerfile`
- Two-stage build: `builder` (Node 20 alpine) → `production` (nginx:alpine)
- `ARG` declarations for all `VITE_*` variables appear **before** `RUN npm run build` — Docker ARGs are available as environment variables to subsequent `RUN` instructions; Vite will pick them up correctly
- `RUN mkdir -p public` before `COPY public ./public/` — prevents build failure if `public/` is empty
- HEALTHCHECK hits `/nginx-health` on port 80 — matches the nginx.conf health endpoint

### `deploy.sh`
- Covers: `first-run`, `update`, `down`, `logs`, `db-migrate`, `db-seed`, `ssl-init`, `ssl-renew`
- `first_run()` checks prereqs, builds and starts all services, then runs `prisma migrate deploy` and seed
- `update()` calls `check_prereqs` before git pull + rebuild
- `ssl_init()` delegates to `init-ssl.sh` with `${SSL_EMAIL}` from sourced `.env`
- **Variable name bug in DB readiness check** — see CRITICAL section

### `init-ssl.sh`
- Solves the chicken-and-egg SSL problem correctly: dummy cert → start nginx → real cert → reload
- Checks if cert already exists before re-initializing
- Supports `--staging` flag for Let's Encrypt rate-limit testing
- Domain `schoolworks.ocboe.com` is **hardcoded** in the script

### `backend/package.json`
- `build` script: `tsc && node -e "require('fs').mkdirSync(...)"` — copies font file post-compile
- No workspace reference to `@mgspe/shared-types` — backend does **not** import from the `shared` package, so the limited Docker build context (`./backend`) is safe
- Prisma 7.2.0 — uses new `prisma.config.ts` pattern (schema.prisma omits `url` from datasource)

### `frontend/package.json`
- `build` script: `tsc && vite build` — standard Vite SPA build
- No ESLint extension in dependencies (only listed in `devDependencies` as lint script)

### `frontend/nginx.conf`
- HTTP (port 80): ACME challenge passthrough + `/nginx-health` + redirect to HTTPS
- HTTPS (port 443): SSL hardening (TLSv1.2/1.3), HSTS, gzip, 1-year cache for static assets
- Proxies `/api/` to `http://backend:3000/api/` with correct headers
- SPA fallback: `try_files $uri $uri/ /index.html`
- **No `client_max_body_size` directive** — default 1 MB applies to all uploads

### `frontend/vite.config.ts`
- Dev proxy: `/api` → `http://localhost:3000` (correct for local dev)
- `host: '127.0.0.1'` in dev server — local-only; not relevant to Docker builds
- Alias `@` → `./src` defined

### `backend/tsconfig.json`
- `outDir: ./dist`, `rootDir: ./src` — matches Dockerfile `COPY src ./src/` and `CMD ["node", "dist/server.js"]`
- `module: CommonJS` — required, since CMD runs directly with `node` (no ESM flag)
- `strict: true`, `esModuleInterop: true` — solid TypeScript config

### `backend/prisma/schema.prisma`
- Datasource: `provider = "postgresql"` — **no `url` field** (by design; uses `prisma.config.ts`)
- 28 migrations present, most recent: `20260427181050_add_food_service_workflow`
- Schema is well-maintained; food service workflow was added one day before this audit

### `backend/src/server.ts`
- Reads `PORT` from env (defaults to 3000) — matches `EXPOSE 3000` in Dockerfile and `PORT: 3000` in docker-compose.yml
- CORS reads `CORS_ORIGIN` — supports comma-separated origins
- Starts `cronJobsService` immediately on listen — this will query the DB
- `/health` endpoint returns JSON with uptime — matches HEALTHCHECK
- Graceful shutdown on `SIGTERM` — correct for Docker container management

### `.env.deploy`
- Missing `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` — see CRITICAL section
- Contains `DOMAIN=schoolworks.ocboe.com` — **not referenced** by docker-compose.yml
- All other required variables present with placeholder values

### `backend/.env.example`
- Missing `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` 
- Contains `UPLOAD_DIR` and `LOG_LEVEL` variables not referenced in docker-compose.yml (dev-only)

### `frontend/.env.example`
- All `VITE_*` variables documented including group IDs
- `VITE_API_URL=http://localhost:3000/api` — correct for local dev (different from `/api` used in Docker build)

---

## Critical Issues

### CRITICAL-1 — PostgreSQL Port Exposed to Host/Internet

**File:** `docker-compose.yml`, line 12  
**Exact text:**
```yaml
ports:
  - "5432:5432"
```

**Problem:** The database port is mapped to `0.0.0.0:5432` on the host. On a public-facing server this exposes PostgreSQL directly to the internet. Any attacker can attempt direct brute-force authentication against the database, bypassing the application entirely.

**Fix:** Either remove the `ports` entry entirely (backend communicates with `db` over the Docker network using the service name) or restrict to localhost:
```yaml
ports:
  - "127.0.0.1:5432:5432"
```
The backend container reaches the DB at `db:5432` via the internal Docker network — host-level port mapping is only needed for local DBA tooling (e.g., pgAdmin, psql from host). Keep `127.0.0.1:5432:5432` if local DBA access is needed; remove it entirely for a hardened production deployment.

---

### CRITICAL-2 — `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` Missing from `.env.deploy` Template

**File:** `c:\Tech-V2\.env.deploy`  
**Problem:** `docker-compose.yml` references `${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}` in two places:
- Backend environment (line ~43): `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: ${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}`
- Frontend build args (line ~61): `VITE_ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: ${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}`

The `.env.deploy` template omits this variable entirely. When operators copy `.env.deploy` to `.env`, this value will be an empty string. The food service PO workflow (added in migration `20260427181050_add_food_service_workflow`) will silently fail — approval buttons will be hidden and group membership checks will never match.

**Fix:** Add to `.env.deploy`:
```bash
ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID=food-services-po-entry-group-object-id
```

Also add to `backend/.env.example`:
```bash
# Food Services PO Entry Entra group — members can enter food service POs
ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID="food-services-po-entry-group-object-id"
```

---

## Warnings

### WARNING-1 — deploy.sh DB Readiness Check Uses Wrong Variable Names

**File:** `deploy.sh`, lines 51–60  
**Exact text:**
```bash
source .env
# ...
if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-techv2}" > /dev/null 2>&1; then
```

**Problem:** After `source .env`, the shell has `DB_USER` defined (from `.env.deploy`), but NOT `POSTGRES_USER` or `POSTGRES_DB`. Therefore:
- `${POSTGRES_USER:-postgres}` falls back to `postgres` (should be value of `DB_USER`, e.g., `techv2`)
- `${POSTGRES_DB:-techv2}` falls back to `techv2` (actual DB name is `tech_v2` with an underscore)

In practice `pg_isready` may still return success because it checks server availability, not auth validity. However, with the wrong database name, some PostgreSQL versions DO return a non-zero code. This makes the readiness check unreliable.

**Fix:**
```bash
if docker compose exec -T db pg_isready -U "${DB_USER:-techv2}" -d "tech_v2" > /dev/null 2>&1; then
```

---

### WARNING-2 — No `client_max_body_size` in nginx.conf — File Uploads Will 413

**File:** `frontend/nginx.conf`  
**Problem:** Nginx default `client_max_body_size` is 1 MB. The application handles:
- Inventory CSV imports (can exceed 1 MB for large datasets)
- Equipment attachments (`multer` is in backend dependencies)
- Any future file upload features

Large uploads will be rejected with HTTP 413 `Request Entity Too Large` before reaching the backend.

**Fix:** Add to the `server` block in the HTTPS section:
```nginx
# Allow up to 50MB for file uploads (CSV imports, attachments)
client_max_body_size 50M;
```

---

### WARNING-3 — Backend Accessible Before Migrations Run in `first_run`

**File:** `deploy.sh`, `first_run()` function  
**Problem:** `docker compose up -d --build` starts all services. The backend container starts (depends_on ensures DB is healthy, but does NOT ensure migrations have run). There is a window between backend start and the subsequent `docker compose exec backend npx prisma migrate deploy` where:
- The Prisma client is connected to a DB with no schema
- The `cronJobsService.start()` fires immediately on server listen

If any cron job or early request hits the DB during this window, it will fail with Prisma errors (table/column not found).

**Fix:** Option A — Run migrations before starting the backend on first-run by using a startup order override or by running migrations manually before `up`. Option B — Add a `/api/health` deep check that catches Prisma connection errors, so the container stays unhealthy until migrations complete. Option C (simplest) — Document that `docker compose up` should NOT be used directly; always use `./deploy.sh first-run`.

---

### WARNING-4 — Certbot Container Has No `depends_on: frontend`

**File:** `docker-compose.yml`  
**Problem:** The `certbot` container's 12-hour renewal loop runs via `entrypoint`. If the host restarts and services come up, `certbot renew` may attempt the ACME HTTP-01 challenge (via the certbot_www volume) before nginx is ready to serve the `/.well-known/acme-challenge/` directory. This could cause a renewal failure that goes unnoticed until the 12-hour retry.

**Fix:** Add dependency:
```yaml
certbot:
  depends_on:
    frontend:
      condition: service_healthy
```

---

### WARNING-5 — Backend Container `--start-period=10s` May Be Insufficient

**File:** `backend/Dockerfile`, HEALTHCHECK line  
**Exact text:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

**Problem:** `start-period` is 10 seconds. On a cold container (alpine pulling Node modules, Prisma client init, connection pool warmup), the backend may need more time before it can respond to `/health`. With retries=3 and interval=30s, a slow start will be tolerated, but docker-compose `depends_on` for any hypothetical downstream service could be affected.

**Fix:** Increase to `--start-period=30s` to match normal cold-start times.

---

### WARNING-6 — `DOMAIN` Variable in `.env.deploy` Is Unused

**File:** `c:\Tech-V2\.env.deploy`, last line  
**Exact text:**
```bash
DOMAIN=schoolworks.ocboe.com
```

**Problem:** `docker-compose.yml` does NOT reference `${DOMAIN}` anywhere. The domain is hardcoded in `nginx.conf` (`server_name schoolworks.ocboe.com`) and `init-ssl.sh` (`DOMAIN="schoolworks.ocboe.com"`). This variable in `.env.deploy` creates a false expectation that changing it here will change the deployed domain — it will not.

**Fix:** Either:
- Remove the `DOMAIN` variable from `.env.deploy` to avoid confusion, OR
- Wire it up: pass it as a build arg or parameterize `init-ssl.sh` to use it

---

### WARNING-7 — `init-ssl.sh` Domain Is Hardcoded, Ignores `.env`

**File:** `init-ssl.sh`, line 14  
**Exact text:**
```bash
DOMAIN="schoolworks.ocboe.com"
```

**Problem:** Domain is hardcoded. If the application is ever deployed to a different hostname (staging environment, disaster recovery, etc.), `init-ssl.sh` must be manually edited. The `SSL_EMAIL` is correctly read from env, but `DOMAIN` is not.

**Fix:**
```bash
DOMAIN="${DOMAIN:-schoolworks.ocboe.com}"
```
This reads from the environment (set by deployer or `.env`) with a safe fallback to the production domain.

---

## Info / Looks Correct

| # | Finding | Details |
|---|---------|---------|
| INFO-01 | `depends_on: condition: service_healthy` | Correct startup ordering. DB must pass `pg_isready` health check before backend starts. No `wait-for-it.sh` needed. |
| INFO-02 | Backend `expose: "3000"` (not `ports`) | Correct. Port is only reachable by other services on the Docker network. PostgreSQL DB is the one needing attention (see CRITICAL-1). |
| INFO-03 | `JWT_SECRET` and `DB_PASSWORD` use `?:` mandatory syntax | Will fail immediately at `docker compose up` if unset. Correct fail-fast pattern. |
| INFO-04 | `ENTRA_CLIENT_SECRET` NOT passed to frontend build args | Correct. Client secret stays server-side only. |
| INFO-05 | Docker ARGs available to `RUN npm run build` | Standard Docker behavior — ARGs declared before a RUN instruction are available as env vars within that RUN. Vite build sees all `VITE_*` args correctly. No `ENV` conversion needed. |
| INFO-06 | Backend does not import from `shared` package | Confirmed by source search. Build context `./backend` is fully self-contained. |
| INFO-07 | Font file exists at build path | `src/assets/fonts/FreestyleScript.ttf` exists; build script copy will succeed. |
| INFO-08 | `prisma generate` in both builder and production stages | Builder needs it for TypeScript compilation; production stage needs it for the runtime Prisma client. Both are correct. |
| INFO-09 | Non-root user in backend Dockerfile | `appuser:appgroup` created, `/app` chowned before USER switch. Correct security pattern. |
| INFO-10 | Non-root nginx in frontend Dockerfile | `nginx:nginx` ownership on html, cache, log, and pid. Correct. |
| INFO-11 | `CORS_ORIGIN` supports comma-separated origins | `server.ts` splits on comma and trims. Matches docker-compose env value. |
| INFO-12 | HSTS configured with `includeSubDomains` | `max-age=31536000` (1 year) — correct for production. |
| INFO-13 | TLS 1.2 / 1.3 only; SSLv3 and TLS 1.0/1.1 disabled | Industry standard. Good. |
| INFO-14 | Rate limiting on `/api/` (500/15min) and `/api/auth/login` (20/15min) | Defense against brute force and DoS. Correct. |
| INFO-15 | Certbot auto-renewal every 12 hours | Let's Encrypt certs expire every 90 days; 12-hour checks ensure timely renewal. |
| INFO-16 | 28 migrations, most recent `20260427181050_add_food_service_workflow` | Well-managed migration history. `prisma migrate deploy` is safe in production. |
| INFO-17 | `SIGTERM` handler stops cron and exits | Proper graceful shutdown for Docker `docker stop`. |
| INFO-18 | `prisma.config.ts` omitting URL from schema.prisma | Valid Prisma 7.x pattern. URL provided at runtime via process env; `prisma generate` does not need a live connection. |
| INFO-19 | Gzip enabled for API responses and static assets | Reduces bandwidth for JSON API responses and JS bundles. |
| INFO-20 | `REFRESH_TOKEN_EXPIRES_IN` configured but no `REFRESH_TOKEN_SECRET` | Same `JWT_SECRET` used for both access and refresh tokens. Acceptable but less secure than separate secrets. No current code mismatch. |

---

## Missing Files

| File | Status | Impact |
|------|--------|--------|
| `c:\Tech-V2\.env` | Missing (expected — gitignored) | Operators must copy from `.env.deploy` |
| `c:\Tech-V2\backend\.env` | Missing (expected) | Dev must copy from `backend/.env.example` |
| `c:\Tech-V2\frontend\.env` | Missing (expected) | Dev must copy from `frontend/.env.example` |
| `c:\Tech-V2\.env.example` | Missing | A root-level `.env.example` pointing operators to `.env.deploy` would improve discoverability |
| `backend/src/assets/fonts/FreestyleScript.ttf` | **EXISTS** ✓ | No issue |

---

## Recommended Action Plan

**Priority 1 — Do Before Next Production Deploy:**

1. **CRITICAL-1:** Change `db.ports` to `127.0.0.1:5432:5432` or remove the ports entry entirely.
2. **CRITICAL-2:** Add `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` to `.env.deploy` and `backend/.env.example`.

**Priority 2 — Should Fix Soon:**

3. **WARNING-1:** Fix `deploy.sh` readiness check variable names (`DB_USER`, `tech_v2`).
4. **WARNING-2:** Add `client_max_body_size 50M;` to `frontend/nginx.conf` HTTPS server block.
5. **WARNING-7:** Parameterize `init-ssl.sh` domain via env var.

**Priority 3 — Nice to Have:**

6. **WARNING-3:** Document that `./deploy.sh first-run` is mandatory; never use bare `docker compose up` for initial deployment.
7. **WARNING-4:** Add `depends_on: frontend: condition: service_healthy` to certbot service.
8. **WARNING-5:** Increase backend `--start-period` to `30s`.
9. **WARNING-6:** Remove or wire up `DOMAIN` in `.env.deploy`.
