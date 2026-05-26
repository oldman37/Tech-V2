-- AlterTable
ALTER TABLE "inventory_audit_items" ADD COLUMN     "isAddition" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previousLocationId" TEXT,
ADD COLUMN     "previousRoomId" TEXT;

-- AlterTable
ALTER TABLE "inventory_audit_sessions" ADD COLUMN     "additionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "inventory_audit_items_isAddition_idx" ON "inventory_audit_items"("isAddition");
