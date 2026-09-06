import { randomBytes } from 'node:crypto';
import {
  createPlatformInvitationProof,
  hashPlatformInvitation,
  isPlausiblePlatformInvitationProof,
} from './platform-invitation.util';

describe('platform-invitation.util', () => {
  const pepper = randomBytes(32);

  it('returns a cryptographically random single-use proof and its HMAC digest', () => {
    const first = createPlatformInvitationProof(pepper);
    const second = createPlatformInvitationProof(pepper);

    expect(first.value).not.toBe(second.value);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.digest).not.toContain(first.value);
    expect(isPlausiblePlatformInvitationProof(first.value)).toBe(true);
    expect(hashPlatformInvitation(first.value, pepper)).toBe(first.digest);
  });

  it('the digest does not reveal the plaintext proof (lookup is digest-based)', () => {
    const { value, digest } = createPlatformInvitationProof(pepper);
    // The database stores only `digest`; re-deriving from the presented proof
    // must match, but the digest alone must never contain the plaintext.
    expect(digest).not.toContain(value.split('.')[1]);
    expect(digest.length).toBe(64);
  });

  it('a tampered proof has a different digest and is rejected', () => {
    const { value, digest } = createPlatformInvitationProof(pepper);
    const tampered = `${value}x`;
    expect(hashPlatformInvitation(tampered, pepper)).not.toBe(digest);
  });

  it('rejects structurally implausible proofs before any database lookup', () => {
    expect(isPlausiblePlatformInvitationProof('')).toBe(false);
    expect(isPlausiblePlatformInvitationProof('pia.')).toBe(false);
    expect(isPlausiblePlatformInvitationProof('not-an-invitation')).toBe(false);
  });

  it('rejects a pepper shorter than 32 random bytes', () => {
    expect(() => createPlatformInvitationProof(randomBytes(16))).toThrow(
      'Platform invitation pepper must contain at least 32 random bytes',
    );
  });
});
