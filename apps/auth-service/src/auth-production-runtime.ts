import {
  assertNoServerSecretsInPublicEnv,
  assertProductionFlagsDisabled,
  loadEnv,
  parseReleaseIdentity,
  parseUrlConfig,
} from '@medsphere/config';
import { parseAuthEnvironment } from './auth/auth-config.service';

export const AUTH_PRODUCTION_FORBIDDEN_FLAGS = [
  'ENABLE_SWAGGER',
  'ENABLE_TEST_VERIFICATION_PROVIDER',
  'ENABLE_UNACCEPTED_PROTOTYPE_SERVICES',
  'ENABLE_PRISMA_QUERY_LOGGING',
  'RUN_AUTH_INFRASTRUCTURE_TESTS',
] as const;

// Infrastructure keys owned by the production runtime boundary.
// Authentication-specific keys and semantic validation remain owned by
// the accepted parseAuthEnvironment() contract to avoid duplicated parsers.
export const AUTH_PRODUCTION_REQUIRED_VARS = ['DATABASE_URL', 'REDIS_CLUSTER_URL'] as const;

function assertOptionalProductionPort(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (environment.PORT === undefined) {
    return;
  }

  const raw = environment.PORT.trim();

  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error('PORT has an invalid format');
  }

  const port = Number(raw);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be between 1 and 65535');
  }
}

export function assertAuthProductionRuntimePolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  assertProductionFlagsDisabled('auth-service', AUTH_PRODUCTION_FORBIDDEN_FLAGS, environment);
  assertNoServerSecretsInPublicEnv(environment);

  if (environment.NODE_ENV === 'production') {
    loadEnv(AUTH_PRODUCTION_REQUIRED_VARS, environment);
    assertOptionalProductionPort(environment);
    parseReleaseIdentity(environment, { requiredInProduction: true });

    // Reuse the accepted authentication parser in full before Nest bootstrap.
    // This validates RSA key material, TTL relationships, peppers, Argon2
    // parameters, issuer, audience, and key ID without duplicating that contract.
    parseAuthEnvironment(environment as NodeJS.ProcessEnv);

    parseUrlConfig('DATABASE_URL', environment, {
      allowedProtocols: ['postgresql:'],
      allowCredentials: true,
      allowLoopbackInProduction: true,
    });
    parseUrlConfig('REDIS_CLUSTER_URL', environment, {
      allowedProtocols: ['redis:', 'rediss:'],
      allowCredentials: true,
      allowLoopbackInProduction: true,
    });
  }
}
