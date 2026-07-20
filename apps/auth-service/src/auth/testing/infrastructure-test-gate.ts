/**
 * Test-only infrastructure gate utility.
 *
 * Integration suites that require PostgreSQL, Redis, or other external
 * services use `isInfrastructureTestEnabled` and `requireEnv` to
 * conditionally execute on the explicit `RUN_AUTH_INFRASTRUCTURE_TESTS=true`
 * flag and to validate that required environment variables are present.
 *
 * This prevents accidental activation of infrastructure tests when a
 * developer .env contains `DATABASE_URL` or `REDIS_CLUSTER_URL` but the
 * corresponding service is not running.
 */

const INFRASTRUCTURE_FLAG = 'RUN_AUTH_INFRASTRUCTURE_TESTS';

/**
 * Returns `true` only when `RUN_AUTH_INFRASTRUCTURE_TESTS` is set to the
 * exact string `"true"`. Any other value — missing, empty, `"false"`,
 * `"1"`, or `"TRUE"` — returns `false`.
 */
export function isInfrastructureTestEnabled(): boolean {
  return process.env[INFRASTRUCTURE_FLAG] === 'true';
}

/**
 * Asserts that the specified environment variable is set and non-empty.
 *
 * Throws a concise configuration error naming only the missing variable.
 * Never logs or exposes connection strings, passwords, tokens, or secrets.
 *
 * @param variableName — The name of the required environment variable.
 * @throws Error if the variable is missing, empty, or whitespace-only.
 */
export function requireEnv(variableName: string): string {
  const value = process.env[variableName];
  if (value !== undefined && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Missing required environment variable: ${variableName}`);
}
