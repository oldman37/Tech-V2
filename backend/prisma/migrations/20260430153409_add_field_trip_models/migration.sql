-- CreateTable
CREATE TABLE "field_trip_requests" (
    "id" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "teacherName" VARCHAR(200) NOT NULL,
    "schoolBuilding" VARCHAR(200) NOT NULL,
    "gradeClass" VARCHAR(100) NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "destination" VARCHAR(500) NOT NULL,
    "purpose" TEXT NOT NULL,
    "departureTime" VARCHAR(20) NOT NULL,
    "returnTime" VARCHAR(20) NOT NULL,
    "transportationNeeded" BOOLEAN NOT NULL DEFAULT false,
    "transportationDetails" TEXT,
    "costPerStudent" DECIMAL(10,2),
    "totalCost" DECIMAL(10,2),
    "fundingSource" VARCHAR(200),
    "chaperoneInfo" TEXT,
    "emergencyContact" VARCHAR(500),
    "additionalNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submitterEmail" TEXT NOT NULL,
    "denialReason" TEXT,
    "approverEmailsSnapshot" JSONB,
    "fiscalYear" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_trip_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_trip_approvals" (
    "id" TEXT NOT NULL,
    "fieldTripRequestId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actedById" TEXT NOT NULL,
    "actedByName" TEXT NOT NULL,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "denialReason" TEXT,

    CONSTRAINT "field_trip_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_trip_status_history" (
    "id" TEXT NOT NULL,
    "fieldTripRequestId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "field_trip_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_trip_requests_status_idx" ON "field_trip_requests"("status");

-- CreateIndex
CREATE INDEX "field_trip_requests_submittedById_idx" ON "field_trip_requests"("submittedById");

-- CreateIndex
CREATE INDEX "field_trip_requests_tripDate_idx" ON "field_trip_requests"("tripDate");

-- CreateIndex
CREATE INDEX "field_trip_requests_fiscalYear_idx" ON "field_trip_requests"("fiscalYear");

-- CreateIndex
CREATE INDEX "field_trip_requests_status_submittedById_idx" ON "field_trip_requests"("status", "submittedById");

-- CreateIndex
CREATE INDEX "field_trip_approvals_fieldTripRequestId_idx" ON "field_trip_approvals"("fieldTripRequestId");

-- CreateIndex
CREATE INDEX "field_trip_approvals_actedById_idx" ON "field_trip_approvals"("actedById");

-- CreateIndex
CREATE INDEX "field_trip_approvals_stage_idx" ON "field_trip_approvals"("stage");

-- CreateIndex
CREATE INDEX "field_trip_status_history_fieldTripRequestId_idx" ON "field_trip_status_history"("fieldTripRequestId");

-- CreateIndex
CREATE INDEX "field_trip_status_history_changedById_idx" ON "field_trip_status_history"("changedById");

-- CreateIndex
CREATE INDEX "field_trip_status_history_changedAt_idx" ON "field_trip_status_history"("changedAt");

-- AddForeignKey
ALTER TABLE "field_trip_requests" ADD CONSTRAINT "field_trip_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_trip_approvals" ADD CONSTRAINT "field_trip_approvals_fieldTripRequestId_fkey" FOREIGN KEY ("fieldTripRequestId") REFERENCES "field_trip_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_trip_approvals" ADD CONSTRAINT "field_trip_approvals_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_trip_status_history" ADD CONSTRAINT "field_trip_status_history_fieldTripRequestId_fkey" FOREIGN KEY ("fieldTripRequestId") REFERENCES "field_trip_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_trip_status_history" ADD CONSTRAINT "field_trip_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
