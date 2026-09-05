import { createHmac, randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';

export const PLATFORM_INVITATION_PREFIX = 'pia.';

export interface IssuedPlatformInvitationProof {
  /** The one-time plaintext proof handed to the invitation-holder. */
  readonly value: string;
  /** HMAC-SHA256 hex digest persisted in the database. */
  readonly digest: string;
}

/**
 * Generates a cryptographically random single-use invitation proof and
 * returns its HMAC-SHA256 digest. The plaintext is never persisted, logged,
 * or emitted in audit metadata; only the digest is stored.
 */
export function createPlatformInvitationProof(pepper: Buffer): IssuedPlatformInvitationProof {
  if (pepper.length < 32) {
    throw new Error('Platform invitation pepper must contain at least 32 random bytes');
  }

  const secret = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const value = `${PLATFORM_INVITATION_PREFIX}${id}.${secret}`;
  return { value, digest: hashPlatformInvitation(value, pepper) };
}

/**
 * HMAC-SHA256 digest of the invitation proof. The plaintext invitation secret
 * must never appear in logs, audit metadata, database, errors, or telemetry.
 */
export function hashPlatformInvitation(value: string, pepper: Buffer): string {
  return createHmac('sha256', pepper).update(value, 'utf8').digest('hex');
}

/**
 * Validates an invitation proof is structurally plausible before the digest
 * lookup occurs (bounded shape; timing-safe comparison happens at acceptance).
 */
export function isPlausiblePlatformInvitationProof(value: string): boolean {
  return new RegExp(
    `^${PLATFORM_INVITATION_PREFIX.replaceAll('.', '\\.')}` +
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.[A-Za-z0-9_-]{43}$',
  ).test(value);
}
