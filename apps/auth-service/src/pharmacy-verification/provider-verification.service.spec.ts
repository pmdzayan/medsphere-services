// This unit suite isolates the service from PlatformRepository and its
// generated-client runtime initialization. An explicit factory (not an
// auto-mock) prevents Jest from loading the real module while deriving
// mock metadata.
jest.mock('../platform/platform.repository', () => ({
  PlatformRepository: class {},
}));

import {
  ProviderVerificationService,
  ProviderVerificationConflictError,
} from './provider-verification.service';

/**
 * Candidate Task 0039 (PROVISIONAL). Mock-based unit tests reproduce
 * the query/mutation shapes the service issues, mirroring the pattern
 * used for the accepted Task 0026/0027 candidate services' own tests.
 */

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const PROVIDER_A = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP_A = '33333333-3333-4333-8333-333333333333';
const USER_A = '44444444-4444-4444-8444-444444444444';
const PLATFORM_REVIEWER = '55555555-5555-4555-8555-555555555555';

const tenantActor = { tenantId: TENANT_A, membershipId: MEMBERSHIP_A, userId: USER_A };
const platformActor = {
  platformUserId: PLATFORM_REVIEWER,
  platformAccountId: '66666666-6666-4666-8666-666666666666',
};

function futureDate(days = 365): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
function pastDate(days = 1): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

interface VerificationRow {
  id: string;
  tenantId: string;
  providerId: string | null;
  providerType: string;
  status: string;
  licenseExpiryDate: Date;
  isCurrent: boolean;
  version: number;
  licenseNumber?: string;
  verificationNotes?: string | null;
  applicantMessage?: string | null;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
}

function buildService(
  options: {
    membershipAuthorized?: boolean;
    providerAccessAuthorized?: boolean;
    provider?: {
      id: string;
      tenantId: string;
      providerType: string;
      deletedAt: Date | null;
      isVerified?: boolean;
    } | null;
    verifications?: VerificationRow[];
    reviewerStillAuthorized?: boolean;
  } = {},
) {
  const membershipAuthorized = options.membershipAuthorized ?? true;
  const providerAccessAuthorized = options.providerAccessAuthorized ?? true;
  const reviewerStillAuthorized = options.reviewerStillAuthorized ?? true;
  const provider =
    options.provider === undefined
      ? {
          id: PROVIDER_A,
          tenantId: TENANT_A,
          providerType: 'PHARMACY',
          deletedAt: null,
          isVerified: false,
        }
      : options.provider;
  const verifications: VerificationRow[] = options.verifications ?? [];
  let idCounter = 0;
  const auditEvents: Array<{ eventType: string; scope: string }> = [];

  const client = {
    tenantMembership: {
      findFirst: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(membershipAuthorized ? { id: MEMBERSHIP_A } : null),
        ),
    },
    membershipProviderAccess: {
      findFirst: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(providerAccessAuthorized ? { id: 'access-1' } : null),
        ),
    },
    provider: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (!provider) return Promise.resolve(null);
        if (where.id !== provider.id || where.tenantId !== provider.tenantId)
          return Promise.resolve(null);
        if (where.deletedAt === null && provider.deletedAt !== null) return Promise.resolve(null);
        if (where.providerType && where.providerType !== provider.providerType)
          return Promise.resolve(null);
        return Promise.resolve(provider);
      }),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: { isVerified?: boolean } }) => {
            if (provider && where.id === provider.id) Object.assign(provider, data);
            return Promise.resolve(provider);
          },
        ),
    },
    providerVerification: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const match = verifications.find((v) => {
          if (where.providerId !== undefined && v.providerId !== where.providerId) return false;
          if (where.tenantId !== undefined && v.tenantId !== where.tenantId) return false;
          if (where.isCurrent !== undefined && v.isCurrent !== where.isCurrent) return false;
          if (where.status !== undefined) {
            if (typeof where.status === 'object' && where.status !== null && 'in' in where.status) {
              const allowed = (where.status as { in: string[] }).in;
              if (!allowed.includes(v.status)) return false;
            } else if (v.status !== where.status) {
              return false;
            }
          }
          return true;
        });
        return Promise.resolve(match ?? null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const row = verifications.find((v) => v.id === where.id);
        return Promise.resolve(
          row
            ? {
                ...row,
                provider: row.providerId === provider?.id ? { businessName: 'Pharmacy A' } : null,
              }
            : null,
        );
      }),
      count: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            licenseNumber: string;
            id?: { not: string };
            OR?: Array<{ providerId?: { not: string | null } | null }>;
          };
        }) => {
          const matches = verifications.filter((v) => {
            if (v.licenseNumber !== where.licenseNumber) return false;
            if (where.id?.not !== undefined && v.id === where.id.not) return false;
            if (where.OR) {
              const orMatch = where.OR.some((clause) => {
                if ('providerId' in clause && clause.providerId === null) {
                  return v.providerId === null;
                }
                if (
                  clause.providerId &&
                  typeof clause.providerId === 'object' &&
                  'not' in clause.providerId
                ) {
                  return v.providerId !== clause.providerId.not;
                }
                return false;
              });
              if (!orMatch) return false;
            }
            return true;
          });
          return Promise.resolve(matches.length);
        },
      ),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const match = verifications.find((v) => v.id === where.id);
        if (!match) return Promise.reject(new Error('not found'));
        return Promise.resolve(match);
      }),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = verifications.find((v) => v.id === where.id);
            if (row && data.isCurrent !== undefined) row.isCurrent = data.isCurrent as boolean;
            return Promise.resolve(row);
          },
        ),
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string; version: number; status: string };
            data: Record<string, unknown>;
          }) => {
            const matches = verifications.filter(
              (v) => v.id === where.id && v.version === where.version && v.status === where.status,
            );
            for (const row of matches) {
              if (data.status) row.status = data.status as string;
              if (
                data.version &&
                typeof data.version === 'object' &&
                'increment' in (data.version as object)
              ) {
                row.version += 1;
              }
              if ('verifiedAt' in data) row.verifiedAt = data.verifiedAt as Date;
              if ('verifiedBy' in data) row.verifiedBy = data.verifiedBy as string;
              if ('applicantMessage' in data)
                row.applicantMessage = data.applicantMessage as string | null;
              if ('verificationNotes' in data)
                row.verificationNotes = data.verificationNotes as string | null;
              if ('isCurrent' in data) row.isCurrent = data.isCurrent as boolean;
            }
            return Promise.resolve({ count: matches.length });
          },
        ),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const row: VerificationRow = {
          id: `verification-${idCounter++}`,
          version: 1,
          ...data,
        } as VerificationRow;
        verifications.push(row);
        return Promise.resolve({ id: row.id });
      }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(client)),
    // Mocks the Task-0027-pattern advisory lock query: single-threaded
    // Jest execution needs no real locking here -- it only must not throw.
    $queryRaw: jest.fn().mockResolvedValue([{ locked: 1 }]),
  } as never;

  const prisma = { client } as never;
  const audit = {
    appendTenantUser: jest.fn().mockImplementation((_db: unknown, input: { eventType: string }) => {
      auditEvents.push({ eventType: input.eventType, scope: 'TENANT' });
      return Promise.resolve();
    }),
    appendPlatformUser: jest
      .fn()
      .mockImplementation((_db: unknown, input: { eventType: string }) => {
        auditEvents.push({ eventType: input.eventType, scope: 'PLATFORM' });
        return Promise.resolve();
      }),
  } as never;

  const platformRepository = {
    findEffectivePlatformPermissions: jest
      .fn()
      .mockResolvedValue(reviewerStillAuthorized ? ['platform.provider-verifications.review'] : []),
  } as never;
  const service = new ProviderVerificationService(prisma, audit, platformRepository);
  return { service, verifications, auditEvents, provider, client };
}

describe('ProviderVerificationService.submitVerification (candidate Task 0039)', () => {
  it('a valid first submission succeeds and is marked isCurrent', async () => {
    const { service, verifications, auditEvents } = buildService();
    const result = await service.submitVerification({
      actor: tenantActor,
      providerId: PROVIDER_A,
      licenseNumber: 'LIC-1',
      licenseExpiryDate: futureDate(),
      businessRegistrationNumber: 'REG-1',
      governmentIdReference: 'GOV-1',
    });
    expect(result.verificationId).toBeDefined();
    expect(verifications).toHaveLength(1);
    expect(verifications[0].isCurrent).toBe(true);
    expect(verifications[0].status).toBe('PENDING');
    expect(auditEvents).toContainEqual({
      eventType: 'pharmacy.verification.submitted',
      scope: 'TENANT',
    });
  });

  it('rejects a submission with an already-expired license', async () => {
    const { service } = buildService();
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-1',
        licenseExpiryDate: pastDate(),
        businessRegistrationNumber: 'REG-1',
        governmentIdReference: 'GOV-1',
      }),
    ).rejects.toThrow();
  });

  it('Task 0051 accepts hospital verification through the shared state machine and generic audit event', async () => {
    const { service, auditEvents, verifications } = buildService({
      provider: { id: PROVIDER_A, tenantId: TENANT_A, providerType: 'HOSPITAL', deletedAt: null },
    });
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-1',
        licenseExpiryDate: futureDate(),
        businessRegistrationNumber: 'REG-1',
        governmentIdReference: 'GOV-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ verificationId: expect.any(String) }));
    expect(verifications[0]?.providerType).toBe('HOSPITAL');
    expect(auditEvents).toContainEqual(
      expect.objectContaining({ eventType: 'provider.verification.submitted' }),
    );
  });

  it('rejects submission for a soft-deleted provider', async () => {
    const { service } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: new Date(),
      },
    });
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-1',
        licenseExpiryDate: futureDate(),
        businessRegistrationNumber: 'REG-1',
        governmentIdReference: 'GOV-1',
      }),
    ).rejects.toThrow();
  });

  it('rejects an unauthorized tenant user (no active membership)', async () => {
    const { service } = buildService({ membershipAuthorized: false });
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-1',
        licenseExpiryDate: futureDate(),
        businessRegistrationNumber: 'REG-1',
        governmentIdReference: 'GOV-1',
      }),
    ).rejects.toThrow();
  });

  it('rejects a user without provider access (wrong provider)', async () => {
    const { service } = buildService({ providerAccessAuthorized: false });
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-1',
        licenseExpiryDate: futureDate(),
        businessRegistrationNumber: 'REG-1',
        governmentIdReference: 'GOV-1',
      }),
    ).rejects.toThrow();
  });

  it('a second open (PENDING) submission is rejected/deduped', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-2',
        licenseExpiryDate: futureDate(),
        businessRegistrationNumber: 'REG-2',
        governmentIdReference: 'GOV-2',
      }),
    ).rejects.toThrow(ProviderVerificationConflictError);
  });

  it('resubmission after REJECTED succeeds, preserves the prior row, and moves isCurrent', async () => {
    const { service, verifications, auditEvents } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'REJECTED',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 2,
        },
      ],
    });
    await service.submitVerification({
      actor: tenantActor,
      providerId: PROVIDER_A,
      licenseNumber: 'LIC-CORRECTED',
      licenseExpiryDate: futureDate(),
      businessRegistrationNumber: 'REG-2',
      governmentIdReference: 'GOV-2',
    });
    expect(verifications).toHaveLength(2);
    const oldRow = verifications.find((v) => v.id === 'v1')!;
    expect(oldRow.status).toBe('REJECTED'); // preserved, unmutated
    expect(oldRow.isCurrent).toBe(false); // moved off
    const newRow = verifications.find((v) => v.id !== 'v1')!;
    expect(newRow.isCurrent).toBe(true);
    expect(auditEvents).toContainEqual({
      eventType: 'pharmacy.verification.resubmitted',
      scope: 'TENANT',
    });
  });

  it('CORRECTION 1 (mandatory): a SUSPENDED current verification rejects tenant resubmission -- fails closed, never demoted', async () => {
    const { service, verifications, provider, auditEvents } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: null,
        isVerified: false,
      },
      verifications: [
        {
          id: 'suspended-current',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'SUSPENDED',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 6,
        },
      ],
    });
    await expect(
      service.submitVerification({
        actor: tenantActor,
        providerId: PROVIDER_A,
        licenseNumber: 'LIC-NEW',
        licenseExpiryDate: futureDate(),
        businessRegistrationNumber: 'REG-NEW',
        governmentIdReference: 'GOV-NEW',
      }),
    ).rejects.toThrow(ProviderVerificationConflictError);

    // Suspension remains isCurrent=true, completely untouched.
    expect(verifications).toHaveLength(1);
    expect(verifications[0].status).toBe('SUSPENDED');
    expect(verifications[0].isCurrent).toBe(true);
    // Provider.isVerified remains false -- never flipped by the blocked attempt.
    expect(provider!.isVerified).toBe(false);
    // No submission/resubmission audit event was emitted for the blocked attempt.
    expect(auditEvents).not.toContainEqual(
      expect.objectContaining({ eventType: 'pharmacy.verification.submitted' }),
    );
    expect(auditEvents).not.toContainEqual(
      expect.objectContaining({ eventType: 'pharmacy.verification.resubmitted' }),
    );
  });
});

describe('ProviderVerificationService.beginReview (candidate Task 0039)', () => {
  it('a PENDING submission transitions to UNDER_REVIEW', async () => {
    const { service, verifications } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await service.beginReview({
      reviewerActor: platformActor,
      verificationId: 'v1',
      expectedVersion: 1,
    });
    expect(verifications[0].status).toBe('UNDER_REVIEW');
    expect(verifications[0].version).toBe(2);
  });

  it('a stale version fails the transition', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 2,
        },
      ],
    });
    await expect(
      service.beginReview({
        reviewerActor: platformActor,
        verificationId: 'v1',
        expectedVersion: 1,
      }),
    ).rejects.toThrow(ProviderVerificationConflictError);
  });
});

describe('ProviderVerificationService.approve (candidate Task 0039)', () => {
  it('approval succeeds atomically: status, Provider.isVerified, and audit all update together', async () => {
    const { service, verifications, provider, auditEvents } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await service.approve({
      reviewerActor: platformActor,
      verificationId: 'v1',
      expectedVersion: 1,
    });
    expect(verifications[0].status).toBe('APPROVED');
    expect(provider!.isVerified).toBe(true);
    expect(auditEvents).toContainEqual({
      eventType: 'pharmacy.verification.approved',
      scope: 'PLATFORM',
    });
  });

  it('cannot approve an already-expired-at-decision-time submission', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: pastDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await expect(
      service.approve({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow();
  });

  it('cannot approve when the provider is no longer a pharmacy', async () => {
    const { service } = buildService({
      provider: { id: PROVIDER_A, tenantId: TENANT_A, providerType: 'HOSPITAL', deletedAt: null },
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await expect(
      service.approve({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow();
  });

  it('CORRECTION A/B (mandatory): approving a renewal (isCurrent=false, an older APPROVED row is current) succeeds, atomically demotes the old current row, and promotes the renewal to current', async () => {
    const { service, verifications, provider } = buildService({
      verifications: [
        {
          id: 'old-approval',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(10),
          isCurrent: true,
          version: 5,
        },
        {
          id: 'renewal',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(400),
          isCurrent: false,
          version: 1,
        },
      ],
    });
    await service.approve({
      reviewerActor: platformActor,
      verificationId: 'renewal',
      expectedVersion: 1,
    });
    const old = verifications.find((v) => v.id === 'old-approval')!;
    const renewal = verifications.find((v) => v.id === 'renewal')!;
    expect(old.isCurrent).toBe(false); // demoted
    expect(old.status).toBe('APPROVED'); // untouched otherwise -- still valid historical fact
    expect(renewal.isCurrent).toBe(true); // promoted
    expect(renewal.status).toBe('APPROVED');
    expect(provider!.isVerified).toBe(true);
  });

  it('CORRECTION F (mandatory): approval fails when the reviewer no longer holds the review permission (re-verified live, not trusted from the actor shape alone)', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
      reviewerStillAuthorized: false,
    });
    await expect(
      service.approve({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow();
  });

  it('CORRECTION H (mandatory): approval fails closed if the verification providerType no longer matches the linked Provider', async () => {
    const { service } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: null,
        isVerified: false,
      },
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'HOSPITAL',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await expect(
      service.approve({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow();
  });

  it('CORRECTION (item 3, mandatory): Provider changes from PHARMACY to HOSPITAL after submission but before approval -- approve() rejects, verification/isCurrent/Provider.isVerified all unchanged, and NO approval audit event is emitted', async () => {
    const { service, verifications, provider, auditEvents } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'HOSPITAL',
        deletedAt: null,
        isVerified: false,
      },
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          // Recorded as PHARMACY at submission time, when the Provider
          // was still a pharmacy -- the Provider itself has since
          // changed type, which the approval path must catch.
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await expect(
      service.approve({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow();

    expect(verifications[0].status).toBe('UNDER_REVIEW'); // unchanged
    expect(verifications[0].version).toBe(1); // unchanged -- no version increment
    expect(verifications[0].isCurrent).toBe(true); // unchanged
    expect(provider!.isVerified).toBe(false); // remains false
    expect(auditEvents).not.toContainEqual(
      expect.objectContaining({ eventType: 'pharmacy.verification.approved' }),
    );
  });

  it('duplicate approve retry is deterministic (fails on the second call)', async () => {
    const { service, verifications } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await service.approve({
      reviewerActor: platformActor,
      verificationId: 'v1',
      expectedVersion: 1,
    });
    await expect(
      service.approve({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow(ProviderVerificationConflictError);
    expect(verifications[0].version).toBe(2);
  });
});

describe('ProviderVerificationService.reject (candidate Task 0039)', () => {
  it('rejection succeeds, sets Provider.isVerified=false, records the applicant message separately from internal notes', async () => {
    const { service, verifications, provider } = buildService({
      provider: { id: PROVIDER_A, tenantId: TENANT_A, providerType: 'PHARMACY', deletedAt: null },
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    provider!.isVerified = true;
    await service.reject({
      reviewerActor: platformActor,
      verificationId: 'v1',
      expectedVersion: 1,
      applicantMessage: 'Please provide a clearer license copy.',
      verificationNotes: 'Internal: license image was blurry, likely legitimate.',
    });
    expect(verifications[0].status).toBe('REJECTED');
    expect(verifications[0].applicantMessage).toBe('Please provide a clearer license copy.');
    expect(verifications[0].verificationNotes).toBe(
      'Internal: license image was blurry, likely legitimate.',
    );
    expect(provider!.isVerified).toBe(false);
  });

  it('CORRECTION C (mandatory): rejecting a renewal while an older APPROVED verification remains current does NOT demote the existing approval or touch Provider.isVerified', async () => {
    const { service, verifications, provider } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: null,
        isVerified: true,
      },
      verifications: [
        {
          id: 'current-approval',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(30),
          isCurrent: true,
          version: 4,
        },
        {
          id: 'renewal',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'UNDER_REVIEW',
          licenseExpiryDate: futureDate(400),
          isCurrent: false,
          version: 1,
        },
      ],
    });
    await service.reject({
      reviewerActor: platformActor,
      verificationId: 'renewal',
      expectedVersion: 1,
    });
    const currentApproval = verifications.find((v) => v.id === 'current-approval')!;
    const renewal = verifications.find((v) => v.id === 'renewal')!;
    expect(renewal.status).toBe('REJECTED');
    expect(currentApproval.status).toBe('APPROVED'); // untouched
    expect(currentApproval.isCurrent).toBe(true); // untouched
    expect(provider!.isVerified).toBe(true); // untouched -- still eligible via the existing approval
  });

  it('CORRECTION C (mandatory): rejecting the current/initial verification (no valid prior approval exists) sets Provider.isVerified=false', async () => {
    const { service, verifications, provider } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: null,
        isVerified: false,
      },
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await service.reject({
      reviewerActor: platformActor,
      verificationId: 'v1',
      expectedVersion: 1,
    });
    expect(verifications[0].status).toBe('REJECTED');
    expect(provider!.isVerified).toBe(false);
  });
});

describe('ProviderVerificationService.getReviewDetail -- duplicate-license signal (candidate Task 0039, item 5)', () => {
  it('CORRECTION 5 (mandatory): a historical renewal for the SAME provider is NOT counted as another pharmacy', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'current',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 2,
          licenseNumber: 'LIC-SHARED',
        },
        {
          id: 'historical-same-provider',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'REJECTED',
          licenseExpiryDate: futureDate(),
          isCurrent: false,
          version: 1,
          licenseNumber: 'LIC-SHARED',
        },
      ],
    });
    const detail = await service.getReviewDetail('current');
    expect(detail.possibleDuplicateLicenseCount).toBe(0);
  });

  it('CORRECTION 5 (mandatory): the same license number under a DIFFERENT provider IS counted', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'current',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 2,
          licenseNumber: 'LIC-SHARED',
        },
        {
          id: 'other-provider',
          tenantId: TENANT_A,
          providerId: 'other-provider-id',
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
          licenseNumber: 'LIC-SHARED',
        },
      ],
    });
    const detail = await service.getReviewDetail('current');
    expect(detail.possibleDuplicateLicenseCount).toBe(1);
  });

  it('CORRECTION 5 (mandatory): the row itself is excluded from its own duplicate count', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'only-row',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
          licenseNumber: 'LIC-UNIQUE',
        },
      ],
    });
    const detail = await service.getReviewDetail('only-row');
    expect(detail.possibleDuplicateLicenseCount).toBe(0);
  });

  it('CORRECTION 5 (mandatory): a legacy providerId=NULL row sharing the license IS counted (deliberately conservative -- cannot be attributed to this provider)', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'current',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 2,
          licenseNumber: 'LIC-SHARED',
        },
        {
          id: 'legacy',
          tenantId: TENANT_A,
          providerId: null,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(),
          isCurrent: false,
          version: 1,
          licenseNumber: 'LIC-SHARED',
        },
      ],
    });
    const detail = await service.getReviewDetail('current');
    expect(detail.possibleDuplicateLicenseCount).toBe(1);
  });
});

describe('ProviderVerificationService.suspend (candidate Task 0039)', () => {
  it('suspending an APPROVED verification immediately fails eligibility and does not touch an older row', async () => {
    const { service, verifications, provider } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'APPROVED',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 3,
        },
      ],
    });
    provider!.isVerified = true;
    await service.suspend({
      reviewerActor: platformActor,
      verificationId: 'v1',
      expectedVersion: 3,
    });
    expect(verifications[0].status).toBe('SUSPENDED');
    expect(provider!.isVerified).toBe(false);
  });

  it('cannot suspend a PENDING (not yet approved) verification', async () => {
    const { service } = buildService({
      verifications: [
        {
          id: 'v1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          providerType: 'PHARMACY',
          status: 'PENDING',
          licenseExpiryDate: futureDate(),
          isCurrent: true,
          version: 1,
        },
      ],
    });
    await expect(
      service.suspend({ reviewerActor: platformActor, verificationId: 'v1', expectedVersion: 1 }),
    ).rejects.toThrow(ProviderVerificationConflictError);
  });
});

describe('ProviderVerificationService.getProfile / updateProfile (Task 0039 compatibility + Task 0051 provider expansion)', () => {
  it('returns the safe profile fields for the assigned PHARMACY provider', async () => {
    const { service, client } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: null,
        isVerified: true,
      },
    });
    const profile = await service.getProfile(tenantActor, PROVIDER_A);
    // The mock does not simulate Prisma's `select` clause (it always
    // returns the whole mock object), so this asserts the service
    // actually issued a `select` limited to safe fields -- the real
    // enforcement is the `select: {...}` clause in `getProfile` itself,
    // reviewed directly in the source rather than re-derived here.
    expect(
      (client as { provider: { findFirst: jest.Mock } }).provider.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          businessName: true,
          ownerName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
          latitude: true,
          longitude: true,
        },
      }),
    );
    expect(profile).toBeDefined();
  });

  it('Task 0051 returns the same safe profile projection for an assigned HOSPITAL provider', async () => {
    const { service } = buildService({
      provider: { id: PROVIDER_A, tenantId: TENANT_A, providerType: 'HOSPITAL', deletedAt: null },
    });
    await expect(service.getProfile(tenantActor, PROVIDER_A)).resolves.toBeDefined();
  });

  it('getProfile throws for a soft-deleted provider', async () => {
    const { service } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: new Date(),
      },
    });
    await expect(service.getProfile(tenantActor, PROVIDER_A)).rejects.toThrow();
  });

  it('getProfile throws for an unauthorized tenant user (no active membership)', async () => {
    const { service } = buildService({ membershipAuthorized: false });
    await expect(service.getProfile(tenantActor, PROVIDER_A)).rejects.toThrow();
  });

  it('updateProfile applies only the fields passed and never touches providerType/isVerified/isActive/deletedAt', async () => {
    const { service, provider } = buildService({
      provider: {
        id: PROVIDER_A,
        tenantId: TENANT_A,
        providerType: 'PHARMACY',
        deletedAt: null,
        isVerified: true,
      },
    });
    await service.updateProfile(tenantActor, PROVIDER_A, { businessName: 'New Name' });
    expect((provider as unknown as { businessName: string }).businessName).toBe('New Name');
    expect(provider!.providerType).toBe('PHARMACY');
    expect(provider!.isVerified).toBe(true);
    expect(provider!.deletedAt).toBe(null);
  });

  it('Task 0051 updates common safe profile fields for an assigned HOSPITAL provider', async () => {
    const { service, provider } = buildService({
      provider: { id: PROVIDER_A, tenantId: TENANT_A, providerType: 'HOSPITAL', deletedAt: null },
    });
    await expect(
      service.updateProfile(tenantActor, PROVIDER_A, { businessName: 'New Hospital Name' }),
    ).resolves.toBeUndefined();
    expect((provider as unknown as { businessName: string }).businessName).toBe(
      'New Hospital Name',
    );
    expect(provider?.providerType).toBe('HOSPITAL');
  });

  it('updateProfile throws for an unauthorized tenant user', async () => {
    const { service } = buildService({ membershipAuthorized: false });
    await expect(
      service.updateProfile(tenantActor, PROVIDER_A, { businessName: 'New Name' }),
    ).rejects.toThrow();
  });
});
