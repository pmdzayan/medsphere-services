/**
 * Candidate Task 0039 (PROVISIONAL) - Strict boundary tests for the
 * pharmacy verification submission DTO, including the opaque
 * evidence-reference contract (CTO review correction).
 */
import { ValidationPipe } from '@nestjs/common';
import { SubmitPharmacyVerificationDto } from './pharmacy-verification.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function futureIsoDate(days = 365): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    licenseNumber: 'LIC-1234',
    licenseExpiryDate: futureIsoDate(),
    businessRegistrationNumber: 'REG-1234',
    governmentIdReference: 'GOV-REF-1234',
    ...overrides,
  };
}

async function transform(body: Record<string, unknown>) {
  return pipe.transform(body, { type: 'body', metatype: SubmitPharmacyVerificationDto });
}

describe('SubmitPharmacyVerificationDto -- opaque evidence-reference contract (candidate Task 0039)', () => {
  it('accepts a normal bounded opaque reference', async () => {
    const result = (await transform(
      validBody({ governmentIdReference: 'GOV-REF-2026-001' }),
    )) as SubmitPharmacyVerificationDto;
    expect(result.governmentIdReference).toBe('GOV-REF-2026-001');
  });

  it('accepts a plain UUID as the reference', async () => {
    const result = (await transform(
      validBody({ governmentIdReference: '123e4567-e89b-12d3-a456-426614174000' }),
    )) as SubmitPharmacyVerificationDto;
    expect(result.governmentIdReference).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('rejects an http:// URL', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'http://example.com/doc.pdf' })),
    ).rejects.toThrow();
  });

  it('rejects an https:// URL', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'https://example.com/evidence/1' })),
    ).rejects.toThrow();
  });

  it('CORRECTION (mandatory): rejects a schemeless-slash-free URI scheme value "https:example.com"', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'https:example.com' })),
    ).rejects.toThrow();
  });

  it('CORRECTION (mandatory): rejects a schemeless-slash-free URI scheme value "http:example.com"', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'http:example.com' })),
    ).rejects.toThrow();
  });

  it('CORRECTION (mandatory): rejects a "javascript:" scheme value', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'javascript:alert' })),
    ).rejects.toThrow();
  });

  it('CORRECTION (mandatory): rejects a "urn:" scheme value', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'urn:document:123' })),
    ).rejects.toThrow();
  });

  it('CORRECTION (mandatory): rejects an arbitrary "scheme:value" form', async () => {
    await expect(transform(validBody({ governmentIdReference: 'scheme:value' }))).rejects.toThrow();
  });

  it('rejects a degenerate separator-only value "."', async () => {
    await expect(transform(validBody({ governmentIdReference: '.' }))).rejects.toThrow();
  });

  it('rejects a degenerate separator-only value "-"', async () => {
    await expect(transform(validBody({ governmentIdReference: '-' }))).rejects.toThrow();
  });

  it('rejects a degenerate separator-only value "_"', async () => {
    await expect(transform(validBody({ governmentIdReference: '_' }))).rejects.toThrow();
  });

  it('rejects a path-like public/document value', async () => {
    await expect(
      transform(validBody({ governmentIdReference: '/documents/gov-id.pdf' })),
    ).rejects.toThrow();
  });

  it('rejects a value containing a query string', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'ref?download=true' })),
    ).rejects.toThrow();
  });

  it('rejects a value containing a fragment', async () => {
    await expect(transform(validBody({ governmentIdReference: 'ref#section' }))).rejects.toThrow();
  });

  it('rejects a whitespace-only value', async () => {
    await expect(transform(validBody({ governmentIdReference: '   ' }))).rejects.toThrow();
  });

  it('rejects a value containing an embedded control character', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'GOV-REF\u0000-1234' })),
    ).rejects.toThrow();
  });

  it('rejects a value containing embedded whitespace', async () => {
    await expect(transform(validBody({ governmentIdReference: 'GOV REF 1234' }))).rejects.toThrow();
  });

  it('rejects an over-length value', async () => {
    await expect(
      transform(validBody({ governmentIdReference: 'A'.repeat(201) })),
    ).rejects.toThrow();
  });

  it('rejects unexpected request fields via the global exact-key validation boundary', async () => {
    await expect(
      transform(validBody({ extraUnexpectedField: 'should-be-rejected' })),
    ).rejects.toThrow();
  });
});
