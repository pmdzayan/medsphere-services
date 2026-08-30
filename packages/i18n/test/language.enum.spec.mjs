import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  ENABLED_UI_LANGUAGES,
  LANGUAGE_NAMES,
  isLanguageSupported,
  isEnabledUiLanguage,
} = require('../dist/language.enum.js');
const { I18nService } = require('../dist/i18n.service.js');

test('ENABLED_UI_LANGUAGES matches exactly the frontend-complete locale set (en, ta, ur)', () => {
  // Kept in sync by hand with apps/web/src/lib/i18n.ts's
  // enabledLocaleOptions -- see that file's isLocaleComplete. A user's
  // persisted whole-app language preference must never be settable to a
  // language whose frontend UI translation is not yet complete.
  assert.deepEqual(
    [...ENABLED_UI_LANGUAGES].sort(),
    [SupportedLanguage.EN, SupportedLanguage.TA, SupportedLanguage.UR].sort(),
  );
});

test('ENABLED_UI_LANGUAGES is a subset of the full SupportedLanguage set', () => {
  for (const code of ENABLED_UI_LANGUAGES) {
    assert.ok(SUPPORTED_LANGUAGES.includes(code));
  }
});

test('every enabled UI language has a display name', () => {
  for (const code of ENABLED_UI_LANGUAGES) {
    assert.ok(LANGUAGE_NAMES[code]);
  }
});

test('isEnabledUiLanguage accepts only the enabled set', () => {
  assert.equal(isEnabledUiLanguage('en'), true);
  assert.equal(isEnabledUiLanguage('ta'), true);
  assert.equal(isEnabledUiLanguage('ur'), true);
  assert.equal(isEnabledUiLanguage('hi'), false);
  assert.equal(isEnabledUiLanguage('te'), false);
  assert.equal(isEnabledUiLanguage('kn'), false);
  assert.equal(isEnabledUiLanguage('xx'), false);
});

test('isLanguageSupported still recognizes hi/te/kn for backend-generated strings', () => {
  // Broader than isEnabledUiLanguage -- these remain valid for whatever
  // backend-generated system messages already have real translations,
  // even though they are not complete enough to be a whole-app UI
  // preference (see update-language.dto.ts, which uses the narrower
  // ENABLED_UI_LANGUAGES specifically).
  assert.equal(isLanguageSupported('hi'), true);
  assert.equal(isLanguageSupported('te'), true);
  assert.equal(isLanguageSupported('kn'), true);
});

test('I18nService.getSupportedLanguages returns only the enabled UI set', () => {
  const service = new I18nService();
  const codes = service.getSupportedLanguages().map((l) => l.code);
  assert.deepEqual([...codes].sort(), ['en', 'ta', 'ur'].sort());
});

test('I18nService.translate falls back to English for a language with no translation file content', () => {
  const service = new I18nService();
  assert.equal(
    service.translate('auth.login.success', 'ur'),
    service.translate('auth.login.success', 'en'),
  );
});
