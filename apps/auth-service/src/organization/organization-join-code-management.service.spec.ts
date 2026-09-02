import { hashJoinCode, normalizeJoinCode } from './organization-join-code.util';
import { OrganizationOnboardingService } from './organization-onboarding.service';

const PEPPER = Buffer.from('e'.repeat(64), 'hex');
const identity = {
  userId: 'user-1',
  membershipId: 'membership-1',
  tenantId: 'tenant-1',
  sessionId: 'session-1',
  tokenId: 'token-1',
  securityVersion: 1,
};

function buildHarness() {
  const created: Record<string, unknown>[] = [];
  const transaction = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ id: identity.tenantId }),
    },
    organizationJoinCode: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          id: 'code-1',
          status: 'ACTIVE',
          expiresAt: data.expiresAt,
          redemptionCount: 0,
          version: 1,
          createdAt: new Date('2026-08-28T00:00:00.000Z'),
        });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma = {
    client: {
      $transaction: jest.fn((op: (tx: typeof transaction) => unknown) => op(transaction)),
      organizationJoinCode: { findMany: jest.fn().mockResolvedValue([]) },
    },
  };
  const audit = {
    appendTenantUser: jest.fn().mockResolvedValue(undefined),
    appendTenantSystem: jest.fn().mockResolvedValue(undefined),
    appendSystem: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new OrganizationOnboardingService(prisma as never, audit as never),
    transaction,
    audit,
    created,
  };
}

describe('OrganizationOnboardingService join-code management', () => {
  it('returns plaintext once while persisting only its tenant-bound HMAC', async () => {
    const harness = buildHarness();

    const result = await harness.service.issueJoinCode(identity, null, PEPPER, {});

    expect(result.code).toMatch(/^MED-[23456789A-HJKMNP-Z]{5}-[23456789A-HJKMNP-Z]{5}$/);
    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]).toMatchObject({
      tenantId: identity.tenantId,
      createdByMembershipId: identity.membershipId,
      codeHash: hashJoinCode(PEPPER, normalizeJoinCode(result.code)),
    });
    expect(JSON.stringify(harness.created[0])).not.toContain(result.code);
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authentication.organization.join.code.issued',
      }),
    );
  });

  it('revokes only a matching code version inside the authenticated tenant', async () => {
    const harness = buildHarness();

    await harness.service.revokeJoinCode(identity, 'code-1', 3, {});

    expect(harness.transaction.organizationJoinCode.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'code-1',
        tenantId: identity.tenantId,
        deletedAt: null,
        status: 'ACTIVE',
        version: 3,
      },
      data: {
        status: 'REVOKED',
        revokedAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'authentication.organization.join.code.revoked',
        resourceId: 'code-1',
      }),
    );
  });
});
