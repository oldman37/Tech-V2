/**
 * fix-requisition-permission-levels.ts
 *
 * Migrates REQUISITIONS permission records from the legacy 1–9 inverted system
 * to the new 1–5 ascending system that matches routes, service, and frontend.
 *
 * WRONG (legacy seed):
 *   level 1 = Director of Schools (highest authority)
 *   level 9 = General User (lowest authority)
 *
 * CORRECT (new 1–5 ascending system):
 *   level 1 = Viewer          (view own POs only)
 *   level 2 = General User    (create, edit, submit own POs)
 *   level 3 = Supervisor      (approve/reject submitted POs)
 *   level 4 = Purchasing Staff (purchasing approval; assign account codes)
 *   level 5 = Director of Services (final approval and PO issuance)
 *
 * ALGORITHM:
 *   1. Print current REQUISITIONS permissions and user assignments.
 *   2. Move all existing REQUISITIONS permissions to temporary levels (100+)
 *      to free up the target level numbers (1–5) without unique-constraint conflicts.
 *   3. Create (or find) the five new permission records at levels 1–5.
 *   4. Migrate UserPermission rows from old temp records to new records.
 *      If a user already has the target new-level permission, skip the duplicate.
 *   5. Delete the old temp permission records (cascade removes leftover rows).
 *   6. Print the final state for verification.
 *
 * NOTE: UserPermission rows reference permissionId (UUID), not the level integer.
 *       This script is safe to run on a live database.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/fix-requisition-permission-levels.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const MODULE = 'REQUISITIONS';

// ---------------------------------------------------------------------------
// Old-level → new-level mapping
// ---------------------------------------------------------------------------
/** Every old legacy level and which new level it should become. */
const OLD_TO_NEW: Record<number, number> = {
  1: 5, // Director of Schools   → Director of Services
  2: 5, // Director of Finance   → Director of Services
  3: 4, // PO Entry              → Purchasing Staff
  4: 3, // Principal             → Supervisor
  5: 3, // Vice Principal        → Supervisor
  6: 3, // Bookkeeper            → Supervisor
  7: 3, // Supervisor            → Supervisor
  8: 3, // Athletic Director     → Supervisor
  9: 2, // General User          → General User
};

// ---------------------------------------------------------------------------
// New permission definitions (matches updated seed.ts)
// ---------------------------------------------------------------------------
const NEW_PERMISSIONS = [
  { level: 1, name: 'Viewer',               description: 'View own purchase orders only (no create/submit)' },
  { level: 2, name: 'General User',         description: 'Create, edit, submit own purchase orders' },
  { level: 3, name: 'Supervisor',           description: 'Approve/reject submitted purchase orders' },
  { level: 4, name: 'Purchasing Staff',     description: 'Purchasing approval; assign account codes' },
  { level: 5, name: 'Director of Services', description: 'Final approval and PO issuance' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function printCurrentState(label: string) {
  const perms = await prisma.permission.findMany({
    where: { module: MODULE },
    orderBy: { level: 'asc' },
    include: { _count: { select: { userPermissions: true } } },
  });

  console.log(`\n${label} [${MODULE}]:`);
  if (perms.length === 0) {
    console.log('  (no records found)');
    return;
  }
  perms.forEach((p) => {
    const userCount = p._count.userPermissions;
    console.log(`  level ${p.level}: "${p.name}" — ${p.description} [${userCount} user(s)]`);
  });
}

async function printUserAssignments() {
  const perms = await prisma.permission.findMany({
    where: { module: MODULE },
    include: {
      userPermissions: {
        include: { user: { select: { email: true } } },
      },
    },
    orderBy: { level: 'asc' },
  });

  const hasAny = perms.some((p) => p.userPermissions.length > 0);
  if (!hasAny) {
    console.log('\nNo user assignments found for REQUISITIONS.');
    return;
  }

  console.log('\nCurrent user → level assignments:');
  for (const perm of perms) {
    if (perm.userPermissions.length === 0) continue;
    console.log(`  level ${perm.level} "${perm.name}":`);
    perm.userPermissions.forEach((up) => {
      console.log(`    • ${up.user.email}`);
    });
  }
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function main() {
  console.log(`🔧 Fixing ${MODULE} permission levels (legacy 1–9 → new 1–5)...\n`);

  await printCurrentState('BEFORE migration');
  await printUserAssignments();

  // ── Step 1: Check whether migration is needed ──────────────────────────
  const existing = await prisma.permission.findMany({
    where: { module: MODULE },
    orderBy: { level: 'asc' },
  });

  if (existing.length === 0) {
    console.log('\n⚠️  No REQUISITIONS permission records found. Run the seed to create them.');
    return;
  }

  const levels = existing.map((p) => p.level);
  const alreadyNew =
    levels.length <= 5 &&
    levels.every((l) => l >= 1 && l <= 5) &&
    existing.some((p) => p.level === 2 && p.name === 'General User');

  if (alreadyNew) {
    console.log('\n✅  REQUISITIONS permissions are already on the new 1–5 system — nothing to do.');
    return;
  }

  console.log(`\n🔄  Migration needed. Found ${existing.length} legacy level(s): ${levels.join(', ')}`);

  await prisma.$transaction(async (tx) => {
    // ── Step 2: Move all old levels to temp levels (100+) ───────────────
    console.log('\n⏩  Step 2: Moving old levels to temp levels (100+)...');
    for (const perm of existing) {
      const tempLevel = perm.level + 100;
      await tx.permission.update({
        where: { id: perm.id },
        data: { level: tempLevel },
      });
      console.log(`    old level ${perm.level} "${perm.name}" → temp level ${tempLevel}`);
    }

    // ── Step 3: Create new permission records (levels 1–5) ──────────────
    console.log('\n⏩  Step 3: Creating new permission records (levels 1–5)...');
    const newPermMap: Record<number, string> = {}; // newLevel → new UUID

    for (const def of NEW_PERMISSIONS) {
      const created = await tx.permission.create({
        data: {
          module: MODULE,
          level: def.level,
          name: def.name,
          description: def.description,
        },
      });
      newPermMap[def.level] = created.id;
      console.log(`    ✅  Created level ${def.level} "${def.name}" (id: ${created.id})`);
    }

    // ── Step 4: Migrate UserPermission rows ─────────────────────────────
    console.log('\n⏩  Step 4: Migrating user assignments from old temp levels to new levels...');

    let migrated = 0;
    let skipped = 0;

    for (const perm of existing) {
      const tempLevel = perm.level + 100;
      const targetNewLevel = OLD_TO_NEW[perm.level];

      if (targetNewLevel === undefined) {
        console.log(`    ⚠️  No mapping defined for old level ${perm.level} "${perm.name}" — skipping users`);
        continue;
      }

      const targetPermId = newPermMap[targetNewLevel];

      // Find UserPermission rows pointing to the temp record
      const tempPerm = await tx.permission.findUnique({
        where: { module_level: { module: MODULE, level: tempLevel } },
        include: { userPermissions: true },
      });

      if (!tempPerm || tempPerm.userPermissions.length === 0) {
        console.log(`    ℹ️   Old level ${perm.level} "${perm.name}" → new level ${targetNewLevel}: no users to migrate`);
        continue;
      }

      console.log(`    🔁  Old level ${perm.level} "${perm.name}" → new level ${targetNewLevel} (${tempPerm.userPermissions.length} user(s)):`);

      for (const up of tempPerm.userPermissions) {
        // Check if user already has the target new-level permission (unique constraint guard)
        const alreadyHasTarget = await tx.userPermission.findUnique({
          where: { userId_permissionId: { userId: up.userId, permissionId: targetPermId } },
        });

        if (alreadyHasTarget) {
          console.log(`      ⏭️   User ${up.userId}: already has new level ${targetNewLevel} — skipping duplicate`);
          skipped++;
          continue;
        }

        await tx.userPermission.update({
          where: { id: up.id },
          data: { permissionId: targetPermId },
        });
        console.log(`      ➡️   User ${up.userId}: migrated to new level ${targetNewLevel}`);
        migrated++;
      }
    }

    console.log(`\n    Summary: ${migrated} migrated, ${skipped} duplicates skipped`);

    // ── Step 5: Delete old temp permission records ───────────────────────
    console.log('\n⏩  Step 5: Deleting old temp permission records...');
    for (const perm of existing) {
      const tempLevel = perm.level + 100;
      const deleted = await tx.permission.deleteMany({
        where: { module: MODULE, level: tempLevel },
      });
      if (deleted.count > 0) {
        console.log(`    🗑️   Deleted temp level ${tempLevel} (was old level ${perm.level} "${perm.name}")`);
      }
    }
  });

  // ── Step 6: Final state ───────────────────────────────────────────────
  await printCurrentState('AFTER migration');
  await printUserAssignments();

  console.log('\n✅  Done. REQUISITIONS permissions are now on the new 1–5 system.');
  console.log('    Level 2 = "General User" (Requestor) — can create and submit own POs.');
  console.log('    Level 3+ = Supervisor/Purchasing/DOS — can see and process all POs.\n');
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
