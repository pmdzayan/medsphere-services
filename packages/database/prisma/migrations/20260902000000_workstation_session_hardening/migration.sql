-- Task 0014: workstation/session hardening.
--
-- Forward-only migration. Adds server-authoritative workstation-lock state
-- to UserSession and extends the durable audit allowlist with the bounded
-- Task 0014 session-security events.

ALTER TABLE "UserSession"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockReason" VARCHAR(120),
  ADD COLUMN "unlockedAt" TIMESTAMP(3),
  ADD COLUMN "unlockMethod" VARCHAR(40),
  ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "recentAuthenticatedAt" TIMESTAMP(3);

CREATE INDEX "UserSession_status_lockedAt_idx"
  ON "UserSession"("status", "lockedAt");

ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_securityVersion_positive_check"
  CHECK ("securityVersion" >= 1);

-- Extend the database audit-event allowlist with the Task 0014
-- workstation/session events, preserving every previously accepted event
-- type (including Task 0010 organization-join and Task 0013 privacy events).
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_event_type_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_event_type_check" CHECK (
  "eventType" IN (
    'authorization.role.created', 'authorization.role.updated',
    'authorization.role.deleted', 'authorization.assignment.added',
    'authorization.assignment.removed', 'authorization.provider-access.added',
    'authorization.provider-access.removed', 'authorization.permission.denied',
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
    'inventory.listing.configured', 'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged', 'inventory.batch.expired', 'inventory.batch.quarantined',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired'
  )
);