export enum SupportedLanguage {
  EN = 'en',
  HI = 'hi',
  TA = 'ta',
  TE = 'te',
  KN = 'kn',
  UR = 'ur',
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = Object.values(SupportedLanguage);

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  [SupportedLanguage.EN]: 'English',
  [SupportedLanguage.HI]: 'हिन्दी (Hindi)',
  [SupportedLanguage.TA]: 'தமிழ் (Tamil)',
  [SupportedLanguage.TE]: 'తెలుగు (Telugu)',
  [SupportedLanguage.KN]: 'ಕನ್ನಡ (Kannada)',
  [SupportedLanguage.UR]: 'اردو (Urdu)',
};

/**
 * Languages whose app-wide UI translation (apps/web/src/lib/i18n.ts) is
 * actually complete -- see that file's isLocaleComplete/enabledLocaleOptions,
 * the single source of truth this list is kept in sync with. The web and
 * auth-service contract tests independently enforce this enabled set. A user's
 * persisted whole-app language preference must never be set to a
 * language broader "SupportedLanguage" recognizes for backend-generated
 * strings but whose frontend UI translation is not yet complete.
 */
export const ENABLED_UI_LANGUAGES: readonly SupportedLanguage[] = [
  SupportedLanguage.EN,
  SupportedLanguage.TA,
  SupportedLanguage.UR,
];

export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

export function isEnabledUiLanguage(lang: string): lang is SupportedLanguage {
  return ENABLED_UI_LANGUAGES.includes(lang as SupportedLanguage);
}
