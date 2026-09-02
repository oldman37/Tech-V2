-- CreateTable
CREATE TABLE "fuel_mileage_baselines" (
    "id" TEXT NOT NULL,
    "transportationUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mileage" INTEGER NOT NULL,
    "asOfMonth" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_mileage_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_mileage_baselines_transportationUnitId_userId_key" ON "fuel_mileage_baselines"("transportationUnitId", "userId");

-- CreateIndex
CREATE INDEX "fuel_mileage_baselines_userId_idx" ON "fuel_mileage_baselines"("userId");

-- AddForeignKey
ALTER TABLE "fuel_mileage_baselines" ADD CONSTRAINT "fuel_mileage_baselines_transportationUnitId_fkey" FOREIGN KEY ("transportationUnitId") REFERENCES "transportation_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_mileage_baselines" ADD CONSTRAINT "fuel_mileage_baselines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_mileage_baselines" ADD CONSTRAINT "fuel_mileage_baselines_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
