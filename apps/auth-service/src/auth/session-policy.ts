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
  | { readonly outcome: 'IDENTITY_DISABLED' };

/**
 * Security policy:
 *
 * - A `USED` credential is a confirmed replay and must revoke the family.
 * - A `REVOKED` credential is rejected as revoked, not escalated to replay.
 * - An `UNKNOWN` credential is invalid, but never a confirmed replay. An
 *   attacker submitting a random secret with a known session ID must not be
 *   able to revoke a legitimate session.
 * - Session terminal state and expirations are evaluated before the identity
 *   chain so an already-revoked or expired session is reported accurately.
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

  if (
    context.sessionStatus === 'EXPIRED' ||
    context.expiresAt.getTime() <= context.now.getTime() ||
    context.absoluteExpiresAt.getTime() <= context.now.getTime()
  ) {
    return { outcome: 'EXPIRED' };
  }

  if (context.credentialState === 'USED') {
    return { outcome: 'REPLAY_DETECTED' };
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
