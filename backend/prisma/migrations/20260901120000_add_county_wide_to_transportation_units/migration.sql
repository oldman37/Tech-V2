-- AlterTable
ALTER TABLE "transportation_units" ADD COLUMN "isCountyWide" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "transportation_units_isCountyWide_idx" ON "transportation_units"("isCountyWide");
