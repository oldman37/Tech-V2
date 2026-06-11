# PR-6 Spec — Remove Dead VITE_ENTRA_* Build-Time Variables

**Date:** 2026-06-11  
**Finding:** PR-6 — Entra Group IDs Baked Into Frontend Bundle (Informational)  
**Severity:** 🔵 Low / Info

---

## Current State Analysis

The ARCH-2 fix (first-pass audit) already moved all authorization logic to the backend.
The backend `/api/auth/me` response includes pre-computed boolean flags
(`canAccessDeviceManagement`, `canSeeAllLocations`, `isPrincipalOrVP`, `permLevels`, `roles`).
`authStore.ts` reads these flags directly; its comment explicitly says
"Group IDs never leave the backend; no VITE_ENTRA_* group env vars needed."

Despite this, the following dead configuration remains:

### Dead ARG declarations — `frontend/Dockerfile` (lines 29–38)
```
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_TENANT_ID
ARG VITE_ENTRA_FINANCE_DIRECTOR_GROUP_ID
ARG VITE_ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID
ARG VITE_ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID
ARG VITE_ENTRA_PRINCIPALS_GROUP_ID
ARG VITE_ENTRA_VICE_PRINCIPALS_GROUP_ID
ARG VITE_ENTRA_ADMIN_GROUP_ID
ARG VITE_ENTRA_TECH_ASSISTANTS_GROUP_ID
ARG VITE_ENTRA_OCBOE_LIBRARIANS_GROUP_ID
```
None of these are referenced by `import.meta.env.*` anywhere in `frontend/src/`.
`VITE_API_URL` is used (`frontend/src/services/api.ts` line 4) and must be kept.

### Dead build args — `docker-compose.dev.yml` (lines 84–91), `docker-compose.yml` (lines 89–96)
Both files pass all 8 group IDs + CLIENT_ID + TENANT_ID as build args. These are
unused in the bundle; they also require `ENTRA_*` env vars to be populated in `.env`
at frontend build time even when their values are irrelevant.

### Dead type declarations — `frontend/src/vite-env.d.ts` (lines 5–6)
```ts
readonly VITE_ENTRA_CLIENT_ID: string;
readonly VITE_ENTRA_TENANT_ID: string;
```
No frontend source file uses `import.meta.env.VITE_ENTRA_CLIENT_ID` or
`VITE_ENTRA_TENANT_ID`. The MSAL SDK runs entirely on the backend (Node.js);
the frontend auth flow is backend-redirected only.

### Dead entries — `frontend/.env.example` (lines 3–4)
```
VITE_ENTRA_CLIENT_ID=your-client-id
VITE_ENTRA_TENANT_ID=your-tenant-id
```

---

## Problem Definition

The dead `ARG` instructions in the Dockerfile make the group IDs available as
environment variables to the `npm run build` RUN step. Although Vite tree-shakes
unreferenced `import.meta.env.*` values, having them declared as build args
creates unnecessary coupling:
- They pollute Docker layer caches — any change to a group ID forces a full frontend rebuild.
- They create a false dependency on backend secrets at frontend image build time.
- The type declarations in `vite-env.d.ts` mislead future maintainers into thinking
  these values are in use.
- `.env.example` entries for unused vars increase deployment confusion.

---

## Proposed Solution

Remove all dead `VITE_ENTRA_*` configuration from infrastructure and type files.
No business logic changes required — the backend-computed flags in `/api/auth/me`
already handle everything the group IDs were previously used for.

**What stays:** `VITE_API_URL` (actively used in `api.ts`).

---

## Implementation Steps

1. **`frontend/Dockerfile`** — Remove the 10 dead `ARG VITE_ENTRA_*` lines (keep `ARG VITE_API_URL=/api`).
2. **`docker-compose.dev.yml`** — Remove the 8 group ID build args and `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_TENANT_ID`; keep only `VITE_API_URL: /api`.
3. **`docker-compose.yml`** — Same as above.
4. **`frontend/src/vite-env.d.ts`** — Remove `VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_TENANT_ID` declarations.
5. **`frontend/.env.example`** — Remove the two Entra lines.

---

## Dependencies

No new dependencies. No Prisma schema changes.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Some undiscovered code references `import.meta.env.VITE_ENTRA_*` | Low | Confirmed via grep: zero matches in `frontend/src/**` |
| `.env` file on host still has old vars | None | Old vars in `.env` are simply ignored by Docker; no cleanup required |
| Frontend build breaks after removal | Low | `VITE_API_URL` is the only var used; it is preserved |

---

## Verification

- `docker compose -f docker-compose.dev.yml build frontend` completes with exit 0
- No `VITE_ENTRA_*` references remain in `frontend/Dockerfile`, docker-compose files, `vite-env.d.ts`, or `.env.example`
- `preflight.ps1` passes (both backend and frontend builds + tests)
