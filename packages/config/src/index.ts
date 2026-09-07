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
  const missing = required.filter(
    (key) => !environment[key] || environment[key]!.trim().length === 0,
  );
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

export function assertScaffoldRuntimeNotProduction(
  serviceName: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (environment.NODE_ENV === 'production') {
    throw new Error(
      `${serviceName} is a health-only scaffold and cannot run as a production application runtime`,
    );
  }
}

export function assertProductionFlagsDisabled(
  serviceName: string,
  flags: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (environment.NODE_ENV !== 'production') {
    return;
  }

  const enabled = flags.filter((flag) => environment[flag] === 'true');
  if (enabled.length > 0) {
    throw new Error(
      `${serviceName} production runtime forbids development/test flag(s): ${enabled.join(', ')}`,
    );
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

export interface UrlConfigOptions {
  readonly allowedProtocols?: readonly string[];
  readonly requireHttpsInProduction?: boolean;
  readonly allowCredentials?: boolean;
  readonly allowLoopbackInProduction?: boolean;
}

export function parseUrlConfig(
  keyName: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: UrlConfigOptions = {},
): void {
  const raw = environment[keyName]?.trim();
  if (!raw) {
    throw new Error(`Missing required URL environment variable: ${keyName}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL format for environment variable: ${keyName}`);
  }

  const allowedProtocols = options.allowedProtocols ?? ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${keyName} uses unsupported URL protocol`);
  }

  if (
    environment.NODE_ENV === 'production' &&
    options.requireHttpsInProduction &&
    parsed.protocol !== 'https:'
  ) {
    throw new Error(`${keyName} must be an absolute HTTPS URL`);
  }

  if (!options.allowCredentials && (parsed.username || parsed.password)) {
    throw new Error(`${keyName} must not contain embedded user credentials`);
  }

  if (
    environment.NODE_ENV === 'production' &&
    !options.allowLoopbackInProduction &&
    isLoopbackHost(parsed.hostname)
  ) {
    throw new Error(`${keyName} must not target a loopback host in production`);
  }

  return;
}

export interface ReleaseIdentity {
  readonly appVersion: string;
  readonly releaseSha: string;
}

export function parseReleaseIdentity(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: { readonly requiredInProduction?: boolean } = {},
): ReleaseIdentity {
  const configuredAppVersion = environment.APP_VERSION?.trim();
  const appVersion = configuredAppVersion || '1.0.0';
  const releaseSha = environment.RELEASE_SHA?.trim() || '';

  if (
    environment.NODE_ENV === 'production' &&
    options.requiredInProduction &&
    !configuredAppVersion
  ) {
    throw new Error('Missing required release identity: APP_VERSION');
  }

  if (appVersion.length > 64 || !/^[A-Za-z0-9._-]+$/.test(appVersion)) {
    throw new Error('APP_VERSION has an invalid format');
  }

  if (environment.NODE_ENV === 'production' && options.requiredInProduction && !releaseSha) {
    throw new Error('Missing required release commit identity: RELEASE_SHA');
  }

  if (releaseSha && !/^[0-9a-fA-F]{40}$/.test(releaseSha)) {
    throw new Error('RELEASE_SHA must be a full 40-character hexadecimal Git commit SHA');
  }

  return Object.freeze({
    appVersion,
    releaseSha: releaseSha.toLowerCase(),
  });
}

const SERVER_SECRET_PATTERNS = [
  /PRIVATE_KEY/,
  /PEPPER/,
  /SECRET/,
  /PASSWORD/,
  /DATABASE_URL/,
  /REDIS_CLUSTER_URL/,
  /MSG91_AUTH_KEY/,
  /SMTP_URL/,
  /MEDSPHERE_OTLP_COLLECTOR_AUTH_HEADER/,
];

export function assertNoServerSecretsInPublicEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  for (const key of Object.keys(environment)) {
    if (key.startsWith('NEXT_PUBLIC_')) {
      for (const pattern of SERVER_SECRET_PATTERNS) {
        if (pattern.test(key)) {
          throw new Error(
            `Forbidden exposure of server secret under public environment key: ${key}`,
          );
        }
      }
    }
  }
}

export interface RuntimeUrlConfigSpec {
  readonly key: string;
  readonly options?: UrlConfigOptions;
}

export interface RuntimeConfigSpec<T extends string> {
  readonly serviceName: string;
  readonly requiredKeys?: readonly T[];
  readonly forbiddenFlags?: readonly string[];
  readonly urls?: readonly RuntimeUrlConfigSpec[];
  readonly requireReleaseIdentityInProduction?: boolean;
}

export function validateRuntimeConfig<T extends string>(
  spec: RuntimeConfigSpec<T>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): {
  readonly env: Record<T, string>;
  readonly release: ReleaseIdentity;
} {
  if (spec.forbiddenFlags && spec.forbiddenFlags.length > 0) {
    assertProductionFlagsDisabled(spec.serviceName, spec.forbiddenFlags, environment);
  }

  const env = spec.requiredKeys
    ? loadEnv(spec.requiredKeys, environment)
    : ({} as Record<T, string>);

  for (const url of spec.urls ?? []) {
    parseUrlConfig(url.key, environment, url.options);
  }

  const release = parseReleaseIdentity(environment, {
    requiredInProduction: spec.requireReleaseIdentityInProduction,
  });

  assertNoServerSecretsInPublicEnv(environment);

  return { env, release };
}
