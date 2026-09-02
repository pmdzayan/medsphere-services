import { parseAuthEnvironment } from '../auth-config.service';
import { createAuthConfigFixture } from './auth-config-fixture';
import { createRsaTestKeyFixture } from './rsa-key-fixture';

describe('createAuthConfigFixture', () => {
  it('creates a complete configuration accepted by production parsing', () => {
    const environment = createAuthConfigFixture();
    const parsed = parseAuthEnvironment(environment);

    expect(parsed.accessTokenTtlSeconds).toBe(900);
    expect(parsed.recentAuthTtlSeconds).toBe(300);
    expect(parsed.refreshIdleTtlSeconds).toBe(604800);
    expect(parsed.refreshAbsoluteTtlSeconds).toBe(2592000);
    expect(parsed.refreshTokenPepper).toHaveLength(32);
    expect(parsed.argon2MemoryKiB).toBe(19456);
    expect(parsed.argon2TimeCost).toBe(2);
    expect(parsed.argon2Parallelism).toBe(1);
  });

  it('supports isolated overrides without mutating process.env', () => {
    const originalEnvironment = { ...process.env };
    const environment = createAuthConfigFixture({ AUTH_ACCESS_TOKEN_TTL_SECONDS: '300' });

    expect(environment.AUTH_ACCESS_TOKEN_TTL_SECONDS).toBe('300');
    expect(process.env).toEqual(originalEnvironment);
  });

  it('requires a bounded recent-authentication TTL', () => {
    const tooShort = createAuthConfigFixture({
      AUTH_RECENT_AUTH_TTL_SECONDS: '30',
    });
    const tooLong = createAuthConfigFixture({
      AUTH_RECENT_AUTH_TTL_SECONDS: '7200',
    });

    expect(() => parseAuthEnvironment(tooShort)).toThrow(
      'AUTH_RECENT_AUTH_TTL_SECONDS must be between 60 and 3600',
    );
    expect(() => parseAuthEnvironment(tooLong)).toThrow(
      'AUTH_RECENT_AUTH_TTL_SECONDS must be between 60 and 3600',
    );
  });

  it('fails closed when required asymmetric key material is absent', () => {
    const environment: NodeJS.ProcessEnv = { ...createAuthConfigFixture() };
    delete environment.AUTH_JWT_PRIVATE_KEY_BASE64;

    expect(() => parseAuthEnvironment(environment)).toThrow(
      'Missing required authentication environment variable: AUTH_JWT_PRIVATE_KEY_BASE64',
    );
  });

  it('rejects a public key that does not match the configured private key', () => {
    const unrelatedKeys = createRsaTestKeyFixture();
    const environment = createAuthConfigFixture({
      AUTH_JWT_PUBLIC_KEY_BASE64: unrelatedKeys.publicKeyBase64,
    });

    expect(() => parseAuthEnvironment(environment)).toThrow(
      'Authentication JWT public key does not match the private key',
    );
  });

  it('requires a clean HTTPS token issuer', () => {
    const environment = createAuthConfigFixture({
      AUTH_JWT_ISSUER: 'http://auth.medsphere.test?unsafe=true',
    });

    expect(() => parseAuthEnvironment(environment)).toThrow(
      'AUTH_JWT_ISSUER must be a clean HTTPS URL',
    );
  });

  it('rejects weak refresh-token peppers and unsafe TTL relationships', () => {
    const weakPepper = createAuthConfigFixture({
      AUTH_REFRESH_TOKEN_PEPPER: Buffer.alloc(16).toString('base64'),
    });
    const invalidTtl = createAuthConfigFixture({
      AUTH_REFRESH_IDLE_TTL_SECONDS: '600',
      AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    });

    expect(() => parseAuthEnvironment(weakPepper)).toThrow(
      'AUTH_REFRESH_TOKEN_PEPPER must contain at least 32 random bytes',
    );
    expect(() => parseAuthEnvironment(invalidTtl)).toThrow(
      'Refresh idle TTL must not be shorter than the access-token TTL',
    );
  });
});
