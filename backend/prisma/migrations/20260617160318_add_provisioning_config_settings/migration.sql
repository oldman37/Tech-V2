-- Add targetTenant, disableThreshold, reportEmails, adminEmails to provisioning_config
ALTER TABLE "provisioning_config"
  ADD COLUMN "targetTenant"     TEXT    NOT NULL DEFAULT 'TEST',
  ADD COLUMN "disableThreshold" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "reportEmails"     TEXT,
  ADD COLUMN "adminEmails"      TEXT;

-- Seed the provisioning-sync job schedule so schedulerService picks it up on next start.
-- ON CONFLICT prevents re-seeding if someone already created this row manually.
INSERT INTO "job_schedules" ("id", "jobKey", "cronExpr", "enabled", "nextRunAt", "updatedAt", "createdAt")
VALUES (
  'provisioning-sync-default-seed',
  'provisioning-sync',
  '0 */2 * * *',
  true,
  CURRENT_TIMESTAMP + INTERVAL '2 hours',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("jobKey") DO NOTHING;
