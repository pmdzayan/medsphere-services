import { PharmacyVerificationEligibilityEvaluator } from './pharmacy-verification-eligibility.evaluator';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '99999999-9999-4999-8999-999999999999';
const PROVIDER_A = '22222222-2222-4222-8222-222222222222';

interface ProviderRow {
  id: string;
  tenantId: string;
  providerType: 'PHARMACY' | 'HOSPITAL';
  isActive: boolean;
  deletedAt: Date | null;
}

interface VerificationRow {
  providerId: string | null;
  tenantId: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED';
  licenseExpiryDate: Date;
  isCurrent: boolean;
}

function buildEvaluator(fixtures: {
  provider?: ProviderRow | null;
  verifications?: VerificationRow[];
}) {
  const provider = fixtures.provider === undefined ? null : fixtures.provider;
  const verifications = fixtures.verifications ?? [];

  const client = {
    provider: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string; tenantId: string } }) => {
          if (!provider) return Promise.resolve(null);
          if (provider.id !== where.id || provider.tenantId !== where.tenantId)
            return Promise.resolve(null);
          return Promise.resolve(provider);
        }),
    },
    providerVerification: {
      findFirst: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { providerId: string; tenantId: string; isCurrent: boolean } }) => {
            const match = verifications.find(
              (v) =>
                v.providerId === where.providerId &&
                v.tenantId === where.tenantId &&
                v.isCurrent === where.isCurrent,
            );
            return Promise.resolve(match ?? null);
          },
        ),
    },
  };
  const evaluator = new PharmacyVerificationEligibilityEvaluator({ client } as never);
  return { evaluator };
}

const baseProvider: ProviderRow = {
  id: PROVIDER_A,
  tenantId: TENANT_A,
  providerType: 'PHARMACY',
  isActive: true,
  deletedAt: null,
};

const futureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const pastDate = new Date(Date.now() - 24 * 3600 * 1000);

describe('PharmacyVerificationEligibilityEvaluator (candidate Task 0039)', () => {
  it('a valid current APPROVED, unexpired verification is eligible', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A });
    expect(result).toEqual({ eligible: true });
  });

  it('MANDATORY: an expired approval is immediately ineligible, with no dependency on a worker having run', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: pastDate,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A });
    expect(result).toEqual({ eligible: false, reason: 'LICENSE_EXPIRED' });
  });

  it('a suspended current verification is ineligible', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'SUSPENDED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A });
    expect(result).toEqual({ eligible: false, reason: 'CURRENT_VERIFICATION_NOT_APPROVED' });
  });

  it('a rejected current verification is ineligible', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'REJECTED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A });
    expect(result).toEqual({ eligible: false, reason: 'CURRENT_VERIFICATION_NOT_APPROVED' });
  });

  it('a PENDING current verification is ineligible', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'PENDING',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'CURRENT_VERIFICATION_NOT_APPROVED',
    });
  });

  it('an UNDER_REVIEW current verification is ineligible', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'CURRENT_VERIFICATION_NOT_APPROVED',
    });
  });

  it('an EXPIRED-status current verification is ineligible via the status check', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'EXPIRED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'CURRENT_VERIFICATION_NOT_APPROVED',
    });
  });

  it('MANDATORY: a historical APPROVED row with a newer non-current SUSPENDED current row remains ineligible -- the old approval never overrides the newer decision', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        // Historical: an old APPROVED row, no longer current.
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: futureDate,
          isCurrent: false,
        },
        // The genuinely current row: a later suspension.
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'SUSPENDED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A });
    expect(result).toEqual({ eligible: false, reason: 'CURRENT_VERIFICATION_NOT_APPROVED' });
  });

  it('no current verification row at all is ineligible', async () => {
    const { evaluator } = buildEvaluator({ provider: baseProvider, verifications: [] });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'NO_CURRENT_VERIFICATION',
    });
  });

  it('MANDATORY: Provider.isActive=false independently fails, even with a valid current approval', async () => {
    const { evaluator } = buildEvaluator({
      provider: { ...baseProvider, isActive: false },
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'PROVIDER_INACTIVE',
    });
  });

  it('MANDATORY: a soft-deleted provider fails, even with a valid current approval', async () => {
    const { evaluator } = buildEvaluator({
      provider: { ...baseProvider, deletedAt: new Date() },
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'PROVIDER_DELETED',
    });
  });

  it('a non-PHARMACY provider (e.g. HOSPITAL) fails, even with a valid current approval', async () => {
    const { evaluator } = buildEvaluator({
      provider: { ...baseProvider, providerType: 'HOSPITAL' },
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'PROVIDER_NOT_PHARMACY',
    });
  });

  it('a non-existent provider fails', async () => {
    const { evaluator } = buildEvaluator({ provider: null });
    expect(await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A })).toEqual({
      eligible: false,
      reason: 'PROVIDER_NOT_FOUND',
    });
  });

  it('MANDATORY: wrong tenant (provider exists but under a different tenant) fails closed as not found -- never leaks a cross-tenant match', async () => {
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: futureDate,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_B, providerId: PROVIDER_A });
    expect(result).toEqual({ eligible: false, reason: 'PROVIDER_NOT_FOUND' });
  });

  it('a license expiring at exactly the evaluation instant is treated as expired (strict inequality, not <=)', async () => {
    const now = new Date();
    const { evaluator } = buildEvaluator({
      provider: baseProvider,
      verifications: [
        {
          providerId: PROVIDER_A,
          tenantId: TENANT_A,
          status: 'APPROVED',
          licenseExpiryDate: now,
          isCurrent: true,
        },
      ],
    });
    const result = await evaluator.evaluate({ tenantId: TENANT_A, providerId: PROVIDER_A, now });
    expect(result).toEqual({ eligible: false, reason: 'LICENSE_EXPIRED' });
  });
});
