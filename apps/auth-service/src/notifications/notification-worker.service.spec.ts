import { randomUUID } from 'node:crypto';
import { NotificationWorkerService } from './notification-worker.service';
import { NotificationDeliveryFailure } from './notification.errors';

const tenantId = randomUUID();
const destinationToken = 'transient-destination-token';

describe('NotificationWorkerService', () => {
  it('resolves, composes, and sends a stable idempotency key without leaking destination data', async () => {
    const delivery = claimed();
    const providerDeliver = jest
      .fn()
      .mockResolvedValue({ providerReference: 'provider-message-1' });
    const observer = { record: jest.fn() };
    const service = worker(delivery, providerDeliver, observer);
    await expect(service.run({ limit: 10, leaseMs: 30_000, now: new Date() })).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      failed: 0,
      deadLettered: 0,
    });
    expect(providerDeliver).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: delivery.deliveryId,
        idempotencyKey: delivery.deliveryId,
        destinationToken,
        templateKey: 'reservation-ready',
        templateVersion: 1,
        variables: { status: 'READY' },
        composedContent: {
          templateKey: 'reservation-ready',
          templateVersion: 1,
          locale: 'en',
          subject: 'AIM: Your reservation is ready',
          body: 'Your All In Medico reservation is ready for collection.',
          metadata: {
            workflowKey: 'reservation-ready-membership-v1',
            contentClass: 'OPERATIONAL',
          },
        },
      }),
    );
    expect(observer.record).toHaveBeenCalledWith(expect.not.objectContaining({ destinationToken }));
  });

  it('fails closed before provider delivery when queued composition is unsupported', async () => {
    const delivery = claimed();
    const providerDeliver = jest.fn();
    const observer = { record: jest.fn() };
    const service = worker(
      { ...delivery, templateKey: 'unsupported-template' },
      providerDeliver,
      observer,
    );
    await expect(
      service.run({ limit: 10, leaseMs: 30_000, maximumAttempts: 1, now: new Date() }),
    ).resolves.toMatchObject({ claimed: 1, deadLettered: 1 });
    expect(providerDeliver).not.toHaveBeenCalled();
    expect(observer.record).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'TEMPLATE_KEY_UNSUPPORTED', outcome: 'DEAD_LETTER' }),
    );
  });

  it('converts raw provider errors into coded evidence without exposing the exception', async () => {
    const delivery = claimed();
    const observer = { record: jest.fn() };
    const service = worker(
      delivery,
      jest.fn().mockRejectedValue(new Error('raw secret failure')),
      observer,
    );
    await expect(
      service.run({ limit: 10, leaseMs: 30_000, maximumAttempts: 3, now: new Date() }),
    ).resolves.toMatchObject({ claimed: 1, failed: 1 });
    expect(observer.record).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'UNEXPECTED_DELIVERY_FAILURE', outcome: 'FAILED' }),
    );
  });

  it('preserves allowlisted resolver/provider failure codes', async () => {
    const delivery = claimed(3);
    const observer = { record: jest.fn() };
    const prisma = prismaFor(delivery);
    const service = new NotificationWorkerService(
      prisma as never,
      {
        resolve: jest
          .fn()
          .mockRejectedValue(
            new NotificationDeliveryFailure('RECIPIENT_RESOLUTION_UNAVAILABLE', 'unresolved'),
          ),
      },
      { forChannel: jest.fn() },
      observer,
    );
    await expect(
      service.run({ limit: 10, leaseMs: 30_000, maximumAttempts: 3, now: new Date() }),
    ).resolves.toMatchObject({ deadLettered: 1 });
    expect(observer.record).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'RECIPIENT_RESOLUTION_UNAVAILABLE',
        outcome: 'DEAD_LETTER',
      }),
    );
  });

  it('does not let an observer failure rewrite a delivered outcome', async () => {
    const delivery = claimed();
    const prisma = prismaFor(delivery);
    const service = new NotificationWorkerService(
      prisma as never,
      { resolve: jest.fn().mockResolvedValue({ destinationToken }) },
      {
        forChannel: () => ({
          providerKey: 'test-provider',
          deliver: jest.fn().mockResolvedValue({}),
        }),
      },
      { record: jest.fn().mockRejectedValue(new Error('metrics unavailable')) },
    );
    await expect(
      service.run({ limit: 10, leaseMs: 30_000, now: new Date() }),
    ).resolves.toMatchObject({
      delivered: 1,
      failed: 0,
    });
    const updateMany = prisma.client.$transaction;
    expect(updateMany).toBeDefined();
  });
});

function worker(
  delivery: ReturnType<typeof claimed>,
  deliver: jest.Mock,
  observer: { record: jest.Mock },
) {
  return new NotificationWorkerService(
    prismaFor(delivery) as never,
    { resolve: jest.fn().mockResolvedValue({ destinationToken }) },
    { forChannel: () => ({ providerKey: 'test-provider', deliver }) },
    observer,
  );
}

function prismaFor(delivery: ReturnType<typeof claimed>) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const create = jest.fn().mockResolvedValue({ id: randomUUID() });
  return {
    client: {
      $queryRaw: jest.fn().mockResolvedValue([delivery]),
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          notificationDelivery: { updateMany },
          notificationDeliveryAttempt: { create },
        }),
    },
  };
}

function claimed(attemptCount = 1) {
  return {
    deliveryId: randomUUID(),
    tenantId,
    sourceEventId: randomUUID(),
    workflowKey: 'reservation-ready-membership-v1',
    recipientType: 'TENANT_MEMBERSHIP' as const,
    recipientReferenceId: randomUUID(),
    channel: 'EMAIL' as const,
    templateKey: 'reservation-ready',
    templateVersion: 1,
    variables: { status: 'READY' },
    attemptCount,
    lockToken: randomUUID(),
  };
}
