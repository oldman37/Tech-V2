-- Merge the "in_repair" RepairTicket status into "sent_to_vendor" — sending a
-- ticket to the vendor already means the device is being repaired, so the
-- separate "in_repair" step was redundant with no distinct side effects.
UPDATE repair_tickets SET status = 'sent_to_vendor' WHERE status = 'in_repair';
