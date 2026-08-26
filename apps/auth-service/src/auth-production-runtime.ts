import { assertProductionFlagsDisabled } from '@medsphere/config';

export const AUTH_PRODUCTION_FORBIDDEN_FLAGS = [
  'ENABLE_SWAGGER',
  'ENABLE_TEST_VERIFICATION_PROVIDER',
  'ENABLE_UNACCEPTED_PROTOTYPE_SERVICES',
  'ENABLE_PRISMA_QUERY_LOGGING',
  'RUN_AUTH_INFRASTRUCTURE_TESTS',
] as const;

export function assertAuthProductionRuntimePolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  assertProductionFlagsDisabled('auth-service', AUTH_PRODUCTION_FORBIDDEN_FLAGS, environment);
}
