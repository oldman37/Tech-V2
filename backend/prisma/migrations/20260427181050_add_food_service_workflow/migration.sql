-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "workflowType" TEXT NOT NULL DEFAULT 'standard';

-- CreateIndex
CREATE INDEX "purchase_orders_workflowType_idx" ON "purchase_orders"("workflowType");
