CREATE TABLE "supervisor_delegations" (
  "id"             TEXT         NOT NULL,
  "locationId"     TEXT         NOT NULL,
  "supervisorType" TEXT         NOT NULL,
  "delegateUserId" TEXT         NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "reason"         TEXT,
  "isActive"       BOOLEAN      NOT NULL DEFAULT true,
  "createdById"    TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supervisor_delegations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supervisor_delegations_locationId_supervisorType_idx"
  ON "supervisor_delegations"("locationId", "supervisorType");

CREATE INDEX "supervisor_delegations_delegateUserId_idx"
  ON "supervisor_delegations"("delegateUserId");

CREATE INDEX "supervisor_delegations_expiresAt_idx"
  ON "supervisor_delegations"("expiresAt");

ALTER TABLE "supervisor_delegations"
  ADD CONSTRAINT "supervisor_delegations_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "office_locations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_delegations"
  ADD CONSTRAINT "supervisor_delegations_delegateUserId_fkey"
  FOREIGN KEY ("delegateUserId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_delegations"
  ADD CONSTRAINT "supervisor_delegations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
