import {
  generateOtpCode,
  hashOtpCode,
  isValidOtpCodeFormat,
  verifyOtpCode,
} from './otp-crypto.util';

const pepper = Buffer.from('a'.repeat(64), 'hex');

describe('otp-crypto.util', () => {
  it('generates a 6-digit numeric code, zero-padded', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(isValidOtpCodeFormat(code)).toBe(true);
    }
  });

  it('produces different codes across repeated generation (no fixed/predictable output)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('never persists or exposes the plaintext code via the hash itself', () => {
    const code = '042817';
    const hash = hashOtpCode(pepper, code);
    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hash is deterministic for the same pepper and code', () => {
    expect(hashOtpCode(pepper, '123456')).toBe(hashOtpCode(pepper, '123456'));
  });

  it('hash differs for a different pepper (keyed, not a bare digest)', () => {
    const otherPepper = Buffer.from('b'.repeat(64), 'hex');
    expect(hashOtpCode(pepper, '123456')).not.toBe(hashOtpCode(otherPepper, '123456'));
  });

  it('verifies a correct code against its own hash', () => {
    const code = generateOtpCode();
    const hash = hashOtpCode(pepper, code);
    expect(verifyOtpCode(pepper, code, hash)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const hash = hashOtpCode(pepper, '111111');
    expect(verifyOtpCode(pepper, '222222', hash)).toBe(false);
  });

  it('rejects malformed submitted codes without throwing', () => {
    const hash = hashOtpCode(pepper, '111111');
    expect(verifyOtpCode(pepper, 'abcdef', hash)).toBe(false);
    expect(verifyOtpCode(pepper, '12345', hash)).toBe(false);
    expect(verifyOtpCode(pepper, '1234567', hash)).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    expect(verifyOtpCode(pepper, '111111', 'not-a-hash')).toBe(false);
  });
});
