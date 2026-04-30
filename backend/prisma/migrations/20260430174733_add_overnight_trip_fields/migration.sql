-- AlterTable
ALTER TABLE "field_trip_requests" ADD COLUMN     "isOvernightTrip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnDate" TIMESTAMP(3);
