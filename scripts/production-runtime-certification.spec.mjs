import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  loadEnv,
  assertProductionFlagsDisabled,
  assertUnacceptedPrototypeRuntimeAllowed,
  assertScaffoldRuntimeNotProduction,
  parseUrlConfig,
  parseReleaseIdentity,
  assertNoServerSecretsInPublicEnv,
  validateRuntimeConfig,
} from '../packages/config/dist/index.js';
import {
  AUTH_PRODUCTION_FORBIDDEN_FLAGS,
  assertAuthProductionRuntimePolicy,
} from '../apps/auth-service/dist/auth-production-runtime.js';

describe('Task 0023 — Production Runtime & Configuration Policy Spec', () => {
  it('A: required production value missing => fail closed with key name', () => {
    assert.throws(
      () => loadEnv(['DATABASE_URL'], {}),
      (err) => {
        assert.match(err.message, /Missing required environment variable/);
        assert.match(err.message, /DATABASE_URL/);
        return true;
      },
    );
  });

  it('B: required production value whitespace-only => fail closed', () => {
    assert.throws(
      () => loadEnv(['DATABASE_URL'], { DATABASE_URL: '   ' }),
      (err) => {
        assert.match(err.message, /Missing required environment variable/);
        assert.match(err.message, /DATABASE_URL/);
        return true;
      },
    );
  });

  it('C: malformed critical URL configuration => fail closed', () => {
    assert.throws(
      () =>
        parseUrlConfig('TELEMETRY_METRICS_EXPORT_ENDPOINT', {
          TELEMETRY_METRICS_EXPORT_ENDPOINT: 'not-a-url',
        }),
      (err) => {
        assert.match(err.message, /Invalid URL format for environment variable/);
        assert.match(err.message, /TELEMETRY_METRICS_EXPORT_ENDPOINT/);
        return true;
      },
    );
  });

  it('D: error reports variable NAME but NEVER secret VALUE', () => {
    const SECRET_VAL = 'super-secret-jwt-key-material-999';
    try {
      assertAuthProductionRuntimePolicy({
        NODE_ENV: 'production',
        ENABLE_SWAGGER: 'true',
        AUTH_JWT_PRIVATE_KEY_BASE64: SECRET_VAL,
      });
      assert.fail('Expected policy error');
    } catch (err) {
      assert.match(err.message, /auth-service production runtime forbids development\/test flag/);
      assert.match(err.message, /ENABLE_SWAGGER/);
      assert.strictEqual(err.message.includes(SECRET_VAL), false);
    }
  });

  it('E: development/test flags rejected in production', () => {
    for (const flag of AUTH_PRODUCTION_FORBIDDEN_FLAGS) {
      assert.throws(
        () =>
          assertProductionFlagsDisabled('auth-service', [flag], {
            NODE_ENV: 'production',
            [flag]: 'true',
          }),
        (err) => {
          assert.match(err.message, new RegExp(flag));
          return true;
        },
      );
    }
  });

  it('F: permitted production-safe configuration passes', () => {
    assert.doesNotThrow(() => {
      validateRuntimeConfig(
        {
          serviceName: 'auth-service',
          requiredKeys: ['NODE_ENV'],
          urls: [
            {
              key: 'AUTH_JWT_ISSUER',
              options: {
                requireHttpsInProduction: true,
                allowCredentials: false,
                allowLoopbackInProduction: false,
              },
            },
          ],
          forbiddenFlags: AUTH_PRODUCTION_FORBIDDEN_FLAGS,
        },
        {
          NODE_ENV: 'production',
          AUTH_JWT_ISSUER: 'https://auth.example.com',
          ENABLE_SWAGGER: 'false',
        },
      );
    });

    const RAW_BAD_URL = 'not-a-url-SHOULD-NEVER-LEAK';
    assert.throws(
      () =>
        validateRuntimeConfig(
          {
            serviceName: 'auth-service',
            urls: [
              {
                key: 'AUTH_JWT_ISSUER',
                options: {
                  requireHttpsInProduction: true,
                  allowCredentials: false,
                  allowLoopbackInProduction: false,
                },
              },
            ],
          },
          {
            NODE_ENV: 'production',
            AUTH_JWT_ISSUER: RAW_BAD_URL,
          },
        ),
      (err) => {
        assert.match(err.message, /AUTH_JWT_ISSUER/);
        assert.strictEqual(err.message.includes(RAW_BAD_URL), false);
        return true;
      },
    );
  });

  it('G: prototype services remain impossible to activate in production', () => {
    assert.throws(
      () =>
        assertUnacceptedPrototypeRuntimeAllowed('inventory-service', { NODE_ENV: 'production' }),
      (err) => {
        assert.match(
          err.message,
          /inventory-service contains unaccepted prototype routes and cannot run in production/,
        );
        return true;
      },
    );

    assert.throws(
      () => assertScaffoldRuntimeNotProduction('api-gateway', { NODE_ENV: 'production' }),
      (err) => {
        assert.match(err.message, /api-gateway is a health-only scaffold/);
        return true;
      },
    );
  });

  it('H: test/mock verification/provider modes impossible to activate in production', () => {
    assert.throws(
      () =>
        assertAuthProductionRuntimePolicy({
          NODE_ENV: 'production',
          ENABLE_TEST_VERIFICATION_PROVIDER: 'true',
        }),
      (err) => {
        assert.match(err.message, /ENABLE_TEST_VERIFICATION_PROVIDER/);
        return true;
      },
    );
  });

  it('I: server-only secrets cannot be accidentally exposed under NEXT_PUBLIC_ keys', () => {
    const cases = [
      ['NEXT_PUBLIC_DATABASE_URL', 'postgresql://user:pass@host/db'],
      ['NEXT_PUBLIC_MSG91_AUTH_KEY', 'msg91-secret-value'],
      ['NEXT_PUBLIC_MEDSPHERE_OTLP_COLLECTOR_AUTH_HEADER', 'Bearer secret-collector-token'],
      ['NEXT_PUBLIC_AUTH_REFRESH_TOKEN_PEPPER', 'pepper-secret-value'],
      ['NEXT_PUBLIC_AUTH_JWT_PRIVATE_KEY_BASE64', 'private-key-secret-value'],
    ];

    for (const [key, secretValue] of cases) {
      assert.throws(
        () =>
          assertNoServerSecretsInPublicEnv({
            [key]: secretValue,
          }),
        (err) => {
          assert.match(
            err.message,
            /Forbidden exposure of server secret under public environment key/,
          );
          assert.match(err.message, new RegExp(key));
          assert.strictEqual(err.message.includes(secretValue), false);
          return true;
        },
      );
    }
  });

  it('J: release/build identity validation is bounded and deterministic', () => {
    const validProduction = {
      APP_VERSION: '1.2.3',
      RELEASE_SHA: '6bd5aee560f72aac6482384b320a7bb0e14d6657',
      NODE_ENV: 'production',
    };

    const release = parseReleaseIdentity(validProduction, {
      requiredInProduction: true,
    });

    assert.strictEqual(release.appVersion, '1.2.3');
    assert.strictEqual(release.releaseSha, '6bd5aee560f72aac6482384b320a7bb0e14d6657');

    assert.throws(
      () =>
        parseReleaseIdentity(
          {
            NODE_ENV: 'production',
            RELEASE_SHA: validProduction.RELEASE_SHA,
          },
          { requiredInProduction: true },
        ),
      /APP_VERSION/,
    );

    assert.throws(
      () =>
        parseReleaseIdentity(
          {
            NODE_ENV: 'production',
            APP_VERSION: '   ',
            RELEASE_SHA: validProduction.RELEASE_SHA,
          },
          { requiredInProduction: true },
        ),
      /APP_VERSION/,
    );

    assert.throws(
      () =>
        parseReleaseIdentity(
          {
            NODE_ENV: 'production',
            APP_VERSION: '1.2.3',
          },
          { requiredInProduction: true },
        ),
      /RELEASE_SHA/,
    );

    assert.throws(
      () =>
        parseReleaseIdentity(
          {
            NODE_ENV: 'production',
            APP_VERSION: '1.2.3',
            RELEASE_SHA: 'abcdef0',
          },
          { requiredInProduction: true },
        ),
      /full 40-character hexadecimal Git commit SHA/,
    );

    assert.throws(
      () =>
        parseReleaseIdentity(
          {
            NODE_ENV: 'production',
            APP_VERSION: 'invalid version!',
            RELEASE_SHA: validProduction.RELEASE_SHA,
          },
          { requiredInProduction: true },
        ),
      /APP_VERSION has an invalid format/,
    );
  });

  it('K: existing localhost/development fallbacks work only outside production', () => {
    assert.doesNotThrow(() => {
      parseUrlConfig(
        'AUTH_API_URL',
        {
          NODE_ENV: 'development',
          AUTH_API_URL: 'http://localhost:3000',
        },
        { allowLoopbackInProduction: false },
      );
    });

    assert.throws(
      () =>
        parseUrlConfig(
          'AUTH_API_URL',
          {
            NODE_ENV: 'production',
            AUTH_API_URL: 'http://localhost:3000',
          },
          { allowLoopbackInProduction: false },
        ),
      (err) => {
        assert.match(err.message, /AUTH_API_URL must not target a loopback host in production/);
        return true;
      },
    );
  });

  it('N: certification output never emits injected sentinel secret values', () => {
    const sentinel = 'TASK0023-SECRET-SENTINEL-MUST-NEVER-APPEAR';

    const result = spawnSync(process.execPath, ['scripts/production-runtime-certification.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_DATABASE_URL: sentinel,
      },
    });

    assert.strictEqual(result.status, 0);

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    assert.strictEqual(output.includes(sentinel), false);
  });
});
