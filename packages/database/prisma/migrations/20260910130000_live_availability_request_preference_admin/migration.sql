-- Task 0027: trusted administration for pharmacy live-request preferences.
--
-- This migration intentionally follows the already-applied
-- 20260910120000_live_availability_request_controls migration instead of
-- rewriting it.
--
-- The existing Task 0026 `.manage` permission means "respond to requests".
-- Preference administration is a distinct organization-level authority and
-- therefore receives its own least-privilege permission.
--
-- No requester identity, patient data, stock quantity, or second request
-- lifecycle is introduced here.

ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES (
    md5('aim:permission:inventory.availability-requests.configure')::uuid,
    'inventory.availability-requests.configure',
    'Configure live availability request participation for an assigned provider'
);

ALTER TABLE "Permission"
ENABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "RolePermission" (
    "id",
    "tenantId",
    "roleId",
    "permissionId",
    "createdAt"
)
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
  AND p."name" = 'inventory.availability-requests.configure';

-- Extend the immutable DB-level audit-event allowlist with the Task 0027
-- provider preference configuration event. Every previously accepted event
-- remains allowed.
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