-- Candidate Task 0032 (pre-0031): PATIENT IDENTITY, PROFILE & DASHBOARD.
-- This migration is PROVISIONAL -- see
-- docs/candidates/0032-patient-identity-profile-dashboard-pre0031.md
-- for the full candidate scope and reconciliation plan required once
-- Tasks 0019-0031 are accepted. No destructive change, no new table:
-- the candidate deliberately reuses the existing User and UserPrivacy
-- models for patient profile storage (see that document for why no
-- new PatientProfile model was introduced).
--
-- Adds exactly one new audit event type -- patient.profile.updated --
-- for the self-service profile-update action, written via
-- appendPlatformUser (global personal-identity scope, never tenant-
-- attributed). The CHECK constraint is rebuilt from the CURRENT full
-- authoritative packages/database/src/audit.ts allowlist (all 45
-- pre-existing types) plus this one new type, so this migration
-- cannot accidentally drop an event type introduced by another task.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_event_type_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_event_type_check" CHECK (
  "eventType" IN (
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
    'inventory.listing.configured',
    'patient.profile.updated',
    'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged', 'inventory.batch.expired', 'inventory.batch.quarantined',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired'
  )
);
