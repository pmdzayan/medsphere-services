export type CanonicalProductIdentifier = {
  type: 'GTIN' | 'EAN' | 'UPC';
  value: string;
  normalizedValue: string;
};

const SUPPORTED_LENGTHS = new Set([8, 12, 13, 14]);

export function normalizeProductIdentifier(raw: string): CanonicalProductIdentifier | null {
  const value = raw.trim().replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(value) || /^0+$/.test(value) || !SUPPORTED_LENGTHS.has(value.length))
    return null;

  const payload = value.slice(0, -1);
  const actualCheckDigit = Number(value.at(-1));
  let sum = 0;
  for (let index = payload.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(payload[index]) * (position % 2 === 0 ? 3 : 1);
  }
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  if (actualCheckDigit !== expectedCheckDigit) return null;

  return {
    type: value.length === 12 ? 'UPC' : value.length === 8 || value.length === 13 ? 'EAN' : 'GTIN',
    value,
    normalizedValue: value.padStart(14, '0'),
  };
}

export function equivalentLegacyBarcodeValues(canonical: CanonicalProductIdentifier): string[] {
  const unpadded = canonical.normalizedValue.replace(/^0+(?=\d)/, '');
  return [...new Set([canonical.value, canonical.normalizedValue, unpadded])];
}
