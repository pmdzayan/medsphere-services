/**
 * Pure session-rotation decision logic for AG-02A.
 *
 * Kept free of Prisma and NestJS dependencies so the security-significant
 * state classification can be unit-tested without a database or mocks.
 */

export type PresentedCredentialState = 'ACTIVE' | 'USED' | 'REVOKED' | 'UNKNOWN';

export type SessionStatusValue = 'ACTIVE' | 'ROTATED' | 'EXPIRED' | 'REVOKED' | 'COMPROMISED';

export type MembershipStatusValue = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export type UserStatusValue = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface SessionPolicyContext {
  readonly sessionStatus: SessionStatusValue;
  readonly sessionRevokedAt: Date | null;
  readonly sessionLockedAt: Date | null;
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly credentialState: PresentedCredentialState;
  readonly credentialRevokedAt: Date | null;
  readonly membershipStatus: MembershipStatusValue;
  readonly membershipDeletedAt: Date | null;
  readonly userStatus: UserStatusValue;
  readonly userDeletedAt: Date | null;
  readonly tenantIsActive: boolean;
  readonly tenantDeletedAt: Date | null;
  readonly now: Date;
}

export type RotationDecision =
  | { readonly outcome: 'ROTATED' }
  | { readonly outcome: 'REPLAY_DETECTED' }
  | { readonly outcome: 'INVALID' }
  | { readonly outcome: 'EXPIRED' }
  | { readonly outcome: 'REVOKED' }
  | { readonly outcome: 'IDENTITY_DISABLED' }
  | { readonly outcome: 'LOCKED' };

/**
 * Security policy:
 *
 * - A `USED` credential is a confirmed replay and must revoke the family.
 * - A `REVOKED` credential is rejected as revoked, not escalated to replay.
 * - An `UNKNOWN` credential is invalid, but never a confirmed replay. An
 *   attacker submitting a random secret with a known session ID must not be
 *   able to revoke a legitimate session.
 * - A confirmed replay outranks expiry. A consumed credential presented after
 *   its predecessor session's idle deadline can still expose theft and must
 *   revoke an otherwise-active successor in the same family.
 * - Revoked and compromised session-family state remains terminal, preventing
 *   repeated replay submissions from producing repeated compromise actions.
 * - The user/membership/tenant chain must all be active for rotation.
 */
export function decideRotation(context: SessionPolicyContext): RotationDecision {
  if (
    context.sessionStatus === 'REVOKED' ||
    context.sessionStatus === 'COMPROMISED' ||
    context.sessionRevokedAt !== null
  ) {
    return { outcome: 'REVOKED' };
  }

  // Task 0014: a locked session must not be refreshable through the normal
  // refresh path. Only the dedicated unlock endpoint may rotate it.
  if (context.sessionLockedAt !== null) {
    return { outcome: 'LOCKED' };
  }

  if (context.credentialState === 'USED') {
    return { outcome: 'REPLAY_DETECTED' };
  }

  if (
    context.sessionStatus === 'EXPIRED' ||
    context.expiresAt.getTime() <= context.now.getTime() ||
    context.absoluteExpiresAt.getTime() <= context.now.getTime()
  ) {
    return { outcome: 'EXPIRED' };
  }

  if (context.credentialState === 'REVOKED' || context.credentialRevokedAt !== null) {
    return { outcome: 'REVOKED' };
  }

  if (context.credentialState === 'UNKNOWN') {
    return { outcome: 'INVALID' };
  }

  // The presented credential is ACTIVE.
  if (context.sessionStatus !== 'ACTIVE') {
    return { outcome: 'INVALID' };
  }

  if (
    context.membershipStatus !== 'ACTIVE' ||
    context.membershipDeletedAt !== null ||
    context.userStatus !== 'ACTIVE' ||
    context.userDeletedAt !== null ||
    context.tenantIsActive !== true ||
    context.tenantDeletedAt !== null
  ) {
    return { outcome: 'IDENTITY_DISABLED' };
  }

  return { outcome: 'ROTATED' };
}
