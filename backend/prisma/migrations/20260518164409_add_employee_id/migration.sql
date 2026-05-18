-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employeeId" TEXT;

-- CreateIndex
CREATE INDEX "users_employeeId_idx" ON "users"("employeeId");
