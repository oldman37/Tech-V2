-- AlterTable
ALTER TABLE "fuel_consumption_entries" ADD COLUMN     "tankId" TEXT;

-- CreateTable
CREATE TABLE "fuel_tanks" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "label" VARCHAR(100),
    "fuelType" TEXT NOT NULL,
    "capacityGallons" DECIMAL(10,2) NOT NULL,
    "currentFillGallons" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "alertThresholdPercent" INTEGER NOT NULL DEFAULT 30,
    "alertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_tanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_tank_deliveries" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gallonsDelivered" DECIMAL(10,2) NOT NULL,
    "vendorName" VARCHAR(200),
    "invoiceNumber" VARCHAR(100),
    "costPerGallon" DECIMAL(10,4),
    "totalCost" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_tank_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_tanks_stationId_idx" ON "fuel_tanks"("stationId");

-- CreateIndex
CREATE INDEX "fuel_tanks_fuelType_idx" ON "fuel_tanks"("fuelType");

-- CreateIndex
CREATE INDEX "fuel_tanks_isActive_idx" ON "fuel_tanks"("isActive");

-- CreateIndex
CREATE INDEX "fuel_tanks_stationId_isActive_idx" ON "fuel_tanks"("stationId", "isActive");

-- CreateIndex
CREATE INDEX "fuel_tank_deliveries_tankId_idx" ON "fuel_tank_deliveries"("tankId");

-- CreateIndex
CREATE INDEX "fuel_tank_deliveries_enteredById_idx" ON "fuel_tank_deliveries"("enteredById");

-- CreateIndex
CREATE INDEX "fuel_tank_deliveries_deliveryDate_idx" ON "fuel_tank_deliveries"("deliveryDate");

-- CreateIndex
CREATE INDEX "fuel_consumption_entries_tankId_idx" ON "fuel_consumption_entries"("tankId");

-- AddForeignKey
ALTER TABLE "fuel_consumption_entries" ADD CONSTRAINT "fuel_consumption_entries_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "fuel_tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "transportation_fuel_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_deliveries" ADD CONSTRAINT "fuel_tank_deliveries_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "fuel_tanks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_deliveries" ADD CONSTRAINT "fuel_tank_deliveries_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
