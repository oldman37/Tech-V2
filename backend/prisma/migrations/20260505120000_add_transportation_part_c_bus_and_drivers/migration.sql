-- AlterTable
ALTER TABLE "field_trip_transportation_requests"
ADD COLUMN "transportationBusCount" INTEGER,
ADD COLUMN "driverNames"            JSONB;
