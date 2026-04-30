-- AlterTable
ALTER TABLE "users" ADD COLUMN     "primaryRoomId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_primaryRoomId_fkey" FOREIGN KEY ("primaryRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
