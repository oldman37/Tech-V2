/**
 * One-time backfill: populate Ticket.categoryId from the existing Ticket.category string.
 *
 * Matches each ticket's category string to a WorkOrderCategory record by name
 * (case-insensitive) within the same module (TECHNOLOGY<->TECHNOLOGY,
 * MAINTENANCE<->MAINTENANCE), then writes the FK.
 *
 * Safe to re-run: skips tickets that already have a categoryId.
 *
 * Usage:
 *   cd C:\Tech-V2\backend
 *   npx tsx scripts/_backfill_ticket_category_id.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: { category: { not: null }, categoryId: null },
    select: { id: true, category: true, department: true },
  });

  console.log(`Found ${tickets.length} ticket(s) needing backfill`);

  let matched = 0;
  let unmatched = 0;

  for (const ticket of tickets) {
    if (!ticket.category) continue;

    const module =
      ticket.department === 'MAINTENANCE' ? 'MAINTENANCE' : 'TECHNOLOGY';

    const cat = await prisma.workOrderCategory.findFirst({
      where: {
        module,
        name: { equals: ticket.category, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (cat) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data:  { categoryId: cat.id },
      });
      matched++;
    } else {
      unmatched++;
    }
  }

  console.log(`Backfill complete: ${matched} matched, ${unmatched} unmatched (no WorkOrderCategory found)`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
