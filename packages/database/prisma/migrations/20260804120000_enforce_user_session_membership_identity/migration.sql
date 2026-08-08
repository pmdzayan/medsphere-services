-- CreateUniqueIndex
CREATE UNIQUE INDEX "TenantMembership_id_userId_tenantId_key" ON "TenantMembership"("id", "userId", "tenantId");

-- DropForeignKey
ALTER TABLE "UserSession" DROP CONSTRAINT "UserSession_membershipId_fkey";

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_membershipId_userId_tenantId_fkey" FOREIGN KEY ("membershipId", "userId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
