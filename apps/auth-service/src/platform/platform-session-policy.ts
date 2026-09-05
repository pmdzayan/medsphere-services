/**
 * Task 0021 — pure platform session-rotation decision logic.
 *
 * Mirror of the accepted tenant `session-policy.ts`, additionally decoding
 * the platform-access chain (platform account ACTIVE, platform user ACTIVE,
 * non-deleted). Kept free of Prisma/NestJS so it can be unit-tested without a
 * database.
 */

export type PlatformCredentialState = 'ACTIVE' | 'USED' | 'REVOKED' | 'UNKNOWN';

export type PlatformSessionStatusValue =
  'ACTIVE' | 'ROTATED' | 'EXPIRED' | 'REVOKED' | 'COMPROMISED';

export type PlatformAccountStatusValue = 'ACTIVE' | 'SUSPENDED';
export type UserStatusValue = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface PlatformSessionPolicyContext {
  readonly sessionStatus: PlatformSessionStatusValue;
  readonly sessionRevokedAt: Date | null;
  readonly sessionLockedAt: Date | null;
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly credentialState: PlatformCredentialState;
  readonly credentialRevokedAt: Date | null;
  readonly platformAccountStatus: PlatformAccountStatusValue;
  readonly platformAccountDeletedAt: Date | null;
  readonly hasActivePlatformRoleAssignment: boolean;
  readonly userStatus: UserStatusValue;
  readonly userDeletedAt: Date | null;
  readonly now: Date;
}

export type PlatformRotationDecision =
  | { readonly outcome: 'ROTATED' }
  | { readonly outcome: 'REPLAY_DETECTED' }
  | { readonly outcome: 'INVALID' }
  | { readonly outcome: 'EXPIRED' }
  | { readonly outcome: 'REVOKED' }
  | { readonly outcome: 'IDENTITY_DISABLED' }
  | { readonly outcome: 'LOCKED' }
  | { readonly outcome: 'PLATFORM_ACCESS_DISABLED' };

/**
 * Security policy (identical semantics to the tenant decision, plus the
 * platform-access chain):
 *
 * - USED credential -> confirmed replay, revoke family.
 * - REVOKED credential -> rejected as revoked (not escalated to replay).
 * - UNKNOWN credential -> invalid, never a confirmed replay.
 * - A locked platform session is not refreshable.
 * - A suspended platform account or a platform account with no live role
 *   assignment -> PLATFORM_ACCESS_DISABLED (never rotate).
 */
export function decidePlatformRotation(
  context: PlatformSessionPolicyContext,
): PlatformRotationDecision {
  if (
    context.sessionStatus === 'REVOKED' ||
    context.sessionStatus === 'COMPROMISED' ||
    context.sessionRevokedAt !== null
  ) {
    return { outcome: 'REVOKED' };
  }

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

  if (
    context.sessionStatus !== 'ACTIVE' ||
    context.platformAccountStatus !== 'ACTIVE' ||
    context.platformAccountDeletedAt !== null ||
    !context.hasActivePlatformRoleAssignment ||
    context.userStatus !== 'ACTIVE' ||
    context.userDeletedAt !== null
  ) {
    return { outcome: 'PLATFORM_ACCESS_DISABLED' };
  }

  return { outcome: 'ROTATED' };
}
