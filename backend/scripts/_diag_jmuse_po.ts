/**
 * Diagnostic script: Investigate jmuse@ocboe.com PO approval bypass
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const email = 'jmuse@ocboe.com';

  // 1. User info, groups, roles
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (!user) { console.log('User not found'); return; }

  console.log('\n=== USER INFO ===');
  console.log(`ID:          ${user.id}`);
  console.log(`Email:       ${user.email}`);
  console.log(`Name:        ${user.firstName} ${user.lastName}`);
  console.log(`Role:        ${user.role}`);
  console.log(`Groups:      ${JSON.stringify(user.groups)}`);
  console.log(`isActive:    ${user.isActive}`);
  console.log(`Department:  ${user.department}`);
  console.log(`Job Title:   ${user.jobTitle}`);

  // Derive perm level for REQUISITIONS like groupAuth.ts does
  const GROUP_MODULE_MAP_REQUISITIONS: Array<[string, number]> = [
    ['ENTRA_ADMIN_GROUP_ID', 6],
    ['ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID', 6],
    ['ENTRA_FINANCE_DIRECTOR_GROUP_ID', 5],
    ['ENTRA_FINANCE_PO_ENTRY_GROUP_ID', 4],
    ['ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_TECH_ASSISTANTS_GROUP_ID', 3],
    ['ENTRA_PRINCIPALS_GROUP_ID', 3],
    ['ENTRA_VICE_PRINCIPALS_GROUP_ID', 3],
    ['ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_MAINTENANCE_ADMIN_GROUP_ID', 3],
    ['ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_SPED_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_NURSE_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_PRE_K_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_CTE_DIRECTOR_GROUP_ID', 3],
    ['ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID', 3],
    ['ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID', 4],
    ['ENTRA_ALL_STAFF_GROUP_ID', 2],
  ];

  const userGroups = (user.groups as string[]) ?? [];
  let highestReqLevel = 0;
  const matchedGroups: string[] = [];
  for (const [envVar, level] of GROUP_MODULE_MAP_REQUISITIONS) {
    const gid = process.env[envVar];
    if (gid && userGroups.includes(gid)) {
      matchedGroups.push(`${envVar} → level ${level}`);
      if (level > highestReqLevel) highestReqLevel = level;
    }
  }
  console.log(`\n=== DERIVED REQUISITIONS PERM LEVEL: ${highestReqLevel} ===`);
  console.log('Matched groups:');
  matchedGroups.forEach(g => console.log(`  - ${g}`));

  // 2. Supervisor assignments
  console.log('\n=== SUPERVISOR ASSIGNMENTS (UserSupervisor) ===');
  const userSupRecords = await prisma.userSupervisor.findMany({
    where: { userId: user.id },
    include: { supervisor: { select: { id: true, email: true, displayName: true } } },
  });
  if (userSupRecords.length > 0) {
    userSupRecords.forEach(us => {
      console.log(`  - Supervisor: ${us.supervisor.displayName} (${us.supervisor.email}), isPrimary: ${us.isPrimary}`);
      console.log(`    supervisorId === userId? ${us.supervisorId === user.id}`);
    });
  } else {
    console.log('  (none)');
  }

  // 3. Location supervisors this user is assigned to
  const locSupRecords = await prisma.locationSupervisor.findMany({
    where: { userId: user.id },
    include: { location: { select: { id: true, name: true, code: true, type: true } } },
  });
  console.log('\n=== LOCATION SUPERVISOR ASSIGNMENTS ===');
  if (locSupRecords.length > 0) {
    locSupRecords.forEach(ls => {
      console.log(`  - Location: ${ls.location.name} (${ls.location.code}), type: ${ls.location.type}, isPrimary: ${ls.isPrimary}, supervisorType: ${ls.supervisorType}`);
    });
  } else {
    console.log('  (none — standard user)');
  }

  // 4. Recent POs
  const recentPOs = await prisma.purchase_orders.findMany({
    where: { requestorId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      officeLocation: { select: { id: true, name: true, code: true, type: true } },
      statusHistory: {
        orderBy: { changedAt: 'asc' },
        include: { changedBy: { select: { email: true, displayName: true } } },
      },
    },
  });

  console.log(`\n=== RECENT POs (${recentPOs.length}) ===`);
  for (const po of recentPOs) {
    console.log(`\n  PO ${po.reqNumber ?? '(no req#)'} | id: ${po.id}`);
    console.log(`    Status:       ${po.status}`);
    console.log(`    WorkflowType: ${po.workflowType}`);
    console.log(`    Description:  ${po.description}`);
    console.log(`    Amount:       ${po.amount}`);
    console.log(`    Location:     ${po.officeLocation ? `${po.officeLocation.name} (${po.officeLocation.code}, ${po.officeLocation.type})` : '(none)'}`);
    console.log(`    Created:      ${po.createdAt}`);
    console.log(`    Submitted:    ${po.submittedAt}`);

    // Check: Was this PO's location supervisor the user themselves?
    if (po.officeLocationId) {
      const locSup = await prisma.locationSupervisor.findFirst({
        where: {
          locationId: po.officeLocationId,
          isPrimary: true,
        },
        include: { user: { select: { id: true, email: true, displayName: true } } },
      });
      if (locSup) {
        console.log(`    Location Primary Supervisor: ${locSup.user.displayName} (${locSup.user.email}), isSelf: ${locSup.userId === user.id}`);
      } else {
        console.log(`    Location Primary Supervisor: (none found — triggers self-supervisor bypass!)`);
      }

      // Also check for FOOD_SERVICES_SUPERVISOR type specifically if food_service workflow
      if (po.workflowType === 'food_service') {
        const fsSup = await prisma.locationSupervisor.findFirst({
          where: {
            locationId: po.officeLocationId,
            isPrimary: true,
            supervisorType: 'FOOD_SERVICES_SUPERVISOR',
          },
          include: { user: { select: { id: true, email: true, displayName: true } } },
        });
        if (fsSup) {
          console.log(`    FS Supervisor (typed):  ${fsSup.user.displayName} (${fsSup.user.email}), isSelf: ${fsSup.userId === user.id}`);
        } else {
          console.log(`    FS Supervisor (typed):  (NONE found for FOOD_SERVICES_SUPERVISOR type — triggers bypass!)`);
        }
      }
    }

    console.log('    Status History:');
    po.statusHistory.forEach(h => {
      console.log(`      ${h.fromStatus} → ${h.toStatus} by ${h.changedBy?.displayName ?? h.changedBy?.email ?? '?'} at ${h.changedAt}${h.notes ? ` [${h.notes}]` : ''}`);
    });
  }

  // 5. Check supervisorBypassEnabled setting
  const settings = await prisma.settings.findFirst();
  console.log('\n=== SETTINGS ===');
  console.log(`  supervisorBypassEnabled: ${settings?.supervisorBypassEnabled}`);
  console.log(`  supervisorApprovalLevel: ${settings?.supervisorApprovalLevel}`);
  console.log(`  financeDirectorApprovalLevel: ${settings?.financeDirectorApprovalLevel}`);
  console.log(`  dosApprovalLevel: ${settings?.dosApprovalLevel}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
