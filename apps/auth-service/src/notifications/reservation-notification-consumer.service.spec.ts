import { randomUUID } from 'node:crypto';
import { ReservationNotificationConsumerService } from './reservation-notification-consumer.service';

describe('ReservationNotificationConsumerService', () => {
  it('uses the accepted G3.21 inbox transaction before reading and enqueuing', async () => {
    const fixture = harness();
    await expect(fixture.service.consume(fixture.reference)).resolves.toEqual({
      processed: true,
      enqueued: true,
    });
    expect(fixture.receipts.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: fixture.reference.tenantId,
          eventId: fixture.reference.eventId,
          consumerName: 'reservation-ready-notification-v1',
        }),
        skipDuplicates: true,
      }),
    );
    expect(fixture.deliveries.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceEventId: fixture.reference.eventId,
          recipientType: 'TENANT_MEMBERSHIP',
          recipientReferenceId: fixture.recipientMembershipId,
          templateKey: 'reservation-ready',
          variables: { status: 'READY' },
        }),
      }),
    );
  });

  it('treats a duplicate inbox receipt as a replay without another effect', async () => {
    const fixture = harness({ receiptCount: 0 });
    await expect(fixture.service.consume(fixture.reference)).resolves.toEqual({
      processed: false,
      enqueued: false,
    });
    expect(fixture.events.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(fixture.deliveries.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['inventory.reservation.confirmed', 1, 'unsupported'],
    ['inventory.reservation.ready', 2, 'unsupported'],
  ])('fails closed for event %s version %s', async (eventType, eventVersion, message) => {
    const fixture = harness({ eventType, eventVersion });
    await expect(fixture.service.consume(fixture.reference)).rejects.toThrow(message);
    expect(fixture.deliveries.createMany).not.toHaveBeenCalled();
  });

  it('rejects schema drift before resolving a recipient or enqueuing', async () => {
    const fixture = harness({ payload: { status: 'READY', patientEmail: 'forbidden' } });
    await expect(fixture.service.consume(fixture.reference)).rejects.toThrow('schema');
    expect(fixture.memberships.findFirstOrThrow).not.toHaveBeenCalled();
    expect(fixture.deliveries.createMany).not.toHaveBeenCalled();
  });
});

function harness(
  overrides: {
    readonly receiptCount?: number;
    readonly eventType?: string;
    readonly eventVersion?: number;
    readonly payload?: Record<string, unknown>;
  } = {},
) {
  const tenantId = randomUUID();
  const eventId = randomUUID();
  const aggregateId = randomUUID();
  const providerId = randomUUID();
  const subjectUserId = randomUUID();
  const recipientMembershipId = randomUUID();
  const receipts = {
    createMany: jest.fn().mockResolvedValue({ count: overrides.receiptCount ?? 1 }),
  };
  const events = {
    findUniqueOrThrow: jest.fn().mockResolvedValue({
      id: eventId,
      tenantId,
      eventType: overrides.eventType ?? 'inventory.reservation.ready',
      eventVersion: overrides.eventVersion ?? 1,
      aggregateType: 'MedicineReservation',
      aggregateId,
      occurredAt: new Date('2026-08-14T19:00:00.000Z'),
      payload: overrides.payload ?? {
        providerId,
        previousStatus: 'CONFIRMED',
        status: 'READY',
        version: 2,
        totalQuantity: 1,
      },
    }),
  };
  const reservations = {
    findFirstOrThrow: jest.fn().mockResolvedValue({ subjectUserId }),
  };
  const memberships = {
    findFirstOrThrow: jest.fn().mockResolvedValue({ id: recipientMembershipId }),
  };
  const deliveries = { createMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const transaction = {
    eventInboxReceipt: receipts,
    outboxEvent: events,
    medicineReservation: reservations,
    tenantMembership: memberships,
    notificationDelivery: deliveries,
  };
  const prisma = {
    client: {
      $transaction: async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    },
  };
  return {
    service: new ReservationNotificationConsumerService(prisma as never),
    reference: { tenantId, eventId },
    recipientMembershipId,
    receipts,
    events,
    memberships,
    deliveries,
  };
}
