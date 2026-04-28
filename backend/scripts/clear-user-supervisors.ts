import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function clearUserSupervisors() {
  try {
    console.log('🗑️  Clearing all user supervisor assignments...\n');

    const deleted = await prisma.userSupervisor.deleteMany({});
    
    console.log(`✅ Deleted ${deleted.count} user supervisor assignments\n`);

  } catch (error) {
    console.error('❌ Error clearing user supervisors:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

clearUserSupervisors();
