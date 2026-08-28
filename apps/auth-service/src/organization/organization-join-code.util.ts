import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Organization join-code format and crypto (Task 0010). A reusable,
 * revocable, admin-issued code -- never a per-invitee single-use token
 * (see the accompanying ADR for the coherent V1 model this chose).
 *
 * Shape: a static, non-identifying "MED-" prefix followed by 10
 * characters drawn from a 32-symbol alphabet that excludes visually
 * ambiguous characters (0/O, 1/I/L), displayed as two groups of five for
 * human readability (e.g. "MED-X7P42-Q9K3R"). 32^10 ~= 1.1x10^15
 * combinations (~50 bits) -- combined with hashing at rest and the
 * dedicated request/verification rate limits wired in
 * organization-onboarding.service.ts, this is not brute-forceable at any
 * practical online rate.
 *
 * The prefix and format never encode the tenant slug, tenant ID, or
 * organization name (see CODE_PATTERN below) -- there is no way to
 * derive which organization a code belongs to from the code text itself.
 */
const CODE_PREFIX = 'MED-';
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 32 symbols, no 0/O/1/I/L
const CODE_BODY_LENGTH = 10;

/** Accepts the code with or without the human-readable grouping hyphen; normalization strips both. */
export const CODE_PATTERN = /^MED-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/;

/**
 * Generates a new plaintext join code using rejection-free uniform
 * sampling (node:crypto randomInt), never Math.random. Returned only for
 * immediate one-time display to the issuing operator -- callers must
 * never persist this value, only its hash (see hashJoinCode).
 */
export function generateJoinCode(): string {
  let body = '';
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    body += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${body.slice(0, 5)}-${body.slice(5)}`;
}

/**
 * Normalizes a user-submitted code for lookup/comparison: uppercases,
 * strips whitespace and the optional display hyphen between the two
 * body groups, so "med-x7p42-q9k3r", "MED-X7P42Q9K3R", and
 * "MED-X7P42-Q9K3R" all resolve to the same stored hash. The leading
 * "MED-" (including its hyphen) must be present as displayed -- this
 * deliberately does not attempt to also recover a prefix hyphen a
 * caller stripped entirely, since "MED" can also legitimately appear as
 * the start of the random body itself (the alphabet includes M, E, and
 * D), which would make blind prefix-stripping ambiguous and unsafe.
 */
export function normalizeJoinCode(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const withoutPrefix = upper.startsWith(CODE_PREFIX) ? upper.slice(CODE_PREFIX.length) : upper;
  const bodyOnly = withoutPrefix.replace(/-/g, '').replace(/\s+/g, '');
  return `${CODE_PREFIX}${bodyOnly}`;
}

export function isValidJoinCodeFormat(normalized: string): boolean {
  return CODE_PATTERN.test(normalized);
}

/**
 * Hashes a normalized join code with HMAC-SHA256 keyed by the
 * server-side ORG_JOIN_CODE_PEPPER -- the same keyed-hash pattern
 * already accepted for refresh credentials and OTP codes. A stolen
 * table cannot be brute-forced offline against the ~50-bit code space
 * without also compromising the pepper, and the plaintext code is never
 * persisted anywhere.
 */
export function hashJoinCode(pepper: Buffer, normalizedCode: string): string {
  return createHmac('sha256', pepper).update(normalizedCode, 'utf8').digest('hex');
}

/** Constant-time verification against a stored hash. */
export function verifyJoinCode(pepper: Buffer, submittedCode: string, storedHash: string): boolean {
  const normalized = normalizeJoinCode(submittedCode);
  if (!isValidJoinCodeFormat(normalized) || !/^[a-f0-9]{64}$/.test(storedHash)) {
    return false;
  }
  const actual = Buffer.from(hashJoinCode(pepper, normalized), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
