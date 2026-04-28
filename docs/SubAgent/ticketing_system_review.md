# Unified Ticketing System — Quality Review

**Project:** Tech-V2 — Unified Ticket System  
**Reviewer:** Review Subagent  
**Date:** April 21, 2026  
**Build Status:** ✅ BOTH BUILDS PASS (backend + frontend)

---

## 1. Executive Summary

The unified ticketing system implementation is largely solid. The backend architecture is clean, follows established project patterns faithfully, and all security fundamentals are correctly in place. Both TypeScript builds compile without errors.

However, **three bugs require fixes before production deployment**:

1. A **Prisma query merge bug** (`OR` overwrite) causes the search filter to be silently dropped for level-3 users — tickets at their locations are returned regardless of search term.
2. A **form field mapping bug** in `NewTicketPage` causes Technology tickets that have any Equipment Details filled in to be rejected by the backend validator (mfg/model/serial fields must not be sent for TECHNOLOGY tickets, but the form state named them as TECHNOLOGY-specific fields and includes them in the DTO).
3. A **race condition** in ticket number generation (`count()` + sequential insert) can yield duplicate `ticketNumber` values under concurrent load, violating the `@unique` constraint.

Additionally, the spec-required **asset tag selector** for Technology tickets (linking `equipmentId` to inventory) is not implemented — the Technology form shows free-text fields instead, which the backend actively rejects.

---

## 2. Security Compliance Findings

| Check | Result | Notes |
|-------|--------|-------|
| All backend routes have `authenticateToken` (`authenticate`) | ✅ PASS | `router.use(authenticate)` at top of tickets.routes.ts |
| CSRF protection on state-changing routes | ✅ PASS | `router.use(validateCsrfToken)`; middleware correctly skips GET/HEAD/OPTIONS |
| CSRF token injected by frontend on mutations | ✅ PASS | `api.ts` interceptor injects `x-xsrf-token` header for POST/PUT/PATCH/DELETE |
| Permission checks on all routes | ✅ PASS | All routes have `requireModule('TICKETS', N)` at correct levels |
| All inputs validated with Zod schemas | ⚠️ PARTIAL | All mutation/query params validated; **`GET /tickets/stats/summary` reads query params without Zod validation** (passes raw strings to Prisma) |
| No `console.log` statements | ✅ PASS | All logging uses structured `logger` from `lib/logger` |
| No sensitive data in logs | ✅ PASS | Logs emit IDs, department, status — no PII or secrets |
| Custom error classes used | ✅ PASS | `NotFoundError`, `ValidationError`, `AuthorizationError` from `utils/errors.ts` |
| Error messages sanitized | ✅ PASS | `handleControllerError` normalizes all errors |
| No `any` types without justification | ⚠️ PARTIAL | 9 `as any` casts and 3 `: any` declarations; see Code Quality section |
| Prisma ORM only (no raw SQL) | ✅ PASS | All queries use Prisma client exclusively |

### Stats Endpoint: Unvalidated Query Params (RECOMMENDED)

`GET /tickets/stats/summary` in the controller reads query params as:
```ts
const { officeLocationId, department, fiscalYear } = req.query as Record<string, string | undefined>;
```
These are passed directly to `service.getTicketStats()` where they construct a Prisma `where` clause without enum validation. An invalid `department` value (e.g., `"INVALID"`) would cause a Prisma runtime error rather than a clean 400 validation response. **Risk level is Low** (no injection risk via Prisma, but produces uncontrolled 500 responses). Fix: add a lightweight Zod schema for this endpoint's query params.

---

## 3. Code Quality Findings

### 3.1 `as any` Casts in tickets.service.ts

Nine `as any` casts are used to bridge the gap between Zod-inferred string literal types and Prisma's generated enum types (e.g., `data.department as any`, `data.status as any`). This pattern also appears in `purchaseOrder.service.ts` and is an established pattern in this codebase. The casts are safe because Zod validates the enum values upstream. They should be replaced with proper Prisma enum imports (`TicketDepartment`, `TicketStatus`, `TicketPriority` from `@prisma/client`) for type safety.

Three `any`-typed where-builder variables (`baseWhere: any`, `scopeWhere: any`, `where: any`) in `getTickets` are acceptable for dynamic filter construction but introduce one critical bug (see §4.1).

### 3.2 Duplicate Type Definitions

The project has two separate ticket type files:
- `c:\Tech-V2\shared\src\ticket.types.ts` — shared types
- `c:\Tech-V2\frontend\src\types\ticket.types.ts` — frontend types (separate file, not importing from shared)

Both define `TicketDepartment`, `TicketStatus`, `TicketPriority`, and related interfaces. This duplication creates a drift risk. The frontend should import from `@tech-v2/shared` or the shared types should be the single source of truth. Currently these are in sync, but future changes to one file will not automatically propagate to the other.

### 3.3 `NewTicketPage` Form State Design Confusion

The `FormState` interface defines:
```ts
// TECHNOLOGY
equipmentMfg: string;
equipmentModel: string;
equipmentSerial: string;
// MAINTENANCE
mfg: string;
model: string;
serial: string;
```

The Technology section renders `form.equipmentMfg/Model/Serial` and includes them in the DTO for TECHNOLOGY tickets. However, the backend's `CreateTicketSchema.superRefine` rejects any TECHNOLOGY ticket where `equipmentMfg`, `equipmentModel`, or `equipmentSerial` are non-null. **If a user fills in the Technology "Equipment Details" fields, the ticket creation will fail with a backend validation error.** (See §4.2 for CRITICAL classification.)

Additionally, the spec requires Technology tickets to have an **asset tag selector** from inventory (linking `equipmentId` to a specific piece of equipment). The current form shows free-text fields for TECHNOLOGY instead of the specified equipment picker.

### 3.4 React Query Patterns

- `useTicketList`: Correctly uses `keepPreviousData` for pagination — prevents flash-of-empty between page changes. ✅
- `useTicket`: Correctly uses `enabled: !!id` to skip queries for undefined IDs. ✅
- `useTicketStats`: Uses `staleTime: 60_000` for appropriate caching of aggregate data. ✅
- Cache invalidation: Mutations correctly invalidate `tickets.all` (broad) after create/delete, and both list + detail after status/assign updates. ✅

### 3.5 MUI Component Usage

- `TicketStatusChip` and `TicketPriorityChip`: Clean, typed, consistent. ✅
- `DepartmentSelector`: Well-designed card-based selector with proper visual feedback. ✅
- `TicketListPage`: Standard MUI Table with `TablePagination`. ✅
- `TicketDetailPage`: Two-column layout with dialogs for status/assign. Clean pattern. ✅
- `NewTicketPage`: Correct use of controlled `Select`, `TextField`, `FormControl`. ✅

---

## 4. Functionality Findings

### 4.1 ⚠️ CRITICAL — `OR` Filter Overwrite in `getTickets` Scope Merge

In `tickets.service.ts > getTickets()`, the search filter and the permission-scope filter are both built as an `OR` array and then merged with object spread:

```ts
// Search adds baseWhere.OR
if (query.search) {
  baseWhere.OR = [
    { title: { contains: query.search, mode: 'insensitive' } },
    { ticketNumber: ... },
    { description: ... },
  ];
}

// Level-3 scope adds scopeWhere.OR
if (permLevel === 3) {
  scopeWhere = {
    OR: [
      { reportedById: userId },
      { officeLocationId: { in: locationIds } },
    ],
  };
}

// DESTRUCTIVE MERGE — scopeWhere.OR overwrites baseWhere.OR
const where = { ...baseWhere, ...scopeWhere };
```

**Result:** For a level-3 staff user performing a search, the `search` OR is silently discarded. All tickets at their locations are returned rather than the filtered subset. **Search is completely non-functional for level-3 users.**

**Fix:** Use Prisma's `$and` / `AND` operator to compose both conditions safely:
```ts
const conditions: object[] = [];
if (Object.keys(baseWhere).length) conditions.push(baseWhere);
if (Object.keys(scopeWhere).length) conditions.push(scopeWhere);
const where = conditions.length > 1 ? { AND: conditions } : (conditions[0] ?? {});
```

### 4.2 ⚠️ CRITICAL — Technology Form Sends Invalid Fields (Backend Rejects Them)

`NewTicketPage` renders a "Equipment Details" panel for TECHNOLOGY tickets with three free-text fields (`equipmentMfg`, `equipmentModel`, `equipmentSerial`). In `handleSubmit`, these are included in the DTO for TECHNOLOGY tickets:

```ts
...(form.department === 'TECHNOLOGY' && {
  equipmentMfg: form.equipmentMfg || null,
  equipmentModel: form.equipmentModel || null,
  equipmentSerial: form.equipmentSerial || null,
}),
```

The backend validator explicitly rejects this combination:
```ts
if (data.department === 'TECHNOLOGY' && (data.equipmentMfg || data.equipmentModel || data.equipmentSerial)) {
  ctx.addIssue({ message: 'Maintenance equipment fields are not valid for Technology tickets' });
}
```

**Result:** Any user who fills in the Technology equipment detail fields will receive a backend validation error and the ticket will not be created — with no clear error message to explain the constraint.

The Technology "Equipment Details" section should be removed. Per the spec, Technology tickets support linking to inventory via `equipmentId` (asset tag selector). The MAINTENANCE department section (using `form.mfg/model/serial`) correctly maps to backend fields and is unaffected.

### 4.3 ⚠️ CRITICAL — Race Condition in Ticket Number Generation

`generateTicketNumber()` derives the sequence number from `prisma.ticket.count()`, then constructs a number and returns it. If two ticket creations execute concurrently before either is committed, both can receive the same count:

```ts
// Both requests see count = 42
const count = await this.prisma.ticket.count({ where: { department, fiscalYear } });
const seq = String(count + 1).padStart(4, '0'); // both return "0043"
return `TECH-2026-0043`;   // constraint violation on second insert
```

The outer `$transaction` doesn't prevent this because `count()` inside a transaction still reads the committed state before either insert completes.

**Impact:** Under concurrent load, one of the two requests will fail with a Prisma `P2002` unique constraint violation and return a 500 error.

**Fix:** Use a database-level sequence (PostgreSQL `SEQUENCE`) or add an advisory lock / retry loop.

### 4.4 ⚠️ RECOMMENDED — Missing Asset Tag Selector for Technology Tickets

The spec defines Technology tickets as having a "DataTable of all active, non-disposed equipment registered in the room" with a radio/autocomplete selector that populates `equipmentId`. `NewTicketPage` does not implement this. Instead it shows free-text manufacturer/model/serial fields (which are rejected by the backend).

This is a missed spec requirement. The technology equipment link (`equipmentId`) cannot be set through the UI.

### 4.5 Status State Machine

The `VALID_TRANSITIONS` map is correctly defined and enforced:

```
OPEN → IN_PROGRESS (L3+), CLOSED (L4+)
IN_PROGRESS → ON_HOLD (L3+), RESOLVED (L3+), CLOSED (L4+)
ON_HOLD → IN_PROGRESS (L3+), CLOSED (L4+)
RESOLVED → CLOSED (L3+), IN_PROGRESS (L3+)
CLOSED → (terminal, no transitions)
```

This matches ITIL v4 incident lifecycle principles. Timestamps (`resolvedAt`, `closedAt`) are correctly set on state transitions. Re-opening from RESOLVED clears `resolvedAt`. ✅

### 4.6 Department/Category Cross-Validation

Backend `CreateTicketSchema.superRefine` correctly cross-validates:
- TECHNOLOGY tickets cannot have `equipmentMfg/Model/Serial`
- MAINTENANCE tickets cannot have `equipmentId`

The `category` field is stored as a plain `String?` (intentionally flexible). Frontend correctly presents department-specific category lists from `TECH_CATEGORIES`/`MAINT_CATEGORIES`. An API client could submit out-of-range category strings, but this is an acceptable trade-off for flexibility.

### 4.7 Route Registration

`server.ts` correctly registers:
```ts
import ticketRoutes from './routes/tickets.routes';
app.use('/api/tickets', ticketRoutes);
```
Route ordering within `tickets.routes.ts` is correct: `/stats/summary` is registered before `/:id` to prevent path conflict. ✅

---

## 5. Build Results

### Backend TypeScript

```
cd c:\Tech-V2\backend
npx tsc --noEmit
```

**Result: ✅ SUCCESS — No errors**

### Frontend TypeScript

```
cd c:\Tech-V2\frontend
npx tsc --noEmit
```

**Result: ✅ SUCCESS — No errors**

---

## 6. Consistency with Existing Codebase

| Pattern | Adherence | Notes |
|---------|-----------|-------|
| Service class with `PrismaClient` constructor injection | ✅ | Matches PurchaseOrderService exactly |
| Singleton service in controller (`const service = new TicketService(prisma)`) | ✅ | Matches all other controllers |
| try/catch + `handleControllerError` in every handler | ✅ | Consistent |
| `AuthRequest` type for authenticated handlers | ✅ | Consistent |
| `router.use(authenticate)` at top of route file | ✅ | Consistent |
| `validateRequest` middleware for Zod validation | ✅ | Consistent |
| `requireModule('MODULE', level)` for permission gates | ✅ | Consistent |
| `logger.info()` for business events | ✅ | Consistent |
| Query hooks with `placeholderData: keepPreviousData` | ✅ | Matches `usePurchaseOrders` |
| Object-literal service pattern on frontend | ✅ | Matches `purchaseOrder.service.ts` |
| `queryKeys.xxx.all`, `.list()`, `.detail()` structure | ✅ | Added to existing `queryKeys.ts` |
| `ProtectedRoute` + `AppLayout` wrapping in `App.tsx` | ✅ | All three ticket routes wrapped |

---

## 7. Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 68% | C+ |
| Best Practices | 82% | B |
| Functionality | 72% | C+ |
| Code Quality | 78% | C+ |
| Security | 88% | B+ |
| Performance | 85% | B |
| Consistency | 93% | A |
| Build Success | 100% | A |
| **Overall** | **83%** | **B** |

> **Specification Compliance** score reduced significantly by: (1) missing asset tag selector, (2) Technology form fields violating the spec's department-specific field requirement.

---

## 8. Prioritized Findings

### CRITICAL — Must Fix Before Production

**C1. `OR` filter overwrite destroys search for level-3 users**
- File: `c:\Tech-V2\backend\src\services\tickets.service.ts` — `getTickets()`, line ~233
- Problem: `{ ...baseWhere, ...scopeWhere }` overwrites `baseWhere.OR` (search) with `scopeWhere.OR` (location scope) when permLevel === 3
- Fix: Use `AND: [baseWhere, scopeWhere]` via Prisma's `AND` compound clause

**C2. Technology form sends `equipmentMfg/Model/Serial` — backend rejects**
- File: `c:\Tech-V2\frontend\src\pages\NewTicketPage.tsx` — `handleSubmit()` and Technology-specific form section
- Problem: Form state `equipmentMfg/Model/Serial` fields are included in DTO for TECHNOLOGY tickets; backend `superRefine` validation rejects non-null values for this department
- Fix: Remove the Technology "Equipment Details" free-text panel entirely (or replace with `equipmentId` asset tag selector per spec); ensure `equipmentMfg/Model/Serial` are only ever sent for MAINTENANCE tickets

**C3. Race condition in ticket number generation causes P2002 constraint violation**
- File: `c:\Tech-V2\backend\src\services\tickets.service.ts` — `generateTicketNumber()`, lines ~117–132
- Problem: Concurrent creates can get the same count, producing duplicate `ticketNumber` values
- Fix: Use a PostgreSQL sequence or advisory lock; alternatively, catch P2002 and retry with a timestamp/random suffix

### RECOMMENDED — Should Fix Soon

**R1. `GET /tickets/stats/summary` query params bypass Zod validation**
- File: `c:\Tech-V2\backend\src\controllers\tickets.controller.ts` — `getTicketStats`, line ~54
- Problem: `department`, `officeLocationId`, `fiscalYear` read from query without schema validation; invalid enum strings cause unhandled Prisma errors
- Fix: Add a `StatsQuerySchema` (e.g., `z.object({ department: TicketDepartmentEnum.optional(), ... })`) and `validateRequest` middleware for the stats route

**R2. Replace `as any` casts with Prisma enum imports**
- File: `c:\Tech-V2\backend\src\services\tickets.service.ts` — 6 `as any` cast sites
- Problem: Type safety gap; if Prisma enum values change, the compiler won't catch mismatches
- Fix: Import `TicketDepartment`, `TicketStatus`, `TicketPriority` enums from `@prisma/client` and use them directly

**R3. Implement asset tag selector for Technology tickets (spec requirement)**
- File: `c:\Tech-V2\frontend\src\pages\NewTicketPage.tsx`
- Problem: The spec requires a `ToggleButtonGroup` or DataTable for selecting equipment from inventory (via `equipmentId`). Currently omitted.
- Fix: Add a room-scoped equipment autocomplete/select that populates `equipmentId` in the DTO when `department === 'TECHNOLOGY'`

**R4. Consolidate ticket type definitions**
- Files: `c:\Tech-V2\shared\src\ticket.types.ts` and `c:\Tech-V2\frontend\src\types\ticket.types.ts`
- Problem: Two separate files define the same types with no import relationship; any change must be made in both places
- Fix: Have `frontend/src/types/ticket.types.ts` re-export from `@tech-v2/shared`, or generate frontend types from the shared source

### OPTIONAL — Nice to Have

**O1. `getTicketById` does not enforce location scope for level-3 users**
- A level-3 staff user can fetch any ticket by ID regardless of their assigned locations. The list endpoint enforces scope, but the detail endpoint only blocks levels ≤2.
- Decide if this is intentional (staff who know a ticket ID can view it) or should be restricted.

**O2. `deleteTicket` uses hard delete with no audit trail**
- Tickets are permanently deleted. Consider soft-delete (`isDeleted` flag) or archiving, particularly since `TicketStatusHistory` records are cascade-deleted.

**O3. Ticket number generation — format consistency**
- `TECH-2026-0001` / `MAINT-2026-0001` numbers reset each fiscal year. If `ticketNumber` is `@unique` globally, the format must ensure no collisions across fiscal years. The current format includes the year so this is fine, but worth documenting.

**O4. `warning.50` MUI palette reference in `TicketDetailPage`**
- `bgcolor: 'warning.50'` references a non-standard palette shade. Some MUI themes don't define `warning.50`. Prefer `alpha(theme.palette.warning.light, 0.1)` or `warning.lighter` if using the MUI extended palette.

---

## Return

**Overall Assessment:** NEEDS_REFINEMENT

**Build Result:** SUCCESS — both backend and frontend TypeScript compile clean with zero errors.

**Summary Score:**

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 68% | C+ |
| Best Practices | 82% | B |
| Functionality | 72% | C+ |
| Code Quality | 78% | C+ |
| Security | 88% | B+ |
| Performance | 85% | B |
| Consistency | 93% | A |
| Build Success | 100% | A |
| **Overall** | **83%** | **B** |

**CRITICAL Findings (must fix before production):**

1. **C1** — Search filter (`OR`) silently dropped for level-3 users due to object spread overwrite in `getTickets()` — `backend/src/services/tickets.service.ts`
2. **C2** — `NewTicketPage` TECHNOLOGY form sends `equipmentMfg/Model/Serial` fields that the backend validator rejects; any filled Technology equipment fields cause ticket creation to fail — `frontend/src/pages/NewTicketPage.tsx`
3. **C3** — `generateTicketNumber()` uses `count()` before insert; concurrent creates produce duplicate `ticketNumber`, hitting the `@unique` constraint — `backend/src/services/tickets.service.ts`

**Review Document:** `c:\Tech-V2\docs\SubAgent\ticketing_system_review.md`
