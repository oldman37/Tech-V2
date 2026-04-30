/*
  Warnings:

  - A unique constraint covering the columns `[barcode]` on the table `equipment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "lastMaintenanceDate" TIMESTAMP(3),
ADD COLUMN     "maintenanceSchedule" TEXT,
ADD COLUMN     "qrCode" TEXT,
ADD COLUMN     "warrantyExpires" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "equipment_attachments" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_history" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "maintenanceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedDate" TIMESTAMP(3) NOT NULL,
    "cost" DECIMAL(10,2),
    "notes" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_attachments_equipmentId_idx" ON "equipment_attachments"("equipmentId");

-- CreateIndex
CREATE INDEX "maintenance_history_equipmentId_idx" ON "maintenance_history"("equipmentId");

-- CreateIndex
CREATE INDEX "maintenance_history_performedDate_idx" ON "maintenance_history"("performedDate");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_barcode_key" ON "equipment"("barcode");

-- CreateIndex
CREATE INDEX "equipment_assignedToUserId_idx" ON "equipment"("assignedToUserId");

-- CreateIndex
CREATE INDEX "equipment_barcode_idx" ON "equipment"("barcode");

-- CreateIndex
CREATE INDEX "equipment_officeLocationId_status_idx" ON "equipment"("officeLocationId", "status");

-- CreateIndex
CREATE INDEX "equipment_categoryId_status_idx" ON "equipment"("categoryId", "status");

-- CreateIndex
CREATE INDEX "inventory_changes_changedBy_idx" ON "inventory_changes"("changedBy");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_attachments" ADD CONSTRAINT "equipment_attachments_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_attachments" ADD CONSTRAINT "equipment_attachments_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
