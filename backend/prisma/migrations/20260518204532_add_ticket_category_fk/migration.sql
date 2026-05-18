-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "tickets_categoryId_idx" ON "tickets"("categoryId");

-- CreateIndex
CREATE INDEX "work_order_categories_module_sortOrder_idx" ON "work_order_categories"("module", "sortOrder");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "work_order_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
