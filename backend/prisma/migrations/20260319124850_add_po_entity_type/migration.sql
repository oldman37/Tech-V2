-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "entityType" TEXT;

-- CreateIndex
CREATE INDEX "purchase_orders_entityType_idx" ON "purchase_orders"("entityType");
