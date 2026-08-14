import {
  appendOutboxEvent,
  consumeOutboxEventOnce,
  markOutboxDelivered,
  markOutboxFailed,
  retryDelayMs,
  validateTenantDomainEvent,
} from '@medsphere/database';
import type { Prisma } from '@prisma/client';

const tenantId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const eventId = '44444444-4444-4444-8444-444444444444';

const event = {
  eventId,
  eventType: 'inventory.batch.quarantined',
  eventVersion: 1,
  aggregateType: 'Batch',
  aggregateId: 'batch-1',
  occurredAt: '2026-08-14T12:00:00.000Z',
  actor: { actorType: 'TENANT_USER', tenantId, membershipId, userId },
  correlationId: 'request-1',
  payload: { batchId: 'batch-1', reasonCode: 'QUALITY_SUSPECT' },
} as const;

describe('G3.21 transactional event delivery foundation', () => {
  it('persists a validated tenant event without transport side effects', async () => {
    const create = jest.fn().mockResolvedValue({ id: eventId });
    await appendOutboxEvent({ outboxEvent: { create } } as never, event);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: eventId,
        tenantId,
        actorType: 'TENANT_USER',
        actorMembershipId: membershipId,
        actorUserId: userId,
        payload: event.payload,
      }),
      select: { id: true },
    });
  });

  it('rejects malformed identity and oversized payloads', () => {
    expect(() => validateTenantDomainEvent({ ...event, eventId: 'not-a-uuid' })).toThrow(
      'Event id must be a UUID',
    );
    expect(() =>
      validateTenantDomainEvent({ ...event, payload: { value: 'x'.repeat(17 * 1024) } }),
    ).toThrow('Event payload exceeds the application size limit');
  });

  it('uses bounded exponential retry and dead-letters with coded failures', async () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(4)).toBe(8_000);
    expect(retryDelayMs(20)).toBe(3_600_000);

    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const database = { outboxEvent: { updateMany } } as never;
    const now = new Date('2026-08-14T12:01:00.000Z');
    const claimed = { eventId, lockToken: 'lease-token', attemptCount: 2 };

    await expect(
      markOutboxFailed(database, claimed, { now, errorCode: 'PROVIDER_TIMEOUT' }),
    ).resolves.toBe('FAILED');
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'PROVIDER_TIMEOUT',
          availableAt: new Date('2026-08-14T12:01:02.000Z'),
        }),
      }),
    );

    await expect(
      markOutboxFailed(database, { ...claimed, attemptCount: 10 }, {
        now,
        errorCode: 'PROVIDER_REJECTED',
      }),
    ).resolves.toBe('DEAD_LETTER');
  });

  it('requires the current lease before recording delivery', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const deliveredAt = new Date('2026-08-14T12:02:00.000Z');
    await markOutboxDelivered(
      { outboxEvent: { updateMany } } as never,
      { eventId, lockToken: 'lease-token' },
      deliveredAt,
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId, status: 'PROCESSING', lockToken: 'lease-token' },
        data: expect.objectContaining({ status: 'DELIVERED', deliveredAt }),
      }),
    );
  });

  it('runs first delivery atomically and treats duplicate receipts as no-ops', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = { eventInboxReceipt: { createMany } } as unknown as Prisma.TransactionClient;
    const host = {
      $transaction: jest.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const operation = jest.fn().mockResolvedValue('projected');

    await expect(
      consumeOutboxEventOnce(
        host as never,
        { tenantId, eventId, consumerName: 'inventory-analytics-v1' },
        operation,
      ),
    ).resolves.toEqual({ processed: true, result: 'projected' });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith(transaction);

    const duplicateTransaction = {
      eventInboxReceipt: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as Prisma.TransactionClient;
    const duplicateHost = {
      $transaction: jest.fn(
        async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(duplicateTransaction),
      ),
    };
    await expect(
      consumeOutboxEventOnce(
        duplicateHost as never,
        { tenantId, eventId, consumerName: 'inventory-analytics-v1' },
        operation,
      ),
    ).resolves.toEqual({ processed: false });
  });
});
