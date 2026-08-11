-- Per-user, per-nav-section read state driving the Requests sidebar nav
-- badges. Coarser-grained than ticket_views (one row per user+section, not
-- per item) — the two coexist; this table drives only the nav badge.

-- CreateEnum
CREATE TYPE "RequestSection" AS ENUM ('WORK_ORDERS', 'PURCHASE_ORDERS', 'FIELD_TRIPS', 'FIELD_TRIP_APPROVALS', 'TRANSPORTATION_REQUESTS');

-- CreateTable
CREATE TABLE "request_section_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "RequestSection" NOT NULL,
    "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_section_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_section_views_userId_section_key" ON "request_section_views"("userId", "section");

-- CreateIndex
CREATE INDEX "request_section_views_userId_idx" ON "request_section_views"("userId");

-- AddForeignKey
ALTER TABLE "request_section_views" ADD CONSTRAINT "request_section_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
