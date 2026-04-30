/*
  Warnings:

  - You are about to drop the `permissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `role_profile_permissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `role_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_permissions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "role_profile_permissions" DROP CONSTRAINT "role_profile_permissions_profileId_fkey";

-- DropForeignKey
ALTER TABLE "user_permissions" DROP CONSTRAINT "user_permissions_permissionId_fkey";

-- DropForeignKey
ALTER TABLE "user_permissions" DROP CONSTRAINT "user_permissions_userId_fkey";

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "approverEmailsSnapshot" JSONB;

-- DropTable
DROP TABLE "permissions";

-- DropTable
DROP TABLE "role_profile_permissions";

-- DropTable
DROP TABLE "role_profiles";

-- DropTable
DROP TABLE "user_permissions";
