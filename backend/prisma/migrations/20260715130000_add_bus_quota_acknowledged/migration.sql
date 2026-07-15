-- Add busQuotaAcknowledged to field_trip_requests
ALTER TABLE "field_trip_requests" ADD COLUMN "busQuotaAcknowledged" BOOLEAN NOT NULL DEFAULT false;
