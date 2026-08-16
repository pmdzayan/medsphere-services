import { randomUUID } from 'node:crypto';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationRecipientResolverService } from './reservation-recipient-resolver.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

type MembershipState = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
type UserState = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

infrastructure('G3.25 PostgreSQL reservation recipient resolution', () => {
  const prisma = new PrismaService();
  const service = new ReservationRecipientResolverService(prisma);
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const inactiveTenantId = randomUUID();

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'G3.25 recipient tenant', slug: `g325-${tenantId}` },
        { id: otherTenantId, name: 'G3.25 other tenant', slug: `g325-${otherTenantId}` },
        {
          id: inactiveTenantId,
          name: 'G3.25 inactive tenant',
          slug: `g325-${inactiveTenantId}`,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('resolves the active same-tenant recipient deterministically under concurrency without writes', async () => {
    const recipient = await createRecipient();
    const before = await prisma.client.notificationDelivery.count({ where: { tenantId } });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.resolve({
          tenantId,
          recipientType: 'TENANT_MEMBERSHIP',
          recipientReferenceId: recipient.membershipId,
          channel: 'EMAIL',
        }),
      ),
    );

    expect(results).toEqual(
      Array.from({ length: 8 }, () => ({ destinationToken: recipient.email })),
    );
    await expect(prisma.client.notificationDelivery.count({ where: { tenantId } })).resolves.toBe(
      before,
    );
  });

  it('conceals cross-tenant and missing membership references as unavailable', async () => {
    const recipient = await createRecipient();

    await expect(
      service.resolve({
        tenantId: otherTenantId,
        recipientType: 'TENANT_MEMBERSHIP',
        recipientReferenceId: recipient.membershipId,
        channel: 'EMAIL',
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });

    await expect(
      service.resolve({
        tenantId,
        recipientType: 'TENANT_MEMBERSHIP',
        recipientReferenceId: randomUUID(),
        channel: 'EMAIL',
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });
  });

  it('rejects suspended, ended, and deleted memberships as disabled', async () => {
    const suspended = await createRecipient({ membershipStatus: 'SUSPENDED' });
    const ended = await createRecipient({ endedAt: new Date() });
    const deleted = await createRecipient({ membershipDeletedAt: new Date() });

    for (const recipient of [suspended, ended, deleted]) {
      await expect(
        service.resolve({
          tenantId,
          recipientType: 'TENANT_MEMBERSHIP',
          recipientReferenceId: recipient.membershipId,
          channel: 'EMAIL',
        }),
      ).rejects.toMatchObject({ code: 'RECIPIENT_DISABLED' });
    }
  });

  it('rejects inactive user and inactive tenant state as disabled', async () => {
    const suspendedUser = await createRecipient({ userStatus: 'SUSPENDED' });
    const inactiveTenantRecipient = await createRecipient({ tenantId: inactiveTenantId });

    await expect(
      service.resolve({
        tenantId,
        recipientType: 'TENANT_MEMBERSHIP',
        recipientReferenceId: suspendedUser.membershipId,
        channel: 'EMAIL',
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_DISABLED' });

    await expect(
      service.resolve({
        tenantId: inactiveTenantId,
        recipientType: 'TENANT_MEMBERSHIP',
        recipientReferenceId: inactiveTenantRecipient.membershipId,
        channel: 'EMAIL',
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_DISABLED' });
  });

  async function createRecipient(
    options: {
      tenantId?: string;
      membershipStatus?: MembershipState;
      endedAt?: Date;
      membershipDeletedAt?: Date;
      userStatus?: UserState;
      userDeletedAt?: Date;
    } = {},
  ) {
    const recipientTenantId = options.tenantId ?? tenantId;
    const userId = randomUUID();
    const membershipId = randomUUID();
    const email = `${userId}@medsphere.test`;

    await prisma.client.user.create({
      data: {
        id: userId,
        email,
        passwordHash: 'integration-only-placeholder',
        firstName: 'G3.25',
        lastName: 'Recipient',
        status: options.userStatus ?? 'ACTIVE',
        deletedAt: options.userDeletedAt,
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId: recipientTenantId,
        userId,
        status: options.membershipStatus ?? 'ACTIVE',
        joinedAt: new Date(),
        endedAt: options.endedAt,
        deletedAt: options.membershipDeletedAt,
      },
    });
    return { membershipId, email };
  }
});
