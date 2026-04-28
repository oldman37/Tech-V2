import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * This script removes incorrect supervisor assignments.
 * 
 * Schools should only have:
 * - PRINCIPAL (specific to that school)
 * - VICE_PRINCIPAL (specific to that school)
 * 
 * Department locations should only have their specific director/supervisor.
 * 
 * District-wide supervisors (Director of Schools, Finance, Tech, etc.) 
 * should NOT be assigned to every location.
 */

async function main() {
  console.log('🧹 Fixing supervisor assignments...\n');

  // Get all locations
  const locations = await prisma.officeLocation.findMany({
    include: {
      supervisors: {
        include: {
          user: true,
        },
      },
    },
  });

  let removedCount = 0;

  for (const location of locations) {
    console.log(`\n📍 ${location.name} (${location.type})`);
    
    if (location.type === 'SCHOOL') {
      // For schools, remove all supervisors EXCEPT Principal and Vice Principal
      const toRemove = location.supervisors.filter(
        (s) => s.supervisorType !== 'PRINCIPAL' && s.supervisorType !== 'VICE_PRINCIPAL'
      );

      if (toRemove.length > 0) {
        console.log(`   Removing ${toRemove.length} incorrect supervisor(s):`);
        for (const sup of toRemove) {
          const name = sup.user.displayName || `${sup.user.firstName} ${sup.user.lastName}`;
          console.log(`   - ${name} (${sup.supervisorType})`);
          
          await prisma.locationSupervisor.delete({
            where: { id: sup.id },
          });
          removedCount++;
        }
      } else {
        console.log('   ✓ No incorrect assignments');
      }
    } else if (location.type === 'DEPARTMENT') {
      // For departments, this is trickier. We need to know which departments should have which supervisors.
      // For now, let's identify common issues:
      
      // Remove duplicate supervisors (same type assigned multiple times)
      const supervisorTypeCount = new Map<string, number>();
      const toRemove: typeof location.supervisors = [];
      
      for (const sup of location.supervisors) {
        const count = supervisorTypeCount.get(sup.supervisorType) || 0;
        supervisorTypeCount.set(sup.supervisorType, count + 1);
        
        // If this is a duplicate (not the primary one), mark for removal
        if (count > 0 && !sup.isPrimary) {
          toRemove.push(sup);
        }
      }

      // Also check if the department has supervisors that don't match its purpose
      // For example, "Finance Director" department shouldn't have Tech Directors
      const deptName = location.name.toLowerCase();
      
      for (const sup of location.supervisors) {
        const supType = sup.supervisorType.toLowerCase();
        
        // Check for obvious mismatches
        if (
          (deptName.includes('technology') && !supType.includes('technology')) ||
          (deptName.includes('finance') && !supType.includes('finance')) ||
          (deptName.includes('maintenance') && !supType.includes('maintenance')) ||
          (deptName.includes('transportation') && !supType.includes('transportation')) ||
          (deptName.includes('afterschool') && !supType.includes('afterschool')) ||
          (deptName.includes('sped') && !supType.includes('sped')) ||
          (deptName.includes('nurse') && !supType.includes('nurse')) ||
          (deptName.includes('cte') && !supType.includes('cte'))
        ) {
          if (!toRemove.includes(sup)) {
            toRemove.push(sup);
          }
        }
      }

      if (toRemove.length > 0) {
        console.log(`   Removing ${toRemove.length} incorrect supervisor(s):`);
        for (const sup of toRemove) {
          const name = sup.user.displayName || `${sup.user.firstName} ${sup.user.lastName}`;
          console.log(`   - ${name} (${sup.supervisorType})`);
          
          await prisma.locationSupervisor.delete({
            where: { id: sup.id },
          });
          removedCount++;
        }
      } else {
        console.log('   ✓ No incorrect assignments');
      }
    } else if (location.type === 'DISTRICT_OFFICE') {
      // District Office should only have Director of Schools
      const toRemove = location.supervisors.filter(
        (s) => s.supervisorType !== 'DIRECTOR_OF_SCHOOLS'
      );

      if (toRemove.length > 0) {
        console.log(`   Removing ${toRemove.length} incorrect supervisor(s):`);
        for (const sup of toRemove) {
          const name = sup.user.displayName || `${sup.user.firstName} ${sup.user.lastName}`;
          console.log(`   - ${name} (${sup.supervisorType})`);
          
          await prisma.locationSupervisor.delete({
            where: { id: sup.id },
          });
          removedCount++;
        }
      } else {
        console.log('   ✓ No incorrect assignments');
      }
    }
  }

  console.log(`\n\n✅ Cleanup complete! Removed ${removedCount} incorrect supervisor assignments.`);
  console.log('\nRun "npx tsx scripts/check-supervisor-assignments.ts" to verify the changes.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
