-- AlterTable: add reqNumber to purchase_orders
ALTER TABLE "purchase_orders" ADD COLUMN "reqNumber" TEXT;
CREATE UNIQUE INDEX "purchase_orders_reqNumber_key" ON "purchase_orders"("reqNumber");

-- CreateTable: system_settings singleton
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "nextReqNumber" INTEGER NOT NULL DEFAULT 1,
    "reqNumberPrefix" TEXT NOT NULL DEFAULT 'REQ',
    "nextPoNumber" INTEGER NOT NULL DEFAULT 1,
    "poNumberPrefix" TEXT NOT NULL DEFAULT 'PO',
    "supervisorBypassEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supervisorStageEmail" TEXT,
    "purchasingStageEmail" TEXT,
    "dosStageEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
