import { UnauthorizedException } from '@nestjs/common';
import { ACCESS_TOKEN_TYPE, ACCESS_TOKEN_USE, AccessTokenClaims } from './auth.types';

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Performs the header checks that must happen before a verification key is
 * selected. Returning false keeps malformed and algorithm-substitution
 * tokens on the same generic authentication-failure path.
 */
export function hasExpectedAccessTokenHeader(rawToken: string, keyId: string): boolean {
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
      (parsed as { typ?: unknown }).typ === ACCESS_TOKEN_TYPE &&
      (parsed as { kid?: unknown }).kid === keyId
    );
  } catch {
    return false;
  }
}

/**
 * One claim validator is shared by direct token verification and Passport's
 * request strategy so those security boundaries cannot drift apart.
 */
export function assertValidAccessTokenClaims(value: unknown): asserts value is AccessTokenClaims {
  if (typeof value !== 'object' || value === null) {
    throw new UnauthorizedException('Authentication required');
  }

  const claims = value as Partial<AccessTokenClaims>;
  if (
    claims.tokenUse !== ACCESS_TOKEN_USE ||
    !isUuid(claims.sub) ||
    !isUuid(claims.mid) ||
    !isUuid(claims.tid) ||
    !isUuid(claims.sid) ||
    !isUuid(claims.jti) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    (claims.exp as number) <= (claims.iat as number)
  ) {
    throw new UnauthorizedException('Authentication required');
  }
}
