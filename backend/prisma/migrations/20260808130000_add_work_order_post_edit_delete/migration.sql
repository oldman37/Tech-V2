-- Nullable "edited at" timestamps for the four things a work order post-author
-- can edit: the description, a comment body, a status-history note, and a
-- priority-history note. Nullable rather than boolean so the marker also shows
-- *when* it was edited, and every existing row is correctly "never edited"
-- with no backfill needed. Purely additive, safe on populated tables.

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "descriptionEditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_comments" ADD COLUMN "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_status_history" ADD COLUMN "notesEditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_priority_history" ADD COLUMN "notesEditedAt" TIMESTAMP(3);
