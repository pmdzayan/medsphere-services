/**
 * Task 0026 - V1 Live Availability time policy.
 *
 * One explicit bounded configuration object. Conservative V1 defaults:
 *
 * - pending request lifetime: 15 minutes (a still-PENDING request older than
 *   this can no longer be responded to; a new request may be created);
 * - AVAILABLE / UNAVAILABLE pharmacist-confirmation validity: 30 minutes;
 * - CHECK_LATER retry delay: 5 minutes minimum, 24 hours maximum.
 *
 * Clients never select confirmation validity. For CHECK_LATER the backend
 * accepts only a bounded integer retry delay and remains authoritative; a
 * frontend may expose a small practical preset list only.
 *
 * Expired evidence must never produce a current confirmation, and malformed
 * or future timestamps fail closed. All times follow server/database time.
 */

export interface AvailabilityRequestPolicy {
  /** Milliseconds a PENDING request stays actionable before expiry. */
  readonly requestLifetimeMs: number;
  /** Milliseconds an AVAILABLE/UNAVAILABLE confirmation stays current. */
  readonly confirmationValidityMs: number;
  /** Minimum accepted CHECK_LATER delay in milliseconds. */
  readonly retryAfterMinimumMs: number;
  /** Maximum accepted CHECK_LATER delay in milliseconds. */
  readonly retryAfterMaximumMs: number;
}

export const AVAILABILITY_REQUEST_TTL_DEFAULT_MINUTES = 15;
export const AVAILABILITY_REQUEST_TTL_MAXIMUM_MINUTES = 60;
export const PHARMACIST_CONFIRMATION_VALIDITY_DEFAULT_MINUTES = 30;
export const PHARMACIST_CONFIRMATION_VALIDITY_MAXIMUM_MINUTES = 180;
export const AVAILABILITY_RETRY_MIN_DEFAULT_MINUTES = 5;
export const AVAILABILITY_RETRY_MIN_MAXIMUM_MINUTES = 60;
export const AVAILABILITY_RETRY_MAX_DEFAULT_MINUTES = 24 * 60;
export const AVAILABILITY_RETRY_MAX_MAXIMUM_MINUTES = 7 * 24 * 60;

const MINUTE_MS = 60_000;

export const DEFAULT_AVAILABILITY_REQUEST_POLICY: Readonly<AvailabilityRequestPolicy> =
  Object.freeze({
    requestLifetimeMs: AVAILABILITY_REQUEST_TTL_DEFAULT_MINUTES * MINUTE_MS,
    confirmationValidityMs: PHARMACIST_CONFIRMATION_VALIDITY_DEFAULT_MINUTES * MINUTE_MS,
    retryAfterMinimumMs: AVAILABILITY_RETRY_MIN_DEFAULT_MINUTES * MINUTE_MS,
    retryAfterMaximumMs: AVAILABILITY_RETRY_MAX_DEFAULT_MINUTES * MINUTE_MS,
  });

/** Parses the V1 live-availability policy from the environment with
 * conservative defaults and hard caps. */
export function parseAvailabilityRequestEnvironment(
  environment: NodeJS.ProcessEnv,
): AvailabilityRequestPolicy {
  const ttlMinutes = parseBoundedInteger(
    environment.AVAILABILITY_REQUEST_TTL_MINUTES,
    AVAILABILITY_REQUEST_TTL_DEFAULT_MINUTES,
    AVAILABILITY_REQUEST_TTL_MAXIMUM_MINUTES,
    'AVAILABILITY_REQUEST_TTL_MINUTES',
  );
  const validityMinutes = parseBoundedInteger(
    environment.PHARMACIST_CONFIRMATION_VALIDITY_MINUTES,
    PHARMACIST_CONFIRMATION_VALIDITY_DEFAULT_MINUTES,
    PHARMACIST_CONFIRMATION_VALIDITY_MAXIMUM_MINUTES,
    'PHARMACIST_CONFIRMATION_VALIDITY_MINUTES',
  );
  const retryMinimum = parseBoundedInteger(
    environment.AVAILABILITY_RETRY_MIN_MINUTES,
    AVAILABILITY_RETRY_MIN_DEFAULT_MINUTES,
    AVAILABILITY_RETRY_MIN_MAXIMUM_MINUTES,
    'AVAILABILITY_RETRY_MIN_MINUTES',
  );
  const retryMaximum = parseBoundedInteger(
    environment.AVAILABILITY_RETRY_MAX_MINUTES,
    AVAILABILITY_RETRY_MAX_DEFAULT_MINUTES,
    AVAILABILITY_RETRY_MAX_MAXIMUM_MINUTES,
    'AVAILABILITY_RETRY_MAX_MINUTES',
  );
  if (retryMaximum < retryMinimum) {
    throw new Error('AVAILABILITY_RETRY_MAX_MINUTES must be >= AVAILABILITY_RETRY_MIN_MINUTES');
  }
  return Object.freeze({
    requestLifetimeMs: ttlMinutes * MINUTE_MS,
    confirmationValidityMs: validityMinutes * MINUTE_MS,
    retryAfterMinimumMs: retryMinimum * MINUTE_MS,
    retryAfterMaximumMs: retryMaximum * MINUTE_MS,
  });
}

/** Validates a client-proposed CHECK_LATER retry delay (minutes) against the
 *  accepted V1 bounds. Returns the accepted minutes or null when invalid. */
export function acceptedRetryAfterMinutes(
  proposed: number | undefined,
  policy: AvailabilityRequestPolicy,
): number | null {
  if (proposed === undefined || !Number.isSafeInteger(proposed)) return null;
  const minimum = Math.ceil(policy.retryAfterMinimumMs / MINUTE_MS);
  const maximum = Math.floor(policy.retryAfterMaximumMs / MINUTE_MS);
  if (proposed < minimum || proposed > maximum) return null;
  return proposed;
}

/** Fail-closed direction check: an expired (or malformed) PENDING request
 *  can no longer be responded to. */
export function isPendingRequestExpired(expiresAt: Date, now: Date): boolean {
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(now.getTime())) return true;
  return expiresAt.getTime() <= now.getTime();
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined) return fallback;

  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}
