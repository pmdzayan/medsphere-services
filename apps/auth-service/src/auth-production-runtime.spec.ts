import {
  AUTH_PRODUCTION_FORBIDDEN_FLAGS,
  assertAuthProductionRuntimePolicy,
} from './auth-production-runtime';

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

  it('allows production when development and test flags are disabled', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        NODE_ENV: 'production',
        ENABLE_SWAGGER: 'false',
        ENABLE_TEST_VERIFICATION_PROVIDER: 'false',
        ENABLE_UNACCEPTED_PROTOTYPE_SERVICES: 'false',
        ENABLE_PRISMA_QUERY_LOGGING: 'false',
        RUN_AUTH_INFRASTRUCTURE_TESTS: 'false',
      }),
    ).not.toThrow();
  });

  it.each(AUTH_PRODUCTION_FORBIDDEN_FLAGS)('rejects %s when enabled in production', (flag) => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        NODE_ENV: 'production',
        [flag]: 'true',
      }),
    ).toThrow(flag);
  });

  it('reports every conflicting production flag without exposing secret values', () => {
    expect(() =>
      assertAuthProductionRuntimePolicy({
        NODE_ENV: 'production',
        ENABLE_SWAGGER: 'true',
        ENABLE_TEST_VERIFICATION_PROVIDER: 'true',
        AUTH_JWT_PRIVATE_KEY_BASE64: 'must-never-appear',
      }),
    ).toThrow(
      'auth-service production runtime forbids development/test flag(s): ENABLE_SWAGGER, ENABLE_TEST_VERIFICATION_PROVIDER',
    );

    try {
      assertAuthProductionRuntimePolicy({
        NODE_ENV: 'production',
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
        NODE_ENV: 'production',
        ENABLE_SWAGGER: 'false',
        ENABLE_TEST_VERIFICATION_PROVIDER: 'yes',
      }),
    ).not.toThrow();
  });
});
