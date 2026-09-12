import { describe, expect, it } from 'vitest';
import { isPatientProfile, isUpdatePatientProfileRequest } from './patient-profile-contract';

const profile = {
  userId: '11111111-1111-1111-1111-111111111111',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.test',
  phone: null,
  phoneVerified: false,
  preferredLanguage: 'en',
  wantsReservationNotifications: true,
  hideSensitiveNotifications: false,
};

describe('patient profile frontend contract', () => {
  it('accepts the exact bounded profile response', () => {
    expect(isPatientProfile(profile)).toBe(true);
  });

  it('rejects a profile response with a wrong-typed field', () => {
    expect(isPatientProfile({ ...profile, phoneVerified: 'yes' })).toBe(false);
  });

  describe('isUpdatePatientProfileRequest', () => {
    it('accepts a valid partial update', () => {
      expect(isUpdatePatientProfileRequest({ firstName: 'Asha Updated' })).toBe(true);
    });

    it('accepts an update with all valid fields', () => {
      expect(
        isUpdatePatientProfileRequest({
          firstName: 'Asha',
          lastName: 'Rao',
          preferredLanguage: 'ta',
          wantsReservationNotifications: true,
          hideSensitiveNotifications: false,
        }),
      ).toBe(true);
    });

    it('rejects an empty object', () => {
      expect(isUpdatePatientProfileRequest({})).toBe(false);
    });

    it('rejects an extra, non-whitelisted key', () => {
      expect(
        isUpdatePatientProfileRequest({ firstName: 'Asha', userId: 'attacker-chosen-id' }),
      ).toBe(false);
    });

    it('rejects a wrong-typed field', () => {
      expect(isUpdatePatientProfileRequest({ wantsReservationNotifications: 'true' })).toBe(false);
      expect(isUpdatePatientProfileRequest({ firstName: 123 })).toBe(false);
    });

    it('rejects a whitespace-only name', () => {
      expect(isUpdatePatientProfileRequest({ firstName: '   ' })).toBe(false);
      expect(isUpdatePatientProfileRequest({ lastName: '\t\n' })).toBe(false);
    });

    it('rejects a name over the accepted 120-character bound', () => {
      expect(isUpdatePatientProfileRequest({ firstName: 'a'.repeat(121) })).toBe(false);
      expect(isUpdatePatientProfileRequest({ lastName: 'a'.repeat(120) })).toBe(true);
    });

    it('rejects an empty string name', () => {
      expect(isUpdatePatientProfileRequest({ firstName: '' })).toBe(false);
    });

    it('rejects an unsupported or invalid language code', () => {
      expect(isUpdatePatientProfileRequest({ preferredLanguage: 'fr' })).toBe(false);
      expect(isUpdatePatientProfileRequest({ preferredLanguage: 'hi' })).toBe(false);
    });

    it('accepts every currently enabled language code', () => {
      expect(isUpdatePatientProfileRequest({ preferredLanguage: 'en' })).toBe(true);
      expect(isUpdatePatientProfileRequest({ preferredLanguage: 'ta' })).toBe(true);
      expect(isUpdatePatientProfileRequest({ preferredLanguage: 'ur' })).toBe(true);
    });

    it('rejects non-object and array payloads', () => {
      expect(isUpdatePatientProfileRequest(null)).toBe(false);
      expect(isUpdatePatientProfileRequest('firstName')).toBe(false);
      expect(isUpdatePatientProfileRequest(['firstName'])).toBe(false);
    });
  });
});
