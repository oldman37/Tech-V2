-- CreateTable
CREATE TABLE "intune_action_logs" (
    "id"               TEXT NOT NULL,
    "performedBy"      TEXT NOT NULL,
    "action"           TEXT NOT NULL,
    "modelId"          TEXT,
    "modelName"        TEXT,
    "totalDevices"     INTEGER NOT NULL,
    "successCount"     INTEGER NOT NULL,
    "failedCount"      INTEGER NOT NULL,
    "notEnrolledCount" INTEGER NOT NULL,
    "results"          JSONB NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intune_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intune_action_logs_performedBy_idx" ON "intune_action_logs"("performedBy");

-- CreateIndex
CREATE INDEX "intune_action_logs_createdAt_idx" ON "intune_action_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "intune_action_logs"
    ADD CONSTRAINT "intune_action_logs_performedBy_fkey"
    FOREIGN KEY ("performedBy")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
