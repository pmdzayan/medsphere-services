import { equivalentLegacyBarcodeValues, normalizeProductIdentifier } from './product-identifier';

describe('Task 0042 product identifier normalization', () => {
  it.each([
    ['4006381333931', 'EAN', '04006381333931'],
    ['036000291452', 'UPC', '00036000291452'],
    ['10012345000017', 'GTIN', '10012345000017'],
    ['96385074', 'EAN', '00000096385074'],
  ] as const)(
    'normalizes valid %s identifiers without changing product authority',
    (value, type, normalized) => {
      expect(normalizeProductIdentifier(value)).toEqual({
        type,
        value,
        normalizedValue: normalized,
      });
    },
  );

  it('accepts bounded scanner separators but still validates checksum', () => {
    expect(normalizeProductIdentifier('4006-3813 33931')?.normalizedValue).toBe('04006381333931');
    expect(normalizeProductIdentifier('4006381333932')).toBeNull();
  });

  it('returns only exact canonical equivalents for legacy Product.barcode compatibility', () => {
    const canonical = normalizeProductIdentifier('4006381333931');
    expect(canonical).not.toBeNull();
    expect(equivalentLegacyBarcodeValues(canonical!)).toEqual(['4006381333931', '04006381333931']);

    const gtin = normalizeProductIdentifier('10012345000017');
    expect(gtin).not.toBeNull();
    expect(equivalentLegacyBarcodeValues(gtin!)).toEqual(['10012345000017']);
  });

  it.each(['', 'abc', '1234567', '123456789012345', '00000000000000'])(
    'rejects unsupported or invalid identifier %p',
    (value) => {
      expect(normalizeProductIdentifier(value)).toBeNull();
    },
  );
});
