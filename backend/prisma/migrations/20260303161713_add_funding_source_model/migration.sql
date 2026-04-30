-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "fundingSourceId" TEXT;

-- CreateTable
CREATE TABLE "funding_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funding_sources_name_key" ON "funding_sources"("name");

-- CreateIndex
CREATE INDEX "funding_sources_isActive_idx" ON "funding_sources"("isActive");

-- CreateIndex
CREATE INDEX "funding_sources_name_idx" ON "funding_sources"("name");

-- CreateIndex
CREATE INDEX "equipment_fundingSourceId_idx" ON "equipment"("fundingSourceId");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES "funding_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
