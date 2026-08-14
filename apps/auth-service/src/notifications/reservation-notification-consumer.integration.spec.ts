import { randomUUID } from 'node:crypto';
import { appendOutboxEvent } from '@medsphere/database';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import {
  RESERVATION_READY_NOTIFICATION_CONSUMER,
  ReservationNotificationConsumerService,
} from './reservation-notification-consumer.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.24 PostgreSQL reservation notification consumer', () => {
  const prisma = new PrismaService();
  const service = new ReservationNotificationConsumerService(prisma);
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const subjectUserId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'G3.24 notification tenant', slug: `g324-${tenantId}` },
        { id: otherTenantId, name: 'G3.24 other tenant', slug: `g324-${otherTenantId}` },
      ],
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
        businessName: 'G3.24 fixture provider',
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

  it('creates one queue intent and one immutable inbox receipt under replay', async () => {
    const fixture = await readyEventFixture();
    const consume = () => service.consume({ tenantId, eventId: fixture.eventId });
    const duplicateResults = await Promise.all([consume(), consume()]);
    expect(duplicateResults.filter(({ processed }) => processed)).toEqual([
      { processed: true, enqueued: true },
    ]);
    expect(duplicateResults.filter(({ processed }) => !processed)).toEqual([
      { processed: false, enqueued: false },
    ]);
    await expect(service.consume({ tenantId, eventId: fixture.eventId })).resolves.toEqual({
      processed: false,
      enqueued: false,
    });

    const [deliveries, receipts] = await Promise.all([
      prisma.client.notificationDelivery.findMany({ where: { sourceEventId: fixture.eventId } }),
      prisma.client.eventInboxReceipt.findMany({
        where: { eventId: fixture.eventId, consumerName: RESERVATION_READY_NOTIFICATION_CONSUMER },
      }),
    ]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      tenantId,
      recipientType: 'TENANT_MEMBERSHIP',
      recipientReferenceId: membershipId,
      channel: 'EMAIL',
      templateKey: 'reservation-ready',
      templateVersion: 1,
      variables: { status: 'READY' },
    });
    expect(receipts).toHaveLength(1);
    await expect(
      prisma.client.eventInboxReceipt.delete({ where: { id: receipts[0]!.id } }),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it('rolls back the inbox receipt when the authoritative reservation is unavailable', async () => {
    const eventId = randomUUID();
    await appendReadyEvent(eventId, randomUUID());
    await expect(service.consume({ tenantId, eventId })).rejects.toThrow();
    await expect(
      prisma.client.eventInboxReceipt.count({
        where: { eventId, consumerName: RESERVATION_READY_NOTIFICATION_CONSUMER },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.client.notificationDelivery.count({ where: { sourceEventId: eventId } }),
    ).resolves.toBe(0);
  });

  it('rejects cross-tenant consumption without recording processing evidence', async () => {
    const fixture = await readyEventFixture();
    await expect(
      service.consume({ tenantId: otherTenantId, eventId: fixture.eventId }),
    ).rejects.toThrow();
    await expect(
      prisma.client.eventInboxReceipt.count({
        where: { eventId: fixture.eventId, tenantId: otherTenantId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.client.notificationDelivery.count({
        where: { sourceEventId: fixture.eventId, tenantId: otherTenantId },
      }),
    ).resolves.toBe(0);
  });

  it('fails closed for an unsupported reservation event and rolls back its receipt', async () => {
    const reservationId = await createReservation();
    const eventId = randomUUID();
    await appendOutboxEvent(prisma.client, {
      eventId,
      eventType: 'inventory.reservation.confirmed',
      eventVersion: 1,
      aggregateType: 'MedicineReservation',
      aggregateId: reservationId,
      occurredAt: new Date().toISOString(),
      actor: { actorType: 'TENANT_USER', tenantId, membershipId, userId: subjectUserId },
      payload: {
        providerId,
        previousStatus: 'PENDING',
        status: 'CONFIRMED',
        version: 2,
        totalQuantity: 1,
      },
    });
    await expect(service.consume({ tenantId, eventId })).rejects.toThrow('type is unsupported');
    await expect(prisma.client.eventInboxReceipt.count({ where: { eventId } })).resolves.toBe(0);
  });

  async function readyEventFixture() {
    const reservationId = await createReservation();
    const eventId = randomUUID();
    await appendReadyEvent(eventId, reservationId);
    return { eventId, reservationId };
  }

  async function createReservation(): Promise<string> {
    const reservationId = randomUUID();
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId,
        status: 'READY',
        expiresAt: new Date(Date.now() + 60_000),
        readyAt: new Date(),
        idempotencyKey: `g324-${reservationId}`,
        creationHash: 'a'.repeat(64),
        version: 2,
      },
    });
    return reservationId;
  }

  async function appendReadyEvent(eventId: string, reservationId: string): Promise<void> {
    await appendOutboxEvent(prisma.client, {
      eventId,
      eventType: 'inventory.reservation.ready',
      eventVersion: 1,
      aggregateType: 'MedicineReservation',
      aggregateId: reservationId,
      occurredAt: new Date().toISOString(),
      actor: { actorType: 'TENANT_USER', tenantId, membershipId, userId: subjectUserId },
      payload: {
        providerId,
        previousStatus: 'CONFIRMED',
        status: 'READY',
        version: 2,
        totalQuantity: 1,
      },
    });
  }
});
