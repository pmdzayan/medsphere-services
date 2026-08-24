export interface NotificationWorkerRunConfig {
  readonly limit: number;
  readonly leaseMs: number;
  readonly maximumAttempts: number;
}

export const NOTIFICATION_WORKER_DEFAULT_LIMIT = 25;
export const NOTIFICATION_WORKER_MAXIMUM_LIMIT = 100;
export const NOTIFICATION_WORKER_DEFAULT_LEASE_MS = 30_000;
export const NOTIFICATION_WORKER_MAXIMUM_LEASE_MS = 300_000;
export const NOTIFICATION_WORKER_DEFAULT_MAXIMUM_ATTEMPTS = 5;
export const NOTIFICATION_WORKER_HARD_MAXIMUM_ATTEMPTS = 10;

export function parseNotificationWorkerEnvironment(
  environment: NodeJS.ProcessEnv,
): NotificationWorkerRunConfig {
  return {
    limit: parseBoundedInteger(
      environment.NOTIFICATION_WORKER_LIMIT,
      NOTIFICATION_WORKER_DEFAULT_LIMIT,
      NOTIFICATION_WORKER_MAXIMUM_LIMIT,
      'NOTIFICATION_WORKER_LIMIT',
    ),
    leaseMs: parseBoundedInteger(
      environment.NOTIFICATION_WORKER_LEASE_MS,
      NOTIFICATION_WORKER_DEFAULT_LEASE_MS,
      NOTIFICATION_WORKER_MAXIMUM_LEASE_MS,
      'NOTIFICATION_WORKER_LEASE_MS',
    ),
    maximumAttempts: parseBoundedInteger(
      environment.NOTIFICATION_WORKER_MAX_ATTEMPTS,
      NOTIFICATION_WORKER_DEFAULT_MAXIMUM_ATTEMPTS,
      NOTIFICATION_WORKER_HARD_MAXIMUM_ATTEMPTS,
      'NOTIFICATION_WORKER_MAX_ATTEMPTS',
    ),
  };
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}
