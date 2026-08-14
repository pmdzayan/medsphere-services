import { randomUUID } from 'node:crypto';
import { NotificationOperationsService } from './notification-operations.service';

describe('NotificationOperationsService', () => {
  it('derives tenant scope from the trusted operator and omits sensitive delivery fields', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new NotificationOperationsService({
      client: { notificationDelivery: { findMany } },
    } as never);
    const actor = { tenantId: randomUUID(), membershipId: randomUUID(), userId: randomUUID() };
    await service.list(actor, { limit: 20, status: 'FAILED' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: actor.tenantId, status: 'FAILED' },
        take: 20,
        select: expect.not.objectContaining({
          recipientReferenceId: true,
          variables: true,
          lockToken: true,
        }),
      }),
    );
  });

  it('rejects untrusted actor identifiers and unbounded queries', async () => {
    const service = new NotificationOperationsService({ client: {} } as never);
    await expect(
      service.list(
        { tenantId: 'client-input', membershipId: randomUUID(), userId: randomUUID() },
        {},
      ),
    ).rejects.toThrow('must be a UUID');
    await expect(
      service.list(
        { tenantId: randomUUID(), membershipId: randomUUID(), userId: randomUUID() },
        { limit: 101 },
      ),
    ).rejects.toThrow('between 1 and 100');
  });
});
