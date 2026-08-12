-- CreateTable
CREATE TABLE "transportation_approval_history" (
    "id" TEXT NOT NULL,
    "transportationRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "performedByName" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "changes" JSONB,

    CONSTRAINT "transportation_approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transportation_approval_history_transportationRequestId_idx" ON "transportation_approval_history"("transportationRequestId");

-- CreateIndex
CREATE INDEX "transportation_approval_history_performedById_idx" ON "transportation_approval_history"("performedById");

-- CreateIndex
CREATE INDEX "transportation_approval_history_performedAt_idx" ON "transportation_approval_history"("performedAt");

-- AddForeignKey
ALTER TABLE "transportation_approval_history" ADD CONSTRAINT "transportation_approval_history_transportationRequestId_fkey" FOREIGN KEY ("transportationRequestId") REFERENCES "field_trip_transportation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation_approval_history" ADD CONSTRAINT "transportation_approval_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
