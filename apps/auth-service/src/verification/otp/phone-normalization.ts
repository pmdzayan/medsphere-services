/**
 * Minimal E.164 normalization and validation. The application has no telecom
 * integration to do carrier-aware parsing (no libphonenumber dependency
 * exists in this repo), so this deliberately only enforces the E.164
 * shape: an optional leading '+', then 8-15 digits, no formatting
 * characters. Reused by both the OTP request DTO and the OTP repository so
 * "the same phone number" always resolves to the same string.
 */
const E164_PATTERN = /^\+?[1-9]\d{7,14}$/;

export function normalizePhoneNumber(value: string): string {
  const stripped = value.replace(/[\s()-]/g, '');
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

export function isValidE164PhoneNumber(value: string): boolean {
  return E164_PATTERN.test(value);
}
