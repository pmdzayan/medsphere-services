import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import ur from './locales/ur.json';
import {
  SupportedLanguage,
  isLanguageSupported,
  LANGUAGE_NAMES,
  ENABLED_UI_LANGUAGES,
} from './language.enum';

type TranslationMap = Record<string, unknown>;

const translations: Record<SupportedLanguage, TranslationMap> = {
  [SupportedLanguage.EN]: en as unknown as TranslationMap,
  [SupportedLanguage.HI]: hi as unknown as TranslationMap,
  [SupportedLanguage.TA]: ta as unknown as TranslationMap,
  [SupportedLanguage.TE]: te as unknown as TranslationMap,
  [SupportedLanguage.KN]: kn as unknown as TranslationMap,
  [SupportedLanguage.UR]: ur as unknown as TranslationMap,
};

/**
 * Resolves a dot-notation key path against a nested object.
 * e.g. resolveKey({ auth: { login: { success: "OK" } } }, "auth.login.success") => "OK"
 */
function resolveKey(obj: TranslationMap, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replaces {placeholder} tokens in a string with provided values.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value != null ? String(value) : `{${key}}`;
  });
}

export class I18nService {
  /**
   * Translates a dot-notation key to the specified language.
   * Falls back to English if the key is missing in the target language.
   * Falls back to the key itself if not found in any language.
   */
  translate(
    key: string,
    lang: string = SupportedLanguage.EN,
    params?: Record<string, string | number>,
  ): string {
    const language = isLanguageSupported(lang) ? lang : SupportedLanguage.EN;

    // Try requested language first
    let message = resolveKey(translations[language], key);

    // Fallback to English
    if (message == null && language !== SupportedLanguage.EN) {
      message = resolveKey(translations[SupportedLanguage.EN], key);
    }

    // Fallback to key itself
    if (message == null) {
      return key;
    }

    return interpolate(message, params);
  }

  /**
   * Returns languages safe to offer as a user's whole-app language
   * preference -- restricted to ENABLED_UI_LANGUAGES (translation-complete
   * on the frontend), not every SupportedLanguage this service can
   * produce a backend-generated string fallback for.
   */
  getSupportedLanguages(): Array<{ code: string; name: string }> {
    return ENABLED_UI_LANGUAGES.map((code) => ({
      code,
      name: LANGUAGE_NAMES[code] || code,
    }));
  }
}

export const i18nService = new I18nService();
