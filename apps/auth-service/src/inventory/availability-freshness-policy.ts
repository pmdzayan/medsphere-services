/**
 * Task 0025 - V1 freshness policy.
 *
 * One explicit policy. No scattered freshness durations. Values parse from the
 * environment through the accepted bounded-integer configuration pattern (see
 * batch-expiry.config.ts and reservation-expiry.config.ts), with conservative
 * defaults and hard caps. A later CTO-accepted policy change is a one-line
 * configuration revision, never a code touch throughout the trust model.
 */

export interface AvailabilityFreshnessPolicy {
  /** Milliseconds after an observation before it is no longer fresh. */
  readonly freshWindowMs: number;
  /** Maximum clock-skew tolerance in the future direction of an observation
   * timestamp. Timestamps beyond this are implausible and fail closed. */
  readonly futureObservationAllowedSkewMs: number;
}

export const AVAILABILITY_FRESH_WINDOW_DEFAULT_HOURS = 24;
export const AVAILABILITY_FRESH_WINDOW_MAXIMUM_HOURS = 168;
export const AVAILABILITY_FUTURE_SKEW_DEFAULT_MINUTES = 5;
export const AVAILABILITY_FUTURE_SKEW_MAXIMUM_MINUTES = 60;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Parses the V1 freshness policy from the environment with conservative defaults. */
export function parseAvailabilityFreshnessEnvironment(
  environment: NodeJS.ProcessEnv,
): AvailabilityFreshnessPolicy {
  const freshWindowHours = parseBoundedInteger(
    environment.AVAILABILITY_OBSERVATION_FRESH_HOURS,
    AVAILABILITY_FRESH_WINDOW_DEFAULT_HOURS,
    AVAILABILITY_FRESH_WINDOW_MAXIMUM_HOURS,
    'AVAILABILITY_OBSERVATION_FRESH_HOURS',
  );
  const futureSkewMinutes = parseBoundedInteger(
    environment.AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES,
    AVAILABILITY_FUTURE_SKEW_DEFAULT_MINUTES,
    AVAILABILITY_FUTURE_SKEW_MAXIMUM_MINUTES,
    'AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES',
  );
  return Object.freeze({
    freshWindowMs: freshWindowHours * HOUR_MS,
    futureObservationAllowedSkewMs: futureSkewMinutes * MINUTE_MS,
  });
}

export const DEFAULT_AVAILABILITY_FRESHNESS_POLICY: AvailabilityFreshnessPolicy = Object.freeze({
  freshWindowMs: AVAILABILITY_FRESH_WINDOW_DEFAULT_HOURS * HOUR_MS,
  futureObservationAllowedSkewMs: AVAILABILITY_FUTURE_SKEW_DEFAULT_MINUTES * MINUTE_MS,
});

export type ObservationFreshnessClassification = 'FRESH' | 'STALE' | 'INVALID';

/**
 * Classifies a single observation timestamp against the V1 policy.
 *
 * - Implausibly-future timestamps (beyond the accepted clock-skew tolerance)
 *   fail closed: INVALID. A malformed/non-finite timestamp also fails closed.
 * - Exactly-at-boundary is FRESH (inside threshold); strictly beyond the window
 *   is STALE.
 */
export function classifyObservationFreshness(
  observedAt: Date,
  now: Date,
  policy: AvailabilityFreshnessPolicy,
): ObservationFreshnessClassification {
  const observedMs = observedAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) return 'INVALID';
  if (observedMs > nowMs + policy.futureObservationAllowedSkewMs) return 'INVALID';
  return nowMs - observedMs <= policy.freshWindowMs ? 'FRESH' : 'STALE';
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
