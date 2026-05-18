-- AlterTable
ALTER TABLE "transportation_requests" ADD COLUMN     "officeLocationId" TEXT,
ADD COLUMN     "supervisorApprovedAt" TIMESTAMP(3),
ADD COLUMN     "supervisorApprovedById" TEXT,
ADD COLUMN     "supervisorDenialReason" TEXT,
ADD COLUMN     "supervisorDeniedAt" TIMESTAMP(3),
ADD COLUMN     "supervisorDeniedById" TEXT,
ADD COLUMN     "supervisorEmailSnapshot" VARCHAR(500),
ALTER COLUMN "status" SET DEFAULT 'PENDING_SUPERVISOR_APPROVAL';

-- CreateIndex
CREATE INDEX "transportation_requests_officeLocationId_idx" ON "transportation_requests"("officeLocationId");

-- AddForeignKey
ALTER TABLE "transportation_requests" ADD CONSTRAINT "transportation_requests_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_requests" ADD CONSTRAINT "transportation_requests_supervisorApprovedById_fkey" FOREIGN KEY ("supervisorApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_requests" ADD CONSTRAINT "transportation_requests_supervisorDeniedById_fkey" FOREIGN KEY ("supervisorDeniedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
