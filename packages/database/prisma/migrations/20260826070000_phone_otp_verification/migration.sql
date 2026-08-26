-- Real phone OTP verification foundation.
-- Adds only the live, single-use OTP challenge state required to verify a
-- phone number and feed the existing phoneVerifiedAt/account-activation
-- policy. Stores a cryptographic representation of the OTP only -- never
-- the plaintext code.

ALTER TYPE "AccountVerificationProvider" ADD VALUE 'SMS_OTP';

CREATE TABLE "PhoneOtpChallenge" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneOtpChallenge_tenantId_userId_key"
  ON "PhoneOtpChallenge"("tenantId", "userId");

CREATE INDEX "PhoneOtpChallenge_expiresAt_idx"
  ON "PhoneOtpChallenge"("expiresAt");

ALTER TABLE "PhoneOtpChallenge"
  ADD CONSTRAINT "PhoneOtpChallenge_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PhoneOtpChallenge"
  ADD CONSTRAINT "PhoneOtpChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extend the database audit-event allowlist for OTP request events.
-- Verification outcomes (success/failure) reuse the existing
-- 'authentication.verification.completed' event type and are not a new
-- allowlist entry.
ALTER TABLE "AuditEvent"
  DROP CONSTRAINT "AuditEvent_event_type_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_event_type_check"
  CHECK ("eventType" IN (
    'authorization.role.created',
    'authorization.role.updated',
    'authorization.role.deleted',
    'authorization.assignment.added',
    'authorization.assignment.removed',
    'authorization.provider-access.added',
    'authorization.provider-access.removed',
    'authorization.permission.denied',
    'authentication.session.created',
    'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed',
    'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded',
    'authentication.sessions.logout.succeeded',
    'authentication.verification.completed',
    'authentication.account.activated',
    'authentication.otp.requested',
    'inventory.listing.configured',
    'inventory.batch.received',
    'inventory.stock.adjusted',
    'inventory.stock.transferred',
    'inventory.stock.damaged',
    'inventory.batch.expired',
    'inventory.batch.quarantined',
    'inventory.reservation.created',
    'inventory.reservation.confirmed',
    'inventory.reservation.ready',
    'inventory.reservation.completed',
    'inventory.reservation.cancelled',
    'inventory.reservation.expired'
  ));
