import { isInQuietHours } from './quiet-hours.policy';

export interface PharmacyLiveRequestPreferenceSnapshot {
  readonly liveRequestsEnabled: boolean;
  readonly timezone: string;
  readonly quietHoursStartMinute: number | null;
  readonly quietHoursEndMinute: number | null;
}

export type PharmacyLiveRequestAdmissionReason =
  | 'PHARMACY_LIVE_REQUESTS_NOT_CONFIGURED'
  | 'PHARMACY_LIVE_REQUESTS_DISABLED'
  | 'PHARMACY_IN_QUIET_HOURS'
  | 'ALLOWED';

export type PharmacyLiveRequestAdmissionDecision =
  | {
      readonly allowed: false;
      readonly reason: Exclude<PharmacyLiveRequestAdmissionReason, 'ALLOWED'>;
    }
  | {
      readonly allowed: true;
      readonly reason: 'ALLOWED';
    };

/**
 * Task 0027 pharmacy-side admission policy.
 *
 * This policy controls creation of a NEW live availability request only.
 * It does not invalidate current pharmacist evidence or an already-existing
 * Task 0026 PENDING request.
 *
 * Missing configuration and malformed/unresolvable timezone configuration
 * fail closed so a pharmacy is never silently opted into disruptive live
 * requests.
 */
export function evaluatePharmacyLiveRequestPreference(
  preference: PharmacyLiveRequestPreferenceSnapshot | null,
  now: Date,
): PharmacyLiveRequestAdmissionDecision {
  if (preference === null) {
    return {
      allowed: false,
      reason: 'PHARMACY_LIVE_REQUESTS_NOT_CONFIGURED',
    };
  }

  if (!preference.liveRequestsEnabled) {
    return {
      allowed: false,
      reason: 'PHARMACY_LIVE_REQUESTS_DISABLED',
    };
  }

  const quietHours = isInQuietHours(now, {
    timezone: preference.timezone,
    quietHoursStartMinute: preference.quietHoursStartMinute,
    quietHoursEndMinute: preference.quietHoursEndMinute,
  });

  if (quietHours.inQuietHours || quietHours.reason === 'INVALID_TIMEZONE_FAIL_SAFE') {
    return {
      allowed: false,
      reason: 'PHARMACY_IN_QUIET_HOURS',
    };
  }

  return {
    allowed: true,
    reason: 'ALLOWED',
  };
}
