import { isSupportedLanguageCode, type SupportedLanguageCode } from './settings-contract';

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
  readonly preferredLanguage?: SupportedLanguageCode;
  readonly wantsReservationNotifications?: boolean;
  readonly hideSensitiveNotifications?: boolean;
}

const UPDATABLE_PATIENT_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'preferredLanguage',
  'wantsReservationNotifications',
  'hideSensitiveNotifications',
] as const;

// Mirrors the backend's UpdatePatientProfileDto (@MinLength(1) @MaxLength(120)
// on the raw string) plus PatientProfileService.updateOwnProfile's
// whitespace-only rejection on the trimmed value -- both constraints must
// hold here so a malformed PATCH is rejected at this boundary instead of
// being forwarded to the auth service.
const NAME_MAX_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidPatientName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= NAME_MAX_LENGTH &&
    value.trim().length > 0
  );
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

/**
 * Fail-closed validator for the patient profile PATCH boundary. Mirrors
 * isLanguageUpdateRequest/isPrivacyPreferenceUpdate in settings-contract.ts:
 * only the exact whitelisted keys are accepted, at least one must be
 * present, and every present field's type/shape is validated here rather
 * than trusting the backend's class-validator ValidationPipe alone.
 */
export function isUpdatePatientProfileRequest(
  value: unknown,
): value is UpdatePatientProfileRequest {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (!keys.every((key) => (UPDATABLE_PATIENT_PROFILE_FIELDS as readonly string[]).includes(key)))
    return false;

  if ('firstName' in value && !isValidPatientName(value.firstName)) return false;
  if ('lastName' in value && !isValidPatientName(value.lastName)) return false;
  if ('preferredLanguage' in value && !isSupportedLanguageCode(value.preferredLanguage))
    return false;
  if (
    'wantsReservationNotifications' in value &&
    typeof value.wantsReservationNotifications !== 'boolean'
  )
    return false;
  if (
    'hideSensitiveNotifications' in value &&
    typeof value.hideSensitiveNotifications !== 'boolean'
  )
    return false;

  return true;
}
