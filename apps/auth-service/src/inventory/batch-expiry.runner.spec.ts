import { executeBatchExpiryWorker } from './batch-expiry.runner';

const config = {
  batchSize: 10,
  maximumRecords: 100,
  maximumReservationsPerBatch: 50,
  maximumAllocationsPerBatch: 500,
};
const asOf = new Date('2026-08-10T12:00:00.000Z');

function harness() {
  return {
    service: { run: jest.fn() },
    logger: {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
}

describe('executeBatchExpiryWorker', () => {
  it('returns zero and logs only bounded aggregate evidence', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({
      asOf,
      selected: 1,
      reconciled: 1,
      skipped: 0,
      failed: 0,
      affectedReservations: 2,
      releasedUnits: 6,
      failures: {},
    });
    await expect(executeBatchExpiryWorker(service as never, config, logger)).resolves.toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      'Batch expiry worker completed',
      expect.objectContaining({ reconciled: 1, affectedReservations: 2, releasedUnits: 6 }),
    );
  });

  it('returns non-zero after a bounded candidate failure without logging identities', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({
      asOf,
      selected: 2,
      reconciled: 1,
      skipped: 0,
      failed: 1,
      affectedReservations: 0,
      releasedUnits: 0,
      failures: { invariant_conflict: 1 },
    });
    await expect(executeBatchExpiryWorker(service as never, config, logger)).resolves.toBe(1);
    expect(JSON.stringify(logger.warn.mock.calls[0]?.[1])).not.toMatch(
      /tenantId|providerId|batchId|reservationId|patient|token/i,
    );
  });
});
