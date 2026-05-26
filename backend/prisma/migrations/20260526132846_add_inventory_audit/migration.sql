-- DropForeignKey
ALTER TABLE "damage_incidents" DROP CONSTRAINT "damage_incidents_equipmentId_fkey";

-- AlterTable
ALTER TABLE "damage_incidents" ALTER COLUMN "intent" SET DATA TYPE TEXT,
ALTER COLUMN "workflowStep" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "inventory_audit_sessions" (
    "id" TEXT NOT NULL,
    "officeLocationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "conductedById" TEXT NOT NULL,
    "conductedByName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "fiscalYear" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "presentCount" INTEGER NOT NULL DEFAULT 0,
    "missingCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_audit_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_audit_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "equipmentTag" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "equipmentSerial" TEXT,
    "status" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAction" TEXT,
    "resolutionNotes" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_officeLocationId_idx" ON "inventory_audit_sessions"("officeLocationId");

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_roomId_idx" ON "inventory_audit_sessions"("roomId");

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_conductedById_idx" ON "inventory_audit_sessions"("conductedById");

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_status_idx" ON "inventory_audit_sessions"("status");

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_fiscalYear_idx" ON "inventory_audit_sessions"("fiscalYear");

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_startedAt_idx" ON "inventory_audit_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "inventory_audit_sessions_officeLocationId_roomId_fiscalYear_idx" ON "inventory_audit_sessions"("officeLocationId", "roomId", "fiscalYear");

-- CreateIndex
CREATE INDEX "inventory_audit_items_sessionId_idx" ON "inventory_audit_items"("sessionId");

-- CreateIndex
CREATE INDEX "inventory_audit_items_equipmentId_idx" ON "inventory_audit_items"("equipmentId");

-- CreateIndex
CREATE INDEX "inventory_audit_items_status_idx" ON "inventory_audit_items"("status");

-- CreateIndex
CREATE INDEX "inventory_audit_items_resolvedAt_idx" ON "inventory_audit_items"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_audit_items_sessionId_equipmentId_key" ON "inventory_audit_items"("sessionId", "equipmentId");

-- AddForeignKey
ALTER TABLE "damage_incidents" ADD CONSTRAINT "damage_incidents_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_sessions" ADD CONSTRAINT "inventory_audit_sessions_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_sessions" ADD CONSTRAINT "inventory_audit_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_sessions" ADD CONSTRAINT "inventory_audit_sessions_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_items" ADD CONSTRAINT "inventory_audit_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_audit_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_items" ADD CONSTRAINT "inventory_audit_items_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_items" ADD CONSTRAINT "inventory_audit_items_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
