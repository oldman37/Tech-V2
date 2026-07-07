# Review: Ticket Priority Permissions + Status Timeline

**Reviewed against spec:** `.github/docs/subagent_docs/ticket_priority_permissions_and_status_timeline_spec.md`
**Review date:** 2026-07-07

## Methodology

Reviewed via `git diff` against the working tree for every file listed in the implementation
scope (backend: schema, migration SQL, groupAuth, validators, service, controller, routes, auth
controller/types; frontend: types, authStore, service, mutation hook, WorkOrderDetailPage). Cross-
referenced the new `ticket_priority_history` migration DDL against the sibling
`ticket_status_history` DDL in `20260421135641_add_unified_ticketing_system/migration.sql`. Ran
the two approved Docker builds. Did not touch or review `UserSearchAutocomplete.tsx` /
`SupervisorManagement.tsx` (pre-existing unrelated uncommitted changes, out of scope).

## 1. Specification Compliance

Every implementation step in spec section 4 (steps 1–13) is present and matches the spec's code
blocks essentially verbatim:

- `TicketPriorityHistory` Prisma model, `Ticket.priorityHistory`, `User.ticketPriorityHistory` —
  present, field-for-field identical to spec (`backend/prisma/schema.prisma`).
- Migration SQL — present at
  `backend/prisma/migrations/20260707140000_add_ticket_priority_history/migration.sql`, additive
  only.
- `canChangeTicketPriority()` in `groupAuth.ts` — identical to spec, same allowlist pattern as
  `isCountyWideMaintenance`.
- `priority` removed from `UpdateWorkOrderSchema`; `UpdatePrioritySchema` + `UpdatePriorityDto`
  added — matches spec exactly (`work-orders.validators.ts`).
- `priority` removed from `updateWorkOrder`'s Prisma update payload; `priorityHistory` added to
  `WORK_ORDER_DETAIL_INCLUDE`; `updatePriority` service method — matches spec's transaction shape,
  no-op short-circuit, and logging call (`work-orders.service.ts`).
- `updatePriority` controller handler — matches spec (`work-orders.controller.ts`).
- `PUT /:id/priority` route, `requireModule('WORK_ORDERS', 1)`, placed after `/status` and before
  `/assign` — matches spec (`work-orders.routes.ts`).
- `canChangeWorkOrderPriority` added to both `permLevels` construction sites in
  `auth.controller.ts` (login/callback response and `getMe`) and to the `AuthUserInfo` type —
  matches spec.
- Frontend: `WorkOrderPriorityHistoryEntry`, `UpdatePriorityDto`, `priorityHistory` added to
  `WorkOrderDetail`, `priority` removed from `UpdateWorkOrderDto` — matches spec
  (`work-order.types.ts`).
- `authStore.ts` — `canChangeWorkOrderPriority?: boolean` added to the `permLevels` type shape —
  matches spec.
- `work-order.service.ts` — `updatePriority` client call — matches spec.
- `useWorkOrderMutations.ts` — `useUpdateWorkOrderPriority`, same invalidation pattern as
  `useUpdateWorkOrderStatus` — matches spec.
- `WorkOrderDetailPage.tsx` — "Change Priority" button gated on `canChangeWorkOrderPriority`,
  Priority dialog (Select + optional notes TextField), dedicated "Status Timeline" card
  (chronological list, not a Stepper, closing-event visual marker via `lastClosedIdx`), and
  `priority` folded into the merged Comments & Activity `ActivityItem` union via a new
  `PriorityHistoryCard` — matches spec's description in full.

No deviations found. 100% compliance.

## 2. Best Practices

- `updatePriority` mirrors `updateStatus`'s structure exactly: fetch → `assertTicketAccess` →
  permission gate → no-op short-circuit → `$transaction` (update + history insert) → `loggers`
  call → return. Same error types (`NotFoundError`, `AuthorizationError`) used consistently.
- Zod schema follows existing conventions (`z.object`, `.max(1000).optional()` for notes,
  consistent with `UpdateStatusSchema`'s `notes` field).
- React/MUI/TanStack Query usage is idiomatic and matches sibling patterns in the same file
  (`StatusHistoryCard` → `PriorityHistoryCard`, status dialog → priority dialog,
  `useUpdateWorkOrderStatus` → `useUpdateWorkOrderPriority`).

Minor nit (non-blocking): in `schema.prisma`, the new `ticketPriorityHistory` field on `User` and
`priorityHistory` on `Ticket` are not column-aligned with the surrounding block the way
`prisma format` would normally align them (e.g. `ticketPriorityHistory` runs one column further
right than its neighbors, and its type column `TicketPriorityHistory[]` isn't padded like
`TicketStatusHistory[]` above it). Purely cosmetic — `prisma generate`/`migrate deploy` are
unaffected, confirmed by a clean backend build. Recommend running `npx prisma format` at some
point but not blocking.

## 3. Consistency

Fully consistent with existing layered architecture (route → controller → service → Prisma),
existing Zod validator conventions, and existing MUI dialog/button/card patterns already present
in `WorkOrderDetailPage.tsx`. The `canChangeWorkOrderPriority` flag placement in `permLevels`
mirrors `isFinanceDirectorApprover` et al. exactly, at both call sites.

## 4. Maintainability

Comments are minimal and only added where non-obvious (route JSDoc explaining *why* the group
check isn't level-based; inline comments in `updatePriority` explaining the two-stage
authorization). No over-commenting. Naming is consistent with existing sibling code.

## 5. Completeness

All 13 implementation steps from spec section 4 are done. Step 14 (build verification) is this
review's own task, covered in section 9 below.

## 6. Performance

- `WORK_ORDER_DETAIL_INCLUDE` addition (`priorityHistory`) uses the same `select`-scoped
  `changedBy` shape as `statusHistory` — no over-fetching, no N+1 (single Prisma query with
  nested includes, same pattern as before).
- `updatePriority`'s no-op short-circuit avoids writing unnecessary history rows and avoids an
  extra transaction when priority is unchanged.
- Frontend merges `comments` + `statusHistory` + `priorityHistory` in-memory with a single sort —
  O(n log n) on an already-small, already-fetched array; no additional network round trips.

No regressions found.

## 7. Security (primary focus for this feature)

**Route reachability / group gate bypass:** Walked the full path for a user NOT in one of the 6
groups: `requireModule('WORK_ORDERS', 1)` only requires permLevel ≥ 1 (i.e., any authenticated
user with any WORK_ORDERS access), so the request reaches
`WorkOrderService.updatePriority`. There, `assertTicketAccess` runs first (existing scoping,
unchanged), followed by `if (!canChangeTicketPriority(groups)) throw new AuthorizationError(...)`.
A user outside the 6 groups is rejected with 403 regardless of `assertTicketAccess` outcome. This
correctly closes the gap — no bypass found.

**In-group but out-of-scope ticket (e.g. County-Wide Maintenance worker on a Technology
ticket):** `assertTicketAccess` runs *before* the group check. For `permLevel === 3` +
`maintenanceRole === 'county_wide'`, it throws `AuthorizationError` immediately if
`ticket.department !== 'MAINTENANCE'` — this fires before `canChangeTicketPriority` is even
evaluated, so a County-Wide Maintenance worker cannot reach a Technology ticket's priority
endpoint at all. No bypass found. This logic is pre-existing and untouched by this change, so no
new risk was introduced.

**DB-role `ADMIN` bypass interaction (walked, not in the original ask, but relevant to "is the
gate truly unbypassable"):** `requireModule`'s `ADMIN` role bypass
(`req.user.roles?.includes('ADMIN')`) only bypasses the *numeric level* check, setting
`permLevel = Math.max(derivedLevel, minLevel)` — it does not touch `req.user.groups`. Since
`canChangeTicketPriority` operates purely on `groups`, a DB-role `ADMIN` user who is not actually a
member of any of the 6 Entra groups is still correctly rejected by the group check. No bypass.

**`priority` removal from generic update — both schema AND service payload confirmed removed:**
`UpdateWorkOrderSchema` no longer has a `priority` field (validators diff, line 113 removed); the
service's `updateWorkOrder` Prisma `data: {...}` object no longer has
`priority: data.priority as any` (service diff, line 553 removed). `UpdateWorkOrderDto` (backend,
via Zod inference) and the frontend `UpdateWorkOrderDto` interface both cleanly compile with no
leftover references — confirmed by both Docker builds succeeding (`tsc` runs as part of both).

**No raw Entra group ID leakage:** `WORK_ORDER_DETAIL_INCLUDE.priorityHistory.include.changedBy`
uses an explicit `select: { id, displayName, email }` — no `groups` field is selected or returned.
`mapTicket` in the controller only renames `ticketNumber` → `workOrderNumber`; it does not add or
leak any group data. The only new frontend-facing addition is the derived boolean
`canChangeWorkOrderPriority`, consistent with the existing `isFinanceDirectorApprover`-style
pattern — no raw group IDs added to any response shape.

**CSRF:** `router.use(validateCsrfToken)` is at `work-orders.routes.ts:39`, before all route
definitions including the new `/:id/priority` route at line 128 — confirmed the new route is
correctly covered, not placed before or around the middleware.

No security issues found.

## 8. API Currency

No new external dependencies introduced. Confirmed via diff review — all new code uses Zod,
Prisma Client, MUI v7 components, and TanStack Query v5 hooks already used elsewhere in this exact
file/module. `package.json`/`package-lock.json` are untouched (not in the modified-files list, and
`git status` confirms no lockfile changes).

## 9. Build Validation

Both approved commands were run in order, full output captured:

**a. `docker compose -f docker-compose.dev.yml build backend`** — **PASSED**.
Key steps: `npm install` succeeded (pre-existing EBADENGINE/deprecation warnings only, unrelated
to this change), `npx prisma generate` succeeded against the edited schema
(`✔ Generated Prisma Client (v7.8.0)`), and `npm run build` (`tsc && ...`) completed with exit
code 0 — no TypeScript errors from the `priority` field removal, the new `updatePriority` service
method, or any other changed file. Image built and exported successfully.

**b. `docker compose -f docker-compose.dev.yml build frontend`** — **PASSED**.
`npm run build` (`tsc && vite build`) completed with exit code 0 — no TypeScript errors from the
`UpdateWorkOrderDto` type change, the new `WorkOrderPriorityHistoryEntry`/`UpdatePriorityDto`
types, or the `WorkOrderDetailPage.tsx` changes. Only pre-existing, unrelated warnings appeared
(`INEFFECTIVE_DYNAMIC_IMPORT` for `src/services/api.ts`, chunk-size warning on the main bundle) —
neither is new or caused by this feature. Image built and exported successfully.

## Migration SQL Cross-Check

Compared `ticket_priority_history` DDL against the original `ticket_status_history` DDL in
`20260421135641_add_unified_ticketing_system/migration.sql`:

| Aspect | `ticket_status_history` (original) | `ticket_priority_history` (new) | Match? |
|---|---|---|---|
| `id` | `TEXT NOT NULL` PK | `TEXT NOT NULL` PK | Yes |
| `ticketId` | `TEXT NOT NULL` | `TEXT NOT NULL` | Yes |
| `from*` column | `"fromStatus" "TicketStatus"` (nullable) | `"fromPriority" "TicketPriority"` (nullable) | Yes |
| `to*` column | `"toStatus" "TicketStatus" NOT NULL` | `"toPriority" "TicketPriority" NOT NULL` | Yes |
| `changedById` | `TEXT NOT NULL` | `TEXT NOT NULL` | Yes |
| `changedAt` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | same | Yes |
| `notes` | `TEXT` (nullable) | `TEXT` (nullable) | Yes |
| `ticketId` FK | `ON DELETE CASCADE ON UPDATE CASCADE` → `tickets(id)` | identical → `tickets(id)` | Yes |
| `changedById` FK | `ON DELETE RESTRICT ON UPDATE CASCADE` → `users(id)` | identical → `users(id)` | Yes |
| Indexes | `(ticketId)`, `(changedAt)` | `(ticketId)`, `(changedAt)` | Yes |

Exact structural match. Combined with the passing backend build (which runs `prisma generate`
against the edited schema and would fail on a schema/migration drift at `migrate deploy` time in
the real container, though that step itself isn't exercised by `prisma generate`), this gives high
confidence the migration will apply cleanly on next backend container start.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 97% | A |
| Functionality | 100% | A |
| Code Quality | 96% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

## Verdict: PASS

No CRITICAL issues found. One cosmetic, non-blocking nit (Prisma schema field alignment/formatting
in the `User`/`Ticket` relation blocks — does not affect `prisma generate`, `migrate deploy`, or
either Docker build) — optional cleanup, not required before proceeding.
