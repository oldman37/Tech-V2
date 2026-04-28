import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const tickets = await prisma.ticket.findMany({
    select: { id: true, ticketNumber: true, department: true, fiscalYear: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log('Total tickets:', tickets.length);
  console.log('\nCurrent numbers:');
  tickets.forEach((t) => console.log(' ', t.ticketNumber, t.department, t.fiscalYear));

  // Build sequential counters per department+fiscalYear
  const counters: Record<string, number> = {};

  for (const t of tickets) {
    const prefix = t.department === 'TECHNOLOGY' ? 'TECH' : 'MAINT';
    const yearPart = t.fiscalYear.split('-')[0] ?? String(new Date().getFullYear());
    const key = `${prefix}-${yearPart}`;
    counters[key] = (counters[key] ?? 0) + 1;
    const newNumber = `${key}-${String(counters[key]).padStart(4, '0')}`;

    // Skip if already correct format
    if (t.ticketNumber === newNumber) {
      console.log(`\n  ${t.ticketNumber} — already correct`);
      continue;
    }

    console.log(`\n  ${t.ticketNumber} → ${newNumber}`);
    await prisma.ticket.update({
      where: { id: t.id },
      data: { ticketNumber: newNumber },
    });
  }

  console.log('\nDone! All tickets renumbered.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
