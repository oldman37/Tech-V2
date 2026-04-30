-- CreateTable
CREATE TABLE "user_room_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "user_room_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_room_assignments_userId_idx" ON "user_room_assignments"("userId");

-- CreateIndex
CREATE INDEX "user_room_assignments_roomId_idx" ON "user_room_assignments"("roomId");

-- CreateIndex
CREATE INDEX "user_room_assignments_assignedBy_idx" ON "user_room_assignments"("assignedBy");

-- CreateIndex
CREATE INDEX "user_room_assignments_assignedAt_idx" ON "user_room_assignments"("assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_room_assignments_userId_roomId_key" ON "user_room_assignments"("userId", "roomId");

-- AddForeignKey
ALTER TABLE "user_room_assignments" ADD CONSTRAINT "user_room_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_room_assignments" ADD CONSTRAINT "user_room_assignments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_room_assignments" ADD CONSTRAINT "user_room_assignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
