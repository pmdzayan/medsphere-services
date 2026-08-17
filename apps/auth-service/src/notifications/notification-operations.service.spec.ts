import { randomUUID } from 'node:crypto';
import { NotificationOperationsService } from './notification-operations.service';

describe('NotificationOperationsService', () => {
  it('authorizes the active operator, derives tenant scope, and omits sensitive delivery fields', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue({ id: randomUUID() });
    const service = new NotificationOperationsService({
      client: {
        tenantMembership: { findFirst },
        notificationDelivery: { findMany },
      },
    } as never);
    const actor = { tenantId: randomUUID(), membershipId: randomUUID(), userId: randomUUID() };

    await service.list(actor, { limit: 20, status: 'FAILED' });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: actor.membershipId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          status: 'ACTIVE',
          deletedAt: null,
        }),
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: actor.tenantId, status: 'FAILED' },
        take: 20,
        select: expect.objectContaining({
          sourceEventId: true,
          sourceEvent: { select: { correlationId: true } },
          attempts: expect.objectContaining({
            select: expect.objectContaining({ outcome: true, errorCode: true, occurredAt: true }),
          }),
        }),
      }),
    );
    const select = findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty('recipientReferenceId');
    expect(select).not.toHaveProperty('variables');
    expect(select).not.toHaveProperty('lockToken');
  });

  it('fails closed when the actor is not an active membership in the tenant', async () => {
    const findMany = jest.fn();
    const service = new NotificationOperationsService({
      client: {
        tenantMembership: { findFirst: jest.fn().mockResolvedValue(null) },
        notificationDelivery: { findMany },
      },
    } as never);

    await expect(
      service.list(
        { tenantId: randomUUID(), membershipId: randomUUID(), userId: randomUUID() },
        {},
      ),
    ).rejects.toThrow('Notification operational access denied');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns bounded tenant-scoped status metrics', async () => {
    const count = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1);
    const service = new NotificationOperationsService({
      client: {
        tenantMembership: { findFirst: jest.fn().mockResolvedValue({ id: randomUUID() }) },
        notificationDelivery: { count },
      },
    } as never);
    const actor = { tenantId: randomUUID(), membershipId: randomUUID(), userId: randomUUID() };

    await expect(service.summary(actor)).resolves.toEqual({
      tenantId: actor.tenantId,
      counts: { PENDING: 2, PROCESSING: 1, FAILED: 3, DELIVERED: 8, DEAD_LETTER: 1 },
    });
    expect(count).toHaveBeenCalledTimes(5);
    for (const call of count.mock.calls) {
      expect(call[0].where.tenantId).toBe(actor.tenantId);
    }
  });

  it('reports PostgreSQL readiness and propagates dependency failure', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ '?column?': 1 }]);
    const service = new NotificationOperationsService({ client: { $queryRaw: queryRaw } } as never);
    await expect(service.readiness()).resolves.toEqual({ ready: true, dependency: 'postgresql' });

    const failing = new NotificationOperationsService({
      client: { $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    } as never);
    await expect(failing.readiness()).rejects.toThrow('database unavailable');
  });

  it('rejects malformed actor identifiers and unbounded queries before operational reads', async () => {
    const service = new NotificationOperationsService({ client: {} } as never);
    await expect(
      service.list(
        { tenantId: 'client-input', membershipId: randomUUID(), userId: randomUUID() },
        {},
      ),
    ).rejects.toThrow('must be a UUID');

    const serviceWithMembership = new NotificationOperationsService({
      client: {
        tenantMembership: { findFirst: jest.fn().mockResolvedValue({ id: randomUUID() }) },
      },
    } as never);
    await expect(
      serviceWithMembership.list(
        { tenantId: randomUUID(), membershipId: randomUUID(), userId: randomUUID() },
        { limit: 101 },
      ),
    ).rejects.toThrow('between 1 and 100');
  });
});
