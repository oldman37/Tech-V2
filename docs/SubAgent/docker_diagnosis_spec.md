# Docker Deployment Diagnosis — Tech-V2

**Date:** 2026-04-28  
**Scope:** Full-stack Docker deployment (`docker-compose.yml`, backend Dockerfile, frontend Dockerfile, nginx, SSL scripts)  
**Status:** Pre-fix analysis — container stack will NOT start successfully as-is

---

## Executive Summary

The Docker deployment has **two CRITICAL blocking issues** that prevent the application from running at all, plus four HIGH-severity issues that cause silent failures in production once the blocking issues are resolved. The root problems are a TypeScript module system mismatch (CJS vs ESM) and a missing Prisma datasource URL that prevents database connectivity.

---

## 1. Files Reviewed

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Service orchestration |
| `backend/Dockerfile` | Multi-stage backend build |
| `frontend/Dockerfile` | Multi-stage frontend build |
| `frontend/nginx.conf` | Nginx reverse-proxy + SPA config |
| `init-ssl.sh` | Let's Encrypt bootstrap script |
| `deploy.sh` | Deployment management script |
| `backend/package.json` | Backend dependencies and scripts |
| `frontend/package.json` | Frontend dependencies and scripts |
| `backend/tsconfig.json` | TypeScript compiler config |
| `frontend/vite.config.ts` | Vite build tool config |
| `backend/prisma/schema.prisma` | Prisma schema and datasource |
| `backend/prisma.config.ts` | Prisma 7 CLI configuration |
| `backend/src/server.ts` | Express application entry point |
| `backend/.dockerignore` | Backend build ignore list |
| `frontend/.dockerignore` | Frontend build ignore list |
| `.env.deploy` | Deployment environment template |

---

## 2. Issues — Prioritized

---

### CRITICAL-1 — TypeScript ESM Output Without `"type": "module"` in Package.json

**Severity:** CRITICAL  
**File:** `backend/tsconfig.json` + `backend/package.json`

**Root Cause:**

`backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node",
    ...
  }
}
```

`backend/package.json` — has no `"type": "module"` field:
```json
{
  "name": "tech-v2-backend",
  "main": "dist/server.js",
  ...
}
```

`backend/Dockerfile`:
```dockerfile
CMD ["node", "dist/server.js"]
```

**Why This Fails:**

- `"module": "ESNext"` instructs TypeScript to emit JavaScript with native `import`/`export` ES module syntax.
- Without `"type": "module"` in `package.json`, Node.js treats all `.js` files as CommonJS by default.
- When the production container runs `node dist/server.js`, Node sees `import` statements in a CJS context and throws:
  ```
  SyntaxError: Cannot use import statement in a module
  ```
- The container exits immediately with code 1. The health check never passes. All dependent services stall.

**Development environment is unaffected** because `npm run dev` uses `tsx` which handles ESM natively without compiling to disk.

**Proposed Fix (Option A — Recommended: CommonJS output):**

Change `tsconfig.json` to emit CommonJS, which is idiomatic for an Express backend without bundling:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Proposed Fix (Option B — ESM, more invasive):**

Add `"type": "module"` to `backend/package.json` AND change all internal imports in `src/` to include `.js` extensions (TypeScript ESM requirement) AND change tsconfig to `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`. This is significantly more work.

**Recommendation:** Option A (CommonJS). The app uses Express with no ESM-specific requirements.

---

### CRITICAL-2 — Prisma Datasource Missing `url` Field; `prisma.config.ts` Not in Docker Image

**Severity:** CRITICAL  
**Files:** `backend/prisma/schema.prisma`, `backend/prisma.config.ts`, `backend/Dockerfile`

**Root Cause:**

`schema.prisma` datasource:
```prisma
datasource db {
  provider = "postgresql"
}
```

No `url` field is present. The URL is provided exclusively via `prisma.config.ts`:
```typescript
export default defineConfig({
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

However, `backend/Dockerfile` never copies `prisma.config.ts`:
```dockerfile
# Builder stage
COPY package.json package-lock.json* ./
COPY prisma ./prisma/       # schema + migrations ONLY
COPY tsconfig.json ./
COPY src ./src/

# Production stage
COPY package.json package-lock.json* ./
COPY prisma ./prisma/       # schema + migrations ONLY — NO prisma.config.ts
```

**Why This Fails:**

1. `npx prisma generate` in both builder and production stages runs without the config file. Prisma falls back to `schema.prisma`, finds no `url`, and may either error or generate a client that cannot resolve the host at runtime.
2. At runtime, the Prisma client cannot determine where to connect — `DATABASE_URL` is available in the container environment (set by `docker-compose.yml`) but the Prisma client was not generated with the knowledge of how to read it because neither `schema.prisma` nor `prisma.config.ts` is fully available.
3. Every database operation throws a Prisma initialization error, crashing all API routes.

**Proposed Fix:**

Apply both changes:

**Fix 2a** — Add `url` to `schema.prisma` (traditional, always available, backward-compatible):
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Fix 2b** — Copy `prisma.config.ts` to the Docker builder stage so Prisma CLI has access to the full config:

In `backend/Dockerfile`, builder stage:
```dockerfile
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./       # ADD THIS LINE
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build
```

And in the production stage:
```dockerfile
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./       # ADD THIS LINE
RUN npm ci --omit=dev
RUN npx prisma generate
```

---

### HIGH-1 — Missing `CORS_ORIGIN` Environment Variable for Production

**Severity:** HIGH  
**Files:** `docker-compose.yml`, `backend/src/server.ts`, `.env.deploy`

**Root Cause:**

`server.ts` CORS configuration:
```typescript
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim()).filter(Boolean);
```

`docker-compose.yml` backend environment — `CORS_ORIGIN` is never set:
```yaml
environment:
  NODE_ENV: production
  PORT: 3000
  DATABASE_URL: ...
  JWT_SECRET: ...
  # CORS_ORIGIN is absent — defaults to 'http://localhost:5173'
```

`.env.deploy` — `CORS_ORIGIN` is also absent from the template.

**Why This Fails:**

In production, the browser sends requests from `https://schoolworks.ocboe.com`. The `Origin` header will be `https://schoolworks.ocboe.com`. The backend only allows `http://localhost:5173`. All API calls from the browser return:
```
Access to XMLHttpRequest at 'https://schoolworks.ocboe.com/api/...' from origin 
'https://schoolworks.ocboe.com' has been blocked by CORS policy.
```

Note: The Nginx proxy adds `proxy_set_header Host $host` but the browser's `Origin` header is not rewritten by Nginx. The CORS check happens in Express against the actual browser origin.

**Proposed Fix:**

1. Add `CORS_ORIGIN` to `docker-compose.yml` backend environment:
```yaml
environment:
  CORS_ORIGIN: ${CORS_ORIGIN:-https://schoolworks.ocboe.com}
```

2. Add `CORS_ORIGIN` to `.env.deploy`:
```
CORS_ORIGIN=https://schoolworks.ocboe.com
```

---

### HIGH-2 — `prisma.config.ts` Not Copied to Docker Image (Prisma CLI Config Missing)

**Severity:** HIGH  
**Partially covered by CRITICAL-2 above**

`prisma.config.ts` (Prisma 7 configuration) is not included in either Docker build stage. Beyond the URL problem (CRITICAL-2), the absence of this file means:

- `prisma migrate deploy` (run via `deploy.sh`) would execute against a container where the CLI config is absent
- `npx prisma db seed` would also lack the config context

This is resolved by the fixes in CRITICAL-2b.

---

### HIGH-3 — `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` Missing from Backend `docker-compose.yml` Environment

**Severity:** HIGH  
**File:** `docker-compose.yml`

`docker-compose.yml` frontend build args include:
```yaml
VITE_ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: ${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}
```

However, the backend service's `environment` block does not include `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID`. If any backend authorization logic uses this group ID to gate access, it will be `undefined` in the backend, causing silent permission failures or unintended open access.

**Proposed Fix:**

Add to backend environment in `docker-compose.yml`:
```yaml
ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: ${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}
```

---

### MEDIUM-1 — Nginx Health Check Will Fail Until SSL Is Provisioned

**Severity:** MEDIUM  
**File:** `frontend/Dockerfile`

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
```

**Root Cause:**

`nginx.conf` redirects all `http://` traffic on port 80 to HTTPS (301), except for `/.well-known/acme-challenge/`. So `wget --spider http://localhost:80/` receives a 301 redirect to `https://schoolworks.ocboe.com/` and follows it. The HTTPS request then fails because:
- The container has no SSL cert yet (before `init-ssl.sh` runs)
- Even after certs are installed, `wget` inside the container tries to resolve `schoolworks.ocboe.com` — which won't resolve to `localhost` inside the container

**Impact:** The frontend container is always marked `unhealthy`. Any service depending on it with `condition: service_healthy` would never start.

**Proposed Fix:**

Check the ACME challenge path instead (always succeeds with 404, which wget considers a non-fatal response), or check a localhost-friendly path:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/.well-known/acme-challenge/healthcheck || exit 1
```

Or, more robustly, configure nginx to have a dedicated health endpoint on port 80:

```nginx
# Add to the HTTP server block in nginx.conf:
location /nginx-health {
    access_log off;
    return 200 "healthy\n";
    add_header Content-Type text/plain;
}
```

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/nginx-health || exit 1
```

---

### MEDIUM-2 — `deploy.sh` `first_run()` Uses Fixed `sleep 5` Before Migrations

**Severity:** MEDIUM  
**File:** `deploy.sh`

```bash
first_run() {
    docker compose up -d --build
    sleep 5
    docker compose exec backend npx prisma migrate deploy
    ...
}
```

`docker compose up -d` returns immediately after launching (not after services are healthy). The `sleep 5` is a guess. On slow hardware or first pulls, the backend container may still be starting when `docker compose exec` runs, causing:
```
Error response from daemon: container is not running
```

Note: The backend service itself honors `depends_on: db: condition: service_healthy` for startup ordering internally, but the shell script has no awareness of this.

**Proposed Fix:**

Wait for the backend container to be running before executing migrations:
```bash
first_run() {
    docker compose up -d --build
    log "Waiting for backend to be ready..."
    timeout 120 bash -c 'until docker compose exec backend echo ok 2>/dev/null; do sleep 2; done'
    log "Running Prisma migrations..."
    docker compose exec backend npx prisma migrate deploy
    ...
}
```

---

### MEDIUM-3 — Log Volume May Prevent `appuser` from Writing Logs

**Severity:** MEDIUM  
**Files:** `backend/Dockerfile`, `docker-compose.yml`

`backend/Dockerfile`:
```dockerfile
RUN mkdir -p /app/logs
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser
```

`docker-compose.yml`:
```yaml
volumes:
  - backend_logs:/app/logs
```

**Root Cause:**

When a named Docker volume (`backend_logs`) is mounted at `/app/logs`:
- On **first creation**: Docker copies the contents and permissions of the container's `/app/logs` into the volume. Ownership is `appuser:appgroup` (UID 1001). ✓
- On **subsequent runs / re-deployments with `docker compose up -d --build`**: If the volume already exists, it is mounted as-is with its current state. If for any reason the volume was created before the UID/GID was set correctly (e.g., an earlier failed build), the directory is owned by root and `appuser` cannot write logs, causing Winston to throw `EACCES` errors.

**Proposed Fix:**

Use a mount-time init container or ensure the volume is owned correctly with an entrypoint wrapper. The simplest fix is an entrypoint script that fixes ownership before dropping privileges:

```dockerfile
# backend/Dockerfile — replace USER + CMD with:
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server.js"]
```

`docker-entrypoint.sh`:
```bash
#!/bin/sh
# Fix log directory ownership (handles pre-existing volumes)
if [ "$(stat -c %u /app/logs)" != "1001" ]; then
  chown -R 1001:1001 /app/logs
fi
exec su-exec appuser "$@"
```

(Alpine has `su-exec` available; install with `apk add --no-cache su-exec` as root before switching user.)

Alternatively, accept the risk and document that `docker volume rm backend_logs` is required after image changes that modify UID/GIDs.

---

### MEDIUM-4 — `moduleResolution: "node"` Is Incorrect for `module: "ESNext"`

**Severity:** MEDIUM (resolved by CRITICAL-1 fix)  
**File:** `backend/tsconfig.json`

`"moduleResolution": "node"` is the legacy Node.js CJS resolution algorithm. When paired with `"module": "ESNext"`, TypeScript will not enforce `.js` extensions in imports (which ESM requires), potentially producing output that doesn't resolve correctly in a native ESM environment. The fix for CRITICAL-1 (switching to `"module": "CommonJS"`) eliminates this mismatch entirely.

---

### LOW-1 — No Root-Level `.dockerignore`

**Severity:** LOW  
**Path:** `c:\Tech-V2\.dockerignore` — does not exist

Since `docker-compose.yml` builds with `context: ./backend` and `context: ./frontend`, Docker only looks for `.dockerignore` files in those subdirectories (both of which exist and are correct). A root-level `.dockerignore` is not used by any current build and is not required.

**Note:** If a future service is added with `context: .` (root context), a root `.dockerignore` will become necessary to exclude `node_modules`, logs, `.git`, and secrets.

---

### LOW-2 — Nginx Missing OCSP Stapling

**Severity:** LOW  
**File:** `frontend/nginx.conf`

The SSL configuration doesn't include OCSP stapling, which improves TLS handshake performance by pre-fetching certificate revocation status.

**Proposed Addition:**
```nginx
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

---

### LOW-3 — `init-ssl.sh` Fixed `sleep 3` After Starting Nginx

**Severity:** LOW  
**File:** `init-ssl.sh`

```bash
docker compose up -d frontend
sleep 3
```

Three seconds may be insufficient on slow hosts for Nginx to fully start before Certbot's ACME validation begins. This is a minor timing risk.

**Proposed Fix:** Poll Nginx readiness instead of sleeping:
```bash
docker compose up -d frontend
timeout 30 bash -c 'until docker compose exec frontend nginx -t 2>/dev/null; do sleep 1; done'
```

---

### LOW-4 — Frontend `nginx.conf` Cache-Control Headers Missing `Vary: Accept-Encoding`

**Severity:** LOW  
**File:** `frontend/nginx.conf`

With `gzip_vary on`, Nginx adds `Vary: Accept-Encoding`, which is correct. However, the static asset cache rule:
```nginx
location ~* \.(js|css|...)$ {
    add_header Cache-Control "public, immutable";
}
```
...overrides the Nginx `gzip_vary` header for that location block. The `add_header` directive in a `location` block replaces parent-context headers, so `Vary: Accept-Encoding` may not be emitted for cached static assets.

**Proposed Fix:**
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header Vary "Accept-Encoding";
}
```

---

## 3. Current State — File-by-File Analysis

### `docker-compose.yml`
- Services modeled correctly (db, backend, frontend, certbot)
- Healthcheck on `db` is properly used by backend `depends_on`
- `DATABASE_URL` correctly uses the `db` service hostname
- **Missing**: `CORS_ORIGIN` in backend environment (HIGH-1)
- **Missing**: `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` in backend environment (HIGH-3)
- No explicit `networks` block — relies on default compose network (acceptable)
- `certbot` restart policy `unless-stopped` is fine given the loop entrypoint

### `backend/Dockerfile`
- Multi-stage build is correctly structured
- `npm ci --omit=dev` in production stage is correct
- `npx prisma generate` in both stages is correct
- Non-root user (`appuser`) setup is good security practice
- **Missing**: `COPY prisma.config.ts ./` in both stages (CRITICAL-2)
- **Will fail at runtime**: ESM output without `"type": "module"` (CRITICAL-1)
- Font file copy in build script: `src/assets/fonts/FreestyleScript.ttf` — confirmed to exist in repo ✓
- Health check endpoint `/health` matches `server.ts` route ✓
- `CMD ["node", "dist/server.js"]` matches tsconfig `outDir: "./dist"` and `rootDir: "./src"` ✓

### `frontend/Dockerfile`
- Multi-stage build with Nginx is correct
- `ARG` declarations for Vite env vars are correctly placed (after npm install for cache efficiency)
- Vite default `outDir` is `dist`, nginx copies from `/app/dist` ✓
- Non-root nginx setup with correct ownership ✓
- **Issue**: Health check on port 80 follows redirect and fails (MEDIUM-1)

### `frontend/nginx.conf`
- HTTPS server block with TLS 1.2/1.3 is correct
- HSTS header correctly configured
- Proxy to `http://backend:3000/api/` correctly uses compose service DNS ✓
- SPA fallback `try_files $uri $uri/ /index.html` ✓
- Gzip compression correctly configured
- `http2 on` directive is separate from `listen` (correct for nginx >= 1.25.1) ✓
- **Minor**: Gzip vary header may be overridden in static asset location (LOW-4)
- **Missing**: OCSP stapling (LOW-2)

### `backend/prisma/schema.prisma`
- Modern Prisma 7 format (no `url` in datasource — Prisma 7 config approach)
- **CRITICAL**: `url` field absent from datasource; `prisma.config.ts` not in Docker image
- `generator client` uses default `prisma-client-js` ✓
- No `previewFeatures = ["driverAdapters"]` — if `@prisma/adapter-pg` is used via programmatic client instantiation, this may need to be verified against Prisma 7 GA docs

### `backend/src/server.ts`
- Express application properly structured
- CORS uses environment-configurable origin list (but missing in docker-compose env)
- `/health` endpoint exists and returns appropriate payload ✓
- Rate limiting on `/api/` and `/api/auth/login` is correct
- CSRF token middleware is present ✓
- Graceful shutdown handles `SIGTERM` ✓ (important for Docker stop)

### `backend/package.json`
- Build script: `tsc && node -e "...copyFileSync(font)"` — font file confirmed to exist ✓
- `start` script: `node dist/server.js` matches Dockerfile CMD ✓
- Prisma 7.x with `@prisma/adapter-pg` present in dependencies

### `backend/tsconfig.json`
- `"module": "ESNext"` — **CRITICAL BUG** (see CRITICAL-1)
- `"outDir": "./dist"` and `"rootDir": "./src"` match Dockerfile expectations ✓

### `backend/.dockerignore` and `frontend/.dockerignore`
- Both correctly exclude `node_modules`, `dist`, `.env`, logs, and `.git` ✓
- `backend/.dockerignore` excludes `logs/*` which is correct (logs go to volume) ✓

### `.env.deploy`
- Has all required variables except `CORS_ORIGIN` (HIGH-1)
- `SSL_EMAIL` is present ✓
- Secure defaults with `:?` required enforcement in docker-compose for `DB_PASSWORD` and `JWT_SECRET` ✓

### `deploy.sh`
- Command routing structure is clean and robust
- `check_prereqs()` validates Docker and `.env` presence ✓
- `first_run()` uses `sleep 5` — may be insufficient (MEDIUM-2)
- SSL init properly exports `SSL_EMAIL` from `.env` before calling `init-ssl.sh` ✓

### `init-ssl.sh`
- Chicken-and-egg SSL bootstrap approach is correct
- Self-signed intermediate cert approach is standard practice ✓
- `sleep 3` after starting Nginx may be insufficient (LOW-3)
- `--staging` flag for testing is provided ✓

---

## 4. Implementation Steps

Apply fixes in this order (dependency order):

### Step 1 — Fix TypeScript Module System (CRITICAL-1)
Edit `backend/tsconfig.json`:
- Change `"module": "ESNext"` → `"module": "CommonJS"`
- Keep all other fields as-is

### Step 2 — Fix Prisma Datasource URL (CRITICAL-2a)
Edit `backend/prisma/schema.prisma`, datasource block:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Step 3 — Add `prisma.config.ts` to Dockerfile (CRITICAL-2b)
Edit `backend/Dockerfile`:
- Add `COPY prisma.config.ts ./` in both builder and production stages, after `COPY prisma ./prisma/`

### Step 4 — Add CORS_ORIGIN to `docker-compose.yml` and `.env.deploy` (HIGH-1)
In `docker-compose.yml` backend environment, add:
```yaml
CORS_ORIGIN: ${CORS_ORIGIN:-https://schoolworks.ocboe.com}
```
In `.env.deploy`, add:
```
CORS_ORIGIN=https://schoolworks.ocboe.com
```

### Step 5 — Add missing backend env var (HIGH-3)
In `docker-compose.yml` backend environment, add:
```yaml
ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: ${ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID}
```

### Step 6 — Fix Nginx Health Check (MEDIUM-1)
Add `/nginx-health` location to `nginx.conf` HTTP server block and update `HEALTHCHECK` in `frontend/Dockerfile`.

### Step 7 — Fix `deploy.sh` Migration Timing (MEDIUM-2)
Replace `sleep 5` with a readiness poll in `first_run()`.

### Step 8 — Optional: Address Log Volume Permissions (MEDIUM-3)
Add entrypoint script with `su-exec` to fix log directory ownership at container start.

---

## 5. Security Considerations

| Concern | Status |
|---------|--------|
| Non-root container users | ✓ Both backend (`appuser`) and frontend (`nginx`) run as non-root |
| Secrets not in image | ✓ All secrets via environment variables, not baked into image |
| Rate limiting | ✓ 500 req/15min general; 20 req/15min on auth endpoints |
| HSTS | ✓ `max-age=31536000; includeSubDomains` |
| TLS 1.2/1.3 only | ✓ |
| CSRF protection | ✓ Cookie + header double-submit |
| Helmet.js | ✓ Adds `X-Frame-Options`, `X-Content-Type-Options`, CSP, etc. |
| `DB_PASSWORD` required enforcement | ✓ `${DB_PASSWORD:?DB_PASSWORD is required}` in compose |
| `node_modules` excluded from image | ✓ `.dockerignore` files are present and correct |
| `.env` excluded from images | ✓ Both `.dockerignore` files exclude `.env` and `.env.local` |
| CORS restricted to known origins | Needs fix (HIGH-1) — currently defaults to `localhost:5173` in production |
| OCSP stapling | Missing (LOW-2) |

---

## 6. Summary Table

| ID | Severity | Issue | Fix Location |
|----|----------|-------|-------------|
| CRITICAL-1 | CRITICAL | `"module": "ESNext"` + no `"type": "module"` = node can't run compiled output | `backend/tsconfig.json` |
| CRITICAL-2 | CRITICAL | `schema.prisma` has no `url`; `prisma.config.ts` not in Docker image | `schema.prisma` + `Dockerfile` |
| HIGH-1 | HIGH | `CORS_ORIGIN` not set → production CORS failures | `docker-compose.yml`, `.env.deploy` |
| HIGH-2 | HIGH | `prisma.config.ts` absent from Docker CLI context | `backend/Dockerfile` (same fix as C-2) |
| HIGH-3 | HIGH | `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` missing from backend env | `docker-compose.yml` |
| MEDIUM-1 | MEDIUM | Nginx healthcheck follows 301 → HTTPS → cert failure | `frontend/Dockerfile`, `nginx.conf` |
| MEDIUM-2 | MEDIUM | `sleep 5` in `deploy.sh` may not be enough before migrations | `deploy.sh` |
| MEDIUM-3 | MEDIUM | Log volume ownership issue on re-deploy | `backend/Dockerfile` (entrypoint) |
| MEDIUM-4 | MEDIUM | `moduleResolution: "node"` incorrect for ESM (resolved by C-1 fix) | `backend/tsconfig.json` |
| LOW-1 | LOW | No root `.dockerignore` (not currently needed) | Add if root context ever used |
| LOW-2 | LOW | OCSP stapling not configured | `frontend/nginx.conf` |
| LOW-3 | LOW | `sleep 3` in `init-ssl.sh` may be too short | `init-ssl.sh` |
| LOW-4 | LOW | Gzip `Vary` header overridden by static asset `add_header` | `frontend/nginx.conf` |
