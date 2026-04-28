# Code Review: Requisition Permission Bugs — Fix Verification

**Date:** 2026-03-11  
**Reviewer:** Code Review SubAgent  
**Files reviewed:**
- `backend/src/services/purchaseOrder.service.ts`
- `backend/prisma/seed.ts`
- `backend/scripts/fix-requisition-permission-levels.ts`

---

## Summary

| File | Status | Notes |
|---|---|---|
| `purchaseOrder.service.ts` | ✅ Correct | All `permLevel < 2` replaced with `permLevel < 3`; logic is consistent |
| `seed.ts` (REQUISITIONS block) | ✅ Correct | Levels 1–5 with correct names and format |
| `fix-requisition-permission-levels.ts` | ⚠️ Mostly correct — two concerns | Safe to run on a clean DB; not safe after a mid-run crash |

---

## File 1: `purchaseOrder.service.ts`

### Verdict: ✅ CORRECT

### Threshold check (`permLevel < 2` → `permLevel < 3`)

Searched the full file for `permLevel < 2` — **zero matches found**. Every guard uses `permLevel < 3`.

The threshold appears in exactly four locations:

| Line | Function | Guard | Correct? |
|---|---|---|---|
| 172 | `getPurchaseOrders` | `...(permLevel < 3 && { requestorId: userId })` | ✅ Levels 1–2 see only own POs |
| 246 | `getPurchaseOrderById` | `if (permLevel < 3 && po.requestorId !== userId)` | ✅ Levels 1–2 cannot view another user's PO |
| 276 | `updatePurchaseOrder` | `if (permLevel < 3 && po.requestorId !== userId)` | ✅ Levels 1–2 cannot edit another user's PO |
| 346 | `deletePurchaseOrder` | `if (permLevel < 3 && po.requestorId !== userId)` | ✅ Levels 1–2 cannot delete another user's PO |

### Logic verification

- **Level 1 (Viewer) and Level 2 (General User/Requestor):** Scoped to own POs in all four operations. ✓  
- **Level 3+ (Supervisor, Purchasing, DOS):** Can see and act on all POs. ✓  
- **Submit:** Correctly restricted to own PO via `po.requestorId !== userId` (no `permLevel` check needed; any level can submit their own). ✓  
- **Approve:** Uses `APPROVAL_TRANSITIONS[permLevel]` keyed to levels 3/4/5. Levels 1–2 receive `AuthorizationError` because `APPROVAL_TRANSITIONS[1]` and `APPROVAL_TRANSITIONS[2]` are `undefined`. ✓  
- **Reject:** Callable by any authenticated user if permitted by route middleware; no `permLevel` guard in the service (route middleware enforces the appropriate level). ✓  

### Minor observation (not a bug)

`updatePurchaseOrder` and `deletePurchaseOrder` both call `getPurchaseOrderById(id, userId, permLevel)` before performing their own `permLevel < 3` check. Since `getPurchaseOrderById` already throws `AuthorizationError` when a level 1–2 user requests a PO they don't own, the secondary guards in `updatePurchaseOrder` and `deletePurchaseOrder` are technically unreachable for the "other user's PO" case. This is **defense-in-depth**, not a bug, and the behavior is consistent across all functions.

---

## File 2: `seed.ts` — REQUISITIONS block

### Verdict: ✅ CORRECT

### Levels 1–5 check

```typescript
const reqPermissions = [
  { module: 'REQUISITIONS', level: 1, name: 'Viewer',               description: 'View own purchase orders only (no create/submit)' },
  { module: 'REQUISITIONS', level: 2, name: 'General User',         description: 'Create, edit, submit own purchase orders' },
  { module: 'REQUISITIONS', level: 3, name: 'Supervisor',           description: 'Approve/reject submitted purchase orders' },
  { module: 'REQUISITIONS', level: 4, name: 'Purchasing Staff',     description: 'Purchasing approval; assign account codes' },
  { module: 'REQUISITIONS', level: 5, name: 'Director of Services', description: 'Final approval and PO issuance' },
];
```

- Uses levels 1–5 (new system). ✓  
- Level 2 is labeled `'General User'` (matches the idempotency check in the migration script). ✓  
- No legacy levels 6–9 present. ✓  

### Format consistency with other modules

| Check | TECHNOLOGY | MAINTENANCE | REQUISITIONS |
|---|---|---|---|
| Fields: `module, level, name, description` | ✅ | ✅ | ✅ |
| Comment block above permissions | ✅ | ✅ | ✅ |
| Named `const` variable | `techPermissions` | `maintPermissions` | `reqPermissions` |
| Spread into `allPermissions` | ✅ | ✅ | ✅ |
| Upserted via `module_level` compound key | ✅ (shared loop) | ✅ | ✅ |

Format is fully consistent.

### Note: Seed vs. repo memory

The repo memory note `/memories/repo/sprint-c2-po-backend.md` stated: _"Seed already has REQUISITIONS levels 1–9 (legacy names). No change needed."_ This is now **outdated** — the seed has been updated to the new 1–5 system and should be treated as the source of truth. The migration script is needed for existing databases populated from the old seed, not for fresh installs.

---

## File 3: `fix-requisition-permission-levels.ts`

### Verdict: ⚠️ SAFE TO RUN ON A CLEAN LEGACY DB — with caveats documented below

### What is correct

**Prisma client pattern:**  
Matches other scripts (`pg.Pool` → `PrismaPg` adapter → `PrismaClient`). Uses `dotenv.config()` and closes both pool and client in `.finally`. ✓

**Unique constraint handling (temp levels approach):**  
Moving old levels to `level + 100` before creating new records at 1–5 correctly avoids the `@@unique([module, level])` constraint. ✓

**Old-to-new mapping:**  
All nine legacy levels are mapped:
```
1 (Director of Schools)   → 5 (Director of Services)
2 (Director of Finance)   → 5 (Director of Services)
3 (PO Entry)              → 4 (Purchasing Staff)
4 (Principal)             → 3 (Supervisor)
5 (Vice Principal)        → 3 (Supervisor)
6 (Bookkeeper)            → 3 (Supervisor)
7 (Supervisor)            → 3 (Supervisor)
8 (Athletic Director)     → 3 (Supervisor)
9 (General User)          → 2 (General User/Requestor)
```
Mapping is complete — no old levels are left unmapped. ✓

**Idempotency check (already-migrated detection):**  
```typescript
const alreadyNew =
  levels.length <= 5 &&
  levels.every((l) => l >= 1 && l <= 5) &&
  existing.some((p) => p.level === 2 && p.name === 'General User');
```
This reliably identifies the new system if the seed has already been applied or if the script has already run successfully. ✓

**Duplicate user assignment guard:**  
Before migrating a `UserPermission` row, the script checks whether the user already has the target `permissionId` via `findUnique` on the `userId_permissionId` unique index, and skips with a log message if so. This prevents `P2002 Unique constraint` errors. ✓

**Security:**  
- All database access goes through Prisma ORM — no raw SQL, no injection risk. ✓  
- Emails are logged to console (stdout only) — acceptable for an admin CLI script. ✓  
- `DATABASE_URL` loaded from `.env` — not hardcoded. ✓  
- Top-level `.catch` logs the error and calls `process.exit(1)` — unhandled rejections will not silently succeed. ✓  

**UserPermission references updated:**  
Step 4 updates `UserPermission.permissionId` (the UUID foreign key), not the level integer. This is correct because `UserPermission` rows reference `Permission.id`, not `Permission.level`. ✓

---

### Issues Found

#### Issue 1 — Missing transaction (MEDIUM RISK)

The five migration steps (move to temp → create new → migrate users → delete temp) execute as **individual Prisma calls with no surrounding `$transaction`**. If the script crashes between steps, the database is left in a partially-migrated state.

**Crash scenario — what happens on re-run:**

| Crash point | State on next run |
|---|---|
| During Step 2 (some moved to temp, some not) | `existing` contains both original and temp levels. `alreadyNew` correctly returns false. However, for the already-moved records, `tempLevel = existingTempLevel + 100` (e.g., 201+). `OLD_TO_NEW[101]` is `undefined`, so all users under those levels are silently skipped, then cascade-deleted by Step 5. **Data loss risk.** |
| After Step 2, before Step 3 | `existing` is all temp levels (101–109). `alreadyNew` = false. New `tempLevel = 201+`, all mappings undefined, no users migrated. Step 5 deletes 201+ (non-existent, deletes nothing). Final state: DB has levels 101–109 with no new records. **Manual recovery required.** |
| During Step 3 (some new records created) | `existing` contains newly-created levels 1–N + temp levels 101–109. `alreadyNew` = false (because some temp levels exist). Moving level 1 to `101` collides with existing temp record `101`. **Unique constraint violation.** |

**Recommendation:** Wrap Steps 2–5 in a `prisma.$transaction` call so the migration is atomic.

#### Issue 2 — Cascade delete silently removes unmapped users (LOW RISK, mitigated by complete mapping)

`UserPermission` has `onDelete: Cascade` on its relation to `Permission` (confirmed in `schema.prisma`). When Step 5 deletes the temp `Permission` records, any `UserPermission` rows still pointing to those temp records are cascade-deleted at the database level.

This is intentional for the "already has target" case (those were skipped in Step 4, the duplicate row will be cleaned up by cascade). However, if `OLD_TO_NEW` were ever incomplete (a new legacy level was added but not mapped), those users' permission assignments would be silently deleted without a migration row being written.

**In practice, this is not a current risk** because `OLD_TO_NEW` covers all levels 1–9. But the behavior is worth flagging for future changes to the mapping.

#### Issue 3 — `existing` variable captured before Step 2 but re-used in Steps 4–5 (MINOR, works correctly)

`existing` records are read once before the temp-level update. In Steps 4–5, the script uses `perm.level` (the original level) to compute `tempLevel = perm.level + 100` and looks up the temp record by that computed value. This is correct and works, but it relies on the reader knowing that `perm.level` in `existing` reflects the pre-migration level, not the current DB state. A comment noting this would improve clarity.

---

### Safe to run?

**Yes — safe to run once on a database with legacy levels 1–9**, provided:
1. The run completes without interruption.
2. The target database has not been partially migrated.

**Not safe to run a second time after a crash mid-run** without first manually verifying the current permission level state and potentially resetting temp levels back to their original values.

**Before running in production:** Consider adding a `$transaction` wrapper around Steps 2–5 (or at minimum verify no prior partial-migration exists by checking for levels > 99 in the REQUISITIONS module).

---

## Appendix: Schema cascade confirmation

```prisma
model UserPermission {
  ...
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  ...
}
```

Deleting a `Permission` record cascades to all `UserPermission` rows referencing it. This is the mechanism relied upon by the migration script's cleanup step.
