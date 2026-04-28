import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         Fiscal Year Rollover Verification            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // ─── SYSTEM SETTINGS ────────────────────────────────────────────────────────
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 'singleton' },
    select: {
      currentFiscalYear: true,
      fiscalYearStart: true,
      fiscalYearEnd: true,
      nextReqNumber: true,
      nextPoNumber: true,
      reqNumberPrefix: true,
      poNumberPrefix: true,
    },
  });

  console.log('📅 SYSTEM SETTINGS');
  if (settings) {
    const fyStart = settings.fiscalYearStart
      ? settings.fiscalYearStart.toISOString().slice(0, 10)
      : 'not set';
    const fyEnd = settings.fiscalYearEnd
      ? settings.fiscalYearEnd.toISOString().slice(0, 10)
      : 'not set';
    console.log(`  Current Fiscal Year : ${settings.currentFiscalYear ?? 'not set'}`);
    console.log(`  FY Start            : ${fyStart}`);
    console.log(`  FY End              : ${fyEnd}`);
    console.log(`  REQ Prefix / Next # : ${settings.reqNumberPrefix} / ${settings.nextReqNumber}`);
    console.log(`  PO Prefix  / Next # : ${settings.poNumberPrefix} / ${settings.nextPoNumber}`);
  } else {
    console.log('  [ERROR] No SystemSettings row found!');
  }

  // ─── FISCAL YEAR HISTORY ─────────────────────────────────────────────────────
  const history = await prisma.fiscalYearHistory.findMany({
    orderBy: { performedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      fiscalYear: true,
      carriedOverTicketCount: true,
      deniedCount: true,
      performedAt: true,
    },
  });

  console.log('');
  console.log('📋 FISCAL YEAR HISTORY');
  if (history.length === 0) {
    console.log('  (no history records)');
  } else {
    for (const h of history) {
      const rolledAt = h.performedAt.toISOString().replace('T', ' ').slice(0, 19);
      console.log(
        `  ${h.fiscalYear}  |  rolled over on ${rolledAt}  |  ${h.carriedOverTicketCount} tickets carried  |  ${h.deniedCount} POs denied`,
      );
    }
  }

  // ─── TICKETS BY FISCAL YEAR ──────────────────────────────────────────────────
  const ticketGroups = await prisma.ticket.groupBy({
    by: ['fiscalYear', 'status'],
    _count: true,
    orderBy: [{ fiscalYear: 'desc' }],
  });

  const fyMap = new Map<string, Record<string, number>>();
  for (const g of ticketGroups) {
    const fy = g.fiscalYear ?? '(none)';
    if (!fyMap.has(fy)) fyMap.set(fy, {});
    fyMap.get(fy)![g.status] = g._count;
  }

  const statuses = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];

  console.log('');
  console.log('🎫 TICKETS BY FISCAL YEAR');
  if (fyMap.size === 0) {
    console.log('  (no tickets found)');
  } else {
    for (const [fy, counts] of fyMap) {
      const parts = statuses.map((s) => `${s}=${counts[s] ?? 0}`);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`  ${fy} : ${parts.join('  ')}  [total: ${total}]`);
    }
  }

  // ─── ACTIVE POs ──────────────────────────────────────────────────────────────
  const activePoCount = await prisma.purchase_orders.count({
    where: { status: { notIn: ['po_issued', 'denied'] } },
  });

  console.log('');
  console.log('📄 PURCHASE ORDERS (non-terminal)');
  console.log(`  Active POs still in pipeline: ${activePoCount}`);

  // ─── VERIFICATION CHECKS ─────────────────────────────────────────────────────
  console.log('');
  console.log('✅ VERIFICATION CHECKS');

  // Check 1: currentFiscalYear is set
  const hasFY = !!(settings?.currentFiscalYear);
  console.log(`  [${hasFY ? 'PASS' : 'FAIL'}] SystemSettings has a currentFiscalYear set`);

  // Check 2: Most recent FY history matches currentFiscalYear
  const latestHistory = history[0];
  if (history.length === 0) {
    console.log('  [WARN] No FY history records — cannot verify match');
  } else {
    const historyMatchesFY = latestHistory.fiscalYear === settings?.currentFiscalYear;
    const label = historyMatchesFY ? 'PASS' : 'FAIL';
    console.log(
      `  [${label}] Most recent FY history matches currentFiscalYear` +
      ` (history="${latestHistory.fiscalYear}" vs settings="${settings?.currentFiscalYear ?? 'null'}")`,
    );
  }

  // Check 3: No tickets in fiscal years newer than currentFiscalYear
  const currentFY = settings?.currentFiscalYear ?? '';
  let hasFutureFyTickets = false;
  for (const fy of fyMap.keys()) {
    if (fy !== '(none)' && fy > currentFY) {
      hasFutureFyTickets = true;
      break;
    }
  }
  console.log(
    `  [${hasFutureFyTickets ? 'FAIL' : 'PASS'}] No tickets in future fiscal years`,
  );

  // Check 4: Active POs
  if (activePoCount === 0) {
    console.log('  [WARN] No active POs in pipeline (may be expected)');
  } else {
    console.log(`  [PASS] Active POs exist: ${activePoCount}`);
  }

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
