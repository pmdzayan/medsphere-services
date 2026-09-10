/**
 * Task 0026 CTO coverage correction.
 * Dedicated expiry/concurrency characterization for Live Availability Request.
 */
import { AvailabilityRequestExpiryService } from './availability-request-expiry.service';

function buildHarness(
  options: {
    requestStatus?: 'PENDING' | 'RESPONDED' | 'EXPIRED';
    updateCount?: number;
  } = {},
) {
  const asOf = new Date('2026-09-10T12:00:00.000Z');
  const request = {
    id: 'request-1',
    tenantId: 'tenant-1',
    version: 3,
    status: options.requestStatus ?? 'PENDING',
  };

  const transaction = {
    availabilityRequest: {
      findFirst: jest.fn().mockResolvedValue(request),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
    },
  };

  const findMany = jest
    .fn()
    .mockResolvedValueOnce([{ id: request.id, tenantId: request.tenantId, status: 'PENDING' }])
    .mockResolvedValueOnce([]);

  const client = {
    $queryRaw: jest.fn().mockResolvedValue([{ asOf }]),
    availabilityRequest: { findMany },
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };

  const service = new AvailabilityRequestExpiryService({ client } as never);
  return { service, client, transaction, asOf };
}

describe('AvailabilityRequestExpiryService - Task 0026 CTO coverage correction', () => {
  it('expires a still-PENDING request only through the same asOf boundary used by the sweep', async () => {
    const { service, transaction, asOf, client } = buildHarness();

    const result = await service.run({ batchSize: 10, maximumRecords: 10 });

    expect(result).toMatchObject({ selected: 1, expired: 1, skipped: 0, failed: 0 });
    expect(client.availabilityRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          expiresAt: { lte: asOf },
        }),
        take: 10,
      }),
    );
    expect(transaction.availabilityRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        expiresAt: { lte: asOf },
        version: 3,
      },
      data: { status: 'EXPIRED', activeDedupKey: null, version: { increment: 1 } },
    });
  });

  it('skips when a pharmacist response won after candidate selection', async () => {
    const { service, transaction } = buildHarness({ requestStatus: 'RESPONDED' });

    const result = await service.run({ batchSize: 10, maximumRecords: 10 });

    expect(result).toMatchObject({ selected: 1, expired: 0, skipped: 1, failed: 0 });
    expect(transaction.availabilityRequest.updateMany).not.toHaveBeenCalled();
  });

  it('skips when the guarded update loses a version/state race', async () => {
    const { service } = buildHarness({ updateCount: 0 });

    const result = await service.run({ batchSize: 10, maximumRecords: 10 });

    expect(result).toMatchObject({ selected: 1, expired: 0, skipped: 1, failed: 0 });
  });

  it('fails closed on invalid worker bounds before touching the database', async () => {
    const { service, client } = buildHarness();

    await expect(service.run({ batchSize: 0, maximumRecords: 10 })).rejects.toThrow(
      'batch size must be between 1 and 100',
    );
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
});
