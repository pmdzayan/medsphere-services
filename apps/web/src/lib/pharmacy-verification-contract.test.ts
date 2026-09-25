import { describe, expect, it } from 'vitest';
import {
  isPharmacyProfile,
  isUpdatePharmacyProfileRequest,
  isPharmacyVerificationState,
  isSubmitPharmacyVerificationRequest,
} from './pharmacy-verification-contract';

const profile = {
  businessName: 'City Pharmacy',
  ownerName: 'Asha Rao',
  email: 'pharmacy@example.test',
  phone: '+15551234567',
  address: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  country: 'USA',
  postalCode: '62701',
  latitude: 39.78,
  longitude: -89.65,
};

describe('pharmacy profile contract', () => {
  it('accepts the exact bounded profile response', () => {
    expect(isPharmacyProfile(profile)).toBe(true);
  });

  it('rejects a profile response with a wrong-typed field', () => {
    expect(isPharmacyProfile({ ...profile, latitude: '39.78' })).toBe(false);
  });

  describe('isUpdatePharmacyProfileRequest', () => {
    it('accepts a valid partial update', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'New Name' })).toBe(true);
    });

    it('accepts an update with all allowed keys', () => {
      expect(isUpdatePharmacyProfileRequest({ ...profile })).toBe(true);
    });

    it('rejects an empty object', () => {
      expect(isUpdatePharmacyProfileRequest({})).toBe(false);
    });

    it('rejects an unknown key', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', extra: 'y' })).toBe(false);
    });

    it('rejects "tenantId"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', tenantId: 'attacker-id' })).toBe(
        false,
      );
    });

    it('rejects "providerType"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', providerType: 'HOSPITAL' })).toBe(
        false,
      );
    });

    it('rejects "isVerified"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', isVerified: true })).toBe(false);
    });

    it('rejects "isActive"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', isActive: true })).toBe(false);
    });

    it('rejects "deletedAt"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', deletedAt: null })).toBe(false);
    });

    it('rejects "status" and "verificationStatus"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', status: 'APPROVED' })).toBe(false);
      expect(
        isUpdatePharmacyProfileRequest({ businessName: 'X', verificationStatus: 'APPROVED' }),
      ).toBe(false);
    });

    it('rejects "role"/"roles"/"permissions"', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', role: 'admin' })).toBe(false);
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', roles: ['admin'] })).toBe(false);
      expect(isUpdatePharmacyProfileRequest({ businessName: 'X', permissions: ['manage'] })).toBe(
        false,
      );
    });

    it('rejects an invalid latitude (out of range)', () => {
      expect(isUpdatePharmacyProfileRequest({ latitude: 95 })).toBe(false);
    });

    it('rejects an invalid latitude (non-finite)', () => {
      expect(isUpdatePharmacyProfileRequest({ latitude: Number.POSITIVE_INFINITY })).toBe(false);
    });

    it('rejects an invalid longitude (out of range)', () => {
      expect(isUpdatePharmacyProfileRequest({ longitude: 200 })).toBe(false);
    });

    it('rejects a coordinate supplied as a string ("13.4")', () => {
      expect(isUpdatePharmacyProfileRequest({ latitude: '13.4' })).toBe(false);
    });

    it('rejects wrong primitive types for text fields', () => {
      expect(isUpdatePharmacyProfileRequest({ businessName: 12345 })).toBe(false);
      expect(isUpdatePharmacyProfileRequest({ email: true })).toBe(false);
    });

    it('rejects a malformed email', () => {
      expect(isUpdatePharmacyProfileRequest({ email: 'not-an-email' })).toBe(false);
    });

    it('accepts a valid email', () => {
      expect(isUpdatePharmacyProfileRequest({ email: 'valid@example.test' })).toBe(true);
    });
  });
});

describe('pharmacy verification state contract', () => {
  const record = {
    verificationId: '11111111-1111-4111-8111-111111111111',
    status: 'APPROVED' as const,
    submittedAt: '2026-01-01T00:00:00.000Z',
    licenseExpiryDate: '2027-01-01T00:00:00.000Z',
    applicantMessage: null,
    version: 3,
  };

  const officialSource = {
    id: 'INDIA_TN_DRUGS_CONTROL',
    authority: 'Tamil Nadu Drugs Control',
    label: 'Tamil Nadu Drugs Control — drug sales licensing',
    officialUrl: 'https://drugscontrol.tn.gov.in/sales_services.html',
    requirement: 'PRIMARY' as const,
    mode: 'PORTAL_LOOKUP' as const,
    purpose: 'PREMISES_LICENCE',
    limitation: 'Primary statutory source.',
  };

  const stateExtras = {
    verificationSources: [officialSource],
    jurisdictionReviewRequired: false,
    jurisdictionNote: null,
  };

  it('accepts current-only state (no open renewal)', () => {
    expect(isPharmacyVerificationState({ current: record, openSubmission: null, ...stateExtras })).toBe(true);
  });

  it('accepts an initial PENDING submission with no current state', () => {
    const pending = { ...record, status: 'PENDING' as const };
    expect(isPharmacyVerificationState({ current: pending, openSubmission: null, ...stateExtras })).toBe(true);
  });

  it('preserves valid approval + pending renewal as TWO distinct states', () => {
    const renewal = {
      ...record,
      verificationId: '22222222-2222-4222-8222-222222222222',
      status: 'UNDER_REVIEW' as const,
    };
    const result = { current: record, openSubmission: renewal, ...stateExtras };
    expect(isPharmacyVerificationState(result)).toBe(true);
    expect(result.current.status).toBe('APPROVED');
    expect(result.openSubmission.status).toBe('UNDER_REVIEW');
  });

  it('preserves a rejection applicantMessage', () => {
    const rejected = { ...record, status: 'REJECTED' as const, applicantMessage: 'Please retry.' };
    expect(isPharmacyVerificationState({ current: rejected, openSubmission: null, ...stateExtras })).toBe(true);
  });

  it('rejects a record containing internal "verificationNotes"', () => {
    const tampered = { ...record, verificationNotes: 'internal reasoning' };
    expect(isPharmacyVerificationState({ current: tampered, openSubmission: null, ...stateExtras })).toBe(false);
  });

  it('rejects a record containing "verifiedBy" (reviewer identity)', () => {
    const tampered = { ...record, verifiedBy: 'platform-user-id' };
    expect(isPharmacyVerificationState({ current: tampered, openSubmission: null, ...stateExtras })).toBe(false);
  });


  it('accepts controlled HTTPS official verification sources', () => {
    expect(
      isPharmacyVerificationState({
        current: record,
        openSubmission: null,
        ...stateExtras,
      }),
    ).toBe(true);
  });

  it('rejects a non-HTTPS verification source URL', () => {
    expect(
      isPharmacyVerificationState({
        current: record,
        openSubmission: null,
        ...stateExtras,
        verificationSources: [{ ...officialSource, officialUrl: 'http://example.test' }],
      }),
    ).toBe(false);
  });

  it('requires jurisdiction review metadata even when there are no configured sources', () => {
    expect(
      isPharmacyVerificationState({
        current: null,
        openSubmission: null,
        verificationSources: [],
        jurisdictionReviewRequired: true,
        jurisdictionNote: 'Manual authority review required.',
      }),
    ).toBe(true);
  });

  it('rejects a record containing "governmentIdReference" or "licenseNumber"', () => {
    expect(
      isPharmacyVerificationState({
        current: { ...record, governmentIdReference: 'GOV-1' },
        openSubmission: null,
        ...stateExtras,
      }),
    ).toBe(false);
    expect(
      isPharmacyVerificationState({
        current: { ...record, licenseNumber: 'LIC-1' },
        openSubmission: null,
        ...stateExtras,
      }),
    ).toBe(false);
  });
});

describe('submit pharmacy verification contract', () => {
  const validBody = {
    licenseNumber: 'LIC-1234',
    licenseExpiryDate: '2027-01-01T00:00:00.000Z',
    businessRegistrationNumber: 'REG-1234',
    governmentIdReference: 'GOV-REF-1234',
  };

  it('accepts a valid submission', () => {
    expect(isSubmitPharmacyVerificationRequest(validBody)).toBe(true);
  });

  it('accepts a UUID evidence reference', () => {
    expect(
      isSubmitPharmacyVerificationRequest({
        ...validBody,
        governmentIdReference: '123e4567-e89b-12d3-a456-426614174000',
      }),
    ).toBe(true);
  });

  it('rejects an unexpected extra key', () => {
    expect(isSubmitPharmacyVerificationRequest({ ...validBody, extra: 'y' })).toBe(false);
  });

  it('rejects a "status" override attempt', () => {
    expect(isSubmitPharmacyVerificationRequest({ ...validBody, status: 'APPROVED' })).toBe(false);
  });

  it('rejects a "tenantId" override attempt', () => {
    expect(isSubmitPharmacyVerificationRequest({ ...validBody, tenantId: 'attacker' })).toBe(false);
  });

  it('rejects "reviewer"/"reviewerId"/"verificationNotes" fields', () => {
    expect(isSubmitPharmacyVerificationRequest({ ...validBody, reviewer: 'x' })).toBe(false);
    expect(isSubmitPharmacyVerificationRequest({ ...validBody, reviewerId: 'x' })).toBe(false);
    expect(isSubmitPharmacyVerificationRequest({ ...validBody, verificationNotes: 'x' })).toBe(
      false,
    );
  });

  it('rejects an http:// reference', () => {
    expect(
      isSubmitPharmacyVerificationRequest({
        ...validBody,
        governmentIdReference: 'http://example.com',
      }),
    ).toBe(false);
  });

  it('rejects an https:// reference', () => {
    expect(
      isSubmitPharmacyVerificationRequest({
        ...validBody,
        governmentIdReference: 'https://example.com',
      }),
    ).toBe(false);
  });

  it('rejects "https:example.com" (URI scheme without //)', () => {
    expect(
      isSubmitPharmacyVerificationRequest({
        ...validBody,
        governmentIdReference: 'https:example.com',
      }),
    ).toBe(false);
  });

  it('rejects a "javascript:" scheme value', () => {
    expect(
      isSubmitPharmacyVerificationRequest({
        ...validBody,
        governmentIdReference: 'javascript:alert(1)',
      }),
    ).toBe(false);
  });
});
