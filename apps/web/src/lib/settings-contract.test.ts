import { describe, expect, it } from 'vitest';
import {
  isLanguageUpdateRequest,
  isLanguageUpdateResponse,
  isPrivacyPreferences,
  isPrivacyPreferenceUpdate,
  isSupportedLanguages,
} from './settings-contract';

const privacy = {
  sharePhone: false,
  shareEmail: false,
  allowInAppChat: true,
  privatePickup: false,
  hideSensitiveNotifications: true,
};

describe('settings frontend contract', () => {
  it('accepts the exact bounded privacy response', () => {
    expect(isPrivacyPreferences(privacy)).toBe(true);
  });

  it('rejects missing, unknown, and non-boolean privacy fields', () => {
    expect(isPrivacyPreferences({ ...privacy, sharePhone: 'yes' })).toBe(false);
    expect(isPrivacyPreferences({ ...privacy, email: 'private@example.test' })).toBe(false);
    expect(
      isPrivacyPreferences({
        shareEmail: false,
        allowInAppChat: true,
        privatePickup: false,
        hideSensitiveNotifications: true,
      }),
    ).toBe(false);
  });

  it('accepts only non-empty bounded privacy patches', () => {
    expect(isPrivacyPreferenceUpdate({ privatePickup: true })).toBe(true);
    expect(isPrivacyPreferenceUpdate({})).toBe(false);
    expect(isPrivacyPreferenceUpdate({ privatePickup: true, userId: 'foreign' })).toBe(false);
  });

  it('accepts unique reviewed language metadata', () => {
    expect(
      isSupportedLanguages([
        { code: 'en', name: 'English' },
        { code: 'ta', name: 'Tamil' },
      ]),
    ).toBe(true);
  });

  it('rejects unsupported, duplicate, and over-broad language metadata', () => {
    expect(isSupportedLanguages([{ code: 'fr', name: 'French' }])).toBe(false);
    expect(
      isSupportedLanguages([
        { code: 'en', name: 'English' },
        { code: 'en', name: 'Duplicate' },
      ]),
    ).toBe(false);
    expect(isSupportedLanguages([{ code: 'en', name: 'English', localeFile: '/private' }])).toBe(
      false,
    );
  });

  it('validates exact language mutation contracts', () => {
    expect(isLanguageUpdateRequest({ preferredLanguage: 'hi' })).toBe(true);
    expect(isLanguageUpdateRequest({ preferredLanguage: 'ar' })).toBe(false);
    expect(isLanguageUpdateResponse({ message: 'Language updated' })).toBe(true);
    expect(isLanguageUpdateResponse({ message: '', internalId: 'secret' })).toBe(false);
  });
});
