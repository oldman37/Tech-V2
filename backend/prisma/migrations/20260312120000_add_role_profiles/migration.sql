-- CreateTable: role_profiles
CREATE TABLE "role_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "role_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: role_profile_permissions
CREATE TABLE "role_profile_permissions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_profile_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_profiles_name_key" ON "role_profiles"("name");

-- CreateIndex
CREATE INDEX "role_profiles_isActive_idx" ON "role_profiles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "role_profile_permissions_profileId_module_key" ON "role_profile_permissions"("profileId", "module");

-- CreateIndex
CREATE INDEX "role_profile_permissions_profileId_idx" ON "role_profile_permissions"("profileId");

-- AddForeignKey
ALTER TABLE "role_profile_permissions" ADD CONSTRAINT "role_profile_permissions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "role_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
