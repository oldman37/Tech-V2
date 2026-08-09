-- Add an opt-in "show in Quick Fix" flag to work order categories.
--
-- The Quick Fix dropdown and the full New Work Order form read the same
-- work_order_categories rows. Quick Fix only applies to student device fixes, so
-- infrastructure categories must stay available to the work order form while
-- being hidden from Quick Fix. A separate flag is the only way to do that
-- without deactivating them.

ALTER TABLE work_order_categories
  ADD COLUMN IF NOT EXISTS "quickFix" BOOLEAN NOT NULL DEFAULT false;

-- Rename for consistency before flagging, so the flags below match final names.
-- The NOT EXISTS guards protect the @@unique([name, module]) constraint: a failed
-- migration stops the backend container from starting, so skip rather than error
-- if a category already exists under the new name.
UPDATE work_order_categories SET name = 'Hardware Issue'
WHERE module = 'TECHNOLOGY' AND name = 'Hardware Failure'
  AND NOT EXISTS (SELECT 1 FROM work_order_categories
                  WHERE module = 'TECHNOLOGY' AND name = 'Hardware Issue');

UPDATE work_order_categories SET name = 'Equipment Setup'
WHERE module = 'TECHNOLOGY' AND name = 'New Equipment Setup'
  AND NOT EXISTS (SELECT 1 FROM work_order_categories
                  WHERE module = 'TECHNOLOGY' AND name = 'Equipment Setup');

-- Flag the curated set. Every statement here is idempotent (safe to re-run).
UPDATE work_order_categories
SET "quickFix" = true
WHERE module = 'TECHNOLOGY'
  AND name IN (
    'Hardware Issue',
    'Software Issue',
    'Network / Connectivity',
    'Account / Access',
    'Equipment Setup',
    'Other'
  );
