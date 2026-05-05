import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * One-time data fix: transition FieldTripTransportationRequest records from
 * DRAFT → PENDING_TRANSPORTATION where the parent trip is already APPROVED.
 *
 * These records were saved before the approve() service method gained the
 * automatic status promotion added in fieldTrip.service.ts.
 *
 * Run once: npx ts-node -r tsconfig-paths/register scripts/_fix_transport_draft_status.ts
 */
async function main() {
  const result = await prisma.fieldTripTransportationRequest.updateMany({
    where: {
      status: 'DRAFT',
      fieldTripRequest: {
        status: 'APPROVED',
      },
    },
    data: {
      status: 'PENDING_TRANSPORTATION',
      submittedAt: new Date(),
    },
  });

  console.log(`Updated ${result.count} FieldTripTransportationRequest record(s) from DRAFT → PENDING_TRANSPORTATION`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
