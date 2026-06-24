CREATE TABLE "provisioning_disable_batch" (
    "id"           TEXT         NOT NULL,
    "userType"     TEXT         NOT NULL,
    "triggeredBy"  TEXT         NOT NULL,
    "testMode"     BOOLEAN      NOT NULL DEFAULT false,
    "pendingUsers" JSONB        NOT NULL,
    "status"       TEXT         NOT NULL DEFAULT 'PENDING',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"   TIMESTAMP(3),
    "resolvedBy"   TEXT,
    CONSTRAINT "provisioning_disable_batch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provisioning_disable_batch_status_idx" ON "provisioning_disable_batch"("status");
