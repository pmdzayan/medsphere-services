-- AG-02A session credential integrity.
--
-- Forward-only migration. It binds each session directly to the same user and
-- tenant as its membership, then introduces durable refresh-credential state.

CREATE TYPE "RefreshCredentialStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

ALTER TABLE "UserSession"
ADD COLUMN "userId" UUID,
ADD COLUMN "tenantId" UUID,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "UserSession" AS session
SET
  "userId" = membership."userId",
  "tenantId" = membership."tenantId"
FROM "TenantMembership" AS membership
WHERE membership."id" = session."membershipId";

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

CREATE UNIQUE INDEX "TenantMembership_id_userId_tenantId_key"
ON "TenantMembership"("id", "userId", "tenantId");

ALTER TABLE "UserSession"
DROP CONSTRAINT "UserSession_membershipId_fkey";

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_membershipId_userId_tenantId_fkey"
FOREIGN KEY ("membershipId", "userId", "tenantId")
REFERENCES "TenantMembership"("id", "userId", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- Preserve the security meaning of existing session state:
-- ACTIVE -> ACTIVE, ROTATED -> USED, terminal/internally revoked -> REVOKED.
-- In particular, a credential belonging to a ROTATED session must not be
-- backfilled as ACTIVE or a replay after deployment would be misclassified.
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
  md5(session."id"::text || ':credential:1')::uuid,
  session."id",
  session."refreshTokenHash",
  CASE
    WHEN session."status" = 'ACTIVE' AND session."revokedAt" IS NULL
      THEN 'ACTIVE'::"RefreshCredentialStatus"
    WHEN session."status" = 'ROTATED'
      THEN 'USED'::"RefreshCredentialStatus"
    ELSE 'REVOKED'::"RefreshCredentialStatus"
  END,
  session."createdAt",
  CASE
    WHEN session."status" = 'ROTATED'
      THEN COALESCE(session."lastUsedAt", session."updatedAt")
    ELSE NULL
  END,
  CASE
    WHEN session."status" NOT IN ('ACTIVE', 'ROTATED')
      OR (session."status" = 'ACTIVE' AND session."revokedAt" IS NOT NULL)
      THEN COALESCE(session."revokedAt", session."updatedAt")
    ELSE NULL
  END,
  CASE
    WHEN session."replacedById" IS NOT NULL
      THEN md5(session."replacedById"::text || ':credential:1')::uuid
    ELSE NULL
  END,
  ROW_NUMBER() OVER (
    PARTITION BY session."familyId"
    ORDER BY session."createdAt", session."id"
  )::INTEGER,
  session."createdAt"
FROM "UserSession" AS session;

CREATE UNIQUE INDEX "UserSessionRefreshCredential_hash_key"
ON "UserSessionRefreshCredential"("hash");

CREATE INDEX "UserSessionRefreshCredential_sessionId_status_idx"
ON "UserSessionRefreshCredential"("sessionId", "status");

CREATE INDEX "UserSessionRefreshCredential_sessionId_issuedAt_idx"
ON "UserSessionRefreshCredential"("sessionId", "issuedAt");

CREATE INDEX "UserSessionRefreshCredential_status_issuedAt_idx"
ON "UserSessionRefreshCredential"("status", "issuedAt");

CREATE UNIQUE INDEX "UserSessionRefreshCredential_one_active_per_session_key"
ON "UserSessionRefreshCredential"("sessionId")
WHERE "status" = 'ACTIVE';

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_replacedById_fkey"
FOREIGN KEY ("replacedById") REFERENCES "UserSessionRefreshCredential"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_rotationSequence_positive_check"
CHECK ("rotationSequence" >= 1);

ALTER TABLE "UserSessionRefreshCredential"
ADD CONSTRAINT "UserSessionRefreshCredential_state_shape_check"
CHECK (
  ("status" = 'ACTIVE' AND "usedAt" IS NULL AND "revokedAt" IS NULL)
  OR ("status" = 'USED' AND "usedAt" IS NOT NULL AND "revokedAt" IS NULL)
  OR ("status" = 'REVOKED' AND "usedAt" IS NULL AND "revokedAt" IS NOT NULL)
);

CREATE INDEX "UserSession_userId_status_idx"
ON "UserSession"("userId", "status");

CREATE INDEX "UserSession_tenantId_status_idx"
ON "UserSession"("tenantId", "status");

CREATE INDEX "UserSession_familyId_createdAt_idx"
ON "UserSession"("familyId", "createdAt");

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_version_positive_check"
CHECK ("version" >= 1);
