# Docker Deployment QA Review — Tech-V2

**Date:** 2026-04-28  
**Reviewer:** GitHub Copilot (QA review task)  
**Reference Spec:** `docs/SubAgent/docker_deployment_investigation.md`  
**Files Reviewed:**
- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/nginx.conf`
- `deploy.sh`
- `init-ssl.sh`
- `backend/.env.example`
- `.env.deploy`

---

## Summary Score Table

| Issue | Severity | Status | Grade |
|-------|----------|--------|-------|
| CRITICAL-1: PostgreSQL port exposed | CRITICAL | RESOLVED | ✅ |
| CRITICAL-2: `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` missing from templates | CRITICAL | RESOLVED | ✅ |
| WARNING-1: deploy.sh wrong variable names in readiness check | WARNING | RESOLVED | ✅ |
| WARNING-2: No `client_max_body_size` in nginx.conf | WARNING | RESOLVED | ✅ |
| WARNING-3: Backend accessible before migrations run | WARNING | RESOLVED (superior fix) | ✅ |
| WARNING-4: Certbot no `depends_on: frontend` | WARNING | RESOLVED | ✅ |
| WARNING-5: Backend `--start-period=10s` insufficient | WARNING | RESOLVED | ✅ |
| WARNING-6: `DOMAIN` variable in `.env.deploy` unused | WARNING | RESOLVED | ✅ |
| WARNING-7: `init-ssl.sh` domain hardcoded | WARNING | RESOLVED | ✅ |
| NEW-OBS-1: Redundant migration calls in deploy.sh | MINOR | Harmless/Informational | ⚠️ |

**Overall Grade: A (PASS)**

---

## Overall Assessment: PASS

All CRITICAL and WARNING issues from the investigation spec were correctly resolved. No syntax errors were introduced in any file. One harmless redundancy was introduced (double migration execution) — documented below. All specific validation criteria passed.

---

## Detailed Findings

---

### CRITICAL-1 — PostgreSQL Port Exposed to Host/Internet

**Status: RESOLVED**

The `db` service no longer has a `ports:` entry at all. The database is now reachable only on the internal Docker network as `db:5432`. Correct hardened production posture.

> **Validation:** `docker-compose.yml` `db:` service — no `ports:` key present. ✅

---

### CRITICAL-2 — `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` Missing from Templates

**Status: RESOLVED**

Both template files were updated:

- `.env.deploy` line: `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID=food-services-po-entry-group-object-id` ✅
- `backend/.env.example` line: `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID="food-services-po-entry-group-object-id"` with inline comment ✅

The variable was already correctly wired into both the `backend` environment and `frontend` build args in `docker-compose.yml`.

---

### WARNING-1 — deploy.sh DB Readiness Check Wrong Variable Names

**Status: RESOLVED**

`deploy.sh` line in the readiness loop was corrected to:

```bash
if docker compose exec -T db pg_isready -U "${DB_USER:-techv2}" -d "tech_v2" > /dev/null 2>&1; then
```

Both `${DB_USER:-techv2}` (matches the variable name in `.env.deploy`) and hardcoded `"tech_v2"` (actual database name with underscore) are correct. Bash syntax is valid. ✅

---

### WARNING-2 — No `client_max_body_size` in nginx.conf

**Status: RESOLVED**

Added to `frontend/nginx.conf`:

```nginx
# Allow up to 50MB for file uploads (CSV imports, attachments)
client_max_body_size 50M;
```

**Location validation:** The directive is placed inside the HTTPS `server { }` block, between the HSTS header directive and the `root` directive. This is the correct block level — it applies to all requests on the HTTPS server context without restricting individual `location` blocks. ✅

---

### WARNING-3 — Backend Accessible Before Migrations Run in `first_run`

**Status: RESOLVED** *(superior fix applied — more robust than spec recommendation)*

Rather than just documenting the `./deploy.sh first-run` usage, the backend service in `docker-compose.yml` now has:

```yaml
command: sh -c "npx prisma migrate deploy && node dist/server.js"
```

This is Option A from the spec recommendations and is more comprehensive: migrations now run on **every** container startup, not just first-run. This eliminates the migration window entirely for all deployment scenarios (first-run, update, container restart after crash, server reboot, etc.).

**Compatibility check (Criterion 11):** The backend `Dockerfile` has `CMD ["node", "dist/server.js"]` with no `ENTRYPOINT`. The docker-compose `command:` correctly overrides the Dockerfile CMD without any ENTRYPOINT conflict. ✅

**Path/npx check (Criterion 12):**
- `WORKDIR /app` is set in the Dockerfile.
- `prisma/` directory is at `/app/prisma/` and `prisma.config.ts` is at `/app/prisma.config.ts`.
- `npm ci --omit=dev` is run during the image build, making `npx prisma` available.
- `prisma generate` was already executed during image build, so the Prisma client is pre-generated.
- `DATABASE_URL` is injected via `docker-compose.yml` environment, so Prisma can reach the database.
- The container runs as `appuser`, but `chown -R appuser:appgroup /app` runs before `USER appuser`, so the entire `node_modules` tree (including Prisma engine binaries) is owned and executable by `appuser`. ✅

> **NEW OBSERVATION (MINOR):** This fix introduces a harmless redundancy — see `NEW-OBS-1` below.

---

### WARNING-4 — Certbot Container Has No `depends_on: frontend`

**Status: RESOLVED**

`docker-compose.yml` certbot service now has:

```yaml
depends_on:
  frontend:
    condition: service_healthy
```

**Frontend healthcheck validation (Criterion 10):** The `frontend/Dockerfile` (production stage) defines:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/nginx-health || exit 1
```

The `nginx.conf` still contains the `/nginx-health` endpoint in the HTTP server block. Docker Compose's `condition: service_healthy` will correctly read the HEALTHCHECK from the frontend Dockerfile. The `service_healthy` condition is valid and will not cause certbot to hang. ✅

---

### WARNING-5 — Backend Container `--start-period=10s` Insufficient

**Status: RESOLVED**

`backend/Dockerfile` HEALTHCHECK line updated to `--start-period=30s`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

**Syntax validation (Criterion 6):** HEALTHCHECK flags are correct Docker syntax. The `\` line continuation inside a Dockerfile instruction is valid. `wget --no-verbose --tries=1 --spider` is the correct non-root-safe approach for Alpine-based images (which lack `curl` by default). ✅

---

### WARNING-6 — `DOMAIN` Variable in `.env.deploy` Unused

**Status: RESOLVED**

The `.env.deploy` variable now has a clarifying comment:

```bash
# Domain — used by init-ssl.sh for SSL certificate initialization (not read by docker-compose.yml directly)
DOMAIN=schoolworks.ocboe.com
```

This is now accurate because `init-ssl.sh` was updated to read `DOMAIN` from the environment (WARNING-7 fix). The variable is no longer misleading — it is used by the SSL init process. ✅

---

### WARNING-7 — `init-ssl.sh` Domain Hardcoded

**Status: RESOLVED**

`init-ssl.sh` line 14 updated from hardcoded to:

```bash
DOMAIN="${DOMAIN:-schoolworks.ocboe.com}"
```

**Env var pattern validation (Criterion 9):** `"${VARIABLE:-default}"` is the standard POSIX/bash parameter expansion with fallback default. The `set -euo pipefail` at the top of the script means unbound variables raise errors — the `:-` default syntax prevents that here. The deploy.sh `ssl_init()` function calls `export SSL_EMAIL` before invoking `init-ssl.sh`, demonstrating the pattern for how `DOMAIN` would also need to be exported if overriding. ✅

---

## New Issues Introduced by Fixes

---

### NEW-OBS-1 — Redundant Migration Execution in deploy.sh

**Severity: MINOR (Harmless — Informational Only)**

The `command: sh -c "npx prisma migrate deploy && node dist/server.js"` addition to docker-compose.yml causes migrations to run automatically on container startup. However, `deploy.sh` still contains explicit migration calls:

- `first_run()`: `docker compose exec backend npx prisma migrate deploy` (line ~72)
- `update()`: `docker compose exec backend npx prisma migrate deploy` (line ~98)
- `db_migrate()`: `docker compose exec backend npx prisma migrate deploy` (line ~138)

The explicit calls in `first_run()` and `update()` are now **redundant** — migrations already completed when the container started. Running `prisma migrate deploy` twice is **idempotent** (Prisma checks the `_prisma_migrations` table and skips already-applied migrations), so this causes no data loss or corruption.

**Practical impact:**
- Slightly longer execution time during `first-run` and `update` (~1–2 seconds per extra migration check).
- If the backend container is still starting up when `docker compose exec backend npx prisma migrate deploy` is called in `first_run()`, the exec will succeed because the migration was already applied at startup.
- `db-migrate` command retains its value as a standalone admin tool.

**Recommendation:** The redundancy is acceptable given its harmless nature. If desired, the explicit migration calls in `first_run()` and `update()` could be removed as a follow-up cleanup, leaving only `db_migrate()` as the standalone command. This is low priority.

---

## Syntax Validation Summary (Criteria 5–9)

| File | Check | Result |
|------|-------|--------|
| `docker-compose.yml` | Valid YAML with correct 2-space indentation | ✅ PASS |
| `docker-compose.yml` | All volume names in top-level `volumes:` block (`pgdata`, `backend_logs`, `certbot_conf`, `certbot_www`) | ✅ PASS |
| `docker-compose.yml` | `certbot.depends_on.frontend.condition` structure valid | ✅ PASS |
| `docker-compose.yml` | No db `ports:` entry remaining | ✅ PASS |
| `backend/Dockerfile` | HEALTHCHECK syntax with `\` continuation valid | ✅ PASS |
| `frontend/nginx.conf` | `client_max_body_size 50M;` in `server {}` block (correct level) | ✅ PASS |
| `deploy.sh` | `${DB_USER:-techv2}` bash parameter expansion valid | ✅ PASS |
| `init-ssl.sh` | `${DOMAIN:-schoolworks.ocboe.com}` bash parameter expansion valid | ✅ PASS |

---

## Remaining Issues

| # | Issue | Severity | Introduced By |
|---|-------|----------|---------------|
| NEW-OBS-1 | Redundant `npx prisma migrate deploy` calls in `first_run()` and `update()` — harmless/idempotent | MINOR | WARNING-3 fix |

No CRITICAL or WARNING issues remain unresolved. No syntax errors were detected in any modified file.

---

## Final Assessment

**PASS**

All 2 CRITICAL issues and all 7 WARNING issues from the investigation spec are resolved. The fix for WARNING-3 was implemented more robustly than specified (container-level migration-before-start rather than documentation-only). The `service_healthy` condition for certbot is valid because the frontend Dockerfile contains a HEALTHCHECK targeting the `/nginx-health` endpoint. No syntax errors were introduced. The single new observation (double migration execution) is harmless and requires no immediate action.
