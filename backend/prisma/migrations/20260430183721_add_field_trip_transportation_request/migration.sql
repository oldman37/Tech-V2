-- CreateTable
CREATE TABLE "field_trip_transportation_requests" (
    "id" TEXT NOT NULL,
    "fieldTripRequestId" TEXT NOT NULL,
    "busCount" INTEGER NOT NULL,
    "chaperoneCount" INTEGER NOT NULL,
    "needsDriver" BOOLEAN NOT NULL,
    "driverName" VARCHAR(200),
    "loadingLocation" VARCHAR(500) NOT NULL,
    "loadingTime" VARCHAR(20) NOT NULL,
    "arriveFirstDestTime" VARCHAR(20),
    "leaveLastDestTime" VARCHAR(20),
    "additionalDestinations" JSONB,
    "tripItinerary" TEXT,
    "transportationType" VARCHAR(100),
    "transportationCost" DECIMAL(10,2),
    "transportationNotes" TEXT,
    "denialReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deniedById" TEXT,
    "deniedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_trip_transportation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_trip_transportation_requests_fieldTripRequestId_key" ON "field_trip_transportation_requests"("fieldTripRequestId");

-- CreateIndex
CREATE INDEX "field_trip_transportation_requests_fieldTripRequestId_idx" ON "field_trip_transportation_requests"("fieldTripRequestId");

-- CreateIndex
CREATE INDEX "field_trip_transportation_requests_status_idx" ON "field_trip_transportation_requests"("status");

-- AddForeignKey
ALTER TABLE "field_trip_transportation_requests" ADD CONSTRAINT "field_trip_transportation_requests_fieldTripRequestId_fkey" FOREIGN KEY ("fieldTripRequestId") REFERENCES "field_trip_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_trip_transportation_requests" ADD CONSTRAINT "field_trip_transportation_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_trip_transportation_requests" ADD CONSTRAINT "field_trip_transportation_requests_deniedById_fkey" FOREIGN KEY ("deniedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
