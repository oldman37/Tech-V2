-- Remove the "RESOLVED" TicketStatus value: merged into "CLOSED" since the
-- two states were operationally indistinguishable for work orders.

-- 1. Reassign any tickets currently RESOLVED to CLOSED, backfilling closedAt
--    (resolvedAt is left as-is; it remains a valid historical timestamp).
UPDATE "tickets"
SET "status" = 'CLOSED',
    "closedAt" = COALESCE("closedAt", "resolvedAt", now())
WHERE "status" = 'RESOLVED';

-- 2. Reassign historical status-history rows referencing RESOLVED — required
--    before narrowing the enum type below, since Postgres won't allow a
--    column's existing values to reference a label being dropped from its type.
UPDATE "ticket_status_history" SET "fromStatus" = 'CLOSED' WHERE "fromStatus" = 'RESOLVED';
UPDATE "ticket_status_history" SET "toStatus"   = 'CLOSED' WHERE "toStatus"   = 'RESOLVED';

-- 3. Recreate the TicketStatus enum without RESOLVED (Postgres has no
--    ALTER TYPE ... DROP VALUE, so rename/create/alter/drop is required).
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED');

ALTER TABLE "tickets" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tickets" ALTER COLUMN "status" TYPE "TicketStatus" USING ("status"::text::"TicketStatus");
ALTER TABLE "tickets" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "ticket_status_history" ALTER COLUMN "fromStatus" TYPE "TicketStatus" USING ("fromStatus"::text::"TicketStatus");
ALTER TABLE "ticket_status_history" ALTER COLUMN "toStatus" TYPE "TicketStatus" USING ("toStatus"::text::"TicketStatus");

DROP TYPE "TicketStatus_old";
