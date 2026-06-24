-- Audit log for all provisioning actions (creates, updates, disables, failures)
CREATE TABLE "provisioning_audit" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "triggeredBy"  TEXT         NOT NULL,
  "userType"     TEXT         NOT NULL,
  "upn"          TEXT,
  "employeeId"   TEXT,
  "action"       TEXT         NOT NULL,
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "provisioning_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provisioning_audit_createdAt_idx" ON "provisioning_audit"("createdAt" DESC);
CREATE INDEX "provisioning_audit_action_idx"    ON "provisioning_audit"("action");
CREATE INDEX "provisioning_audit_userType_idx"  ON "provisioning_audit"("userType");

-- Singleton config row for provisioning passwords.
-- Seeded on first run from PROVISIONING_DEFAULT_STAFF_PASSWORD / PROVISIONING_DEFAULT_STUDENT_PASSWORD env vars.
-- Managed via web UI after initial seed; env vars have no effect once this row exists.
CREATE TABLE "provisioning_config" (
  "id"              TEXT         NOT NULL DEFAULT 'singleton',
  "staffPassword"   TEXT         NOT NULL,
  "studentPassword" TEXT         NOT NULL,
  "updatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedBy"       TEXT,
  CONSTRAINT "provisioning_config_pkey" PRIMARY KEY ("id")
);
