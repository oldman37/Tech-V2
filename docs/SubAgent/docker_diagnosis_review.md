# Docker Deployment Fixes — QA Review

**Date:** 2026-04-28  
**Reviewer:** Subagent #3 (QA)  
**Spec Reference:** `docs/SubAgent/docker_diagnosis_spec.md`  
**Assessment:** **PASS (with Recommendations)**

---

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| CRITICAL Issues Resolved | 2 / 2 | **A** |
| HIGH Issues Resolved | 3 / 3 | **A** |
| MEDIUM Issues Resolved | 2 / 4 | **C** |
| Docker Best Practices | 3 / 5 | **B** |
| Security | 5 / 5 | **A** |
| Consistency | 4 / 4 | **A** |
| **Overall** | **~80%** | **B** |

---

## Overall Assessment

All **CRITICAL** and **HIGH** blocking issues from the spec have been correctly implemented. The application will now build and run in Docker without the fatal failures identified in the diagnosis. Two MEDIUM issues remain unaddressed, and two new Docker best-practice issues were identified during review.

---

## Findings by Severity

---

### CRITICAL Issues — All Resolved ✓

---

#### CRITICAL-1 — TypeScript Module System ✓ RESOLVED

**File:** `backend/tsconfig.json`  
**Expected:** `"module": "CommonJS"` (Option A from spec)  
**Actual:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    ...
  }
}
```

**Verdict:** Correct. `"module": "CommonJS"` paired with `"moduleResolution": "node"` is the idiomatic Express backend configuration. This also implicitly resolves **MEDIUM-4** (the `moduleResolution: "node"` + ESNext mismatch).

---

#### CRITICAL-2 — Prisma Datasource URL + prisma.config.ts in Docker ✓ RESOLVED

**File:** `backend/prisma/schema.prisma`  
**Expected:** `url = env("DATABASE_URL")` in datasource block  
**Actual:**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Verdict:** Correct. ✓

**File:** `backend/Dockerfile` (Fix 2b)  
**Expected:** `COPY prisma.config.ts ./` in both builder and production stages, before `prisma generate`  
**Actual (builder stage):**

```dockerfile
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./          # ← Added
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build
```

**Actual (production stage):**

```dockerfile
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./          # ← Added
RUN npm ci --omit=dev
RUN npx prisma generate
COPY --from=builder /app/dist ./dist/
```

**Verdict:** `prisma.config.ts` is present in both stages, before `prisma generate` — the spec's primary requirement is met. See **RECOMMENDED-1** below for a layer-caching concern with this ordering.

---

### HIGH Issues — All Resolved ✓

---

#### HIGH-1 — CORS_ORIGIN Missing from Production Environment ✓ RESOLVED

**Files:** `docker-compose.yml`, `.env.deploy`  
**Expected:** `CORS_ORIGIN` present in backend service environment and `.env.deploy` template

**Actual (`docker-compose.yml`):**

```yaml
CORS_ORIGIN: ${CORS_ORIGIN:-https://schoolworks.ocboe.com}
```

**Actual (`.env.deploy`):**

```
CORS_ORIGIN=https://schoolworks.ocboe.com
```

**Verdict:** Correct. The default fallback `https://schoolworks.ocboe.com` is appropriate so the deployment works without explicitly setting the variable. ✓

---

#### HIGH-2 — prisma.config.ts Not in Docker Image ✓ RESOLVED

Covered by CRITICAL-2 fix above.

---

#### HIGH-3 — ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID Missing from Backend ✓ RESOLVED

**File:** `docker-compose.yml`  
**Actual:**

```yaml
ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: ${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}
```

**Verdict:** Correct. The variable is present in the backend service environment. Unlike `CORS_ORIGIN`, no default is provided here — if the `.env` omits this value, it will be empty string (not undefined) since docker-compose passes the shell variable's value. The `.env.deploy` template includes a placeholder value for this variable, which is adequate. ✓

---

### MEDIUM Issues — Partially Resolved

---

#### MEDIUM-1 — Nginx Health Check Follows Redirect ✓ RESOLVED

**Files:** `frontend/nginx.conf`, `frontend/Dockerfile`

**nginx.conf HTTP block (actual):**

```nginx
location /nginx-health {
    access_log off;
    return 200 "healthy\n";
    add_header Content-Type text/plain;
}
```

Placed **before** the `location / { return 301 ... }` block. In Nginx, location matching by prefix length means `/nginx-health` (more specific) takes precedence over `/`. The `return 200` is syntactically valid and will not redirect. ✓

**frontend/Dockerfile HEALTHCHECK (actual):**

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/nginx-health || exit 1
```

**Verdict:** The health check now hits an endpoint that returns 200 directly, without issuing a redirect. This resolves the core issue. See **RECOMMENDED-2** for the missing `--start-period` flag.

---

#### MEDIUM-2 — deploy.sh `sleep 5` Before Migrations ⚠️ NOT ADDRESSED

**File:** `deploy.sh`  
**Actual (unchanged):**

```bash
docker compose up -d --build

log "Waiting for database to be ready..."
sleep 5

log "Running Prisma migrations..."
docker compose exec backend npx prisma migrate deploy
```

**Issue:** `sleep 5` is a hardcoded guess. On first pull or slow hosts, the backend container may still be starting when `docker compose exec` runs, causing:
```
Error response from daemon: container is not running
```

**Status:** Not addressed. This is non-blocking for normal deployments on reasonable hardware, but it is a documented MEDIUM issue from the spec.

---

#### MEDIUM-3 — Log Volume Ownership on Re-deploy ⚠️ NOT ADDRESSED

**File:** `backend/Dockerfile`  
**Actual (relevant section):**

```dockerfile
RUN mkdir -p /app/logs

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser
```

**Issue:** When the named volume `backend_logs` already exists from a previous deployment, Docker mounts it as-is. If the volume was created before correct UID/GID assignment (e.g., a prior failed build), `/app/logs` is owned by root, and `appuser` (UID 1001) cannot write logs. Winston will throw `EACCES` errors.

No `docker-entrypoint.sh` with `su-exec` was added as recommended by the spec.

**Status:** Not addressed. Risk is confined to re-deployments where volume state is stale.

#### MEDIUM-4 — moduleResolution Mismatch ✓ RESOLVED (by CRITICAL-1 fix)

`"module": "CommonJS"` + `"moduleResolution": "node"` is the correct pairing. No separate action required.

---

### LOW Issues — Not Addressed (acceptable)

| ID | Issue | Status |
|----|-------|--------|
| LOW-1 | No root `.dockerignore` | Not needed — build contexts are `./backend` and `./frontend` ✓ |
| LOW-2 | OCSP stapling missing from `nginx.conf` | Not addressed |
| LOW-3 | `init-ssl.sh` fixed `sleep 3` | Not addressed |
| LOW-4 | Gzip `Vary` header override in static assets location | Not addressed |

---

## Newly Identified Issues

---

### RECOMMENDED-1 — Layer Cache Invalidation: prisma.config.ts Copied Before npm ci

**Severity:** RECOMMENDED  
**Files:** `backend/Dockerfile` (both builder and production stages)

**Current order (both stages):**

```dockerfile
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./       ← Change to prisma schema busts npm ci cache
RUN npm ci
RUN npx prisma generate
```

**Problem:** Docker layer caching works by invalidating all layers below the first changed layer. Because `prisma.config.ts` and `prisma/` are copied before `RUN npm ci`, any change to the Prisma schema or config file (which is common during development and migrations) will invalidate the `npm ci` layer and trigger a full `npm install`. On a slow CI runner or remote server, `npm ci` can take 60–120 seconds.

**Recommended order:**

```dockerfile
COPY package.json package-lock.json* ./
RUN npm ci                          # ← cached unless package.json/lock changes
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build
```

This applies to both the builder and production stages.

**Impact:** No functional regression from the current implementation — it is solely a build-time performance concern. However, for a production deployment pipeline, this is a meaningful improvement.

---

### RECOMMENDED-2 — Frontend HEALTHCHECK Missing `--start-period`

**Severity:** RECOMMENDED  
**File:** `frontend/Dockerfile`

**Actual:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/nginx-health || exit 1
```

**Problem:** Without `--start-period`, Docker starts counting health check retries immediately. If Nginx takes more than 3 × 30 seconds (90 seconds) to become ready (unlikely but possible on first-run), the container is marked `unhealthy`. The backend Dockerfile correctly has `--start-period=10s` for this purpose.

**Recommended fix:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/nginx-health || exit 1
```

---

## Security Review

| Concern | Status | Detail |
|---------|--------|--------|
| No secrets hardcoded in Dockerfiles | ✓ Pass | All secrets via docker-compose environment from `.env` |
| DATABASE_URL uses env vars | ✓ Pass | `postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/tech_v2` |
| DB_PASSWORD required enforcement | ✓ Pass | `:?` operator — compose fails fast if unset |
| JWT_SECRET required enforcement | ✓ Pass | `:?` operator |
| ARG vs ENV correct for frontend | ✓ Pass | `ARG VITE_*` used for build-time bake-in; correct for Vite |
| Non-root backend container user | ✓ Pass | `appuser` UID 1001 |
| Non-root frontend container user | ✓ Pass | `nginx:nginx` |
| node_modules excluded from image | ✓ Pass | Both `.dockerignore` files exclude `node_modules` |
| `.env` excluded from images | ✓ Pass | Both `.dockerignore` files exclude `.env` and `.env.local` |
| CORS restricted in production | ✓ Pass | Now correctly set to `https://schoolworks.ocboe.com` |
| HSTS configured | ✓ Pass | `max-age=31536000; includeSubDomains` |
| TLS 1.2/1.3 only | ✓ Pass | `ssl_protocols TLSv1.2 TLSv1.3` |
| OCSP stapling | ✗ Missing | LOW-2, not addressed |

---

## Consistency Check

| Relationship | Status |
|-------------|--------|
| `docker-compose.yml` `DATABASE_URL` → `schema.prisma` `url = env("DATABASE_URL")` | ✓ Match |
| `docker-compose.yml` backend `CORS_ORIGIN` → `.env.deploy` `CORS_ORIGIN` | ✓ Match |
| `docker-compose.yml` backend `ENTRA_*` group IDs → frontend build `ARG VITE_ENTRA_*` | ✓ Match |
| `frontend/Dockerfile` HEALTHCHECK endpoint → `nginx.conf` `/nginx-health` location | ✓ Match |
| `nginx.conf` proxy `http://backend:3000/api/` → backend `EXPOSE 3000` | ✓ Match |
| `backend/tsconfig.json` `"outDir": "./dist"` → Dockerfile `CMD ["node", "dist/server.js"]` | ✓ Match |
| Backend Dockerfile `prisma generate` → `schema.prisma` url field present | ✓ Match |

---

## Remaining Issues Summary

### CRITICAL — Must Fix Before Production
*None.*

### RECOMMENDED — Should Fix
| ID | Issue | File |
|----|-------|------|
| RECOMMENDED-1 | Layer cache invalidated by prisma copy before `npm ci` | `backend/Dockerfile` |
| RECOMMENDED-2 | Frontend HEALTHCHECK missing `--start-period` | `frontend/Dockerfile` |
| MEDIUM-2 | `sleep 5` in `first_run()` before migrations — race condition on slow hosts | `deploy.sh` |
| MEDIUM-3 | Log volume may be root-owned on re-deploy, blocking Winston writes (`EACCES`) | `backend/Dockerfile` |

### OPTIONAL — Nice to Have
| ID | Issue | File |
|----|-------|------|
| LOW-2 | OCSP stapling not configured | `frontend/nginx.conf` |
| LOW-3 | `init-ssl.sh` uses `sleep 3` before certbot — may be too short | `init-ssl.sh` |
| LOW-4 | `Vary: Accept-Encoding` header overridden for static assets by `add_header` in location block | `frontend/nginx.conf` |

---

## Conclusion

The implementation correctly and completely addresses all 2 CRITICAL and all 3 HIGH issues identified in the diagnosis spec. The two remaining MEDIUM issues (`deploy.sh` timing and log volume ownership) were flagged in the spec but not implemented — they represent operational risks rather than hard failures. Two new RECOMMENDED issues were identified (Dockerfile layer caching ordering and missing `--start-period` on the frontend health check).

**The deployment is production-ready with the current fixes.** The RECOMMENDED items should be addressed before the next deployment iteration to improve robustness and build performance.
