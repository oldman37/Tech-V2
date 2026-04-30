-- CreateTable
CREATE TABLE "office_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_supervisors" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supervisorType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_locations_name_key" ON "office_locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "office_locations_code_key" ON "office_locations"("code");

-- CreateIndex
CREATE INDEX "office_locations_type_idx" ON "office_locations"("type");

-- CreateIndex
CREATE INDEX "office_locations_isActive_idx" ON "office_locations"("isActive");

-- CreateIndex
CREATE INDEX "location_supervisors_locationId_idx" ON "location_supervisors"("locationId");

-- CreateIndex
CREATE INDEX "location_supervisors_userId_idx" ON "location_supervisors"("userId");

-- CreateIndex
CREATE INDEX "location_supervisors_supervisorType_idx" ON "location_supervisors"("supervisorType");

-- CreateIndex
CREATE UNIQUE INDEX "location_supervisors_locationId_userId_supervisorType_key" ON "location_supervisors"("locationId", "userId", "supervisorType");

-- AddForeignKey
ALTER TABLE "location_supervisors" ADD CONSTRAINT "location_supervisors_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "office_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_supervisors" ADD CONSTRAINT "location_supervisors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
