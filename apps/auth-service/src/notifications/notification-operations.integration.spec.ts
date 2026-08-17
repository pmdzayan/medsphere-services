import { randomUUID } from 'node:crypto';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOperationsService } from './notification-operations.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.28 reservation notification operational acceptance', () => {
  const prisma = new PrismaService();
  const service = new NotificationOperationsService(prisma);
  const tenantOneId = randomUUID();
  const tenantTwoId = randomUUID();
  const userOneId = randomUUID();
  const userTwoId = randomUUID();
  const membershipOneId = randomUUID();
  const membershipTwoId = randomUUID();
  const correlationOne = `g328-${randomUUID()}`;
  const correlationTwo = `g328-${randomUUID()}`;
  let deliveryOneId: string;

  beforeAll(async () => {
    await createTenantActor(tenantOneId, userOneId, membershipOneId, 'one');
    await createTenantActor(tenantTwoId, userTwoId, membershipTwoId, 'two');
    deliveryOneId = await createDelivery(tenantOneId, membershipOneId, correlationOne, 'FAILED');
    await createDelivery(tenantTwoId, membershipTwoId, correlationTwo, 'DEAD_LETTER');
  });

  afterAll(async () => prisma.client.$disconnect());

  it('returns tenant-isolated metadata-only evidence with event and correlation identifiers', async () => {
    const result = await service.list(
      { tenantId: tenantOneId, membershipId: membershipOneId, userId: userOneId },
      { limit: 10 },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: deliveryOneId,
      workflowKey: 'reservation-ready-membership-v1',
      status: 'FAILED',
      sourceEvent: { correlationId: correlationOne },
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          outcome: 'FAILED',
          providerKey: 'g328-safe-provider',
          errorCode: 'PROVIDER_UNAVAILABLE',
        }),
      ],
    });
    expect(result[0]).not.toHaveProperty('recipientReferenceId');
    expect(result[0]).not.toHaveProperty('variables');
    expect(result[0]).not.toHaveProperty('lockToken');
  });

  it('fails closed for a cross-tenant membership and keeps metrics tenant-scoped', async () => {
    await expect(
      service.list({ tenantId: tenantOneId, membershipId: membershipTwoId, userId: userTwoId }, {}),
    ).rejects.toThrow('Notification operational access denied');

    await expect(
      service.summary({
        tenantId: tenantOneId,
        membershipId: membershipOneId,
        userId: userOneId,
      }),
    ).resolves.toEqual({
      tenantId: tenantOneId,
      counts: { PENDING: 0, PROCESSING: 0, FAILED: 1, DELIVERED: 0, DEAD_LETTER: 0 },
    });
  });

  it('reports ready only when PostgreSQL is reachable', async () => {
    await expect(service.readiness()).resolves.toEqual({ ready: true, dependency: 'postgresql' });
  });

  async function createTenantActor(
    tenantId: string,
    userId: string,
    membershipId: string,
    suffix: string,
  ): Promise<void> {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: `G3.28 tenant ${suffix}`, slug: `g328-${suffix}-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Operational',
        lastName: suffix,
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
  }

  async function createDelivery(
    tenantId: string,
    membershipId: string,
    correlationId: string,
    status: 'FAILED' | 'DEAD_LETTER',
  ): Promise<string> {
    const sourceEventId = randomUUID();
    await prisma.client.outboxEvent.create({
      data: {
        id: sourceEventId,
        tenantId,
        eventType: 'inventory.reservation.ready',
        eventVersion: 1,
        aggregateType: 'MedicineReservation',
        aggregateId: randomUUID(),
        actorType: 'SYSTEM',
        systemService: 'g3.28-integration',
        correlationId,
        payload: { status: 'READY' },
        occurredAt: new Date(),
      },
    });
    const delivery = await prisma.client.notificationDelivery.create({
      data: {
        tenantId,
        sourceEventId,
        workflowKey: 'reservation-ready-membership-v1',
        recipientType: 'TENANT_MEMBERSHIP',
        recipientReferenceId: membershipId,
        channel: 'EMAIL',
        templateKey: 'reservation-ready',
        templateVersion: 1,
        variables: { status: 'READY' },
        status,
        availableAt: status === 'FAILED' ? new Date(Date.now() + 60 * 60 * 1000) : new Date(),
        attemptCount: 1,
        lastErrorCode: 'PROVIDER_UNAVAILABLE',
      },
    });
    await prisma.client.notificationDeliveryAttempt.create({
      data: {
        tenantId,
        deliveryId: delivery.id,
        attemptNumber: 1,
        outcome: status === 'FAILED' ? 'FAILED' : 'DEAD_LETTER',
        providerKey: 'g328-safe-provider',
        errorCode: 'PROVIDER_UNAVAILABLE',
        occurredAt: new Date(),
      },
    });
    return delivery.id;
  }
});
