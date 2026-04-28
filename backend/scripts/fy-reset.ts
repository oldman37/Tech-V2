/**
 * fy-reset.ts — Undo the most recent fiscal year rollover (for testing).
 *
 * Dry-run (default): shows what WOULD happen.
 * Live run:          npx tsx scripts/fy-reset.ts --force
 */
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Hardcoded fallback when no "previous" history record exists ──────────────
const FALLBACK_FY = {
  fiscalYear: '2026-2027',
  fiscalYearStart: new Date('2026-07-01T00:00:00.000Z'),
  fiscalYearEnd: new Date('2027-06-30T23:59:59.999Z'),
  reqPrefix: 'REQ-2627',
  reqStartNumber: 1,
  poPrefix: 'PO-2627',
  poStartNumber: 1,
};

async function main() {
  const force = process.argv.includes('--force');

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          Fiscal Year Rollover — RESET TOOL           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // ─── Fetch the two most recent history records ───────────────────────────────
  const historyRecords = await prisma.fiscalYearHistory.findMany({
    orderBy: { performedAt: 'desc' },
    take: 2,
  });

  if (historyRecords.length === 0) {
    console.log('❌ No FiscalYearHistory records found — nothing to reset.');
    process.exit(0);
  }

  const latest = historyRecords[0];
  const previousRecord = historyRecords[1] ?? null;

  // Determine what we restore TO
  const restoreTo = previousRecord
    ? {
        fiscalYear: previousRecord.fiscalYear,
        fiscalYearStart: previousRecord.fiscalYearStart,
        fiscalYearEnd: previousRecord.fiscalYearEnd,
        reqNumberPrefix: previousRecord.reqPrefix,
        nextReqNumber: previousRecord.reqStartNumber,
        poNumberPrefix: previousRecord.poPrefix,
        nextPoNumber: previousRecord.poStartNumber,
        source: 'previous history record',
      }
    : {
        fiscalYear: FALLBACK_FY.fiscalYear,
        fiscalYearStart: FALLBACK_FY.fiscalYearStart,
        fiscalYearEnd: FALLBACK_FY.fiscalYearEnd,
        reqNumberPrefix: FALLBACK_FY.reqPrefix,
        nextReqNumber: FALLBACK_FY.reqStartNumber,
        poNumberPrefix: FALLBACK_FY.poPrefix,
        nextPoNumber: FALLBACK_FY.poStartNumber,
        source: 'hardcoded fallback (no prior history)',
      };

  // Count tickets that will be re-stamped
  const ticketsToRestampCount = await prisma.ticket.count({
    where: { fiscalYear: latest.fiscalYear },
  });

  // ─── Print plan ──────────────────────────────────────────────────────────────
  console.log('📋 MOST RECENT ROLLOVER RECORD');
  console.log(`  Rolled-to FY    : ${latest.fiscalYear}`);
  console.log(`  Performed at    : ${latest.performedAt.toISOString().replace('T', ' ').slice(0, 19)}`);
  console.log(`  Tickets carried : ${latest.carriedOverTicketCount}`);
  console.log(`  POs denied      : ${latest.deniedCount}`);
  console.log('');

  console.log('🔄 RESET PLAN');
  console.log(`  Source              : ${restoreTo.source}`);
  console.log(`  Restore FY to       : ${restoreTo.fiscalYear}`);
  console.log(`  FY Start / End      : ${restoreTo.fiscalYearStart.toISOString().slice(0, 10)} → ${restoreTo.fiscalYearEnd.toISOString().slice(0, 10)}`);
  console.log(`  REQ Prefix / Next # : ${restoreTo.reqNumberPrefix} / ${restoreTo.nextReqNumber}`);
  console.log(`  PO Prefix  / Next # : ${restoreTo.poNumberPrefix} / ${restoreTo.nextPoNumber}`);
  console.log(`  Tickets to re-stamp : ${ticketsToRestampCount}  (fiscalYear "${latest.fiscalYear}" → "${restoreTo.fiscalYear}")`);
  console.log(`  History record del  : ${latest.id}  (${latest.fiscalYear})`);
  console.log('');

  if (!force) {
    console.log('⚠️  DRY RUN — pass --force to actually reset');
    console.log('    npx tsx scripts/fy-reset.ts --force');
    console.log('');
    process.exit(0);
  }

  // ─── Execute reset in a transaction ─────────────────────────────────────────
  console.log('🚀 Executing reset...');

  await prisma.$transaction(async (tx) => {
    // a. Update SystemSettings
    await tx.systemSettings.update({
      where: { id: 'singleton' },
      data: {
        currentFiscalYear: restoreTo.fiscalYear,
        fiscalYearStart: restoreTo.fiscalYearStart,
        fiscalYearEnd: restoreTo.fiscalYearEnd,
        reqNumberPrefix: restoreTo.reqNumberPrefix,
        nextReqNumber: restoreTo.nextReqNumber,
        poNumberPrefix: restoreTo.poNumberPrefix,
        nextPoNumber: restoreTo.nextPoNumber,
        lastYearRolloverAt: null,
        lastYearRolloverBy: null,
      },
    });

    // b. Re-stamp tickets back to the previous fiscal year
    const stampResult = await tx.ticket.updateMany({
      where: { fiscalYear: latest.fiscalYear },
      data: { fiscalYear: restoreTo.fiscalYear },
    });

    // c. Delete the latest FiscalYearHistory record
    await tx.fiscalYearHistory.delete({ where: { id: latest.id } });

    console.log(`  ✔ SystemSettings restored to ${restoreTo.fiscalYear}`);
    console.log(`  ✔ ${stampResult.count} tickets re-stamped → ${restoreTo.fiscalYear}`);
    console.log(`  ✔ FiscalYearHistory record deleted (${latest.id})`);
  });

  console.log('');
  console.log('✅ Reset complete. Run fy-verify.ts to confirm the new state.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
