export const SUPPORTED_LANGUAGE_CODES = ['en', 'hi', 'ta', 'te', 'kn'] as const;

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
] as const;

const supportedLanguageCodes = new Set<string>(SUPPORTED_LANGUAGE_CODES);

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
      typeof item.code !== 'string' ||
      !supportedLanguageCodes.has(item.code) ||
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
    typeof value.preferredLanguage === 'string' &&
    supportedLanguageCodes.has(value.preferredLanguage)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
