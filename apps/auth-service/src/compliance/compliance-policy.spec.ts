import { decideCompliancePolicy } from './compliance-policy';

const policy = {
  id: '10000000-0000-4000-8000-000000004501',
  allowedPurposes: ['SERVICE_DELIVERY', 'LEGAL_COMPLIANCE'] as const,
  retentionDays: 30,
  expiryDisposition: 'DELETE' as const,
  subjectRequestDisposition: 'ANONYMIZE' as const,
  version: 3,
};

describe('Task 0045 compliance policy decision boundary', () => {
  it('fails closed when no policy exists', () => {
    expect(
      decideCompliancePolicy({
        policy: null,
        hold: null,
        purpose: 'SERVICE_DELIVERY',
        context: 'ACCESS',
        requestedDisposition: null,
      }),
    ).toEqual({
      decision: 'DENY',
      effectiveDisposition: 'RETAIN',
      policyId: null,
      policyVersion: null,
      legalHoldId: null,
    });
  });

  it('denies a purpose that is not explicitly allowlisted', () => {
    expect(
      decideCompliancePolicy({
        policy,
        hold: null,
        purpose: 'BILLING_TAX',
        context: 'ACCESS',
        requestedDisposition: null,
      }).decision,
    ).toBe('DENY');
  });

  it('allows non-destructive access only for an allowed purpose', () => {
    expect(
      decideCompliancePolicy({
        policy,
        hold: null,
        purpose: 'SERVICE_DELIVERY',
        context: 'ACCESS',
        requestedDisposition: null,
      }),
    ).toMatchObject({
      decision: 'ALLOW',
      effectiveDisposition: 'RETAIN',
      policyId: policy.id,
      policyVersion: 3,
    });
  });

  it('makes legal hold override destructive retention expiry', () => {
    expect(
      decideCompliancePolicy({
        policy,
        hold: { id: '20000000-0000-4000-8000-000000004501' },
        purpose: 'LEGAL_COMPLIANCE',
        context: 'RETENTION_EXPIRY',
        requestedDisposition: null,
      }),
    ).toEqual({
      decision: 'LEGAL_HOLD',
      effectiveDisposition: 'RETAIN',
      policyId: policy.id,
      policyVersion: 3,
      legalHoldId: '20000000-0000-4000-8000-000000004501',
    });
  });

  it('makes legal hold override a destructive subject request', () => {
    expect(
      decideCompliancePolicy({
        policy,
        hold: { id: '20000000-0000-4000-8000-000000004501' },
        purpose: 'LEGAL_COMPLIANCE',
        context: 'SUBJECT_REQUEST',
        requestedDisposition: 'ANONYMIZE',
      }).decision,
    ).toBe('LEGAL_HOLD');
  });

  it('denies a subject disposition that does not match policy', () => {
    expect(
      decideCompliancePolicy({
        policy,
        hold: null,
        purpose: 'LEGAL_COMPLIANCE',
        context: 'SUBJECT_REQUEST',
        requestedDisposition: 'DELETE',
      }),
    ).toMatchObject({
      decision: 'DENY',
      effectiveDisposition: 'RETAIN',
    });
  });
});
