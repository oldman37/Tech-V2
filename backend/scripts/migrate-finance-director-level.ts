/**
 * migrate-finance-director-level.ts
 *
 * Diagnostic and targeted migration script for the Finance Director level mismatch.
 *
 * Background
 * ----------
 * During the Sprint C-2 PO workflow refactor, REQUISITIONS permission levels were
 * shifted to insert a separate "PO Entry" function at level 4:
 *
 *   Old:  level 4 = Finance Director (approves supervisor_approved → finance_director_approved)
 *   New:  level 4 = PO Entry         (no /approve; issues PO number after DOS approval)
 *         level 5 = Director of Finance (approves supervisor_approved → finance_director_approved)
 *         level 6 = Director of Schools (approves finance_director_approved → dos_approved)
 *
 * The seed upserted the level-4 record to rename it "PO Entry" and created new level-5 and
 * level-6 records, but did NOT migrate existing UserPermission rows. Any Finance Director user
 * who was granted REQUISITIONS access during or before Sprint C-2 still points to the level-4
 * permission record ("PO Entry") and is blocked by the service-level check (permLevel >= 5).
 *
 * Usage
 * -----
 * Run to see which users are still at level 4:
 *   npx tsx scripts/migrate-finance-director-level.ts
 *
 * After reviewing the output, update users ONE AT A TIME using the commented block below.
 * Not every level-4 user should be promoted — actual PO Entry / Bookkeeper staff should
 * remain at level 4. Admin must determine the correct target level per user.
 *
 * Run:
 *   cd backend
 *   npx tsx scripts/migrate-finance-director-level.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main(): Promise<void> {
  // ── Locate the two key permission records ──────────────────────────────
  const level4Perm = await prisma.permission.findUnique({
    where: { module_level: { module: 'REQUISITIONS', level: 4 } },
  });
  const level5Perm = await prisma.permission.findUnique({
    where: { module_level: { module: 'REQUISITIONS', level: 5 } },
  });

  if (!level4Perm || !level5Perm) {
    console.error('❌ Could not find REQUISITIONS level-4 or level-5 permission records.');
    console.error('   Make sure the seed has been run: npx tsx prisma/seed.ts');
    process.exit(1);
  }

  console.log(`Level 4 record: id=${level4Perm.id}  name="${level4Perm.name}"  isActive=${level4Perm.isActive}`);
  console.log(`Level 5 record: id=${level5Perm.id}  name="${level5Perm.name}"  isActive=${level5Perm.isActive}`);
  console.log('');

  // ── Find all users currently assigned to REQUISITIONS level 4 ──────────
  const affected = await prisma.userPermission.findMany({
    where: { permissionId: level4Perm.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
        },
      },
    },
  });

  if (affected.length === 0) {
    console.log('✅ No users found at REQUISITIONS level 4. No migration needed.');
    return;
  }

  console.log(`Found ${affected.length} user(s) currently assigned to REQUISITIONS level 4 ("${level4Perm.name}"):`);
  console.log('');
  for (const up of affected) {
    console.log(
      `  id=${up.user.id}  email=${up.user.email}  name="${up.user.firstName ?? ''} ${up.user.lastName ?? ''}".trimEnd()  title="${up.user.jobTitle ?? '(none)'}"`,
    );
  }

  console.log('');
  console.log('─'.repeat(72));
  console.log('ACTION REQUIRED: Review the list above.');
  console.log('  • Users who are Finance Directors / financial approvers → promote to level 5');
  console.log('  • Users who are Bookkeepers / PO Entry staff             → leave at level 4');
  console.log('─'.repeat(72));
  console.log('');
  console.log('To promote a specific user, un-comment and run the block below.');
  console.log('Replace USER_EMAIL with the actual email address.');

  // ── Targeted promotion template ───────────────────────────────────────
  // Un-comment, set USER_EMAIL, re-run to promote one user at a time.
  //
  // const targetEmail = 'USER_EMAIL';
  // const targetUser = affected.find((up) => up.user.email === targetEmail);
  // if (!targetUser) {
  //   console.error(`User "${targetEmail}" not found in level-4 list.`);
  //   process.exit(1);
  // }
  // await prisma.userPermission.update({
  //   where: { id: targetUser.id },
  //   data:  { permissionId: level5Perm.id },
  // });
  // console.log(`✅ Promoted ${targetEmail} from REQUISITIONS level 4 → level 5 ("${level5Perm.name}")`);
}

main()
  .catch((e: unknown) => {
    console.error('❌ Migration script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
