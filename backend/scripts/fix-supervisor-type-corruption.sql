-- Fix corrupted supervisorType records that have a :1 (or any :N) suffix
-- Preview what will be changed:
SELECT id, "supervisorType", SPLIT_PART("supervisorType", ':', 1) AS "fixedType"
FROM location_supervisors
WHERE "supervisorType" LIKE '%:%';

-- Apply the fix:
UPDATE location_supervisors
SET "supervisorType" = SPLIT_PART("supervisorType", ':', 1)
WHERE "supervisorType" LIKE '%:%';
