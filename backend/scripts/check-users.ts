import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkUsers() {
  const users = await prisma.user.findMany();
  
  console.log('\n=== Current Users ===');
  users.forEach(u => {
    console.log(`${u.email} - Role: ${u.role} - Active: ${u.isActive}`);
  });
  console.log('');
  
  await pool.end();
  await prisma.$disconnect();
}

checkUsers();
