import { prisma as p } from '../src/lib/prisma';

async function main() {
  const fsPOs = await p.purchase_orders.findMany({
    where: { workflowType: 'food_service', status: { not: 'draft' } },
    select: {
      id: true, status: true, workflowType: true, description: true, reqNumber: true,
      statusHistory: {
        orderBy: { changedAt: 'desc' as const },
        select: { fromStatus: true, toStatus: true, changedById: true, changedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log(`Found ${fsPOs.length} non-draft food_service POs\n`);
  for (const po of fsPOs) {
    console.log('---');
    console.log(`PO: ${po.reqNumber} | ${po.description} | Status: ${po.status} | Workflow: ${po.workflowType}`);
    console.log('History:');
    for (const h of po.statusHistory) {
      console.log(`  ${h.fromStatus} -> ${h.toStatus} by ${h.changedById} at ${h.changedAt}`);
    }
  }

  // Check the DOS user's groups
  const dosGroupId = process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID;
  console.log(`\nDOS Group ID from env: ${dosGroupId}`);
}

main().catch(console.error).finally(() => p.$disconnect());
