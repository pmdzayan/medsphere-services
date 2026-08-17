import { randomUUID } from 'node:crypto';
import { appendOutboxEvent } from '@medsphere/database';
import {
  isInfrastructureTestEnabled,
  requireEnv,
} from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationWorkerService } from './notification-worker.service';
import { ReservationNotificationComposerService } from './reservation-notification-composer.service';
import { ReservationNotificationConsumerService } from './reservation-notification-consumer.service';
import { ReservationRecipientResolverService } from './reservation-recipient-resolver.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.27 end-to-end queued reservation notification workflow', () => {
  const prisma = new PrismaService();
  const consumer = new ReservationNotificationConsumerService(prisma);
  const resolver = new ReservationRecipientResolverService(prisma);
  const composer = new ReservationNotificationComposerService();
  const tenantId = randomUUID();
  const subjectUserId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'G3.27 notification tenant',
        slug: `g327-${tenantId}`,
      },
    });
    await prisma.client.user.create({
      data: {
        id: subjectUserId,
        email: `${subjectUserId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Reservation',
        lastName: 'Recipient',
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId: subjectUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'G3.27 fixture provider',
        ownerName: 'Integration Fixture',
        email: `${providerId}@medsphere.test`,
        phone: '0000000000',
        address: 'Integration fixture only',
        city: 'Test',
        state: 'Test',
        country: 'IN',
        postalCode: '000000',
        latitude: 0,
        longitude: 0,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it(
    'connects event consumption through composition and concurrent worker delivery exactly once',
    async () => {
      const eventId = await readyEventFixture();
      await expect(
        Promise.all([
          consumer.consume({ tenantId, eventId }),
          consumer.consume({ tenantId, eventId }),
        ]),
      ).resolves.toEqual(
        expect.arrayContaining([
          { processed: true, enqueued: true },
          { processed: false, enqueued: false },
        ]),
      );

      const deliver = jest
        .fn()
        .mockResolvedValue({ providerReference: 'g327-provider-reference' });
      const worker = buildWorker(deliver);
      const now = new Date(Date.now() + 5_000);
      const results = await Promise.all([
        worker.run({ limit: 10, leaseMs: 30_000, now }),
        worker.run({ limit: 10, leaseMs: 30_000, now }),
      ]);

      expect(results.reduce((sum, result) => sum + result.delivered, 0)).toBe(1);
      expect(deliver).toHaveBeenCalledTimes(1);
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.any(String),
          tenantId,
          channel: 'EMAIL',
          templateKey: 'reservation-ready',
          variables: { status: 'READY' },
          composedContent: expect.objectContaining({
            locale: 'en',
            subject: 'Your reservation is ready',
            body: 'Your reserved item is ready for collection.',
          }),
        }),
      );

      const stored = await prisma.client.notificationDelivery.findFirstOrThrow({
        where: { sourceEventId: eventId, tenantId },
        include: { attempts: true },
      });
      expect(stored.status).toBe('DELIVERED');
      expect(stored.attempts).toHaveLength(1);
      expect(stored.attempts[0]).toMatchObject({
        outcome: 'DELIVERED',
        attemptNumber: 1,
      });
    },
  );

  it('reuses the same logical delivery idempotency key across a bounded retry', async () => {
    const eventId = await readyEventFixture();
    await consumer.consume({ tenantId, eventId });

    const deliver = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient provider failure'))
      .mockResolvedValueOnce({ providerReference: 'g327-retry-reference' });
    const worker = buildWorker(deliver);
    const firstAt = new Date(Date.now() + 5_000);

    await expect(
      worker.run({ limit: 10, leaseMs: 30_000, maximumAttempts: 3, now: firstAt }),
    ).resolves.toMatchObject({ claimed: 1, failed: 1, delivered: 0 });
    await expect(
      worker.run({
        limit: 10,
        leaseMs: 30_000,
        maximumAttempts: 3,
        now: new Date(firstAt.getTime() + 2_100),
      }),
    ).resolves.toMatchObject({ claimed: 1, failed: 0, delivered: 1 });

    expect(deliver).toHaveBeenCalledTimes(2);
    const firstKey = deliver.mock.calls[0]![0].idempotencyKey;
    const secondKey = deliver.mock.calls[1]![0].idempotencyKey;
    expect(firstKey).toBe(secondKey);

    const stored = await prisma.client.notificationDelivery.findFirstOrThrow({
      where: { sourceEventId: eventId, tenantId },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    expect(stored.status).toBe('DELIVERED');
    expect(stored.attempts).toHaveLength(2);
    expect(stored.attempts.map((attempt) => attempt.outcome)).toEqual([
      'FAILED',
      'DELIVERED',
    ]);
    expect(stored.attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
  });

  function buildWorker(deliver: jest.Mock) {
    return new NotificationWorkerService(
      prisma,
      resolver,
      {
        forChannel: () => ({ providerKey: 'g327-safe-test-provider', deliver }),
      },
      { record: jest.fn() },
      composer,
    );
  }

  async function readyEventFixture(): Promise<string> {
    const reservationId = randomUUID();
    const readyAt = new Date();
    const createdAt = new Date(readyAt.getTime() - 1_000);
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId,
        status: 'READY',
        createdAt,
        expiresAt: new Date(readyAt.getTime() + 60_000),
        confirmedAt: readyAt,
        readyAt,
        idempotencyKey: `g327-${reservationId}`,
        creationHash: 'a'.repeat(64),
        version: 2,
      },
    });
    const eventId = randomUUID();
    await appendOutboxEvent(prisma.client, {
      eventId,
      eventType: 'inventory.reservation.ready',
      eventVersion: 1,
      aggregateType: 'MedicineReservation',
      aggregateId: reservationId,
      occurredAt: readyAt.toISOString(),
      actor: {
        actorType: 'TENANT_USER',
        tenantId,
        membershipId,
        userId: subjectUserId,
      },
      payload: {
        providerId,
        previousStatus: 'CONFIRMED',
        status: 'READY',
        version: 2,
        totalQuantity: 1,
      },
    });
    return eventId;
  }
});
