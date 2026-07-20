import { createSign, createVerify } from 'node:crypto';
import { createAuthConfigFixture } from './auth-config-fixture';

describe('createAuthConfigFixture', () => {
  it('should return all required configuration keys', () => {
    const config = createAuthConfigFixture();
    const expectedKeys: (keyof typeof config)[] = [
      'AUTH_JWT_PRIVATE_KEY_BASE64',
      'AUTH_JWT_PUBLIC_KEY_BASE64',
      'AUTH_JWT_ISSUER',
      'AUTH_JWT_AUDIENCE',
      'AUTH_JWT_KEY_ID',
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      'AUTH_REFRESH_IDLE_TTL_SECONDS',
      'AUTH_REFRESH_ABSOLUTE_TTL_SECONDS',
      'AUTH_REFRESH_TOKEN_PEPPER',
    ];

    for (const key of expectedKeys) {
      expect(config[key]).toBeDefined();
    }
  });

  it('should have access token TTL of 900 seconds', () => {
    const config = createAuthConfigFixture();
    expect(config.AUTH_ACCESS_TOKEN_TTL_SECONDS).toBe('900');
  });

  it('should have refresh idle TTL of 604800 seconds', () => {
    const config = createAuthConfigFixture();
    expect(config.AUTH_REFRESH_IDLE_TTL_SECONDS).toBe('604800');
  });

  it('should have refresh absolute TTL of 2592000 seconds', () => {
    const config = createAuthConfigFixture();
    expect(config.AUTH_REFRESH_ABSOLUTE_TTL_SECONDS).toBe('2592000');
  });

  it('should use a reserved .test issuer hostname', () => {
    const config = createAuthConfigFixture();
    expect(config.AUTH_JWT_ISSUER).toMatch(/\.test$/);
  });

  it('should decode the pepper to at least 32 bytes', () => {
    const config = createAuthConfigFixture();
    const decoded = Buffer.from(config.AUTH_REFRESH_TOKEN_PEPPER, 'base64');
    expect(decoded.length).toBeGreaterThanOrEqual(32);
  });

  it('should replace only specified values when overrides are provided', () => {
    const customIssuer = 'https://custom.test';
    const config = createAuthConfigFixture({ AUTH_JWT_ISSUER: customIssuer });

    expect(config.AUTH_JWT_ISSUER).toBe(customIssuer);
    expect(config.AUTH_JWT_AUDIENCE).toBe('medsphere-services.test');
    expect(config.AUTH_ACCESS_TOKEN_TTL_SECONDS).toBe('900');
  });

  it('should generate key material that can sign and verify', () => {
    const config = createAuthConfigFixture();
    const message = 'config-test-message';

    const privatePem = Buffer.from(config.AUTH_JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
    const publicPem = Buffer.from(config.AUTH_JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf-8');

    const signer = createSign('SHA256');
    signer.update(message);
    signer.end();
    const signature = signer.sign(privatePem);

    const verifier = createVerify('SHA256');
    verifier.update(message);
    verifier.end();
    const isValid = verifier.verify(publicPem, signature);

    expect(isValid).toBe(true);
  });

  it('should not modify process.env', () => {
    const originalEnv = { ...process.env };
    createAuthConfigFixture();
    expect(process.env).toEqual(originalEnv);
  });

  it('should not expose private key material in test output', () => {
    const config = createAuthConfigFixture();
    const output = JSON.stringify(config);
    expect(output).not.toContain('BEGIN PRIVATE KEY');
    expect(output).not.toContain('BEGIN PUBLIC KEY');
  });
});
