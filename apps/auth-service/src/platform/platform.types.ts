/**
 * Task 0021 — Platform administration security foundation.
 *
 * Canonical types for the dedicated, tenant-less platform identity and
 * session boundary. These types are intentionally distinct from the tenant
 * `Auth/AccessTokenIdentity` types: a platform access token can never carry
 * tenant context, and a tenant access token can never be validated as a
 * platform token.
 */

export const PLATFORM_ACCESS_TOKEN_TYPE = 'pt+jwt';
export const PLATFORM_ACCESS_TOKEN_USE = 'platform-access';
export const PLATFORM_REFRESH_CREDENTIAL_PREFIX = 'psr.';

export interface PlatformAccessTokenIdentity {
  /** The exact global AIM user id (server-derived, never client-supplied). */
  readonly userId: string;
  /** The live platform account the user is acting through. */
  readonly platformAccountId: string;
  /** The dedicated platform session id. */
  readonly platformSessionId: string;
  /** Task 0014 parity: increments on lock so pre-lock tokens fail closed. */
  readonly securityVersion: number;
}

export interface PlatformAccessTokenClaims {
  readonly sub: string;
  readonly paid: string;
  readonly psid: string;
  readonly sv: number;
  readonly jti: string;
  readonly tokenUse: typeof PLATFORM_ACCESS_TOKEN_USE;
  readonly iss?: string;
  readonly aud?: string | string[];
  readonly iat?: number;
  readonly exp?: number;
}

export interface PlatformAuthenticatedIdentity extends PlatformAccessTokenIdentity {
  readonly tokenId: string;
}

export interface PlatformRefreshCredentialParts {
  readonly platformSessionId: string;
  readonly verifier: string;
}

export interface IssuedPlatformRefreshCredential {
  readonly value: string;
  readonly hash: string;
  readonly platformSessionId: string;
}

export interface IssuedPlatformAccessToken {
  readonly value: string;
  readonly expiresIn: number;
  readonly tokenId: string;
}

export type PlatformRotationResult =
  | {
      readonly status: 'ROTATED';
      readonly identity: PlatformAccessTokenIdentity;
      readonly expiresAt: Date;
      readonly absoluteExpiresAt: Date;
    }
  | { readonly status: 'REPLAY_DETECTED' }
  | { readonly status: 'INVALID' }
  | { readonly status: 'EXPIRED' }
  | { readonly status: 'REVOKED' }
  | { readonly status: 'IDENTITY_DISABLED' }
  | { readonly status: 'LOCKED' }
  | { readonly status: 'PLATFORM_ACCESS_DISABLED' };
