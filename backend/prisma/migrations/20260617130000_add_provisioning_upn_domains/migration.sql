ALTER TABLE "provisioning_config"
  ADD COLUMN "staffUpnDomain"   TEXT NOT NULL DEFAULT 'ocboe.com',
  ADD COLUMN "studentUpnDomain" TEXT NOT NULL DEFAULT 'students.ocboe.com';
