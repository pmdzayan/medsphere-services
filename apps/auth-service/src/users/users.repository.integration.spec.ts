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
  const membershipId = randomUUID();
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

    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
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
      where: { userId },
    });

    await prisma.client.user.deleteMany({
      where: { id: userId },
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

  it('resolves a linked Google identity only inside its active tenant membership', async () => {
    const result = await repository.findGoogleLoginIdentity(tenantSlug, googleSubject);

    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        membershipId,
        tenantId,
      }),
    );
    expect(result?.user.id).toBe(userId);
  });

  it('does not cross tenant boundaries for the same Google subject', async () => {
    await expect(
      repository.findGoogleLoginIdentity(otherTenantSlug, googleSubject),
    ).resolves.toBeNull();
  });

  it('rejects a suspended membership immediately', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: { status: 'SUSPENDED' },
    });

    await expect(repository.findGoogleLoginIdentity(tenantSlug, googleSubject)).resolves.toBeNull();
  });

  it('rejects a revoked membership immediately', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: { status: 'REVOKED' },
    });

    await expect(repository.findGoogleLoginIdentity(tenantSlug, googleSubject)).resolves.toBeNull();
  });

  it('rejects a deleted membership immediately', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipId },
      data: { deletedAt: new Date() },
    });

    await expect(repository.findGoogleLoginIdentity(tenantSlug, googleSubject)).resolves.toBeNull();
  });
});
