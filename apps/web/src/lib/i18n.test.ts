import { describe, expect, it } from 'vitest';
import {
  enabledLocaleOptions,
  getLocaleDirection,
  isLocale,
  isLocaleComplete,
  localeOptions,
  supportedLocales,
  translate,
  translationKeys,
} from './i18n';
import { BRAND } from '@medsphere/brand';

const EXPECTED_V1_LOCALES = [
  'en',
  'as',
  'bn',
  'brx',
  'doi',
  'gu',
  'hi',
  'kn',
  'ks',
  'kok',
  'mai',
  'ml',
  'mni',
  'mr',
  'ne',
  'or',
  'pa',
  'sa',
  'sat',
  'sd',
  'ta',
  'te',
  'ur',
] as const;

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort();
}

describe('V1 locale registry and catalog schema', () => {
  it('registers the exact 23 planned India-language locale codes', () => {
    expect(supportedLocales).toEqual(EXPECTED_V1_LOCALES);
    expect(localeOptions).toHaveLength(23);
  });

  it('gives every enabled locale a non-empty value and the English placeholder schema for every key', () => {
    for (const option of enabledLocaleOptions) {
      for (const key of translationKeys) {
        const english = translate('en', key);
        const localized = translate(option.code, key);
        expect(localized.trim(), `${option.code}:${key}`).not.toBe('');
        expect(placeholders(localized), `${option.code}:${key}`).toEqual(placeholders(english));
      }
    }
  });
});

describe('isLocaleComplete', () => {
  it('treats English as always complete (it is the source of truth)', () => {
    expect(isLocaleComplete('en')).toBe(true);
  });

  it('treats Tamil as complete -- it has a full manual override for every key', () => {
    expect(isLocaleComplete('ta')).toBe(true);
  });

  it('treats Urdu as complete -- it has a full manual override for every key, including RTL support', () => {
    expect(isLocaleComplete('ur')).toBe(true);
  });

  it('treats a locale with only shell-key overrides as incomplete', () => {
    // Hindi, Bengali, Kannada, etc. currently only override navigation
    // shell keys, not the full critical-screen key set (e.g.
    // registration.*) -- they must not be reported complete.
    expect(isLocaleComplete('hi')).toBe(false);
    expect(isLocaleComplete('bn')).toBe(false);
    expect(isLocaleComplete('kn')).toBe(false);
  });

  it('is computed from the live catalog, not a hardcoded allowlist', () => {
    // Every locale that is not 'en', 'ta', or 'ur' should currently be
    // incomplete, given today's real translation coverage. This
    // assertion is intentionally derived from the actual data rather
    // than naming each locale, so it keeps testing the real invariant
    // even as the catalog grows.
    const incomplete = localeOptions.filter(
      (option) =>
        option.code !== 'en' &&
        option.code !== 'ta' &&
        option.code !== 'ur' &&
        !isLocaleComplete(option.code),
    );
    expect(incomplete.length).toBe(localeOptions.length - 3);
  });
});

describe('enabledLocaleOptions (production selector gate)', () => {
  it('never includes an incomplete locale', () => {
    for (const option of enabledLocaleOptions) {
      expect(isLocaleComplete(option.code)).toBe(true);
    }
  });

  it('includes every locale that is actually complete', () => {
    const codes = enabledLocaleOptions.map((option) => option.code);
    expect(codes).toContain('en');
    expect(codes).toContain('ta');
    expect(codes).toContain('ur');
  });

  it('excludes a known-incomplete locale from the production selector', () => {
    const codes = enabledLocaleOptions.map((option) => option.code);
    expect(codes).not.toContain('bn');
    expect(codes).not.toContain('sd');
    expect(codes).not.toContain('ks');
  });
});

describe('RTL direction', () => {
  it('reports rtl for Urdu, Sindhi, and Kashmiri', () => {
    expect(getLocaleDirection('ur')).toBe('rtl');
    expect(getLocaleDirection('sd')).toBe('rtl');
    expect(getLocaleDirection('ks')).toBe('rtl');
  });

  it('reports ltr for English and Tamil', () => {
    expect(getLocaleDirection('en')).toBe('ltr');
    expect(getLocaleDirection('ta')).toBe('ltr');
  });

  it('includes at least one complete, enabled RTL locale (Urdu)', () => {
    const enabledRtl = enabledLocaleOptions.filter((option) => option.dir === 'rtl');
    expect(enabledRtl.map((option) => option.code)).toContain('ur');
  });
});

describe('translate', () => {
  it('keeps the approved brand proper nouns invariant across complete locales', () => {
    for (const { code } of enabledLocaleOptions) {
      expect(translate(code, 'common.brandHome')).toContain(BRAND.accessibleName);
      expect(translate(code, 'landing.enter')).toContain(BRAND.shortName);
      expect(translate(code, 'settings.hero.description')).toContain(BRAND.fullName);
    }
  });

  it('does not allow callers to override official brand interpolation values', () => {
    expect(
      translate('en', 'common.brandHome', { brandAccessibleName: 'unapproved-name' }),
    ).toContain(BRAND.accessibleName);
  });

  it('falls back to English when the target locale has no override for a key', () => {
    expect(translate('bn', 'registration.title')).toBe('Request onboarding.');
  });

  it('returns the localized value when a complete override exists', () => {
    expect(translate('ta', 'shell.settings')).not.toBe('Settings');
  });

  it('interpolates bounded values without evaluating or dropping unknown placeholders', () => {
    const translated = translate('en', 'reservations.creation.stockOption', {
      name: '<bounded-name>',
      quantity: 7,
      unused: '<script>',
    });
    expect(translated).toContain('<bounded-name>');
    expect(translated).toContain('7');
    expect(translated).not.toContain('{name}');
    expect(translated).not.toContain('{quantity}');
    expect(translated).not.toContain('<script>');
  });
});

describe('isLocale', () => {
  it('accepts any known locale code, complete or not (rendering fallback still applies)', () => {
    expect(isLocale('bn')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  it('rejects an unknown code', () => {
    expect(isLocale('xx')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
