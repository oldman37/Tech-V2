-- Simplify role system: collapse MANAGER, TECHNICIAN, VIEWER into USER
UPDATE "users" SET "role" = 'USER' WHERE "role" IN ('MANAGER', 'TECHNICIAN', 'VIEWER');

-- Update default value
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
