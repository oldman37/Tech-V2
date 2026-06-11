# SP-6 — Free-String `sortBy` Whitelist Fix

**Date:** 2026-06-11
**Finding:** SP-6 🔵 (Low/Info)
**Phase:** 1 (Research & Specification)

---

## 1. Current State Analysis

Five validators accept `sortBy` as an unconstrained string that is then interpolated
directly into a Prisma `orderBy` object:

| Validator | Line | Default | Model |
|---|---|---|---|
| `deviceAssignment.validators.ts` | 47 | `undefined` | `DeviceAssignment` |
| `damageIncident.validators.ts` | 74 | `'reportedAt'` | `DamageIncident` |
| `inventory.validators.ts` | 87 | `undefined` | `equipment` |
| `invoice.validators.ts` | 60 | `'createdAt'` | `DamageInvoice` |
| `repairTicket.validators.ts` | 38 | `'createdAt'` | `RepairTicket` |

Each service then builds an `orderBy` clause via computed property:
```typescript
orderBy: { [sortBy]: sortOrder }          // deviceAssignment.service.ts:309-311
orderBy: { [sortBy]: sortOrder }          // damageIncident.service.ts:252-254
orderBy[sortBy as keyof ...] = sortOrder  // inventory.service.ts:202-203
orderBy: { [sortBy]: sortOrder }          // invoice.service.ts:245
orderBy: { [sortBy]: sortOrder }          // repairTicket.service.ts:168
```

Any value not matching a real Prisma model column throws
`PrismaClientValidationError` → unhandled → **500**. Other validators in the
codebase (`referenceData`, `emailQueueAdmin`, `fundingSource`, `room`,
`workOrderCategory`) already use `z.enum` correctly.

---

## 2. Problem Definition

- `?sortBy=foo` → `PrismaClientValidationError` → 500 (should be 400)
- Exposes internal Prisma column names implicitly via error differentiation
- Inconsistent with the rest of the codebase which uses `z.enum`

---

## 3. Proposed Solution

Replace each `z.string()` / `z.string().max(N)` with `z.enum([...])` using a
whitelist of the model's sortable scalar fields. The default value (where
applicable) is preserved. Services need **no changes** — they simply receive a
pre-validated column name from the enum.

### Whitelists

**DeviceAssignment** (`checkoutAt` is the current hardcoded default):
```typescript
z.enum(['checkoutAt', 'returnedAt', 'createdAt', 'updatedAt']).optional()
```

**DamageIncident** (default `reportedAt`):
```typescript
z.enum(['reportedAt', 'damageDate', 'createdAt', 'updatedAt', 'severity', 'status']).default('reportedAt')
```

**equipment / inventory** (no default — service falls back to natural order):
```typescript
z.enum(['name', 'assetTag', 'createdAt', 'updatedAt', 'purchaseDate', 'purchasePrice', 'status', 'condition']).optional()
```

**DamageInvoice** (default `createdAt`):
```typescript
z.enum(['createdAt', 'updatedAt', 'dueDate', 'amount', 'status', 'sentAt', 'paidAt', 'invoiceNumber']).default('createdAt')
```

**RepairTicket** (default `createdAt`):
```typescript
z.enum(['createdAt', 'updatedAt', 'status', 'sentForRepairAt', 'expectedReturnDate', 'returnedAt', 'repairCost', 'ticketNumber']).default('createdAt')
```

---

## 4. Implementation Steps

1. Edit `backend/src/validators/deviceAssignment.validators.ts` — replace `sortBy`
2. Edit `backend/src/validators/damageIncident.validators.ts` — replace `sortBy`
3. Edit `backend/src/validators/inventory.validators.ts` — replace `sortBy`
4. Edit `backend/src/validators/invoice.validators.ts` — replace `sortBy`
5. Edit `backend/src/validators/repairTicket.validators.ts` — replace `sortBy`

**Verify:** build must pass; invalid `sortBy` values now produce a Zod 400 instead of a Prisma 500.

---

## 5. Dependencies

No new dependencies. Uses Zod already in the project.

---

## 6. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Frontend currently passes an unsupported `sortBy` value | Enum uses the exact column names the frontend already sends (checked against service defaults and existing usage) |
| Missing a commonly used sort column | Whitelists are derived from the Prisma model's scalar fields and cross-checked against service fallback defaults |

---

## 7. Build Commands

- `docker compose -f docker-compose.dev.yml build backend` — TypeScript compile gate
- Frontend unchanged — no frontend build required
