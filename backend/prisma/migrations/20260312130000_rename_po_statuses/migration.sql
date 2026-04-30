-- ============================================================
-- Migration: Rename PO status values for new 5-step workflow
--
-- Old 6-step workflow statuses → New 5-step workflow statuses:
--   draft               → draft               (unchanged)
--   submitted           → submitted            (unchanged)
--   supervisor_approved → supervisor_approved  (unchanged)
--   purchasing_approved → supervisor_approved  (eliminated intermediate step)
--   dos_approved        → finance_director_approved (renamed: was Finance Dir)
--   schools_approved    → dos_approved         (renamed: was Director of Schools)
--   po_issued           → po_issued            (unchanged)
--   denied              → denied               (unchanged)
--
-- IMPORTANT: Updates must be performed in this exact order to avoid
-- data collision between dos_approved ↔ schools_approved rename.
-- ============================================================

-- Step 1: Rename old "dos_approved" (Finance Director approved) → "finance_director_approved"
--         Must happen BEFORE step 2 to avoid overwriting with schools_approved values.
UPDATE purchase_orders
SET status = 'finance_director_approved'
WHERE status = 'dos_approved';

-- Step 2: Rename old "schools_approved" (Director of Schools approved) → "dos_approved"
UPDATE purchase_orders
SET status = 'dos_approved'
WHERE status = 'schools_approved';

-- Step 3: Migrate legacy "purchasing_approved" records → "supervisor_approved"
--         These were in Finance Director's queue; Finance Director now acts on supervisor_approved.
UPDATE purchase_orders
SET status = 'supervisor_approved'
WHERE status = 'purchasing_approved';

-- Step 4: Update RequisitionStatusHistory audit trail (same rename order as above)

-- 4a. Rename dos_approved → finance_director_approved in history
UPDATE requisition_status_history
SET "fromStatus" = 'finance_director_approved'
WHERE "fromStatus" = 'dos_approved';

UPDATE requisition_status_history
SET "toStatus" = 'finance_director_approved'
WHERE "toStatus" = 'dos_approved';

-- 4b. Rename schools_approved → dos_approved in history
UPDATE requisition_status_history
SET "fromStatus" = 'dos_approved'
WHERE "fromStatus" = 'schools_approved';

UPDATE requisition_status_history
SET "toStatus" = 'dos_approved'
WHERE "toStatus" = 'schools_approved';

-- 4c. Rename purchasing_approved → supervisor_approved in history
UPDATE requisition_status_history
SET "fromStatus" = 'supervisor_approved'
WHERE "fromStatus" = 'purchasing_approved';

UPDATE requisition_status_history
SET "toStatus" = 'supervisor_approved'
WHERE "toStatus" = 'purchasing_approved';

-- Step 5: Add schoolsDirectorApprovedAt column to purchase_orders
--         Records the exact timestamp when Director of Schools approves (→ dos_approved).
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS "schoolsDirectorApprovedAt" TIMESTAMP(3);

-- Step 6: Add poEntryStageEmail column to system_settings
--         Optional notification email sent when a record reaches dos_approved (ready for PO Entry).
ALTER TABLE system_settings
ADD COLUMN IF NOT EXISTS "poEntryStageEmail" TEXT;
