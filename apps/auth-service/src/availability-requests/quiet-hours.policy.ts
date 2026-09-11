/**
 * Task 0027 timezone-safe quiet-hours policy.
 *
 * Quiet-hour boundaries are stored
 * as minutes-since-midnight in the pharmacy's own local time (never
 * server local time), so this module never needs to reason about
 * server timezone at all -- only about converting a UTC instant into
 * the pharmacy's own wall-clock minute-of-day via `Intl.DateTimeFormat`,
 * which correctly accounts for daylight-saving transitions because it
 * asks the ICU timezone database for the real local time at that
 * instant, rather than doing manual offset arithmetic.
 */

export interface QuietHoursPolicy {
  readonly timezone: string;
  readonly quietHoursStartMinute: number | null;
  readonly quietHoursEndMinute: number | null;
}

export type QuietHoursDecision =
  | { readonly inQuietHours: false; readonly reason: 'NO_QUIET_HOURS_CONFIGURED' }
  | { readonly inQuietHours: false; readonly reason: 'INVALID_TIMEZONE_FAIL_SAFE' }
  | { readonly inQuietHours: false; readonly reason: 'OUTSIDE_QUIET_HOURS' }
  | { readonly inQuietHours: true; readonly reason: 'INSIDE_QUIET_HOURS' };

const MINUTES_PER_DAY = 1440;

/**
 * Converts a UTC instant into "minutes since local midnight" in the
 * given IANA timezone. Throws if the timezone identifier is not
 * recognized -- callers must catch this and apply the conservative
 * fail-safe policy (see `isInQuietHours` below), never silently fall
 * back to server local time.
 */
function localMinuteOfDay(instant: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Could not resolve local time for timezone "${timezone}"`);
  }
  return hour * 60 + minute;
}

/**
 * Determines whether `instant` falls within the pharmacy's configured
 * quiet hours. Fail-safe policy: if the timezone is missing/invalid,
 * or `Intl.DateTimeFormat` cannot resolve it, this returns
 * `inQuietHours: false` with an explicit `INVALID_TIMEZONE_FAIL_SAFE`
 * reason -- callers that want conservative behavior for malformed
 * configuration should treat this reason as "do not trust this
 * decision; apply the caller's own conservative default" rather than
 * silently proceeding as if it were a genuine "outside quiet hours"
 * result. This module deliberately does not itself decide whether an
 * unresolvable timezone should suppress or allow a request -- that is
 * a policy choice for the caller, made explicit by the distinct reason
 * code rather than folded into an ambiguous `false`.
 */
export function isInQuietHours(instant: Date, policy: QuietHoursPolicy): QuietHoursDecision {
  // A persisted pharmacy timezone is part of the live-request configuration
  // even when quiet hours are not enabled. Resolve it first so corrupted or
  // otherwise unresolvable configuration can never silently become eligible.
  let nowMinute: number;
  try {
    nowMinute = localMinuteOfDay(instant, policy.timezone);
  } catch {
    return { inQuietHours: false, reason: 'INVALID_TIMEZONE_FAIL_SAFE' };
  }

  if (policy.quietHoursStartMinute === null || policy.quietHoursEndMinute === null) {
    return { inQuietHours: false, reason: 'NO_QUIET_HOURS_CONFIGURED' };
  }

  if (
    !Number.isInteger(policy.quietHoursStartMinute) ||
    !Number.isInteger(policy.quietHoursEndMinute) ||
    policy.quietHoursStartMinute < 0 ||
    policy.quietHoursStartMinute >= MINUTES_PER_DAY ||
    policy.quietHoursEndMinute < 0 ||
    policy.quietHoursEndMinute >= MINUTES_PER_DAY
  ) {
    return { inQuietHours: false, reason: 'INVALID_TIMEZONE_FAIL_SAFE' };
  }

  const { quietHoursStartMinute: start, quietHoursEndMinute: end } = policy;
  // An overnight range (e.g. 22:00 -> 07:00, start=1320, end=420) has
  // start > end; a same-day range (e.g. 13:00 -> 14:00) has start <
  // end. Both are handled by the same comparison shape, just with the
  // OR/AND swapped -- this is the one piece of quiet-hours arithmetic
  // that must handle both cases correctly, so it is tested explicitly
  // for both directions plus the exact boundary minutes.
  const inQuietHours =
    start <= end ? nowMinute >= start && nowMinute < end : nowMinute >= start || nowMinute < end;

  return inQuietHours
    ? { inQuietHours: true, reason: 'INSIDE_QUIET_HOURS' }
    : { inQuietHours: false, reason: 'OUTSIDE_QUIET_HOURS' };
}
