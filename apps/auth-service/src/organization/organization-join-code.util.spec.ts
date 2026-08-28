import {
  generateJoinCode,
  hashJoinCode,
  isValidJoinCodeFormat,
  normalizeJoinCode,
  verifyJoinCode,
} from './organization-join-code.util';

const pepper = Buffer.from('d'.repeat(64), 'hex');

describe('organization-join-code.util', () => {
  it('generates a code matching the documented MED-XXXXX-XXXXX shape', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateJoinCode();
      expect(code).toMatch(
        /^MED-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/,
      );
    }
  });

  it('never encodes an ambiguous character (0/O/1/I/L)', () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateJoinCode();
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it('produces different codes across repeated generation', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateJoinCode()));
    expect(codes.size).toBeGreaterThan(45);
  });

  it('never embeds a tenant slug/ID/organization name -- the format is fixed and opaque', () => {
    const code = generateJoinCode();
    expect(code.length).toBe(15); // MED- (4) + 5 + - (1) + 5
    expect(isValidJoinCodeFormat(normalizeJoinCode(code))).toBe(true);
  });

  describe('normalizeJoinCode', () => {
    it('accepts the code as displayed', () => {
      expect(normalizeJoinCode('MED-X7P42-Q9K3R')).toBe('MED-X7P42Q9K3R');
    });

    it('accepts a lowercase submission', () => {
      expect(normalizeJoinCode('med-x7p42-q9k3r')).toBe('MED-X7P42Q9K3R');
    });

    it('accepts the code with the internal body hyphen omitted', () => {
      expect(normalizeJoinCode('MED-X7P42Q9K3R')).toBe('MED-X7P42Q9K3R');
    });

    it('strips surrounding and embedded whitespace', () => {
      expect(normalizeJoinCode('  MED-X7P42 -Q9K3R  ')).toBe('MED-X7P42Q9K3R');
    });
  });

  describe('isValidJoinCodeFormat', () => {
    it('accepts a well-formed normalized code', () => {
      expect(isValidJoinCodeFormat('MED-X7P42Q9K3R')).toBe(true);
    });

    it('rejects a malformed code (wrong length)', () => {
      expect(isValidJoinCodeFormat('MED-X7P42')).toBe(false);
    });

    it('rejects a code containing an ambiguous character', () => {
      expect(isValidJoinCodeFormat('MED-X7P421O9K3R')).toBe(false);
    });

    it('rejects a code with the wrong prefix', () => {
      expect(isValidJoinCodeFormat('ABC-X7P42Q9K3R')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidJoinCodeFormat('')).toBe(false);
    });
  });

  describe('hashJoinCode / verifyJoinCode', () => {
    it('never persists or exposes the plaintext code via the hash itself', () => {
      const code = normalizeJoinCode(generateJoinCode());
      const hash = hashJoinCode(pepper, code);
      expect(hash).not.toContain(code);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hash is deterministic for the same pepper and code', () => {
      const code = normalizeJoinCode('MED-X7P42-Q9K3R');
      expect(hashJoinCode(pepper, code)).toBe(hashJoinCode(pepper, code));
    });

    it('hash differs for a different pepper (keyed, not a bare digest)', () => {
      const otherPepper = Buffer.from('e'.repeat(64), 'hex');
      const code = normalizeJoinCode('MED-X7P42-Q9K3R');
      expect(hashJoinCode(pepper, code)).not.toBe(hashJoinCode(otherPepper, code));
    });

    it('verifies a correct code against its own hash, regardless of display formatting', () => {
      const code = generateJoinCode();
      const hash = hashJoinCode(pepper, normalizeJoinCode(code));
      expect(verifyJoinCode(pepper, code, hash)).toBe(true);
      expect(verifyJoinCode(pepper, code.toLowerCase(), hash)).toBe(true);
      expect(verifyJoinCode(pepper, code.replace(/-([A-Z0-9]+)$/, '$1'), hash)).toBe(true);
    });

    it('rejects an incorrect code', () => {
      const hash = hashJoinCode(pepper, 'MED-AAAAABBBBB');
      expect(verifyJoinCode(pepper, 'MED-CCCCCDDDDD', hash)).toBe(false);
    });

    it('rejects a malformed submitted code without throwing', () => {
      const hash = hashJoinCode(pepper, 'MED-AAAAABBBBB');
      expect(verifyJoinCode(pepper, 'not-a-code', hash)).toBe(false);
      expect(verifyJoinCode(pepper, '', hash)).toBe(false);
    });

    it('rejects a malformed stored hash without throwing', () => {
      expect(verifyJoinCode(pepper, 'MED-AAAAABBBBB', 'not-a-hash')).toBe(false);
    });
  });
});
