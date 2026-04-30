# User-to-Room Assignment — Code Review

**Date:** 2026-04-30  
**Reviewer:** Subagent (Phase 3 QA)  
**Feature:** User-to-Room Assignment  
**Spec:** `docs/SubAgent/user_room_assignment_spec.md`

---

## 1. Overview of Findings

The implementation is structurally sound and follows most project conventions. The backend is clean, compiles without errors, and the schema is valid. However, the **frontend has 7 TypeScript build errors** — making the frontend build currently broken. There is also one missing endpoint (`PUT /api/users/:userId/primary-room`) required by the spec.

**Overall Assessment: NEEDS_REFINEMENT**

---

## 2. Build / Validation Results

### Backend TypeScript

```
cd C:\Tech-V2\backend ; npx tsc --noEmit
```
**Result: ✅ PASS — No errors**

### Prisma Schema

```
cd C:\Tech-V2\backend ; npx prisma validate
```
**Result: ✅ PASS — The schema at prisma\schema.prisma is valid 🚀**

### Frontend TypeScript

```
cd C:\Tech-V2\frontend ; npx tsc --noEmit
```
**Result: ❌ FAILED — 7 errors in 2 files**

#### Error 1–3: Wrong relative import paths in `useRoomAssignmentAccess.ts`

```
src/hooks/useRoomAssignmentAccess.ts(2,30): error TS2307:
  Cannot find module '../../store/authStore'
src/hooks/useRoomAssignmentAccess.ts(3,29): error TS2307:
  Cannot find module '../../services/location.service'
src/hooks/useRoomAssignmentAccess.ts(4,27): error TS2307:
  Cannot find module '../../lib/queryKeys'
```

**Root cause:** The file lives in `src/hooks/` but uses `../../` (two levels up), which resolves to `frontend/` rather than `frontend/src/`. The correct relative path is `../` (one level up) — or, per project convention, the `@/` alias.

#### Error 4–5: Cascade implicit `any` errors in `useRoomAssignmentAccess.ts`

```
src/hooks/useRoomAssignmentAccess.ts(25,14): error TS7006: Parameter 'sl' implicitly has an 'any' type.
src/hooks/useRoomAssignmentAccess.ts(26,11): error TS7006: Parameter 'sl' implicitly has an 'any' type.
```

**Root cause:** Because `location.service` can't be resolved, `getUserSupervisedLocations` returns `any[]`, making the `sl` parameter implicitly typed. Fixing the import paths resolves these cascade errors.

#### Error 6–7: MUI Grid v2 API incompatibility in `RoomAssignmentsPage.tsx`

```
src/pages/RoomAssignments/RoomAssignmentsPage.tsx(105,14): error TS2769:
  Property 'item' does not exist on type ...
src/pages/RoomAssignments/RoomAssignmentsPage.tsx(145,16): error TS2769:
  Property 'item' does not exist on type ...
```

**Root cause:** `RoomAssignmentsPage.tsx` uses MUI v4/v5-style Grid props (`<Grid item xs={12} sm={6} md={4}>`). The project uses **MUI v7** (Grid v2), where the correct API is `<Grid size={{ xs: 12, sm: 6, md: 4 }}>`. This is confirmed by inspecting `src/pages/admin/AdminSettings.tsx` which uses `<Grid size={{ xs: 12, sm: 4 }}>` throughout.

Additional warning: `CircularProgress` at line 15 of `RoomAssignmentsPage.tsx` is imported but never used (replaced by `Skeleton`). While TS code does not fail for unused vars in some configs, it still generates a `TS6133` warning.

---

## 3. Security Compliance Checklist

| Check | Status | Notes |
|-------|--------|-------|
| All routes have `authenticateToken` middleware | ✅ Pass | `router.use(authenticate)` applied at top of routes file |
| All mutation routes have `requireAdmin` or `requireAdminOrPrimarySupervisor` | ✅ Pass | Inline `assertAdminOrPrimarySupervisor()` + middleware for GET location route |
| All inputs validated with Zod schemas | ✅ Pass | All params/body/query validated; `AssignUsersToRoomSchema`, `LocationRoomAssignmentsQuerySchema`, param schemas |
| No tokens in localStorage | ✅ Pass | Auth uses `httpOnly` cookies; `@/services/api` uses axios with `withCredentials` |
| CSRF token sent with all POST/PUT/DELETE frontend requests | ✅ Pass | `validateCsrfToken` on POST and DELETE routes; axios interceptor injects header automatically |
| No `console.log` statements | ✅ Pass | Structured logger (`createLogger`) used throughout |
| No sensitive data in logs | ✅ Pass | Only IDs and non-PII operation metadata logged |
| Custom error classes used | ✅ Pass | `NotFoundError`, `ValidationError`, `AuthorizationError` from `../utils/errors` |
| Error messages sanitized for client | ✅ Pass | `handleControllerError` normalizes all errors |
| No unwarranted `any` types | ✅ Pass | `any` only in `TypedAuthRequest` generic defaults (Express pattern, justified) |
| Prisma ORM only (no raw SQL) | ✅ Pass | All DB access via Prisma client |
| Rate limiting on new endpoints | ⚠️ Partial | Global 500 req/15 min limit applies; no dedicated stricter limit on `POST /assign` |

---

## 4. Findings

### CRITICAL

#### C-1: Frontend build broken — wrong import paths in `useRoomAssignmentAccess.ts`
**File:** `frontend/src/hooks/useRoomAssignmentAccess.ts`, lines 2–4  
**Impact:** Frontend TypeScript build fails; cascades to 2 additional errors at lines 25–26.

The imports use `../../` (two directory levels up) but the file is located in `src/hooks/` (one level below `src/`), so the paths resolve to `frontend/store/authStore` etc., which do not exist. All other hooks in this codebase use the `@/` alias.

```typescript
// Current (BROKEN):
import { useAuthStore } from '../../store/authStore';
import locationService from '../../services/location.service';
import { queryKeys } from '../../lib/queryKeys';

// Fix (use @/ alias, consistent with the rest of the codebase):
import { useAuthStore } from '@/store/authStore';
import locationService from '@/services/location.service';
import { queryKeys } from '@/lib/queryKeys';
```

---

#### C-2: Frontend build broken — MUI Grid v2 API used incorrectly in `RoomAssignmentsPage.tsx`
**File:** `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx`, lines 105 and 145  
**Impact:** 2 TypeScript errors; component will not compile.

Project uses MUI v7 (`@mui/material ^7.3.8`). Grid v2 (the default in MUI v6+/v7) removed the `item`, `xs`, `sm`, `md` props in favour of a unified `size` prop.

```tsx
// Current (BROKEN — MUI v4/v5 Grid v1 API):
<Grid item xs={12} sm={6} md={4} key={i}>
  ...
</Grid>

// Fix (MUI v7 Grid v2 API — matches AdminSettings.tsx and other pages):
<Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
  ...
</Grid>
```
Both occurrences (the skeleton loop at line 105 and the room cards loop at line 145) need to be updated.

---

#### C-3: Missing endpoint — `PUT /api/users/:userId/primary-room`
**File:** `backend/src/controllers/userRoomAssignment.controller.ts`, `backend/src/routes/userRoomAssignment.routes.ts`, `backend/src/services/userRoomAssignment.service.ts`  
**Impact:** Spec section 5.2 specifies this as a required endpoint. No handler, no route, no service method, and no `SetPrimaryRoomSchema` validator exist.

The spec defines:
```
PUT /api/users/:userId/primary-room
Auth: authenticate → requireAdmin → validateCsrfToken → validateRequest(params) → validateRequest(body)
Body: { roomId: string (UUID) | null }   // null = clear primary room
Response: { userId, primaryRoomId, primaryRoom: { id, name, locationName } }
```

The `User.primaryRoomId` field already exists in the schema and database. The frontend service (`userRoomAssignmentService`) also does not expose a `setPrimaryRoom` method, and there is no UI or mutation hook for this operation.

---

### RECOMMENDED

#### R-1: Duplicate authorization logic — `assertAdminOrPrimarySupervisor` function duplicates middleware
**File:** `backend/src/controllers/userRoomAssignment.controller.ts`, lines 20–52; `backend/src/middleware/requireAdminOrPrimarySupervisor.ts`  
**Impact:** Maintenance burden. As written, the admin group ID check and DB query must be kept in sync across two places.

The controller defines a private `assertAdminOrPrimarySupervisor()` helper that is nearly identical to the `requireAdminOrPrimarySupervisor` middleware. Inline checks are used for the room-scoped endpoints (POST, DELETE, GET room) because the `locationId` must be resolved from the room record first. This is a valid pattern but creates dual maintenance points.

**Recommendation:** Document why the inline function is needed (room-first scope resolution) with a comment referencing the middleware, so future maintainers understand the intentional choice rather than treating it as duplication.

---

#### R-2: Unused import — `CircularProgress` in `RoomAssignmentsPage.tsx`
**File:** `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx`, line 15  
**Impact:** Minor — TS6133 warning; dead code in the import declaration.

```typescript
// Remove this line:
CircularProgress,
```
The loading state uses `<Skeleton>` instead.

---

#### R-3: Double DB round-trip in `unassignUserFromRoom`
**File:** `backend/src/services/userRoomAssignment.service.ts`, lines ~208–223  
**Impact:** Minor performance — one unnecessary network round-trip to the DB on every successful unassign.

```typescript
// Current: findUnique + delete (2 queries)
const assignment = await this.prisma.userRoomAssignment.findUnique({ where: ... });
if (!assignment) throw new NotFoundError('UserRoomAssignment');
await this.prisma.userRoomAssignment.delete({ where: ... });

// Better: single delete, catch Prisma P2025 for not-found
try {
  await this.prisma.userRoomAssignment.delete({
    where: { userId_roomId: { userId, roomId } },
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw new NotFoundError('UserRoomAssignment');
  }
  throw error;
}
```

---

#### R-4: `useRoomAssignmentAccess` non-null assertion without guard
**File:** `frontend/src/hooks/useRoomAssignmentAccess.ts`, line 21  
**Impact:** Edge case — if `user` is null when the query fires, `user!.id` will throw at runtime.

```typescript
// Current:
queryFn: () => locationService.getUserSupervisedLocations(user!.id),
// The query is `enabled: !!user && !isAdmin`, so user is not null when queryFn runs.
// This is technically correct but relies on the enabled guard. A redundant guard
// inside queryFn improves clarity:
queryFn: () => {
  if (!user) throw new Error('User not available');
  return locationService.getUserSupervisedLocations(user.id);
},
```

---

#### R-5: Missing rate limit for `POST /api/room-assignments/room/:roomId/assign`
**File:** `backend/src/server.ts` / `backend/src/routes/userRoomAssignment.routes.ts`  
**Impact:** The global 500 req/15 min limit is the only protection. A bulk-assignment endpoint (`userIds` array, up to 100 users) is slightly higher risk and could benefit from a tighter per-IP limit (e.g., 30 req/15 min) consistent with how `authLimiter` is applied to sensitive routes.

---

### OPTIONAL

#### O-1: Route path naming deviates from spec
**File:** `backend/src/routes/userRoomAssignment.routes.ts`  
The spec defines paths like:
- `GET /api/locations/:locationId/room-assignments`  
- `GET /api/rooms/:roomId/users`
- `POST /api/rooms/:roomId/users`
- `DELETE /api/rooms/:roomId/users/:userId`

The implementation uses a `/api/room-assignments/...` prefix with different path structure:
- `GET /api/room-assignments/location/:locationId`
- `GET /api/room-assignments/room/:roomId`
- `POST /api/room-assignments/room/:roomId/assign`
- `DELETE /api/room-assignments/room/:roomId/user/:userId`

The implemented paths are internally consistent and don't conflict with existing routes. The deviation is acceptable, but deviates from REST resource-noun nesting described in the spec.

---

#### O-2: `useLocationRoomAssignments` — query params excluded from query key
**File:** `frontend/src/hooks/queries/useRoomAssignments.ts`, line 10–17  
**Impact:** If the parent component ever changes `params.search` or `params.includeInactive`, the query will not re-fetch because those values are not part of the query key.

```typescript
// Current key: queryKeys.roomAssignments.byLocation(locationId)
// Fix: Include params in key:
queryKey: queryKeys.roomAssignments.byLocation(locationId, params),
```
(This requires updating the `queryKeys.roomAssignments.byLocation` factory accordingly.)

Note: `RoomAssignmentsPage.tsx` does not currently pass `params` to this hook, so this is a non-issue in the current UI — but it's a latent bug for future enhancements (e.g., the search field in `RoomAssignmentDialog` uses `userService.getUsers` directly, not this query).

---

#### O-3: `SetPrimaryRoomSchema` missing from validators file
**File:** `backend/src/validators/userRoomAssignment.validators.ts`  
The spec defines `SetPrimaryRoomSchema` as:
```typescript
const SetPrimaryRoomSchema = z.object({
  roomId: z.string().uuid().nullable(),
});
```
This is not present in the validators file (because the endpoint itself is missing — see C-3).

---

## 5. Specification Compliance Analysis

| Requirement | Status | Notes |
|-------------|--------|-------|
| `UserRoomAssignment` Prisma model | ✅ Implemented | Matches spec exactly |
| `User.roomAssignments` + `roomAssignmentsMade` relations | ✅ Implemented | Both relations present |
| `Room.userAssignments` relation | ✅ Implemented | Present in schema |
| `GET /api/.../room-assignments` (list by location) | ✅ Implemented | Path differs from spec but functional |
| `GET /api/.../room/:roomId` (room users) | ✅ Implemented | Works with inline scope check |
| `POST /api/.../room/:roomId/assign` | ✅ Implemented | Bulk assign with skipDuplicates |
| `DELETE /api/.../room/:roomId/user/:userId` | ✅ Implemented | locationId in query param for scope |
| `GET /api/.../user/:userId/room-assignments` | ✅ Implemented | Admin only |
| `PUT /api/users/:userId/primary-room` | ❌ **Missing** | No handler, route, service, or validator |
| Zod validators for all schemas | ⚠️ Partial | `SetPrimaryRoomSchema` missing |
| Frontend `/room-assignments` route | ✅ Implemented | Correctly guarded |
| `ProtectedRoute requireRoomAssignment` | ✅ Implemented | Includes loading guard to prevent flicker |
| `useRoomAssignmentAccess` hook | ✅ Implemented | Correct logic; broken by wrong import paths |
| Nav item in `AppLayout` | ✅ Implemented | Correctly gated by `canAccessRoomAssignments` |
| Primary supervisor scope enforcement | ✅ Implemented | `assertAdminOrPrimarySupervisor` inline check after resolving room's locationId |
| Admin bypasses scope | ✅ Implemented | Checks `ADMIN` role + Entra group ID |
| `isActive` user filter on assignments | ✅ Implemented | All assignment includes filter `user.isActive: true` |
| Search filter on location assignments | ✅ Implemented | Cascaded into Prisma `where` on `user` relation |

---

## 6. Summary Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 82% | B |
| Security | 92% | A |
| Best Practices | 80% | B |
| Functionality | 80% | B |
| Code Quality | 82% | B |
| Performance | 95% | A |
| Consistency | 83% | B+ |
| Build Success | 0% (backend ✅ / frontend ❌) | F |

**Overall Grade: B- (74%)**

> **Note:** The overall grade is suppressed by the frontend build failure (CRITICAL). With the 3 critical fixes applied, the estimated grade rises to **B+ (87%)**.

---

## 7. Recommended Fix Priority

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| P0 | C-1: Fix import paths in `useRoomAssignmentAccess.ts` | `frontend/src/hooks/useRoomAssignmentAccess.ts` | 5 min |
| P0 | C-2: Fix MUI Grid v2 syntax in `RoomAssignmentsPage.tsx` | `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` | 5 min |
| P1 | C-3: Implement `PUT /api/users/:userId/primary-room` | Backend + frontend | 2–3 hr |
| P2 | R-2: Remove unused `CircularProgress` import | `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` | 1 min |
| P2 | R-1: Add comment explaining inline auth vs. middleware | `backend/src/controllers/userRoomAssignment.controller.ts` | 5 min |
| P3 | R-3: Single-query unassign (P2025 catch) | `backend/src/services/userRoomAssignment.service.ts` | 15 min |
| P3 | R-4: Guard `user!.id` in queryFn | `frontend/src/hooks/useRoomAssignmentAccess.ts` | 2 min |
| P4 | R-5: Add specific rate limit to POST assign route | `backend/src/routes/userRoomAssignment.routes.ts` | 10 min |

---

*Review document generated by Subagent Phase 3 QA. See spec at `docs/SubAgent/user_room_assignment_spec.md`.*
