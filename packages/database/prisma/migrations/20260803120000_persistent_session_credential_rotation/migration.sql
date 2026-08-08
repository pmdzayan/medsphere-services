-- AG-02A persistent session credential rotation.
--
-- Forward-only migration. Adds direct user and tenant relationships to
-- UserSession for durable user-wide revocation and tenant validation, and
-- introduces UserSessionRefreshCredential history for strong replay detection.

-- CreateEnum
CREATE TYPE "RefreshCredentialStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

-- Add direct identity relationships to UserSession. The columns are added
-- nullable, backfilled from the authoritative TenantMembership row, then made
-- NOT NULL. This guarantees every session belongs to the same user and tenant
-- as its membership.
ALTER TABLE "UserSession"
ADD COLUMN "userId" UUID,
ADD COLUMN "tenantId" UUID,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "UserSession" s
SET
  "userId" = tm."userId",
  "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE tm."id" = s."membershipId";

-- Fail closed if any session lacks a resolvable membership chain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserSession"
    WHERE "userId" IS NULL OR "tenantId" IS NULL
  ) THEN
    RAISE EXCEPTION 'AG-02A migration blocked: orphaned session rows require explicit remediation';
  END IF;
END $$;

ALTER TABLE "UserSession"
ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "tenantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UserSessionRefreshCredential" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "status" "RefreshCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "rotationSequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSessionRefreshCredential_pkey" PRIMARY KEY ("id")
);

-- Backfill one active credential for every existing session using the
-- denormalized refreshTokenHash. The rotation sequence starts at 1.
INSERT INTO "UserSessionRefreshCredential" (
    "id",
    "sessionId",
    "hash",
    "status",
    "issuedAt",
    "usedAt",
    "revokedAt",
    "replacedById",
    "rotationSequence",
    "createdAt"
)
SELECT
    md5(s."id"::text || ':credential:1')::uuid,
    s."id",
    s."refreshTokenHash",
    CASE
        WHEN s."status" IN ('ACTIVE', 'ROTATED') AND s."revokedAt" IS NULL THEN 'ACTIVE'::"RefreshCredentialStatus"
        ELSE 'REVOKED'::"RefreshCredentialStatus"
    END,
    s."createdAt",
    NULL,
    CASE
        WHEN s."status" IN ('EXPIRED', 'REVOKED', 'COMPROMISED') OR s."revokedAt" IS NOT NULL THEN COALESCE(s."revokedAt", s."updatedAt")
        ELSE NULL
    END,
    NULL,
    1,
    s."createdAt"
FROM "UserSession" s;

-- CreateIndex
CREATE UNIQUE INDEX "UserSessionRefreshCredential_hash_key"
ON "UserSessionRefreshCredential"("hash");

-- CreateIndex
CREATE INDEX "UserSessionRefreshCredential_sessionId_status_idx"
ON "UserSessionRefreshCredential"("sessionId", "status");

-- CreateIndex
CREATE INDEX "UserSessionRefreshCredential_sessionId_issuedAt_idx"
ON "UserSessionRefreshCredential"("sessionId", "issuedAt");

-- CreateIndex
CREATE INDEX "UserSessionRefreshCredential_status_issuedAt_idx"
ON "UserSessionRefreshCredential"("status", "issuedAt");

-- One active credential per session: the partial unique index is the hard
-- database backstop against concurrent rotation double-claim.
CREATE UNIQUE INDEX "UserSessionRefreshCredential_one_active_per_session_key"
ON "UserSessionRefreshCredential"("sessionId")
WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_replacedById_fkey"
FOREIGN KEY ("replacedById") REFERENCES "UserSessionRefreshCredential"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Check constraints on credential state shape.
ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_rotationSequence_nonnegative_check"
CHECK ("rotationSequence" >= 0);

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_used_state_check"
CHECK (
  ("status" = 'USED' AND "usedAt" IS NOT NULL)
  OR
  ("status" <> 'USED' AND "usedAt" IS NULL)
);

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_revoked_state_check"
CHECK (
  ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  OR
  ("status" <> 'REVOKED' AND "revokedAt" IS NULL)
);

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_active_state_check"
CHECK (
  ("status" = 'ACTIVE' AND "usedAt" IS NULL AND "revokedAt" IS NULL)
  OR
  ("status" <> 'ACTIVE')
);

-- Indexes for new UserSession query paths.
CREATE INDEX "UserSession_userId_status_idx"
ON "UserSession"("userId", "status");

CREATE INDEX "UserSession_tenantId_status_idx"
ON "UserSession"("tenantId", "status");

CREATE INDEX "UserSession_familyId_createdAt_idx"
ON "UserSession"("familyId", "createdAt");

-- Non-negative session version.
ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_version_nonnegative_check"
CHECK ("version" >= 0);