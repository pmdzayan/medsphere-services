/**
 * Candidate Task 0032 (pre-0031). See
 * docs/candidates/0032-patient-identity-profile-dashboard-pre0031.md
 */
export interface PatientProfile {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly phoneVerified: boolean;
  readonly preferredLanguage: string;
  readonly wantsReservationNotifications: boolean;
  readonly hideSensitiveNotifications: boolean;
}

export interface UpdatePatientProfileRequest {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly preferredLanguage?: string;
  readonly wantsReservationNotifications?: boolean;
  readonly hideSensitiveNotifications?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPatientProfile(value: unknown): value is PatientProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string' &&
    typeof value.email === 'string' &&
    (value.phone === null || typeof value.phone === 'string') &&
    typeof value.phoneVerified === 'boolean' &&
    typeof value.preferredLanguage === 'string' &&
    typeof value.wantsReservationNotifications === 'boolean' &&
    typeof value.hideSensitiveNotifications === 'boolean'
  );
}
