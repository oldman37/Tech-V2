# Remove Ticket Title Field — Specification

> **Status:** Research complete — ready for implementation  
> **Date:** 2026-04-23  
> **Scope:** Prisma schema, backend service/validation, frontend pages/types

---

## 1. Current State of the `title` Field

### 1.1 Prisma Schema

**File:** `backend/prisma/schema.prisma` — line 705 (inside `model Ticket`)

```prisma
title  String
```

- **Type:** `String` (non-nullable, required)
- **No indexes** involving `title`
- **No unique constraints** involving `title`
- **No relations** that reference `title`

### 1.2 Backend — Controller

**File:** `backend/src/controllers/work-orders.controller.ts`

- No direct `title` references — the controller delegates to the service and validators.
- `createWorkOrder` (line 93): passes `CreateWorkOrderSchema.parse(req.body)` (which includes `title`)
- `updateWorkOrder` (line 105): passes `UpdateWorkOrderSchema.parse(req.body)` (which includes optional `title`)

### 1.3 Backend — Validators (Zod)

**File:** `backend/src/validators/work-orders.validators.ts`

| Schema | Field | Constraint | Line |
|--------|-------|-----------|------|
| `CreateWorkOrderSchema` | `title` | **Required** — `z.string().min(3).max(200)` | ~76 |
| `UpdateWorkOrderSchema` | `title` | **Optional** — `z.string().min(3).max(200).optional()` | ~100 |

### 1.4 Backend — Service

**File:** `backend/src/services/work-orders.service.ts`

| Usage | Line(s) | Detail |
|-------|---------|--------|
| `sendAssignmentEmail(...)` helper | ~164 | Accepts `title` param, passes it to email function |
| Search filter (`getWorkOrders`) | ~209 | `query.search` matches against `title`, `ticketNumber`, and `description` via `OR` |
| `createWorkOrder` | ~291 | Writes `title: data.title` to DB |
| `createWorkOrder` email call | ~308 | Passes `data.title` to `sendAssignmentEmail` |
| `updateWorkOrder` | ~322 | Writes `title: data.title` to DB |

### 1.5 Backend — Email Service

**File:** `backend/src/services/email.service.ts` — lines 319–365

- `sendWorkOrderAssigned()` receives `workOrder.title` as a parameter
- Used in:
  - Email subject line: `Work Order Assigned: ${workOrderNumber} — ${title}`
  - Email body HTML table: `<tr><td>Title:</td><td>${title}</td></tr>`

### 1.6 Backend — Routes

**File:** `backend/src/routes/work-orders.routes.ts`

- No direct `title` usage — routes wire validators to controller handlers.
- Comment on line 105 mentions "title" in the PUT route description: `"Update work order fields (title, description, priority, category, location, etc.)"`

### 1.7 Frontend — Types

**File:** `frontend/src/types/work-order.types.ts`

| Interface | Field | Line |
|-----------|-------|------|
| `WorkOrderSummary` | `title: string` | ~55 |
| `CreateWorkOrderDto` | `title: string` (required) | ~97 |
| `UpdateWorkOrderDto` | `title?: string` (optional) | ~108 |

**File:** `shared/src/work-order.types.ts`

| Interface | Field | Line |
|-----------|-------|------|
| `WorkOrderSummary` | `title: string` | ~105 |
| `CreateWorkOrderDto` | `title: string` (required) | ~139 |
| `UpdateWorkOrderDto` | `title?: string` (optional) | ~150 |

### 1.8 Frontend — New Work Order Page (Creation Form)

**File:** `frontend/src/pages/NewWorkOrderPage.tsx`

| Usage | Line(s) |
|-------|---------|
| `FormState.title` field | ~57 |
| `INITIAL.title = ''` | ~64 |
| `FormErrors.title` type | ~72 |
| `validate()` — `if (!form.title.trim()) errors.title = 'Title is required.'` | ~78 |
| `handleSubmit()` — `title: form.title.trim()` in DTO | ~135 |
| `<TextField label="Title" ... value={form.title} ...>` | ~228–238 |

### 1.9 Frontend — Work Order Detail Page

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`

| Usage | Line |
|-------|------|
| `{workOrder.title}` displayed as `<Typography variant="h6">` below the work order number | 253 |

### 1.10 Frontend — Work Order List Page

**File:** `frontend/src/pages/WorkOrderListPage.tsx`

| Usage | Line |
|-------|------|
| Table header: `<TableCell>Title</TableCell>` | ~264 |
| Table cell: `{workOrder.title}` displayed with `noWrap` | ~288 |

### 1.11 Frontend — Services, Hooks, Mutations

- `frontend/src/services/work-order.service.ts` — No direct `title` ref (passes DTO objects through)
- `frontend/src/hooks/queries/useWorkOrders.ts` — No direct `title` ref
- `frontend/src/hooks/mutations/useWorkOrderMutations.ts` — No direct `title` ref (passes DTO types)

---

## 2. Files That Reference `title` in the Ticket Context

| # | File | Lines | Type |
|---|------|-------|------|
| 1 | `backend/prisma/schema.prisma` | 705 | Schema field definition |
| 2 | `backend/src/validators/work-orders.validators.ts` | ~76, ~100 | Zod Create (required) + Update (optional) |
| 3 | `backend/src/services/work-orders.service.ts` | ~164, ~209, ~291, ~308, ~322 | Service logic (email, search, create, update) |
| 4 | `backend/src/services/email.service.ts` | ~319–365 | Email subject + body |
| 5 | `backend/src/routes/work-orders.routes.ts` | ~105 | Comment only |
| 6 | `frontend/src/types/work-order.types.ts` | ~55, ~97, ~108 | TypeScript interfaces |
| 7 | `shared/src/work-order.types.ts` | ~105, ~139, ~150 | Shared TypeScript interfaces |
| 8 | `frontend/src/pages/NewWorkOrderPage.tsx` | ~57, ~64, ~72, ~78, ~135, ~228–238 | Form state, validation, input, submit |
| 9 | `frontend/src/pages/WorkOrderDetailPage.tsx` | 253 | Title display under WO number |
| 10 | `frontend/src/pages/WorkOrderListPage.tsx` | ~264, ~288 | Table header + cell |

---

## 3. Database Migration Plan

**Strategy: Make `title` nullable — do NOT drop the column.**

This preserves all existing work order titles for historical records.

### Prisma schema change

```prisma
// BEFORE
title  String

// AFTER
title  String?
```

### Migration

```sql
ALTER TABLE "tickets" ALTER COLUMN "title" DROP NOT NULL;
```

Run: `npx prisma migrate dev --name make-ticket-title-optional`

---

## 4. Backend Changes

### 4.1 Validators (`work-orders.validators.ts`)

**`CreateWorkOrderSchema`:**
- Remove `title` from the schema entirely (stop accepting it)
- OR make it optional: `title: z.string().max(200).optional()` — recommended during transition so old clients don't break

**`UpdateWorkOrderSchema`:**
- Remove `title` field entirely (or keep optional if preserving edit capability)

### 4.2 Service (`work-orders.service.ts`)

**`createWorkOrder()`:**
- Stop writing `title: data.title` — instead write `title: null` (or omit, since it will be nullable)

**`updateWorkOrder()`:**
- Remove `title: data.title` from the update payload

**`getWorkOrders()` — search filter:**
- Remove `{ title: { contains: query.search, mode: 'insensitive' } }` from the `OR` array
- Keep `ticketNumber` and `description` in search

**`sendAssignmentEmail()` helper:**
- Remove `title` parameter
- Update call sites

### 4.3 Email Service (`email.service.ts`)

**`sendWorkOrderAssigned()`:**
- Remove `title` from the function parameter type
- Update email subject: `Work Order Assigned: ${workOrderNumber}` (no title suffix)
- Remove the "Title" row from the HTML table body
- Consider adding a truncated description snippet instead (first ~80 chars)

---

## 5. Frontend Changes

### 5.1 Types

**`frontend/src/types/work-order.types.ts`:**
- `WorkOrderSummary.title` → `title?: string | null` (optional, nullable for backwards compat)
- `CreateWorkOrderDto` → remove `title` field
- `UpdateWorkOrderDto` → remove `title` field

**`shared/src/work-order.types.ts`:**
- Same changes as frontend types

### 5.2 New Work Order Page (`NewWorkOrderPage.tsx`)

- Remove `title` from `FormState` interface
- Remove `title: ''` from `INITIAL`
- Remove `title` from `FormErrors` interface
- Remove `title` validation from `validate()` function
- Remove `title: form.title.trim()` from `handleSubmit()` DTO
- Remove the entire `<TextField label="Title" ... />` block (~lines 228–238)

### 5.3 Work Order Detail Page (`WorkOrderDetailPage.tsx`)

- Remove `{workOrder.title}` display (line 253, the `<Typography variant="h6">`)
- The work order number, status, priority, and department chips remain as the header

### 5.4 Work Order List Page (`WorkOrderListPage.tsx`)

**Replace the Title column with a Description preview column:**
- Change table header from `Title` to `Description`
- Change table cell from `{workOrder.title}` to a truncated `{workOrder.description}` (NOTE: description is not in `WorkOrderSummary` currently — see section 6)
- **Alternative:** Remove the Title column entirely and let the work order number be the primary identifier. The row is still clickable.

**Recommended approach:** Remove the Title column entirely. The table already has 8 columns (WO#, Title, Department, Status, Priority, Location, Assigned To, Created). Dropping Title brings it to 7 columns which is cleaner. The work order number is the primary row identifier and the row is clickable for details.

---

## 6. Strategy for List Views Without Title

### Option A: Remove Title column entirely (RECOMMENDED)
- Work order number serves as the primary identifier
- Rows are already clickable → users click through for description
- Keeps the table clean (7 columns instead of 8)
- No backend changes needed to the summary include

### Option B: Replace Title with truncated description
- Requires adding `description` to `WORK_ORDER_SUMMARY_INCLUDE` (currently not selected)
- Add `select: { description: true }` or just let it flow through
- Frontend truncates to ~80 chars with ellipsis
- More information density but wider table

### Option C: Auto-generate title from description
- On create, auto-generate: `title = description.substring(0, 80)`
- Backwards compatible but adds complexity and feels wrong
- NOT recommended

**Decision: Go with Option A.** Clean, simple, no extra data needed.

---

## 7. Implementation Steps (Ordered)

### Phase 1: Database (non-breaking)
1. Update `backend/prisma/schema.prisma` — change `title String` to `title String?`
2. Generate and run Prisma migration: `npx prisma migrate dev --name make-ticket-title-optional`

### Phase 2: Backend (backwards-compatible)
3. `backend/src/validators/work-orders.validators.ts`:
   - `CreateWorkOrderSchema`: make `title` optional (`z.string().max(200).optional()`)
   - `UpdateWorkOrderSchema`: remove `title` field
4. `backend/src/services/work-orders.service.ts`:
   - `createWorkOrder()`: change to `title: data.title ?? null`
   - `updateWorkOrder()`: remove `title` from update data
   - `getWorkOrders()`: remove `title` from search `OR` array
   - `sendAssignmentEmail()`: stop passing `title`
5. `backend/src/services/email.service.ts`:
   - `sendWorkOrderAssigned()`: remove `title` from param type, subject line, and HTML table

### Phase 3: Frontend types
6. `frontend/src/types/work-order.types.ts`:
   - `WorkOrderSummary.title` → optional/nullable
   - Remove `title` from `CreateWorkOrderDto` and `UpdateWorkOrderDto`
7. `shared/src/work-order.types.ts`:
   - Same changes as step 6

### Phase 4: Frontend pages
8. `frontend/src/pages/NewWorkOrderPage.tsx`:
   - Remove title from form state, validation, and JSX
9. `frontend/src/pages/WorkOrderDetailPage.tsx`:
   - Remove title display line
10. `frontend/src/pages/WorkOrderListPage.tsx`:
    - Remove Title column header and cell
    - Update skeleton and "no results" colSpan from 8 to 7

### Phase 5: Cleanup
11. Update route comment in `backend/src/routes/work-orders.routes.ts` (remove "title" mention)
12. Test end-to-end: create new work order, verify list, verify detail

---

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing work orders lose title display | Low | Medium | Column is nullable, not dropped. Old titles still in DB. Detail page can show title if present: `{workOrder.title && <Typography>...}` |
| Search breaks for old work orders that had title-based matches | Low | Low | Description search still works. Ticket number search still works. |
| Email subject becomes less descriptive | Low | Low | Subject still has work order number. Could add truncated description. |
| Frontend type mismatch during deploy gap | Medium | Low | Deploy backend first (backwards-compatible), then frontend |
| Third-party integrations expecting title | Very Low | Low | No known external consumers of this API |

---

## 9. Optional Enhancements (out of scope, document for future)

- **Detail page:** Show legacy title if present — `{workOrder.title && <Typography variant="subtitle2" color="text.secondary">{workOrder.title}</Typography>}`
- **Email:** Include first 100 chars of description in assignment notification
- **Search:** Add full-text search on description (already included in OR clause)
