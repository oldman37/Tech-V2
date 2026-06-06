-- AlterTable
ALTER TABLE "device_carts" ALTER COLUMN "tagNumber" DROP NOT NULL,
ALTER COLUMN "tagNumber" DROP DEFAULT,
ALTER COLUMN "tagNumber" SET DATA TYPE VARCHAR(100);

-- CreateTable
CREATE TABLE "transportation_units" (
    "id" TEXT NOT NULL,
    "unitNumber" VARCHAR(50) NOT NULL,
    "vin" VARCHAR(17),
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "type" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "currentMileage" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "licensePlate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transportation_fuel_stations" (
    "id" TEXT NOT NULL,
    "officeLocationId" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_fuel_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_consumption_entries" (
    "id" TEXT NOT NULL,
    "transportationUnitId" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "fuelStationId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelAmount" DECIMAL(10,3) NOT NULL,
    "fuelUnit" TEXT NOT NULL DEFAULT 'gallons',
    "mileageAtFueling" INTEGER NOT NULL,
    "costPerUnit" DECIMAL(10,4),
    "totalCost" DECIMAL(10,2),
    "reportingMonth" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_consumption_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transportation_unit_assignments" (
    "id" TEXT NOT NULL,
    "transportationUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "unassignedAt" TIMESTAMP(3),
    "unassignedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_unit_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dot_physicals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "examinerId" TEXT,
    "examinerCertNumber" TEXT,
    "certificateNumber" TEXT,
    "documentUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "remindersSent" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dot_physicals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transportation_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "financeDirectorEmail" TEXT,
    "directorOfSchoolsEmail" TEXT,
    "transportationSecretaryEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dotPhysicalReminderDays" JSONB NOT NULL DEFAULT '[60,30,14,7]',
    "dotNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyFuelReportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyFuelReportDay" INTEGER NOT NULL DEFAULT 1,
    "gasFuelThresholdEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gasFuelThresholdGallons" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transportation_units_unitNumber_key" ON "transportation_units"("unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "transportation_units_vin_key" ON "transportation_units"("vin");

-- CreateIndex
CREATE INDEX "transportation_units_unitNumber_idx" ON "transportation_units"("unitNumber");

-- CreateIndex
CREATE INDEX "transportation_units_type_idx" ON "transportation_units"("type");

-- CreateIndex
CREATE INDEX "transportation_units_fuelType_idx" ON "transportation_units"("fuelType");

-- CreateIndex
CREATE INDEX "transportation_units_isActive_idx" ON "transportation_units"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "transportation_fuel_stations_officeLocationId_key" ON "transportation_fuel_stations"("officeLocationId");

-- CreateIndex
CREATE INDEX "transportation_fuel_stations_officeLocationId_idx" ON "transportation_fuel_stations"("officeLocationId");

-- CreateIndex
CREATE INDEX "transportation_fuel_stations_isActive_idx" ON "transportation_fuel_stations"("isActive");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_transportationUnitId_idx" ON "fuel_consumption_entries"("transportationUnitId");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_enteredById_idx" ON "fuel_consumption_entries"("enteredById");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_fuelStationId_idx" ON "fuel_consumption_entries"("fuelStationId");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_reportingMonth_idx" ON "fuel_consumption_entries"("reportingMonth");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_entryDate_idx" ON "fuel_consumption_entries"("entryDate");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_transportationUnitId_reportingMont_idx" ON "fuel_consumption_entries"("transportationUnitId", "reportingMonth");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_enteredById_reportingMonth_idx" ON "fuel_consumption_entries"("enteredById", "reportingMonth");

-- CreateIndex
CREATE INDEX "transportation_unit_assignments_transportationUnitId_idx" ON "transportation_unit_assignments"("transportationUnitId");

-- CreateIndex
CREATE INDEX "transportation_unit_assignments_userId_idx" ON "transportation_unit_assignments"("userId");

-- CreateIndex
CREATE INDEX "transportation_unit_assignments_userId_unassignedAt_idx" ON "transportation_unit_assignments"("userId", "unassignedAt");

-- CreateIndex
CREATE INDEX "transportation_unit_assignments_assignedAt_idx" ON "transportation_unit_assignments"("assignedAt");

-- CreateIndex
CREATE INDEX "dot_physicals_userId_idx" ON "dot_physicals"("userId");

-- CreateIndex
CREATE INDEX "dot_physicals_expirationDate_idx" ON "dot_physicals"("expirationDate");

-- CreateIndex
CREATE INDEX "dot_physicals_isActive_idx" ON "dot_physicals"("isActive");

-- CreateIndex
CREATE INDEX "dot_physicals_userId_isActive_idx" ON "dot_physicals"("userId", "isActive");

-- CreateIndex
CREATE INDEX "dot_physicals_expirationDate_isActive_idx" ON "dot_physicals"("expirationDate", "isActive");

-- AddForeignKey
ALTER TABLE "transportation_fuel_stations" ADD CONSTRAINT "transportation_fuel_stations_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_fuel_stations" ADD CONSTRAINT "transportation_fuel_stations_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_consumption_entries" ADD CONSTRAINT "fuel_consumption_entries_transportationUnitId_fkey" FOREIGN KEY ("transportationUnitId") REFERENCES "transportation_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_consumption_entries" ADD CONSTRAINT "fuel_consumption_entries_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_consumption_entries" ADD CONSTRAINT "fuel_consumption_entries_fuelStationId_fkey" FOREIGN KEY ("fuelStationId") REFERENCES "transportation_fuel_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_unit_assignments" ADD CONSTRAINT "transportation_unit_assignments_transportationUnitId_fkey" FOREIGN KEY ("transportationUnitId") REFERENCES "transportation_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_unit_assignments" ADD CONSTRAINT "transportation_unit_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_unit_assignments" ADD CONSTRAINT "transportation_unit_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_unit_assignments" ADD CONSTRAINT "transportation_unit_assignments_unassignedById_fkey" FOREIGN KEY ("unassignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dot_physicals" ADD CONSTRAINT "dot_physicals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dot_physicals" ADD CONSTRAINT "dot_physicals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
