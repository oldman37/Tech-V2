-- AlterTable
ALTER TABLE "field_trip_requests" ADD COLUMN     "revisionNote" TEXT,
ADD COLUMN     "submissionCount" INTEGER NOT NULL DEFAULT 0;
