import { prisma } from '../src/lib/prisma';

async function checkUser(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!user) {
      console.log(`❌ User ${email} not found`);
      return;
    }

    console.log('\n📋 User Information:');
    console.log('─'.repeat(50));
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.displayName || `${user.firstName} ${user.lastName}`}`);
    console.log(`Job Title: ${user.jobTitle || 'N/A'}`);
    console.log(`Department: ${user.department || 'N/A'}`);
    console.log(`Office Location: ${user.officeLocation || 'N/A'}`);
    console.log(`Role: ${user.role}`);
    console.log(`Active: ${user.isActive}`);
    console.log(`Last Login: ${user.lastLogin || 'Never'}`);

    console.log('\n🔐 Permissions:');
    console.log('─'.repeat(50));
    if (user.permissions.length === 0) {
      console.log('❌ No permissions assigned');
    } else {
      user.permissions.forEach((up) => {
        console.log(`✓ ${up.permission.name} (${up.permission.module} - ${up.permission.level})`);
      });
    }

    console.log('\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'jlewis@ocboe.com';
checkUser(email);
