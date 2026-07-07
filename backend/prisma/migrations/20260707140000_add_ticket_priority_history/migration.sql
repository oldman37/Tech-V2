-- CreateTable
CREATE TABLE "ticket_priority_history" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromPriority" "TicketPriority",
    "toPriority" "TicketPriority" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ticket_priority_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_priority_history_ticketId_idx" ON "ticket_priority_history"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_priority_history_changedAt_idx" ON "ticket_priority_history"("changedAt");

-- AddForeignKey
ALTER TABLE "ticket_priority_history" ADD CONSTRAINT "ticket_priority_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_priority_history" ADD CONSTRAINT "ticket_priority_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
