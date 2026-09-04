-- Task 0019: exact-user audit accountability.
--
-- Adds an immutable actorUserId to AuditEvent for TENANT_USER events so every
-- human audit event can be attributed to the exact authenticated user, not
-- merely a membership that could later be reassigned.
--
-- actorUserId stays NULLABLE at the SQL column level. The scoped
-- "AuditEvent_actor_scope_check" constraint enforces the invariants:
--   * TENANT_USER  -> exact actorUserId required;
--   * SYSTEM/service actors (tenant- or platform-scoped) -> actorUserId IS NULL;
--   * PLATFORM_USER -> existing platformActorUserId semantics unchanged.
--
-- The composite FK (actorMembershipId, actorUserId, tenantId) references
-- TenantMembership(id, userId, tenantId) -- the same pattern already used by
-- OutboxEvent -- so the database proves the membership-user-tenant triple at
-- write time. This prevents:
--   * a membership from Tenant A being recorded as actor in Tenant B
--   * a user/membership pair that does not belong together
--   * cross-tenant identity spoofing
--   * an arbitrary user ID being paired with another user's membership
--
-- Historical TENANT_USER rows are backfilled from their existing membership's
-- userId. This is objectively correct (reading the actual membership's user,
-- never fabricating an identity) and always satisfies the composite FK because
-- actorMembershipId + tenantId already reference that same membership. The
-- append-only trigger is suspended only for the duration of the backfill and
-- restored immediately afterwards (the same convention Task 0018 used for the
-- Permission catalogue).

-- 1. Add the actor user identifier column. Nullable at the SQL level; the
--    scoped CHECK below requires it for TENANT_USER rows only.
ALTER TABLE "AuditEvent"
ADD COLUMN "actorUserId" UUID;

-- 2. Suspend the append-only trigger while backfilling immutable history.
ALTER TABLE "AuditEvent"
DISABLE TRIGGER "AuditEvent_reject_update_delete";

-- 3. Backfill from the existing membership's user. This is safe: the
--    actorMembershipId + tenantId FK already proves the membership exists, and
--    every membership has exactly one userId. Rows whose membership no longer
--    exists cannot occur because the FK is RESTRICT (membership rows are never
--    deleted), so every TENANT_USER row has a resolvable user.
UPDATE "AuditEvent" ae
SET "actorUserId" = tm."userId"
FROM "TenantMembership" tm
WHERE ae."actorType" = 'TENANT_USER'
  AND ae."actorMembershipId" = tm."id"
  AND ae."tenantId" = tm."tenantId";

-- 4. Fail closed if any TENANT_USER row could not be resolved. This must never
--    happen given the RESTRICT FK, but if it does we refuse to proceed rather
--    than silently leaving an unattributable human event.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AuditEvent"
    WHERE "actorType" = 'TENANT_USER'
      AND "actorUserId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Task 0019 migration blocked: TENANT_USER audit rows without a resolvable actor user require explicit remediation';
  END IF;
END $$;

-- 5. Restore the append-only trigger.
ALTER TABLE "AuditEvent"
ENABLE TRIGGER "AuditEvent_reject_update_delete";

-- 6. Enforce the exact-user invariant in the actor/scope check. TENANT_USER
--    events must now carry actorUserId; SYSTEM/service actors (tenant- or
--    platform-scoped) must not; PLATFORM_USER keeps its existing
--    platformActorUserId semantics.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actor_scope_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor_scope_check" CHECK (
  (
    "scope" = 'TENANT'
    AND "actorType" = 'TENANT_USER'
    AND "tenantId" IS NOT NULL
    AND "actorMembershipId" IS NOT NULL
    AND "actorUserId" IS NOT NULL
    AND "platformActorUserId" IS NULL
  )
  OR
  (
    "scope" = 'TENANT'
    AND "actorType" = 'SYSTEM'
    AND "tenantId" IS NOT NULL
    AND "actorMembershipId" IS NULL
    AND "actorUserId" IS NULL
    AND "platformActorUserId" IS NULL
  )
  OR
  (
    "scope" = 'PLATFORM'
    AND "actorType" = 'PLATFORM_USER'
    AND "tenantId" IS NULL
    AND "actorMembershipId" IS NULL
    AND "actorUserId" IS NULL
    AND "platformActorUserId" IS NOT NULL
  )
  OR
  (
    "scope" = 'PLATFORM'
    AND "actorType" = 'SYSTEM'
    AND "tenantId" IS NULL
    AND "actorMembershipId" IS NULL
    AND "actorUserId" IS NULL
    AND "platformActorUserId" IS NULL
  )
);

-- 7. Retain the composite FK proving the membership-user-tenant triple (same
--    pattern as OutboxEvent). This replaces the previous simple
--    membership-tenant FK and preserves historical attribution after
--    membership suspension/revocation because membership rows are never
--    deleted.
ALTER TABLE "AuditEvent"
DROP CONSTRAINT "AuditEvent_actorMembershipId_tenantId_fkey";
ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_actorMembershipId_actorUserId_tenantId_fkey"
FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId")
REFERENCES "TenantMembership"("id", "userId", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Direct FK to the global user for platform-style lookups and to keep the
--    user row from being deleted while any audit evidence references it.
ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- 9. Index for exact-user audit queries.
CREATE INDEX "AuditEvent_actorUserId_occurredAt_idx"
ON "AuditEvent"("actorUserId", "occurredAt" DESC);