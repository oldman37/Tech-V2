const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'jlewis@ocboe.com' }, select: { id: true, primaryRoomId: true } });
  console.log('User:', JSON.stringify(user));
  if (!user) { await prisma.$disconnect(); return; }
  const userEq = await prisma.equipment.count({ where: { assignedToUserId: user.id, isDisposed: false } });
  console.log('User-assigned count:', userEq);
  if (user.primaryRoomId) {
    const roomEq = await prisma.equipment.count({ where: { roomId: user.primaryRoomId, isDisposed: false } });
    console.log('Room-assigned count:', roomEq);
    const total = await prisma.equipment.count({ where: { isDisposed: false, OR: [{ assignedToUserId: user.id }, { roomId: user.primaryRoomId }] } });
    console.log('Combined (deduped) total:', total);
  } else {
    console.log('No primaryRoomId set');
  }
  await prisma.$disconnect();
}
main().catch(console.error);
