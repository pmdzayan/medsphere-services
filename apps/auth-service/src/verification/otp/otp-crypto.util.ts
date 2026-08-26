import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * OTP length and lifetime. A 6-digit code (10^6 space) is standard for SMS
 * OTP; brute force is bounded by MAX_OTP_ATTEMPTS, not by the code space
 * alone. Kept as named constants rather than magic numbers so the service,
 * repository, and tests share one definition.
 */
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const OTP_PATTERN = /^\d{6}$/;

/**
 * Generates a cryptographically secure numeric OTP using rejection-free
 * uniform sampling (node:crypto randomInt), never Math.random.
 */
export function generateOtpCode(): string {
  const value = randomInt(0, 10 ** OTP_CODE_LENGTH);
  return value.toString().padStart(OTP_CODE_LENGTH, '0');
}

/**
 * Hashes an OTP with an HMAC-SHA256 keyed by the server-side OTP pepper --
 * the same keyed-hash pattern already accepted for refresh credentials
 * (see TokenService.hashRefreshCredential). A keyed hash, rather than a
 * bare SHA-256 digest, means a stolen challenge row cannot be brute-forced
 * offline against the 10^6 code space without also compromising the
 * pepper. The plaintext OTP itself is never persisted or logged.
 */
export function hashOtpCode(pepper: Buffer, code: string): string {
  return createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
}

/**
 * Constant-time verification against a stored hash. Rejects malformed
 * input before hashing so an attacker cannot use response timing to learn
 * anything about hash format.
 */
export function verifyOtpCode(pepper: Buffer, submittedCode: string, storedHash: string): boolean {
  if (!OTP_PATTERN.test(submittedCode) || !/^[a-f0-9]{64}$/.test(storedHash)) {
    return false;
  }

  const actual = Buffer.from(hashOtpCode(pepper, submittedCode), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isValidOtpCodeFormat(value: string): boolean {
  return OTP_PATTERN.test(value);
}
