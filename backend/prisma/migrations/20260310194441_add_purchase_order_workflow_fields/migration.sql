-- AlterTable
ALTER TABLE "po_items" ADD COLUMN     "lineNumber" INTEGER,
ADD COLUMN     "model" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "denialReason" TEXT,
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "officeLocationId" TEXT,
ADD COLUMN     "shipTo" TEXT,
ADD COLUMN     "shippingCost" DECIMAL(10,2),
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ALTER COLUMN "poNumber" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'draft',
ALTER COLUMN "submittedDate" DROP NOT NULL,
ALTER COLUMN "submittedDate" DROP DEFAULT;

-- CreateTable
CREATE TABLE "requisition_status_history" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "requisition_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisition_status_history_purchaseOrderId_idx" ON "requisition_status_history"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "requisition_status_history_changedById_idx" ON "requisition_status_history"("changedById");

-- CreateIndex
CREATE INDEX "requisition_status_history_changedAt_idx" ON "requisition_status_history"("changedAt");

-- CreateIndex
CREATE INDEX "purchase_orders_requestorId_idx" ON "purchase_orders"("requestorId");

-- CreateIndex
CREATE INDEX "purchase_orders_officeLocationId_idx" ON "purchase_orders"("officeLocationId");

-- AddForeignKey
ALTER TABLE "requisition_status_history" ADD CONSTRAINT "requisition_status_history_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_status_history" ADD CONSTRAINT "requisition_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
