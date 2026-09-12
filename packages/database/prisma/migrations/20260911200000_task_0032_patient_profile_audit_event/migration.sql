-- AIM V1 Task 0032: Patient Identity, Profile & Dashboard.
--
-- Adds the patient.profile.updated audit event for authenticated patient
-- self-service profile updates.
--
-- This migration is deliberately forward-only and follows the complete
-- authoritative audit-event allowlist accepted through Task 0027.
-- Every previously accepted event remains allowed.

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
        'authorization.membership.suspended',
        'authorization.membership.revoked',

        'authentication.session.created',
        'authentication.session.refresh.succeeded',
        'authentication.session.refresh.failed',
        'authentication.session.refresh.replayed',
        'authentication.session.logout.succeeded',
        'authentication.sessions.logout.succeeded',
        'authentication.session.locked',
        'authentication.session.unlocked',
        'authentication.session.unlock.failed',
        'authentication.session.logout.locked',
        'authentication.session.switched',
        'authentication.session.reauthenticated',
        'authentication.verification.completed',
        'authentication.account.activated',
        'authentication.otp.requested',
        'authentication.organization.join.requested',
        'authentication.organization.join.code.rejected',
        'authentication.organization.join.code.issued',
        'authentication.organization.join.code.revoked',

        'privacy.consent.granted',
        'privacy.consent.withdrawn',
        'privacy.preference.changed',

        'patient.profile.updated',

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
        'inventory.reservation.expired',
        'inventory.availability-request.responded',
        'inventory.availability-request.preference.configured',

        'platform.authentication.session.created',
        'platform.authentication.session.refresh.succeeded',
        'platform.authentication.session.refresh.failed',
        'platform.authentication.session.refresh.replayed',
        'platform.authentication.session.logout.succeeded',
        'platform.authentication.session.locked',
        'platform.authentication.session.unlocked',
        'platform.invitation.created',
        'platform.invitation.revoked',
        'platform.invitation.accepted',
        'platform.role.assigned',
        'platform.admin.suspended',
        'platform.admin.reactivated',
        'platform.session.revoked',
        'platform.owner.bootstrap'
    ));