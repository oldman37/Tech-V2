-- AlterTable
ALTER TABLE "field_trip_requests" ADD COLUMN     "followUpActivities" TEXT,
ADD COLUMN     "preliminaryActivities" TEXT,
ADD COLUMN     "subjectArea" VARCHAR(100);
