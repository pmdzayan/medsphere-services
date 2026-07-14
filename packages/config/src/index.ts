import 'dotenv/config';

/**
 * Fails fast on a missing required environment variable instead of silently
 * falling back to an insecure default — see PROJECT_RULES.md #9. Call once
 * at service bootstrap, before anything else touches process.env.
 *
 * Example: const env = loadEnv(['DATABASE_URL', 'JWT_SECRET'] as const);
 */
export function loadEnv<T extends string>(required: readonly T[]): Record<T, string> {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
  return required.reduce(
    (acc, key) => ({ ...acc, [key]: process.env[key] as string }),
    {} as Record<T, string>,
  );
}
