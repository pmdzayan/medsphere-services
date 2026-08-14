import { randomUUID } from 'node:crypto';
import {
  enqueueNotificationDelivery,
  notificationRetryDelayMs,
  recordNotificationDelivered,
  recordNotificationFailed,
  validateNotificationDelivery,
} from '@medsphere/database';

const tenantId = randomUUID();
const sourceEventId = randomUUID();
const occurredAt = new Date('2026-08-14T18:00:00.000Z');

const request = {
  tenantId,
  sourceEventId,
  workflowKey: 'inventory-reservation-operations',
  recipientType: 'TENANT_MEMBERSHIP' as const,
  recipientReferenceId: randomUUID(),
  channel: 'EMAIL' as const,
  templateKey: 'reservation-status-v1',
  templateVersion: 1,
  variables: { status: 'READY', referenceCode: 'opaque-123' },
  availableAt: occurredAt,
};

describe('G3.23 notification delivery foundation primitives', () => {
  it('accepts bounded metadata and rejects copied sensitive recipient data', () => {
    expect(() => validateNotificationDelivery(request)).not.toThrow();
    expect(() =>
      validateNotificationDelivery({
        ...request,
        variables: { patientEmail: 'copied@example.invalid' },
      }),
    ).toThrow('forbidden sensitive key');
  });

  it('uses the database idempotency key through createMany skipDuplicates', async () => {
    const createMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const database = { notificationDelivery: { createMany } } as never;
    await expect(enqueueNotificationDelivery(database, request)).resolves.toEqual({
      enqueued: true,
    });
    await expect(enqueueNotificationDelivery(database, request)).resolves.toEqual({
      enqueued: false,
    });
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.objectContaining({
          tenantId,
          sourceEventId,
          recipientReferenceId: request.recipientReferenceId,
        }),
      }),
    );
  });

  it('records a delivered attempt in the same serializable outcome transaction', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: randomUUID() });
    const host = transactionHost(updateMany, create);
    const delivery = claimed();
    await recordNotificationDelivered(host as never, delivery, {
      occurredAt,
      providerKey: 'test-provider',
      providerReferenceHash: 'a'.repeat(64),
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockToken: delivery.lockToken }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'DELIVERED', attemptNumber: 1 }),
      }),
    );
  });

  it('uses coded bounded retries and dead-letters at the configured maximum', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: randomUUID() });
    const host = transactionHost(updateMany, create);
    await expect(
      recordNotificationFailed(host as never, claimed(2), {
        occurredAt,
        providerKey: 'test-provider',
        errorCode: 'PROVIDER_TIMEOUT',
        maximumAttempts: 2,
      }),
    ).resolves.toBe('DEAD_LETTER');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'DEAD_LETTER' }) }),
    );
    expect(notificationRetryDelayMs(1)).toBe(2_000);
    expect(notificationRetryDelayMs(25)).toBe(60 * 60 * 1_000);
  });

  it('rejects stale leases before writing attempt evidence', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest.fn();
    await expect(
      recordNotificationDelivered(transactionHost(updateMany, create) as never, claimed(), {
        occurredAt,
        providerKey: 'test-provider',
      }),
    ).rejects.toThrow('lease was lost');
    expect(create).not.toHaveBeenCalled();
  });
});

function claimed(attemptCount = 1) {
  return {
    deliveryId: randomUUID(),
    tenantId,
    lockToken: randomUUID(),
    attemptCount,
  };
}

function transactionHost(updateMany: jest.Mock, create: jest.Mock) {
  return {
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
      operation({
        notificationDelivery: { updateMany },
        notificationDeliveryAttempt: { create },
      }),
  };
}
