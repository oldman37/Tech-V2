/**
 * fix-permission-levels.ts
 *
 * Fixes the inverted TECHNOLOGY and MAINTENANCE permission levels.
 *
 * Root cause: seed.ts had levels backwards relative to the checkPermission
 * middleware which uses `permission.level >= requiredLevel`.
 *
 * WRONG (old):  level 1 = "Technology Department (full admin)"   ← fails >= 2 write check!
 * CORRECT (new): level 3 = "Technology Department (full admin)"  ← passes >= 2 and >= 3 checks
 *
 * Level semantics (matching middleware):
 *   1 = View only  (General User)
 *   2 = Edit        (Principal / School Tech)
 *   3 = Admin       (Technology Department / dept full access)
 *
 * The swap for TECHNOLOGY and MAINTENANCE is: old-level-1 → new-level-3, old-level-3 → new-level-1.
 * Level 2 stays the same.
 *
 * UserPermission rows are NOT changed because they reference permissionId (UUID), not the level
 * integer directly. After the swap, users who held "Technology Department level-1" still hold the
 * same permission record — which is now correctly labelled level-3.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/fix-permission-levels.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Swap levels 1 ↔ 3 for a given module using a temporary sentinel level 99. */
async function swapLevels(moduleName: string) {
  // Fetch current records
  const [lvl1, lvl2, lvl3] = await Promise.all([
    prisma.permission.findUnique({ where: { module_level: { module: moduleName, level: 1 } } }),
    prisma.permission.findUnique({ where: { module_level: { module: moduleName, level: 2 } } }),
    prisma.permission.findUnique({ where: { module_level: { module: moduleName, level: 3 } } }),
  ]);

  if (!lvl1 || !lvl3) {
    console.log(`  ⚠️  ${moduleName}: level 1 or 3 record not found — skipping`);
    return;
  }

  const alreadyCorrect =
    lvl1.name === 'General User' && lvl3.name === 'Technology Department';

  if (alreadyCorrect) {
    console.log(`  ✅  ${moduleName}: levels already correct — skipping`);
    return;
  }

  console.log(`  🔄  ${moduleName}: swapping levels 1 ↔ 3`);
  console.log(`      Before: level-1="${lvl1.name}"  level-3="${lvl3.name}"`);

  // Step 1 – move old level-1 to a temporary level (99) to avoid unique-constraint clash
  await prisma.permission.update({
    where: { id: lvl1.id },
    data: { level: 99 },
  });

  // Step 2 – move old level-3 down to level-1
  await prisma.permission.update({
    where: { id: lvl3.id },
    data: { level: 1 },
  });

  // Step 3 – move temp (99) up to level-3
  await prisma.permission.update({
    where: { id: lvl1.id },
    data: { level: 3 },
  });

  // Confirm
  const [newLvl1, newLvl3] = await Promise.all([
    prisma.permission.findUnique({ where: { module_level: { module: moduleName, level: 1 } } }),
    prisma.permission.findUnique({ where: { module_level: { module: moduleName, level: 3 } } }),
  ]);
  console.log(`      After:  level-1="${newLvl1?.name}"  level-3="${newLvl3?.name}"`);
}

async function printCurrentPermissions() {
  const perms = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { level: 'asc' }] });
  console.log('\nCurrent permissions table:');
  let lastModule = '';
  perms.forEach((p) => {
    if (p.module !== lastModule) { console.log(`  [${p.module}]`); lastModule = p.module; }
    console.log(`    level ${p.level}: ${p.name} — ${p.description}`);
  });
}

async function printUserPermissionsForAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    include: { userPermissions: { include: { permission: true } } },
    orderBy: { email: 'asc' },
  });

  if (!admins.length) { console.log('\nNo ADMIN users found.'); return; }

  console.log('\nADMIN user permissions:');
  admins.forEach((u) => {
    console.log(`  ${u.email} (${u.role})`);
    if (u.userPermissions.length === 0) {
      console.log('    ‼️  No UserPermission records — relies solely on ADMIN role bypass');
    } else {
      u.userPermissions.forEach((up) => {
        console.log(`    • ${up.permission.module} level ${up.permission.level}: ${up.permission.name}`);
      });
    }
  });
}

async function ensureAdminHasTechPermission() {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
  if (!admins.length) {
    console.log('\nℹ️  No ADMIN role users found — nothing to assign (ADMIN role bypasses permission checks anyway).');
    return;
  }

  const techLevel3 = await prisma.permission.findUnique({
    where: { module_level: { module: 'TECHNOLOGY', level: 3 } },
  });

  if (!techLevel3) {
    console.log('\n⚠️  TECHNOLOGY level-3 permission record not found — run the seed first.');
    return;
  }

  console.log('\nEnsuring all ADMIN users have TECHNOLOGY level-3 permission...');
  for (const admin of admins) {
    const existing = await prisma.userPermission.findUnique({
      where: { userId_permissionId: { userId: admin.id, permissionId: techLevel3.id } },
    });
    if (existing) {
      console.log(`  ✅  ${admin.email} — already has TECHNOLOGY level-3`);
    } else {
      await prisma.userPermission.create({
        data: { userId: admin.id, permissionId: techLevel3.id, grantedBy: 'system' },
      });
      console.log(`  ➕  ${admin.email} — granted TECHNOLOGY level-3`);
    }
  }
}

async function main() {
  console.log('🔧 Fixing permission levels...\n');

  await printCurrentPermissions();

  console.log('\nSwapping levels for affected modules:');
  await swapLevels('TECHNOLOGY');
  await swapLevels('MAINTENANCE');

  await printCurrentPermissions();
  await printUserPermissionsForAdmins();
  await ensureAdminHasTechPermission();

  console.log('\n✅ Done. Re-run the seed (npx prisma db seed) to also update names/descriptions.');
}

main()
  .catch((e) => { console.error('❌ Script failed:', e); process.exit(1); })
  .finally(async () => { await pool.end(); await prisma.$disconnect(); });
