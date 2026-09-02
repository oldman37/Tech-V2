-- Remove the automated monthly fuel report cron job. The report is now
-- generated on demand via CSV export on the My Fuel History page instead
-- of running automatically. Deleting the row prevents an already-enabled
-- schedule from firing again after deploy and removes the stale entry
-- from the admin jobs list.
DELETE FROM "job_schedules" WHERE "jobKey" = 'transportation-monthly-report';
