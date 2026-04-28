import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { contains: 'rdevices', mode: 'insensitive' } },
    include: { userPermissions: { include: { permission: true } } },
  });
  if (!user) {
    console.log('User not found');
    return;
  }
  console.log('User:', user.id, user.email, 'Role:', user.role);
  console.log('Last Login:', user.lastLogin);
  console.log('Last Sync:', user.lastSync);
  console.log('\nAll Permissions:');
  for (const up of user.userPermissions) {
    console.log(
      ' ',
      up.permission.module,
      'Level:',
      up.permission.level,
      up.permission.name,
      '| grantedBy:',
      up.grantedBy,
      '| active:',
      up.permission.isActive
    );
  }
  const reqPerms = user.userPermissions
    .filter(up => up.permission.module === 'REQUISITIONS')
    .sort((a, b) => b.permission.level - a.permission.level);
  console.log('\nHighest REQUISITIONS level:', reqPerms[0]?.permission.level ?? 0);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
