import { UnauthorizedException } from '@nestjs/common';
import {
  PLATFORM_ACCESS_TOKEN_TYPE,
  PLATFORM_ACCESS_TOKEN_USE,
  PlatformAccessTokenClaims,
} from './platform.types';
import { isUuid } from '../auth/access-token.validation';

/**
 * Fail-closed platform access-token header check. A tenant access token
 * carries `typ = at+jwt` and is therefore rejected here before any crypto is
 * attempted, preserving cryptographic separation between the tenant and
 * platform token domains.
 */
export function hasExpectedPlatformAccessTokenHeader(rawToken: string, keyId: string): boolean {
  const parts = rawToken.split('.');
  if (parts.length !== 3 || !parts[0]) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { alg?: unknown }).alg === 'RS256' &&
      (parsed as { typ?: unknown }).typ === PLATFORM_ACCESS_TOKEN_TYPE &&
      (parsed as { kid?: unknown }).kid === keyId
    );
  } catch {
    return false;
  }
}

/**
 * One claim validator shared by direct platform-token verification and the
 * platform Passport strategy so those security boundaries cannot drift.
 *
 * A platform access token MUST NOT contain tenantId/membershipId. We enforce
 * this by requiring the platform-only claims and by rejecting the tenant
 * claims (`mid`, `tid`, `sid`) if they are ever present.
 */
export function assertValidPlatformAccessTokenClaims(
  value: unknown,
): asserts value is PlatformAccessTokenClaims {
  if (typeof value !== 'object' || value === null) {
    throw new UnauthorizedException('Authentication required');
  }

  const claims = value as Partial<PlatformAccessTokenClaims> & {
    mid?: unknown;
    tid?: unknown;
    sid?: unknown;
  };

  if (
    claims.tokenUse !== PLATFORM_ACCESS_TOKEN_USE ||
    'mid' in claims ||
    'tid' in claims ||
    'sid' in claims ||
    !isUuid(claims.sub) ||
    !isUuid(claims.paid) ||
    !isUuid(claims.psid) ||
    !Number.isSafeInteger(claims.sv) ||
    (claims.sv as number) < 1 ||
    !isUuid(claims.jti) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    (claims.exp as number) <= (claims.iat as number)
  ) {
    throw new UnauthorizedException('Authentication required');
  }
}
