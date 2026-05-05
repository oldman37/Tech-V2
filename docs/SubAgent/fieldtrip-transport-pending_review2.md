# Code Review: fieldtrip-transport-pending (Round 2)

**Date:** 2026-05-05  
**Reviewer:** Code Review Subagent  
**Files reviewed:**
- `backend/src/services/fieldTrip.service.ts` — `approve()` transaction block
- `backend/scripts/_fix_transport_draft_status.ts` — one-time backfill script

---

## Criterion 1 — Is `nextStatus` in scope at the point the new block was added?

**PASS.**  
`nextStatus` is declared at function scope before the `prisma.$transaction(...)` call:

```typescript
const nextStatus = APPROVAL_CHAIN[trip.status];
// ...
const updated = await prisma.$transaction(async (tx) => {
  // ...
  if (nextStatus === 'APPROVED') { ... }   // ← captured via closure ✔
```

`nextStatus` is captured by the transaction closure correctly and is always a resolved string at that point.

---

## Criterion 2 — Is `id` the correct variable for `fieldTripRequestId`?

**PASS.**  
The method signature is `approve(userId, id, permLevel, notes?)` where `id` is the `FieldTripRequest.id`.  
`FieldTripTransportationRequest.fieldTripRequestId` is the FK that references `FieldTripRequest.id`.  
Using `id` as the filter value is correct.

---

## Criterion 3 — Is `'DRAFT'` a valid `FieldTripTransportationRequest.status` value?

**PASS.**  
The Prisma schema (`prisma/schema.prisma`, model `FieldTripTransportationRequest`) declares:

```prisma
status  String  @default("DRAFT")
// DRAFT | SUBMITTED | PENDING_TRANSPORTATION | TRANSPORTATION_APPROVED | TRANSPORTATION_DENIED
```

`DRAFT` is both the default and an explicitly listed valid status.

---

## Criterion 4 — Is `'PENDING_TRANSPORTATION'` a valid status value?

**PASS.**  
`PENDING_TRANSPORTATION` appears in the schema comment as a valid status value (see above). The transition DRAFT → PENDING_TRANSPORTATION is used consistently between the service method and the backfill script.

> **Note:** The schema lists `SUBMITTED` between `DRAFT` and `PENDING_TRANSPORTATION` in the comment. The service skips `SUBMITTED` entirely — it transitions directly DRAFT → PENDING_TRANSPORTATION. This is internally consistent (the service never sets `SUBMITTED`) but worth documenting if the `SUBMITTED` state is reserved for a future workflow step.

---

## Criterion 5 — Does `submittedAt` exist on `FieldTripTransportationRequest`?

**PASS.**  
The model defines:

```prisma
submittedAt  DateTime?
```

The field exists and is nullable, so writing `submittedAt: new Date()` is valid in both the service and the backfill script.

---

## Criterion 6 — Is `updateMany` correctly placed inside the transaction using `tx.`?

**PASS.**  
The block uses `tx.fieldTripTransportationRequest.updateMany(...)` — not the module-level `prisma` client — and sits inside the `prisma.$transaction(async (tx) => { ... })` callback, ensuring atomicity with the outer `tx.fieldTripRequest.update(...)` and `tx.fieldTripStatusHistory.create(...)` calls.

---

## Criterion 7 — Is the backfill script safe?

**PASS.**  
The `where` clause uses two conditions joined by AND:

```typescript
where: {
  status: 'DRAFT',
  fieldTripRequest: {
    status: 'APPROVED',
  },
},
```

This scopes the update to only transportation requests that are in DRAFT **and** whose parent trip has already reached APPROVED status. Records in any other transportation status (`SUBMITTED`, `PENDING_TRANSPORTATION`, etc.) or whose parent trip is not yet `APPROVED` are untouched. The filter is tight enough that no collateral updates can occur.

**Additional safety observations:**
- The script is idempotent: re-running it after all eligible records have been promoted produces `count = 0` without side effects.
- `fieldTripRequestId` has a `@unique` constraint, so at most one transportation request exists per trip; the blast radius of any single-record mismatch is limited to one row.

---

## Criterion 8 — Does the backfill script follow the existing script pattern?

**PASS.**  
The script matches the established pattern in the `/scripts` directory:

| Pattern element | Present? |
|---|---|
| `import { PrismaClient }` + PgAdapter construction | ✔ |
| `dotenv.config()` before pool creation | ✔ |
| Named `async function main()` | ✔ |
| `main().catch(console.error).finally(...)` | ✔ |
| Both `prisma.$disconnect()` and `pool.end()` in finally | ✔ |
| Run instructions in JSDoc comment | ✔ |

---

## Summary

| # | Criterion | Result |
|---|---|---|
| 1 | `nextStatus` in scope | PASS |
| 2 | `id` correct for `fieldTripRequestId` | PASS |
| 3 | `'DRAFT'` valid status | PASS |
| 4 | `'PENDING_TRANSPORTATION'` valid status | PASS |
| 5 | `submittedAt` field exists | PASS |
| 6 | `updateMany` uses `tx.` inside transaction | PASS |
| 7 | Backfill script safe / scoped where clause | PASS |
| 8 | Script follows existing pattern | PASS |

## Verdict: **PASS**

No defects found. One non-blocking observation: the `SUBMITTED` status value listed in the schema comment is never written by the service; if it is intended for a future workflow step, this should be noted in the schema comment to avoid confusion.
