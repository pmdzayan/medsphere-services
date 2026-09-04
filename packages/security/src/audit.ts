import type { AuditDatabase, AuditWriter } from '@medsphere/database';
import type { TrustedTenantActor } from './trusted-actor';

/**
 * Task 0020 — Common exact-user audit adapter.
 *
 * This is the ONLY bridge through which a common vertical should record a
 * TENANT_USER audit event. It keeps the Task 0019 exact-user contract
 * authoritative and fail-closed:
 *
 * - actorUserId comes only from the trusted server-derived actor, so a future
 *   vertical cannot record a human action against a fabricated or
 *   client-supplied identity.
 * - There is deliberately NO "human action recorded as SYSTEM" shortcut, and
 *   no "membership-only" shortcut: if you do not hold the exact actor user id
 *   you cannot emit a TENANT_USER event through this adapter.
 * - SYSTEM / PLATFORM_USER semantics are intentionally not exposed here: those
 *   belong to the shared AuditWriter and to platform-side callers. Task 0019
 *   requires SYSTEM rows stay identity-free and PLATFORM_USER rows stay
 *   platform-scoped, both of which the shared AuditWriter already enforces.
 */

export type TenantUserAuditEventOverrides = Omit<
  Parameters<AuditWriter['appendTenantUser']>[1],
  'tenantId' | 'actorMembershipId' | 'actorUserId'
>;

/**
 * Record a TENANT_USER audit event with the actor's exact trusted identity.
 * `actor` and `event` are both required; there is no SYSTEM fallback.
 */
export async function appendExactTenantUserAudit(
  database: AuditDatabase,
  audit: AuditWriter,
  actor: TrustedTenantActor,
  event: TenantUserAuditEventOverrides,
): Promise<void> {
  if (!actor.userId || !actor.membershipId || !actor.tenantId) {
    throw new Error(
      'Exact tenant-user audit requires a complete trusted tenant actor (userId, membershipId, tenantId)',
    );
  }
  await audit.appendTenantUser(database, {
    ...event,
    tenantId: actor.tenantId,
    actorMembershipId: actor.membershipId,
    actorUserId: actor.userId,
  });
}
