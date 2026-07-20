-- S0.3 trusted authentication and tenant-context baseline.
--
-- This forward-only migration deliberately invalidates every unaccepted
-- prototype session. Legacy rows contain raw refresh JWTs and cannot be
-- converted safely into single-use opaque refresh credentials. Users must
-- authenticate again after deployment.

CREATE EXTENSION IF NOT EXISTS citext;

-- Global identity requires one unambiguous, normalized email per person.
-- Stop without exposing any email value when existing prototype data cannot
-- be migrated safely. Identity merging requires a separate reviewed process.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE btrim("email") = ''
  ) THEN
    RAISE EXCEPTION 'S0.3 migration blocked: one or more user emails are empty';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'S0.3 migration blocked: duplicate normalized global user emails require explicit remediation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Tenant"
    WHERE lower(btrim("slug")) !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ) THEN
    RAISE EXCEPTION 'S0.3 migration blocked: one or more tenant slugs cannot be normalized safely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Tenant"
    GROUP BY lower(btrim("slug"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'S0.3 migration blocked: duplicate normalized tenant slugs require explicit remediation';
  END IF;
END $$;

CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'ROTATED';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'COMPROMISED';

ALTER TABLE "Tenant"
ADD COLUMN "selfRegistrationEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TenantMembership" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- Backfill the exact tenant relationship represented by every accepted S0.2
-- user row before removing the tenantId column from global identity.
INSERT INTO "TenantMembership" (
  "id",
  "tenantId",
  "userId",
  "status",
  "isDefault",
  "joinedAt",
  "endedAt",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  md5("id"::text || ':tenant-membership')::uuid,
  "tenantId",
  "id",
  CASE "status"::text
    WHEN 'ACTIVE' THEN 'ACTIVE'::"MembershipStatus"
    WHEN 'SUSPENDED' THEN 'SUSPENDED'::"MembershipStatus"
    WHEN 'PENDING_VERIFICATION' THEN 'PENDING'::"MembershipStatus"
    ELSE 'REVOKED'::"MembershipStatus"
  END,
  true,
  CASE WHEN "status"::text = 'ACTIVE' THEN "createdAt" ELSE NULL END,
  CASE WHEN "status"::text = 'INACTIVE' THEN "updatedAt" ELSE NULL END,
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "User";

CREATE INDEX "TenantMembership_userId_status_idx"
ON "TenantMembership"("userId", "status");

CREATE INDEX "TenantMembership_tenantId_status_idx"
ON "TenantMembership"("tenantId", "status");

CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key"
ON "TenantMembership"("tenantId", "userId");

CREATE UNIQUE INDEX "TenantMembership_one_default_per_user_key"
ON "TenantMembership"("userId")
WHERE "isDefault" = true AND "deletedAt" IS NULL;

ALTER TABLE "TenantMembership"
ADD CONSTRAINT "TenantMembership_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TenantMembership"
ADD CONSTRAINT "TenantMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "User"
SET "email" = lower(btrim("email"));

UPDATE "Tenant"
SET "slug" = lower(btrim("slug"));

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_slug_normalized_check"
CHECK ("slug" = lower(btrim("slug")) AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";
DROP INDEX "User_tenantId_idx";
DROP INDEX "User_tenantId_email_key";

ALTER TABLE "User"
DROP COLUMN "tenantId",
ALTER COLUMN "email" SET DATA TYPE CITEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Revoke prototype sessions by removing their raw refresh credentials before
-- creating the secure session representation.
DELETE FROM "UserSession";

ALTER TABLE "UserSession" DROP CONSTRAINT "UserSession_userId_fkey";
DROP INDEX "UserSession_refreshToken_key";
DROP INDEX "UserSession_userId_idx";
DROP INDEX "UserSession_status_idx";

ALTER TABLE "UserSession"
DROP COLUMN "refreshToken",
DROP COLUMN "userId",
ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN "familyId" UUID NOT NULL,
ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "membershipId" UUID NOT NULL,
ADD COLUMN "refreshTokenHash" VARCHAR(64) NOT NULL,
ADD COLUMN "replacedById" UUID,
ADD COLUMN "revocationReason" VARCHAR(120),
ADD COLUMN "revokedAt" TIMESTAMP(3),
DROP COLUMN "ipAddress",
ADD COLUMN "ipAddress" INET,
ALTER COLUMN "userAgent" SET DATA TYPE VARCHAR(512),
ALTER COLUMN "deviceName" SET DATA TYPE VARCHAR(120);

CREATE UNIQUE INDEX "UserSession_refreshTokenHash_key"
ON "UserSession"("refreshTokenHash");

CREATE UNIQUE INDEX "UserSession_replacedById_key"
ON "UserSession"("replacedById");

CREATE INDEX "UserSession_membershipId_status_idx"
ON "UserSession"("membershipId", "status");

CREATE INDEX "UserSession_familyId_status_idx"
ON "UserSession"("familyId", "status");

CREATE INDEX "UserSession_status_expiresAt_idx"
ON "UserSession"("status", "expiresAt");

CREATE INDEX "UserSession_status_absoluteExpiresAt_idx"
ON "UserSession"("status", "absoluteExpiresAt");

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_replacedById_fkey"
FOREIGN KEY ("replacedById") REFERENCES "UserSession"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
