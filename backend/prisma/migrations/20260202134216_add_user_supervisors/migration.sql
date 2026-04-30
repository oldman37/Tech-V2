-- CreateTable
CREATE TABLE "user_supervisors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "locationId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_supervisors_userId_idx" ON "user_supervisors"("userId");

-- CreateIndex
CREATE INDEX "user_supervisors_supervisorId_idx" ON "user_supervisors"("supervisorId");

-- CreateIndex
CREATE INDEX "user_supervisors_locationId_idx" ON "user_supervisors"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_supervisors_userId_supervisorId_locationId_key" ON "user_supervisors"("userId", "supervisorId", "locationId");

-- AddForeignKey
ALTER TABLE "user_supervisors" ADD CONSTRAINT "user_supervisors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_supervisors" ADD CONSTRAINT "user_supervisors_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
