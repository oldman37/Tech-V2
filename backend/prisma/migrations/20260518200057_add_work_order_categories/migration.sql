-- CreateEnum
CREATE TYPE "WorkOrderCategoryModule" AS ENUM ('TECHNOLOGY', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "work_order_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" "WorkOrderCategoryModule" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_categories_module_isActive_idx" ON "work_order_categories"("module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_categories_name_module_key" ON "work_order_categories"("name", "module");
