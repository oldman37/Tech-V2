-- CreateTable
CREATE TABLE "transportation_requests" (
    "id" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "dateSubmitted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school" VARCHAR(200) NOT NULL,
    "groupOrActivity" VARCHAR(300) NOT NULL,
    "sponsorName" VARCHAR(200) NOT NULL,
    "chargedTo" VARCHAR(300),
    "tripDate" TIMESTAMP(3) NOT NULL,
    "busCount" INTEGER NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "chaperoneCount" INTEGER NOT NULL,
    "needsDriver" BOOLEAN NOT NULL DEFAULT true,
    "driverName" VARCHAR(200),
    "loadingLocation" VARCHAR(500) NOT NULL,
    "loadingTime" VARCHAR(20) NOT NULL,
    "leavingSchoolTime" VARCHAR(20) NOT NULL,
    "arriveFirstDestTime" VARCHAR(20),
    "leaveLastDestTime" VARCHAR(20),
    "returnToSchoolTime" VARCHAR(20) NOT NULL,
    "primaryDestinationName" VARCHAR(500) NOT NULL,
    "primaryDestinationAddress" VARCHAR(500) NOT NULL,
    "additionalDestinations" JSONB,
    "tripItinerary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalComments" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deniedById" TEXT,
    "deniedAt" TIMESTAMP(3),
    "denialReason" TEXT,
    "submitterEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transportation_requests_status_idx" ON "transportation_requests"("status");

-- CreateIndex
CREATE INDEX "transportation_requests_submittedById_idx" ON "transportation_requests"("submittedById");

-- CreateIndex
CREATE INDEX "transportation_requests_tripDate_idx" ON "transportation_requests"("tripDate");

-- CreateIndex
CREATE INDEX "transportation_requests_status_submittedById_idx" ON "transportation_requests"("status", "submittedById");

-- AddForeignKey
ALTER TABLE "transportation_requests" ADD CONSTRAINT "transportation_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_requests" ADD CONSTRAINT "transportation_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_requests" ADD CONSTRAINT "transportation_requests_deniedById_fkey" FOREIGN KEY ("deniedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
