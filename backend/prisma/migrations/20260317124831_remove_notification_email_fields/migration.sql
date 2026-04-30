/*
  Warnings:

  - You are about to drop the column `dosStageEmail` on the `system_settings` table. All the data in the column will be lost.
  - You are about to drop the column `poEntryStageEmail` on the `system_settings` table. All the data in the column will be lost.
  - You are about to drop the column `purchasingStageEmail` on the `system_settings` table. All the data in the column will be lost.
  - You are about to drop the column `supervisorStageEmail` on the `system_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "system_settings" DROP COLUMN "dosStageEmail",
DROP COLUMN "poEntryStageEmail",
DROP COLUMN "purchasingStageEmail",
DROP COLUMN "supervisorStageEmail";
