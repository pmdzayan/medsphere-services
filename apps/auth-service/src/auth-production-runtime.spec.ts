import {
  AUTH_PRODUCTION_FORBIDDEN_FLAGS,
  assertAuthProductionRuntimePolicy,
} from './auth-production-runtime';
import { createAuthConfigFixture } from './auth/testing/auth-config-fixture';

const VALID_PRODUCTION_ENV: Record<string, string> = {
  ...createAuthConfigFixture(),
  NODE_ENV: 'production',
  RELEASE_SHA: '6bd5aee560f72aac6482384b320a7bb0e14d6657',
  APP_VERSION: '1.0.0',
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/medsphere',
  REDIS_CLUSTER_URL: 'redis://:pass@redis.internal:6379',
  ENABLE_SWAGGER: 'false',
  ENABLE_TEST_VERIFICATION_PROVIDER: 'false',
  ENABLE_UNACCEPTED_PROTOTYPE_SERVICES: 'false',
  ENABLE_PRISMA_QUERY_LOGGING: 'false',
  RUN_AUTH_INFRASTRUCTURE_TESTS: 'false',
};

describe('auth-service production runtime policy', () => {
  it('allows development defaults', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        NODE_ENV: 'development',
        ENABLE_SWAGGER: 'true',
        ENABLE_TEST_VERIFICATION_PROVIDER: 'true',
      }),
    ).not.toThrow();
  });

  it('allows production when required variables are present and dev flags are disabled', () => {
    expect(() => assertAuthProductionRuntimePolicy(VALID_PRODUCTION_ENV)).not.toThrow();
  });

  it.each(AUTH_PRODUCTION_FORBIDDEN_FLAGS)('rejects %s when enabled in production', (flag) => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        [flag]: 'true',
      }),
    ).toThrow(flag);
  });

  it('reports missing required production variable', () => {
    const invalidEnv = { ...VALID_PRODUCTION_ENV };
    delete invalidEnv.DATABASE_URL;
    expect(() => assertAuthProductionRuntimePolicy(invalidEnv)).toThrow('DATABASE_URL');
  });

  it('reuses the accepted auth parser for missing authentication configuration', () => {
    const invalidEnv = { ...VALID_PRODUCTION_ENV };
    delete invalidEnv.AUTH_ACCESS_TOKEN_TTL_SECONDS;

    expect(() => assertAuthProductionRuntimePolicy(invalidEnv)).toThrow(
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    );
  });

  it('reuses the accepted auth parser for malformed authentication configuration', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        AUTH_JWT_PRIVATE_KEY_BASE64: 'not-valid-base64',
      }),
    ).toThrow('AUTH_JWT_PRIVATE_KEY_BASE64');
  });

  it('rejects out-of-policy Argon2 configuration before Nest bootstrap', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        AUTH_ARGON2_MEMORY_KIB: '1',
      }),
    ).toThrow('AUTH_ARGON2_MEMORY_KIB');
  });

  it('reports missing RELEASE_SHA in production', () => {
    const invalidEnv = { ...VALID_PRODUCTION_ENV };
    delete invalidEnv.RELEASE_SHA;
    expect(() => assertAuthProductionRuntimePolicy(invalidEnv)).toThrow('RELEASE_SHA');
  });

  it('allows the Docker default when PORT is not explicitly configured', () => {
    expect(() => assertAuthProductionRuntimePolicy(VALID_PRODUCTION_ENV)).not.toThrow();
  });

  it('allows a valid explicit production PORT override', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        PORT: '443',
      }),
    ).not.toThrow();
  });

  it.each(['', '   ', 'abc', '0', '65536'])(
    'rejects invalid explicit production PORT %p',
    (port) => {
      expect(() =>
        assertAuthProductionRuntimePolicy({
          ...VALID_PRODUCTION_ENV,
          PORT: port,
        }),
      ).toThrow('PORT');
    },
  );

  it('reports every conflicting production flag without exposing secret values', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        ENABLE_SWAGGER: 'true',
        ENABLE_TEST_VERIFICATION_PROVIDER: 'true',
        AUTH_JWT_PRIVATE_KEY_BASE64: 'must-never-appear',
      }),
    ).toThrow(
      'auth-service production runtime forbids development/test flag(s): ENABLE_SWAGGER, ENABLE_TEST_VERIFICATION_PROVIDER',
    );

    try {
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        ENABLE_SWAGGER: 'true',
        AUTH_JWT_PRIVATE_KEY_BASE64: 'must-never-appear',
      });
      throw new Error('Expected production policy failure');
    } catch (error) {
      expect(String(error)).not.toContain('must-never-appear');
    }
  });

  it('does not treat arbitrary non-true values as enabled', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        ...VALID_PRODUCTION_ENV,
        ENABLE_SWAGGER: 'false',
        ENABLE_TEST_VERIFICATION_PROVIDER: 'yes',
      }),
    ).not.toThrow();
  });
});
