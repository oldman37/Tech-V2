-- Add per-location flag: when true, purchase orders for this location skip the
-- supervisor approval stage and route directly to the Finance Director stage.
ALTER TABLE "office_locations"
  ADD COLUMN "routeToFinanceDirector" BOOLEAN NOT NULL DEFAULT false;

-- One-time seed to preserve current behavior for the two known locations.
-- Thereafter this flag is admin-controlled via the Locations & Supervisors page.
UPDATE "office_locations"
  SET "routeToFinanceDirector" = true
  WHERE "type" = 'DISTRICT_OFFICE' OR "name" = 'Finance Department';
