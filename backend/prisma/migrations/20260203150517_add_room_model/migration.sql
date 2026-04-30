-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "building" TEXT,
    "floor" INTEGER,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rooms_locationId_idx" ON "rooms"("locationId");

-- CreateIndex
CREATE INDEX "rooms_type_idx" ON "rooms"("type");

-- CreateIndex
CREATE INDEX "rooms_isActive_idx" ON "rooms"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_locationId_name_key" ON "rooms"("locationId", "name");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "office_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
