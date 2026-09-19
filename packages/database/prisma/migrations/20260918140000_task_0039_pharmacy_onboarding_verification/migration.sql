-- Candidate Task 0039 (PROVISIONAL) -- Pharmacy Onboarding & Verification
-- Closure. RECONCILED onto the accepted Task 0027 base (migrations
-- 20260910120000_live_availability_request_controls and
-- 20260910130000_live_availability_request_preference_admin).
--
-- Closes two gaps in the accepted `ProviderVerification` model:
--
-- 1. PROVIDER LINKAGE: `providerId`, NULLABLE (populated-upgrade safety
--    -- existing rows preserved exactly as-is, never fabricated a
--    provider), composite FK to `Provider(id, tenantId)`.
--
-- 2. CURRENT VERIFICATION AUTHORITY: `isCurrent` means "the record
--    currently AUTHORITATIVE for eligibility/state" -- NOT "the most
--    recent submission". A PARTIAL unique index (WHERE "isCurrent" =
--    true) guarantees at most one authoritative row per provider. This
--    is DELIBERATELY SEPARATE from a second, independent partial unique
--    index (WHERE status IN ('PENDING','UNDER_REVIEW')) guaranteeing at
--    most one OPEN submission per provider -- the two concepts are
--    never combined, so a valid APPROVED+current verification (still
--    isCurrent=true) can coexist with an in-flight PENDING renewal
--    (isCurrent=false) for the SAME provider. A CHECK constraint
--    guarantees a legacy row with no provider linkage (providerId IS
--    NULL) can NEVER be isCurrent -- i.e. can never make any Provider
--    verified.

ALTER TABLE "ProviderVerification"
  ADD COLUMN "providerId" UUID,
  ADD COLUMN "applicantMessage" VARCHAR(500),
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProviderVerification"
  ADD CONSTRAINT "ProviderVerification_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderVerification"
  ADD CONSTRAINT "ProviderVerification_isCurrent_requires_providerId"
  CHECK (NOT "isCurrent" OR "providerId" IS NOT NULL);

CREATE UNIQUE INDEX "ProviderVerification_current_per_provider"
  ON "ProviderVerification" ("providerId")
  WHERE "isCurrent" = true;

CREATE UNIQUE INDEX "ProviderVerification_open_submission_per_provider"
  ON "ProviderVerification" ("providerId")
  WHERE "status" IN ('PENDING', 'UNDER_REVIEW');

CREATE INDEX "ProviderVerification_providerId_idx"
  ON "ProviderVerification" ("providerId");

CREATE INDEX "ProviderVerification_providerId_isCurrent_idx"
  ON "ProviderVerification" ("providerId", "isCurrent");

-- ---------------------------------------------------------------------------
-- Extend the immutable DB-level audit-event allowlist (append-only,
-- preserving every prior accepted type through Task 0032 -- including
-- Task 0027's 'inventory.availability-request.preference.configured'
-- and Task 0032's 'patient.profile.updated') with the 7 new Task 0039
-- event types.
-- ---------------------------------------------------------------------------
ALTER TABLE "AuditEvent"
  DROP CONSTRAINT "AuditEvent_event_type_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_event_type_check"
  CHECK ("eventType" IN (
    'authorization.role.created', 'authorization.role.updated',
    'authorization.role.deleted', 'authorization.assignment.added',
    'authorization.assignment.removed', 'authorization.provider-access.added',
    'authorization.provider-access.removed', 'authorization.permission.denied',
    'authorization.membership.suspended', 'authorization.membership.revoked',
    'authentication.session.created', 'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed', 'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded', 'authentication.sessions.logout.succeeded',
    'authentication.session.locked', 'authentication.session.unlocked',
    'authentication.session.unlock.failed', 'authentication.session.logout.locked',
    'authentication.session.switched', 'authentication.session.reauthenticated',
    'authentication.verification.completed', 'authentication.account.activated',
    'authentication.otp.requested',
    'authentication.organization.join.requested',
    'authentication.organization.join.code.rejected',
    'authentication.organization.join.code.issued',
    'authentication.organization.join.code.revoked',
    'privacy.consent.granted', 'privacy.consent.withdrawn', 'privacy.preference.changed',
    'patient.profile.updated',
    'inventory.listing.configured', 'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged', 'inventory.batch.expired', 'inventory.batch.quarantined',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired',
    'inventory.availability-request.responded',
    'inventory.availability-request.preference.configured',
    'platform.authentication.session.created',
    'platform.authentication.session.refresh.succeeded',
    'platform.authentication.session.refresh.failed',
    'platform.authentication.session.refresh.replayed',
    'platform.authentication.session.logout.succeeded',
    'platform.authentication.session.locked',
    'platform.authentication.session.unlocked',
    'platform.invitation.created', 'platform.invitation.revoked', 'platform.invitation.accepted',
    'platform.role.assigned', 'platform.admin.suspended', 'platform.admin.reactivated',
    'platform.session.revoked', 'platform.owner.bootstrap',
    'pharmacy.verification.submitted', 'pharmacy.verification.resubmitted',
    'pharmacy.verification.review-started', 'pharmacy.verification.approved',
    'pharmacy.verification.rejected', 'pharmacy.verification.suspended',
    'pharmacy.verification.expired'
  ));

-- ---------------------------------------------------------------------------
-- Platform permission: verification review. Granted ONLY to
-- PLATFORM_OWNER, mirroring Task 0021's own precedent that
-- PLATFORM_ADMIN never receives consequential-tier (manage-analogous)
-- permissions -- unchanged by this reconciliation.
-- ---------------------------------------------------------------------------
ALTER TABLE "Permission"
  DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:platform.provider-verifications.review')::uuid,
    'platform.provider-verifications.review',
    'Review pharmacy onboarding verification submissions'
  )
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Permission"
  ENABLE TRIGGER "Permission_reject_insert_update_delete";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Permission"
    WHERE "name" = 'platform.provider-verifications.review'
      AND "id" <> md5('medsphere:permission:platform.provider-verifications.review')::uuid
  ) THEN
    RAISE EXCEPTION 'Task 0039 migration blocked: provider-verifications.review permission identifier does not match the authoritative catalogue';
  END IF;
END $$;

INSERT INTO "PlatformRolePermission" ("id", "roleId", "permissionId", "createdAt")
VALUES
  (
    md5('medsphere:platform-role-permission:OWNER:provider-verifications-review')::uuid,
    md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
    md5('medsphere:permission:platform.provider-verifications.review')::uuid,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tenant permission: pharmacy onboarding/verification submission by
-- assigned tenant staff, granted to TENANT_ADMINISTRATOR (matching
-- every other tenant permission's accepted grant target, including
-- Task 0027's own 'inventory.availability-requests.configure').
-- ---------------------------------------------------------------------------
ALTER TABLE "Permission"
  DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:provider.onboarding.manage')::uuid,
    'provider.onboarding.manage',
    'Submit and manage pharmacy onboarding/verification for an assigned provider'
  )
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Permission"
  ENABLE TRIGGER "Permission_reject_insert_update_delete";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Permission"
    WHERE "name" = 'provider.onboarding.manage'
      AND "id" <> md5('medsphere:permission:provider.onboarding.manage')::uuid
  ) THEN
    RAISE EXCEPTION 'Task 0039 migration blocked: provider.onboarding.manage permission identifier does not match the authoritative catalogue';
  END IF;
END $$;

INSERT INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT
  md5(r."id"::text || ':' || p."id"::text)::uuid,
  r."tenantId",
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'TENANT_ADMINISTRATOR'
  AND r."type" = 'SYSTEM'
  AND r."deletedAt" IS NULL
  AND p."name" = 'provider.onboarding.manage'
ON CONFLICT ("id") DO NOTHING;
