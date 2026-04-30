-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "disposalDate" TIMESTAMP(3),
ADD COLUMN     "fundingSource" TEXT,
ADD COLUMN     "officeLocationId" TEXT,
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "inventory_import_jobs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalRows" INTEGER NOT NULL,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "importedBy" TEXT NOT NULL,
    "importedByName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_import_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_export_jobs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "format" TEXT NOT NULL,
    "filters" JSONB,
    "exportedBy" TEXT NOT NULL,
    "exportedByName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_import_jobs_status_idx" ON "inventory_import_jobs"("status");

-- CreateIndex
CREATE INDEX "inventory_import_jobs_importedBy_idx" ON "inventory_import_jobs"("importedBy");

-- CreateIndex
CREATE INDEX "inventory_import_jobs_startedAt_idx" ON "inventory_import_jobs"("startedAt");

-- CreateIndex
CREATE INDEX "inventory_import_items_jobId_idx" ON "inventory_import_items"("jobId");

-- CreateIndex
CREATE INDEX "inventory_import_items_status_idx" ON "inventory_import_items"("status");

-- CreateIndex
CREATE INDEX "inventory_export_jobs_status_idx" ON "inventory_export_jobs"("status");

-- CreateIndex
CREATE INDEX "inventory_export_jobs_exportedBy_idx" ON "inventory_export_jobs"("exportedBy");

-- CreateIndex
CREATE INDEX "inventory_export_jobs_startedAt_idx" ON "inventory_export_jobs"("startedAt");

-- CreateIndex
CREATE INDEX "equipment_officeLocationId_idx" ON "equipment"("officeLocationId");

-- CreateIndex
CREATE INDEX "equipment_isDisposed_idx" ON "equipment"("isDisposed");

-- CreateIndex
CREATE INDEX "equipment_categoryId_idx" ON "equipment"("categoryId");

-- CreateIndex
CREATE INDEX "equipment_roomId_idx" ON "equipment"("roomId");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_import_jobs" ADD CONSTRAINT "inventory_import_jobs_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_import_items" ADD CONSTRAINT "inventory_import_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "inventory_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_import_items" ADD CONSTRAINT "inventory_import_items_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
