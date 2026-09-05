import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { UsersRepository } from './users.repository';

const describeUsersInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeUsersInfra('UsersRepository Google identity PostgreSQL isolation', () => {
  const prisma = new PrismaService();
  const repository = new UsersRepository(prisma);

  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const membershipId = randomUUID();
  const otherMembershipId = randomUUID();
  const googleIdentityId = randomUUID();

  const tenantSlug = `google-auth-${tenantId}`;
  const otherTenantSlug = `google-auth-${otherTenantId}`;
  const googleSubject = `google-sub-${randomUUID()}`;

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        {
          id: tenantId,
          name: 'Google Auth Tenant',
          slug: tenantSlug,
          isActive: true,
        },
        {
          id: otherTenantId,
          name: 'Other Google Auth Tenant',
          slug: otherTenantSlug,
          isActive: true,
        },
      ],
    });

    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Google',
        lastName: 'Integration',
        status: 'ACTIVE',
      },
    });

    await prisma.client.user.create({
      data: {
        id: otherUserId,
        email: `${otherUserId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Other',
        lastName: 'Account',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: otherMembershipId,
        tenantId: otherTenantId,
        userId: otherUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await prisma.client.externalAuthIdentity.create({
      data: {
        id: googleIdentityId,
        userId,
        provider: 'GOOGLE',
        subject: googleSubject,
        email: `${userId}@medsphere.test`,
        emailVerified: true,
      },
    });
  });

  beforeEach(async () => {
    await prisma.client.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: true,
        deletedAt: null,
      },
    });

    await prisma.client.user.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: {
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
  });

  afterAll(async () => {
    await prisma.client.externalAuthIdentity.deleteMany({
      where: { userId },
    });

    await prisma.client.tenantMembership.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });

    await prisma.client.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });

    await prisma.client.tenant.deleteMany({
      where: {
        id: {
          in: [tenantId, otherTenantId],
        },
      },
    });

    await prisma.client.$disconnect();
  });

  it('resolves the active global user from the verified Google subject before tenant choice', async () => {
    const result = await repository.findGlobalGoogleIdentityBySubject(googleSubject);

    expect(result).toEqual({ id: userId, email: `${userId}@medsphere.test` });
  });

  it('rejects an unknown Google subject', async () => {
    await expect(repository.findGlobalGoogleIdentityBySubject('wrong-subject')).resolves.toBeNull();
  });

  it('returns only active memberships belonging to the verified user', async () => {
    await expect(repository.findActiveMembershipsForUser(userId)).resolves.toEqual([
      expect.objectContaining({ membershipId, tenantId }),
    ]);

    await expect(
      repository.findLoginIdentityByMembershipId(userId, otherMembershipId),
    ).resolves.toBeNull();
  });

  it('rejects a suspended membership immediately', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: { status: 'SUSPENDED' },
    });

    await expect(repository.findActiveMembershipsForUser(userId)).resolves.toEqual([]);
  });

  it('rejects a revoked membership immediately', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: { status: 'REVOKED' },
    });

    await expect(repository.findActiveMembershipsForUser(userId)).resolves.toEqual([]);
  });

  it('rejects a deleted membership immediately', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: { deletedAt: new Date() },
    });

    await expect(repository.findActiveMembershipsForUser(userId)).resolves.toEqual([]);
  });

  it('rejects every membership in an inactive tenant', async () => {
    await prisma.client.tenant.update({
      where: { id: tenantId },
      data: { isActive: false },
    });

    await expect(repository.findActiveMembershipsForUser(userId)).resolves.toEqual([]);
  });

  it.each(['INACTIVE', 'SUSPENDED'] as const)('rejects a %s Google-linked user', async (status) => {
    await prisma.client.user.update({
      where: { id: userId },
      data: { status },
    });

    await expect(repository.findGlobalGoogleIdentityBySubject(googleSubject)).resolves.toBeNull();
    await expect(
      repository.findLoginIdentityByMembershipId(userId, membershipId),
    ).resolves.toBeNull();
  });
});

describeUsersInfra('UsersRepository Google onboarding PostgreSQL safety', () => {
  const prisma = new PrismaService();
  const repository = new UsersRepository(prisma);

  const tenantId = randomUUID();
  const tenantSlug = `google-onboarding-${tenantId}`;
  const disabledTenantId = randomUUID();
  const disabledTenantSlug = `google-onboarding-disabled-${disabledTenantId}`;

  const createdEmails: string[] = [];

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        {
          id: tenantId,
          name: 'Google Onboarding Tenant',
          slug: tenantSlug,
          isActive: true,
          selfRegistrationEnabled: true,
        },
        {
          id: disabledTenantId,
          name: 'Disabled Google Onboarding Tenant',
          slug: disabledTenantSlug,
          isActive: true,
          selfRegistrationEnabled: false,
        },
      ],
    });
  });

  afterEach(async () => {
    if (createdEmails.length === 0) {
      return;
    }

    const users = await prisma.client.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });

    const userIds = users.map((user) => user.id);

    if (userIds.length > 0) {
      await prisma.client.externalAuthIdentity.deleteMany({
        where: { userId: { in: userIds } },
      });

      await prisma.client.tenantMembership.deleteMany({
        where: { userId: { in: userIds } },
      });

      await prisma.client.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    createdEmails.splice(0, createdEmails.length);
  });

  afterAll(async () => {
    await prisma.client.tenant.deleteMany({
      where: {
        id: {
          in: [tenantId, disabledTenantId],
        },
      },
    });

    await prisma.client.$disconnect();
  });

  it('atomically creates a passwordless user, pending membership, and verified Google identity', async () => {
    const email = `${randomUUID()}@medsphere.test`;
    const subject = `google-onboarding-${randomUUID()}`;
    createdEmails.push(email);

    await repository.createPendingGoogleRegistration({
      tenantSlug,
      subject,
      email,
      phone: '+919876543210',
      firstName: 'Asha',
      lastName: 'Sharma',
    });

    const user = await prisma.client.user.findUnique({
      where: { email },
      include: {
        memberships: true,
        externalAuthIdentities: true,
      },
    });

    expect(user).not.toBeNull();
    expect(user?.passwordHash).toBeNull();
    expect(user?.status).toBe('PENDING_VERIFICATION');

    expect(user?.memberships).toHaveLength(1);
    expect(user?.memberships[0]).toEqual(
      expect.objectContaining({
        tenantId,
        status: 'PENDING',
      }),
    );

    expect(user?.externalAuthIdentities).toHaveLength(1);
    expect(user?.externalAuthIdentities[0]).toEqual(
      expect.objectContaining({
        provider: 'GOOGLE',
        subject,
        email,
        emailVerified: true,
      }),
    );
  });

  it('does not auto-link an existing global user by matching email', async () => {
    const email = `${randomUUID()}@medsphere.test`;
    const subject = `google-onboarding-${randomUUID()}`;
    createdEmails.push(email);

    const existing = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Existing',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await repository.createPendingGoogleRegistration({
      tenantSlug,
      subject,
      email,
      phone: '+919876543210',
      firstName: 'Google',
      lastName: 'Attempt',
    });

    expect(
      await prisma.client.tenantMembership.count({
        where: { userId: existing.id, tenantId },
      }),
    ).toBe(0);

    expect(
      await prisma.client.externalAuthIdentity.count({
        where: { userId: existing.id },
      }),
    ).toBe(0);
  });

  it('does not reassign an existing Google subject to another user', async () => {
    const ownerEmail = `${randomUUID()}@medsphere.test`;
    const attemptedEmail = `${randomUUID()}@medsphere.test`;
    const subject = `google-onboarding-${randomUUID()}`;
    createdEmails.push(ownerEmail, attemptedEmail);

    const owner = await prisma.client.user.create({
      data: {
        email: ownerEmail,
        passwordHash: null,
        firstName: 'Subject',
        lastName: 'Owner',
        status: 'ACTIVE',
      },
    });

    await prisma.client.externalAuthIdentity.create({
      data: {
        userId: owner.id,
        provider: 'GOOGLE',
        subject,
        email: ownerEmail,
        emailVerified: true,
      },
    });

    await repository.createPendingGoogleRegistration({
      tenantSlug,
      subject,
      email: attemptedEmail,
      phone: '+919876543210',
      firstName: 'Other',
      lastName: 'User',
    });

    expect(
      await prisma.client.user.count({
        where: { email: attemptedEmail },
      }),
    ).toBe(0);

    const identity = await prisma.client.externalAuthIdentity.findUnique({
      where: {
        provider_subject: {
          provider: 'GOOGLE',
          subject,
        },
      },
    });

    expect(identity?.userId).toBe(owner.id);
  });

  it('creates nothing when tenant self-registration is disabled', async () => {
    const email = `${randomUUID()}@medsphere.test`;
    const subject = `google-onboarding-${randomUUID()}`;
    createdEmails.push(email);

    await repository.createPendingGoogleRegistration({
      tenantSlug: disabledTenantSlug,
      subject,
      email,
      phone: '+919876543210',
      firstName: 'Blocked',
      lastName: 'User',
    });

    expect(
      await prisma.client.user.count({
        where: { email },
      }),
    ).toBe(0);

    expect(
      await prisma.client.externalAuthIdentity.count({
        where: { subject, provider: 'GOOGLE' },
      }),
    ).toBe(0);
  });

  it('keeps concurrent duplicate Google onboarding non-enumerating with one resulting identity', async () => {
    const email = `${randomUUID()}@medsphere.test`;
    const subject = `google-onboarding-${randomUUID()}`;
    createdEmails.push(email);

    const attempts = Array.from({ length: 4 }, () =>
      repository.createPendingGoogleRegistration({
        tenantSlug,
        subject,
        email,
        phone: '+919876543210',
        firstName: 'Concurrent',
        lastName: 'User',
      }),
    );

    await expect(Promise.all(attempts)).resolves.toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    expect(
      await prisma.client.user.count({
        where: { email },
      }),
    ).toBe(1);

    expect(
      await prisma.client.externalAuthIdentity.count({
        where: { provider: 'GOOGLE', subject },
      }),
    ).toBe(1);

    expect(
      await prisma.client.tenantMembership.count({
        where: {
          tenantId,
          user: { email },
        },
      }),
    ).toBe(1);
  });
});
