-- AlterTable
ALTER TABLE "fiscal_year_history" DROP COLUMN "poPrefix",
DROP COLUMN "poStartNumber";

-- AlterTable
ALTER TABLE "system_settings" DROP COLUMN "nextPoNumber",
DROP COLUMN "poNumberPrefix";
