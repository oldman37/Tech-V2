-- CreateTable
CREATE TABLE "job_schedules" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunResult" JSONB,
    "nextRunAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_schedules_jobKey_key" ON "job_schedules"("jobKey");
