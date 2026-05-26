-- CreateTable
CREATE TABLE "fiscal_year_audits" (
    "id" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "startedById" TEXT NOT NULL,
    "startedByName" TEXT NOT NULL,
    "totalLocations" INTEGER NOT NULL DEFAULT 0,
    "completedLocations" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_year_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_year_location_statuses" (
    "id" TEXT NOT NULL,
    "fiscalYearAuditId" TEXT NOT NULL,
    "officeLocationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedByName" TEXT,
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "auditedRooms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_year_location_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_year_audits_status_idx" ON "fiscal_year_audits"("status");

-- CreateIndex
CREATE INDEX "fiscal_year_audits_fiscalYear_idx" ON "fiscal_year_audits"("fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_year_audits_fiscalYear_key" ON "fiscal_year_audits"("fiscalYear");

-- CreateIndex
CREATE INDEX "fiscal_year_location_statuses_fiscalYearAuditId_idx" ON "fiscal_year_location_statuses"("fiscalYearAuditId");

-- CreateIndex
CREATE INDEX "fiscal_year_location_statuses_officeLocationId_idx" ON "fiscal_year_location_statuses"("officeLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_year_location_statuses_fiscalYearAuditId_officeLocat_key" ON "fiscal_year_location_statuses"("fiscalYearAuditId", "officeLocationId");

-- AddForeignKey
ALTER TABLE "fiscal_year_audits" ADD CONSTRAINT "fiscal_year_audits_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_year_location_statuses" ADD CONSTRAINT "fiscal_year_location_statuses_fiscalYearAuditId_fkey" FOREIGN KEY ("fiscalYearAuditId") REFERENCES "fiscal_year_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_year_location_statuses" ADD CONSTRAINT "fiscal_year_location_statuses_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_year_location_statuses" ADD CONSTRAINT "fiscal_year_location_statuses_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
