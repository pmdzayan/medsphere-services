import { randomBytes } from 'node:crypto';
import { createRsaTestKeyFixture } from './rsa-key-fixture';

export type AuthConfigFixtureKey =
  | 'AUTH_JWT_PRIVATE_KEY_BASE64'
  | 'AUTH_JWT_PUBLIC_KEY_BASE64'
  | 'AUTH_JWT_ISSUER'
  | 'AUTH_JWT_AUDIENCE'
  | 'AUTH_JWT_KEY_ID'
  | 'AUTH_ACCESS_TOKEN_TTL_SECONDS'
  | 'AUTH_REFRESH_IDLE_TTL_SECONDS'
  | 'AUTH_REFRESH_ABSOLUTE_TTL_SECONDS'
  | 'AUTH_REFRESH_TOKEN_PEPPER'
  | 'AUTH_ARGON2_MEMORY_KIB'
  | 'AUTH_ARGON2_TIME_COST'
  | 'AUTH_ARGON2_PARALLELISM';

export type AuthConfigFixture = Readonly<Record<AuthConfigFixtureKey, string>>;

/**
 * Creates a complete, ephemeral environment-shaped auth configuration. It
 * does not mutate process.env and callers must never snapshot the result.
 */
export function createAuthConfigFixture(
  overrides: Partial<AuthConfigFixture> = {},
): AuthConfigFixture {
  const keys = createRsaTestKeyFixture();
  return {
    AUTH_JWT_PRIVATE_KEY_BASE64: keys.privateKeyBase64,
    AUTH_JWT_PUBLIC_KEY_BASE64: keys.publicKeyBase64,
    AUTH_JWT_ISSUER: 'https://auth.medsphere.test',
    AUTH_JWT_AUDIENCE: 'medsphere-services.test',
    AUTH_JWT_KEY_ID: keys.keyId,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    AUTH_REFRESH_IDLE_TTL_SECONDS: '604800',
    AUTH_REFRESH_ABSOLUTE_TTL_SECONDS: '2592000',
    AUTH_REFRESH_TOKEN_PEPPER: randomBytes(32).toString('base64'),
    AUTH_ARGON2_MEMORY_KIB: '19456',
    AUTH_ARGON2_TIME_COST: '2',
    AUTH_ARGON2_PARALLELISM: '1',
    ...overrides,
  };
}
