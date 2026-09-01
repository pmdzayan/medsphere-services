// These codes may already be stored by the backend. Keep this broader set
// available for safely parsing existing sessions during the rollout.
export const KNOWN_LANGUAGE_CODES = ['en', 'hi', 'ta', 'te', 'kn', 'ur'] as const;
export type KnownLanguageCode = (typeof KNOWN_LANGUAGE_CODES)[number];

// This public BFF mutation contract intentionally exposes only locales that are
// translation-complete for the audited V1 UI. The auth service validates
// the same values via @medsphere/i18n's ENABLED_UI_LANGUAGES; both boundaries
// have tests that pin the reviewed set.
export const SUPPORTED_LANGUAGE_CODES = ['en', 'ta', 'ur'] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export interface SupportedLanguage {
  readonly code: SupportedLanguageCode;
  readonly name: string;
}

export interface PrivacyPreferences {
  readonly sharePhone: boolean;
  readonly shareEmail: boolean;
  readonly allowInAppChat: boolean;
  readonly privatePickup: boolean;
  readonly hideSensitiveNotifications: boolean;
  /** Application preference only -- never overrides a browser notification-permission denial. */
  readonly wantsReservationNotifications: boolean;
  readonly wantsOperationalAlerts: boolean;
}

export type PrivacyPreferenceUpdate = {
  -readonly [Key in keyof PrivacyPreferences]?: PrivacyPreferences[Key];
};

export interface LanguageUpdateRequest {
  readonly preferredLanguage: SupportedLanguageCode;
}

export interface LanguageUpdateResponse {
  readonly message: string;
}

const privacyKeys = [
  'sharePhone',
  'shareEmail',
  'allowInAppChat',
  'privatePickup',
  'hideSensitiveNotifications',
  'wantsReservationNotifications',
  'wantsOperationalAlerts',
] as const;

const supportedLanguageCodes = new Set<string>(SUPPORTED_LANGUAGE_CODES);
const knownLanguageCodes = new Set<string>(KNOWN_LANGUAGE_CODES);

export function isKnownLanguageCode(value: unknown): value is KnownLanguageCode {
  return typeof value === 'string' && knownLanguageCodes.has(value);
}

export function isSupportedLanguageCode(value: unknown): value is SupportedLanguageCode {
  return typeof value === 'string' && supportedLanguageCodes.has(value);
}

export function isPrivacyPreferences(value: unknown): value is PrivacyPreferences {
  if (!isRecord(value) || !hasExactKeys(value, privacyKeys)) return false;
  return privacyKeys.every((key) => typeof value[key] === 'boolean');
}

export function isPrivacyPreferenceUpdate(value: unknown): value is PrivacyPreferenceUpdate {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every(
      (key) =>
        privacyKeys.includes(key as (typeof privacyKeys)[number]) &&
        typeof value[key] === 'boolean',
    )
  );
}

export function isSupportedLanguages(value: unknown): value is SupportedLanguage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SUPPORTED_LANGUAGE_CODES.length)
    return false;
  const seen = new Set<string>();
  return value.every((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ['code', 'name'])) return false;
    if (
      !isSupportedLanguageCode(item.code) ||
      seen.has(item.code) ||
      typeof item.name !== 'string' ||
      item.name.trim().length === 0 ||
      item.name.length > 80
    )
      return false;
    seen.add(item.code);
    return true;
  });
}

export function isLanguageUpdateRequest(value: unknown): value is LanguageUpdateRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['preferredLanguage']) &&
    isSupportedLanguageCode(value.preferredLanguage)
  );
}

export function isLanguageUpdateResponse(value: unknown): value is LanguageUpdateResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['message']) &&
    typeof value.message === 'string' &&
    value.message.trim().length > 0 &&
    value.message.length <= 240
  );
}

export const CONSENT_CATEGORIES = [
  'LOCATION_USE',
  'NOTIFICATIONS_RESERVATIONS',
  'NOTIFICATIONS_OPERATIONAL',
] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export const CONSENT_SOURCES = [
  'settings_privacy_page',
  'nearby_search_prompt',
  'notification_prompt',
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export type ConsentStatusValue = 'GRANTED' | 'WITHDRAWN';

export interface ConsentStatus {
  readonly category: ConsentCategory;
  readonly status: ConsentStatusValue | null;
  readonly updatedAt: string | null;
}

export interface RecordConsentRequest {
  readonly category: ConsentCategory;
  readonly status: ConsentStatusValue;
  readonly source: ConsentSource;
}

const consentCategorySet = new Set<string>(CONSENT_CATEGORIES);

export function isConsentStatusList(value: unknown): value is ConsentStatus[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      isRecord(item) &&
      hasExactKeys(item, ['category', 'status', 'updatedAt']) &&
      typeof item.category === 'string' &&
      consentCategorySet.has(item.category) &&
      (item.status === 'GRANTED' || item.status === 'WITHDRAWN' || item.status === null) &&
      (item.updatedAt === null || typeof item.updatedAt === 'string'),
  );
}

export function isConsentStatus(value: unknown): value is ConsentStatus {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['category', 'status', 'updatedAt']) &&
    typeof value.category === 'string' &&
    consentCategorySet.has(value.category) &&
    (value.status === 'GRANTED' || value.status === 'WITHDRAWN' || value.status === null) &&
    (value.updatedAt === null || typeof value.updatedAt === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
