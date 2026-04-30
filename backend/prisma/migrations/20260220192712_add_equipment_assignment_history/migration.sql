-- CreateTable
CREATE TABLE "equipment_assignment_history" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "assignedToId" TEXT,
    "assignedToType" TEXT,
    "assignedToName" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedByName" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "notes" TEXT,
    "equipmentName" TEXT NOT NULL,
    "equipmentTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_assignment_history_equipmentId_idx" ON "equipment_assignment_history"("equipmentId");

-- CreateIndex
CREATE INDEX "equipment_assignment_history_assignedToId_assignedToType_idx" ON "equipment_assignment_history"("assignedToId", "assignedToType");

-- CreateIndex
CREATE INDEX "equipment_assignment_history_assignedBy_idx" ON "equipment_assignment_history"("assignedBy");

-- CreateIndex
CREATE INDEX "equipment_assignment_history_assignedAt_idx" ON "equipment_assignment_history"("assignedAt");

-- AddForeignKey
ALTER TABLE "equipment_assignment_history" ADD CONSTRAINT "equipment_assignment_history_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignment_history" ADD CONSTRAINT "equipment_assignment_history_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
