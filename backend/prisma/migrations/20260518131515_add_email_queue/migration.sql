-- CreateTable
CREATE TABLE "email_queue" (
    "id" UUID NOT NULL,
    "recipients" TEXT[],
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "context" VARCHAR(100),
    "relatedEntityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_queue_status_nextAttemptAt_idx" ON "email_queue"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "email_queue_status_createdAt_idx" ON "email_queue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_queue_relatedEntityId_idx" ON "email_queue"("relatedEntityId");
