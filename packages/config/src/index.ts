import 'dotenv/config';

/**
 * Fails fast on a missing required environment variable instead of silently
 * falling back to an insecure default — see PROJECT_RULES.md #9. Call once
 * at service bootstrap, before anything else touches process.env.
 *
 * Example: const env = loadEnv(['DATABASE_URL', 'AUTH_JWT_ISSUER'] as const);
 */
export function loadEnv<T extends string>(
  required: readonly T[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Record<T, string> {
  const missing = required.filter((key) => !environment[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
  return required.reduce(
    (acc, key) => ({ ...acc, [key]: environment[key] as string }),
    {} as Record<T, string>,
  );
}

interface RuntimeEnvironment {
  readonly NODE_ENV?: string;
  readonly ENABLE_UNACCEPTED_PROTOTYPE_SERVICES?: string;
}

export function assertUnacceptedPrototypeRuntimeAllowed(
  serviceName: string,
  environment: RuntimeEnvironment = process.env,
): void {
  if (environment.NODE_ENV === 'production') {
    throw new Error(
      `${serviceName} contains unaccepted prototype routes and cannot run in production`,
    );
  }
  if (environment.NODE_ENV !== 'development') {
    throw new Error(`${serviceName} prototype routes are available only in direct development`);
  }
  if (environment.ENABLE_UNACCEPTED_PROTOTYPE_SERVICES !== 'true') {
    throw new Error(
      `${serviceName} is disabled until its authenticated application boundary is accepted`,
    );
  }
}
