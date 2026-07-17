export enum SupportedLanguage {
  EN = 'en',
  HI = 'hi',
  TA = 'ta',
  TE = 'te',
  KN = 'kn',
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = Object.values(SupportedLanguage);

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  [SupportedLanguage.EN]: 'English',
  [SupportedLanguage.HI]: 'हिन्दी (Hindi)',
  [SupportedLanguage.TA]: 'தமிழ் (Tamil)',
  [SupportedLanguage.TE]: 'తెలుగు (Telugu)',
  [SupportedLanguage.KN]: 'ಕನ್ನಡ (Kannada)',
};

export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}
