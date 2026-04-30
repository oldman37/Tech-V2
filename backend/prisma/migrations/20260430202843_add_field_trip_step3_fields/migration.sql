-- AlterTable
ALTER TABLE "field_trip_requests" ADD COLUMN     "chaperones" JSONB,
ADD COLUMN     "instructionalTimeMissed" VARCHAR(200),
ADD COLUMN     "overnightSafetyPrecautions" TEXT,
ADD COLUMN     "parentalPermissionReceived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plansForNonParticipants" TEXT,
ADD COLUMN     "rainAlternateDate" TIMESTAMP(3),
ADD COLUMN     "reimbursementExpenses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "substituteCount" INTEGER;
