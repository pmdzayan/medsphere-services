import { randomBytes } from 'node:crypto';
import { createRsaTestKeyFixture, type RsaKeyFixture } from './rsa-key-fixture';

/**
 * Test-only authentication configuration keys.
 *
 * All values are derived at runtime — never committed, logged, or persisted.
 * TTL values are decimal strings because production configuration surfaces them
 * as environment variables.
 */
export interface AuthConfigFixture {
  /** Base64-encoded private key PEM. */
  readonly AUTH_JWT_PRIVATE_KEY_BASE64: string;
  /** Base64-encoded public key PEM. */
  readonly AUTH_JWT_PUBLIC_KEY_BASE64: string;
  /** JWT issuer. Uses a reserved `.test` hostname. */
  readonly AUTH_JWT_ISSUER: string;
  /** JWT audience. */
  readonly AUTH_JWT_AUDIENCE: string;
  /** Key identifier. */
  readonly AUTH_JWT_KEY_ID: string;
  /** Access token TTL in seconds as a decimal string. */
  readonly AUTH_ACCESS_TOKEN_TTL_SECONDS: string;
  /** Refresh-token idle TTL in seconds as a decimal string. */
  readonly AUTH_REFRESH_IDLE_TTL_SECONDS: string;
  /** Refresh-token absolute TTL in seconds as a decimal string. */
  readonly AUTH_REFRESH_ABSOLUTE_TTL_SECONDS: string;
  /** A cryptographically random pepper for refresh-token signing. */
  readonly AUTH_REFRESH_TOKEN_PEPPER: string;
}

type AuthConfigOverrides = Partial<AuthConfigFixture>;

const TEST_ISSUER = 'https://auth.medsphere.test';
const TEST_AUDIENCE = 'medsphere-services.test';

/**
 * Create a complete, ephemeral test-only authentication configuration.
 *
 * Keys and secrets are generated every call using the RSA fixture and
 * `crypto.randomBytes`. The returned object is read-only and must not be
 * modified or snapshotted.
 *
 * @param overrides Optional partial overrides for any configuration key.
 */
export function createAuthConfigFixture(overrides?: AuthConfigOverrides): AuthConfigFixture {
  const keys: RsaKeyFixture = createRsaTestKeyFixture();
  const pepperBuffer = randomBytes(32);
  const pepper = pepperBuffer.toString('base64');

  const config: AuthConfigFixture = {
    AUTH_JWT_PRIVATE_KEY_BASE64: keys.privateKeyBase64,
    AUTH_JWT_PUBLIC_KEY_BASE64: keys.publicKeyBase64,
    AUTH_JWT_ISSUER: TEST_ISSUER,
    AUTH_JWT_AUDIENCE: TEST_AUDIENCE,
    AUTH_JWT_KEY_ID: keys.keyId,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    AUTH_REFRESH_IDLE_TTL_SECONDS: '604800',
    AUTH_REFRESH_ABSOLUTE_TTL_SECONDS: '2592000',
    AUTH_REFRESH_TOKEN_PEPPER: pepper,
  } as const;

  if (overrides !== undefined) {
    return { ...config, ...overrides };
  }

  return config;
}
