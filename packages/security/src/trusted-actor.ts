/**
 * Task 0020 — Common cross-vertical security framework.
 *
 * Canonical trusted server-derived identity contracts.
 *
 * THESE TYPES ARE THE ONLY ACCEPTED WAY TO DESCRIBE WHO IS ACTING.
 *
 * - A `TrustedTenantActor` is a human acting through an accepted tenant
 *   membership. It is produced ONLY by the authentication boundary after the
 *   access token is re-validated against the live session and the
 *   membership→user→tenant chain (ADR-003, ADR-004). Client-supplied
 *   `userId`, `tenantId`, `membershipId`, roles, permissions, or provider IDs
 *   must never be accepted as authority.
 * - A `TrustedPlatformActor` is a human acting at platform scope through the
 *   global identity (no tenant membership). Platform scope must never grant
 *   tenant-level privileges (Task 0021 covers platform administration).
 * - A `TrustedSystemActor` is an unattended background worker / service. It is
 *   identity-free (`userId`/`membershipId` never present). It must never be
 *   used to record a real human's action (Task 0019 audit requires exact-user
 *   attribution for TENANT_USER events).
 *
 * The discriminated union makes invalid combinations (e.g. a tenant actor with
 * a nullable user id) impossible in well-typed code.
 */

export interface TrustedTenantActor {
  readonly tenantId: string;
  /** The exact membership in `tenantId` that the actor is acting through. */
  readonly membershipId: string;
  /** The exact global user that owns `membershipId` (ADR-003 identity chain). */
  readonly userId: string;
}

export interface TrustedPlatformActor {
  readonly platformUserId: string;
}

export interface TrustedSystemActor {
  /** Accepted service/worker name, e.g. `reservation-expiry-worker`. */
  readonly service: string;
  /** Tenant scope for tenant-scoped background work; absent for platform scope. */
  readonly tenantId?: string;
}

export type TrustedActor = TrustedTenantActor | TrustedPlatformActor | TrustedSystemActor;

export type TrustedActorKind = 'tenant-user' | 'platform-user' | 'system';

export function trustedActorKind(actor: TrustedActor): TrustedActorKind {
  if ('tenantId' in actor && 'membershipId' in actor && 'userId' in actor) {
    return 'tenant-user';
  }
  if ('platformUserId' in actor) {
    return 'platform-user';
  }
  return 'system';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isTrustedTenantActor(value: unknown): value is TrustedTenantActor {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.membershipId) &&
    isNonEmptyString(candidate.userId)
  );
}

export function isTrustedPlatformActor(value: unknown): value is TrustedPlatformActor {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isNonEmptyString(candidate.platformUserId);
}

export function isTrustedSystemActor(value: unknown): value is TrustedSystemActor {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.service) &&
    !('userId' in candidate) &&
    !('membershipId' in candidate) &&
    !('platformUserId' in candidate)
  );
}

/**
 * Fail-closed accessor for the tenant-user variant. Throws rather than
 * returning a looser object, so ambiguous/nullable identity can never reach a
 * tenant-scoped call path.
 */
export function requireTrustedTenantActor(value: unknown): TrustedTenantActor {
  if (!isTrustedTenantActor(value)) {
    throw new Error('Trusted tenant actor identity is missing or incomplete');
  }
  return value;
}
