-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "fiscalYear" TEXT;

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "currentFiscalYear" TEXT,
ADD COLUMN     "dosApprovalLevel" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "financeDirectorApprovalLevel" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "fiscalYearEnd" TIMESTAMP(3),
ADD COLUMN     "fiscalYearStart" TIMESTAMP(3),
ADD COLUMN     "lastYearRolloverAt" TIMESTAMP(3),
ADD COLUMN     "lastYearRolloverBy" TEXT,
ADD COLUMN     "supervisorApprovalLevel" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "fiscal_year_history" (
    "id" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "fiscalYearStart" TIMESTAMP(3) NOT NULL,
    "fiscalYearEnd" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "deniedCount" INTEGER NOT NULL DEFAULT 0,
    "reqPrefix" TEXT NOT NULL,
    "reqStartNumber" INTEGER NOT NULL,
    "poPrefix" TEXT NOT NULL,
    "poStartNumber" INTEGER NOT NULL,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_year_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_year_history_fiscalYear_idx" ON "fiscal_year_history"("fiscalYear");

-- CreateIndex
CREATE INDEX "purchase_orders_fiscalYear_idx" ON "purchase_orders"("fiscalYear");

-- AddForeignKey
ALTER TABLE "fiscal_year_history" ADD CONSTRAINT "fiscal_year_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
