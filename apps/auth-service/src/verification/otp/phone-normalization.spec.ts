import { isValidE164PhoneNumber, normalizePhoneNumber } from './phone-normalization';

describe('phone-normalization', () => {
  it('adds a leading + when missing', () => {
    expect(normalizePhoneNumber('15551234567')).toBe('+15551234567');
  });

  it('keeps an existing leading +', () => {
    expect(normalizePhoneNumber('+15551234567')).toBe('+15551234567');
  });

  it('strips spaces, hyphens, and parentheses', () => {
    expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('accepts a valid E.164 shape', () => {
    expect(isValidE164PhoneNumber('+15551234567')).toBe(true);
    expect(isValidE164PhoneNumber('+919876543210')).toBe(true);
  });

  it('rejects a leading zero after the country code', () => {
    expect(isValidE164PhoneNumber('+05551234567')).toBe(false);
  });

  it('rejects too-short and too-long numbers', () => {
    expect(isValidE164PhoneNumber('+1234567')).toBe(false);
    expect(isValidE164PhoneNumber('+1234567890123456')).toBe(false);
  });

  it('rejects non-numeric content', () => {
    expect(isValidE164PhoneNumber('+1555abc4567')).toBe(false);
  });
});
