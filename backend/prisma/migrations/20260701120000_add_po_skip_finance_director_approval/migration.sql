-- Add skipFinanceDirectorApproval to purchase_orders
-- Set at creation when the requestor is a Finance Director group member, so the
-- PO routes supervisor_approved -> dos_approved directly instead of getting stuck
-- behind a self-approval block at the finance_director_approved stage.
ALTER TABLE "purchase_orders" ADD COLUMN "skipFinanceDirectorApproval" BOOLEAN NOT NULL DEFAULT false;
