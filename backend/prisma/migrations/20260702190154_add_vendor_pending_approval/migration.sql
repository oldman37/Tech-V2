-- Add pending-approval workflow columns to vendors
-- Requester-submitted vendors start pendingApproval = true so they're excluded from the
-- default vendor list (used by the PO wizard's vendor Autocomplete) until an admin
-- reviews and approves them. requestedBy* fields let the admin queue attribute the
-- request without a new FK relation to users.
ALTER TABLE "vendors" ADD COLUMN "pendingApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN "requestedByName" TEXT;
ALTER TABLE "vendors" ADD COLUMN "requestedByEmail" TEXT;
