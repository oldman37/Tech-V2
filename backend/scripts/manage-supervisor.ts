import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function manageSupervisor() {
  try {
    const action = process.argv[2]; // 'add' or 'remove'
    const userEmail = process.argv[3];
    const supervisorEmail = process.argv[4];

    if (!action || !userEmail || !supervisorEmail) {
      console.log('Usage:');
      console.log('  Add supervisor:    npx tsx scripts/manage-supervisor.ts add <user-email> <supervisor-email>');
      console.log('  Remove supervisor: npx tsx scripts/manage-supervisor.ts remove <user-email> <supervisor-email>');
      console.log('\nExamples:');
      console.log('  npx tsx scripts/manage-supervisor.ts add jdoe@ocboe.com bsimmons@ocboe.com');
      console.log('  npx tsx scripts/manage-supervisor.ts remove jdoe@ocboe.com bsimmons@ocboe.com');
      return;
    }

    if (action !== 'add' && action !== 'remove') {
      console.error('Error: Action must be either "add" or "remove"');
      return;
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, displayName: true, email: true, officeLocation: true }
    });

    if (!user) {
      console.error(`Error: User not found: ${userEmail}`);
      return;
    }

    // Find the supervisor
    const supervisor = await prisma.user.findUnique({
      where: { email: supervisorEmail },
      select: { id: true, displayName: true, email: true, officeLocation: true }
    });

    if (!supervisor) {
      console.error(`Error: Supervisor not found: ${supervisorEmail}`);
      return;
    }

    // Check if user is trying to be their own supervisor
    if (user.id === supervisor.id) {
      console.error('Error: A user cannot be their own supervisor');
      return;
    }

    if (action === 'add') {
      // Check if assignment already exists
      const existing = await prisma.userSupervisor.findFirst({
        where: {
          userId: user.id,
          supervisorId: supervisor.id
        }
      });

      if (existing) {
        console.log(`\n⚠️  Supervisor assignment already exists:`);
        console.log(`   User: ${user.displayName} (${user.email})`);
        console.log(`   Supervisor: ${supervisor.displayName} (${supervisor.email})`);
        console.log(`   Assigned: ${existing.assignedAt.toLocaleDateString()}`);
        return;
      }

      // Find matching location if possible
      let locationId: string | null = null;
      if (user.officeLocation && supervisor.officeLocation === user.officeLocation) {
        const location = await prisma.officeLocation.findFirst({
          where: {
            name: { equals: user.officeLocation, mode: 'insensitive' }
          }
        });
        if (location) {
          locationId = location.id;
        }
      }

      // Create the assignment
      const assignment = await prisma.userSupervisor.create({
        data: {
          userId: user.id,
          supervisorId: supervisor.id,
          locationId,
          isPrimary: false, // Manual assignments default to non-primary
          assignedBy: 'MANUAL',
          notes: 'Manually assigned via manage-supervisor script'
        }
      });

      console.log(`\n✅ Supervisor assigned successfully:`);
      console.log(`   User: ${user.displayName} (${user.email})`);
      console.log(`   Office: ${user.officeLocation || 'Not set'}`);
      console.log(`   Supervisor: ${supervisor.displayName} (${supervisor.email})`);
      console.log(`   Supervisor Office: ${supervisor.officeLocation || 'Not set'}`);
      console.log(`   Assigned: ${assignment.assignedAt.toLocaleDateString()}`);
      if (locationId) {
        console.log(`   Location Match: Yes`);
      }

    } else if (action === 'remove') {
      // Find the assignment
      const assignment = await prisma.userSupervisor.findFirst({
        where: {
          userId: user.id,
          supervisorId: supervisor.id
        }
      });

      if (!assignment) {
        console.log(`\n⚠️  No supervisor assignment found:`);
        console.log(`   User: ${user.displayName} (${user.email})`);
        console.log(`   Supervisor: ${supervisor.displayName} (${supervisor.email})`);
        return;
      }

      // Delete the assignment
      await prisma.userSupervisor.delete({
        where: { id: assignment.id }
      });

      console.log(`\n✅ Supervisor assignment removed:`);
      console.log(`   User: ${user.displayName} (${user.email})`);
      console.log(`   Supervisor: ${supervisor.displayName} (${supervisor.email})`);
      console.log(`   Was assigned: ${assignment.assignedAt.toLocaleDateString()}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the script
manageSupervisor();
