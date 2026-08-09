import { executeReservationExpiryWorker } from './reservation-expiry.runner';

function harness() {
  const service = { run: jest.fn() };
  const logger = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { service, logger };
}

const config = { batchSize: 10, maximumRecords: 100 };
const asOf = new Date('2026-08-09T00:00:00.000Z');

describe('executeReservationExpiryWorker', () => {
  it('returns success and logs bounded aggregate counts', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({
      asOf,
      selected: 2,
      expired: 2,
      skipped: 0,
      failed: 0,
      failures: {},
    });

    await expect(executeReservationExpiryWorker(service as never, config, logger)).resolves.toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      'Reservation expiry worker completed',
      expect.objectContaining({ selected: 2, expired: 2, failed: 0 }),
    );
  });

  it('returns non-zero for selected-record failures without logging identities', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({
      asOf,
      selected: 2,
      expired: 1,
      skipped: 0,
      failed: 1,
      failures: { invariant_conflict: 1 },
    });

    await expect(executeReservationExpiryWorker(service as never, config, logger)).resolves.toBe(1);
    const metadata = logger.warn.mock.calls[0]?.[1];
    expect(JSON.stringify(metadata)).not.toMatch(/tenant|reservation|patient|user|token/i);
  });

  it('returns non-zero for an unexpected run failure', async () => {
    const { service, logger } = harness();
    service.run.mockRejectedValue(new Error('database unavailable'));

    await expect(executeReservationExpiryWorker(service as never, config, logger)).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith('Reservation expiry worker failed', undefined, {
      category: 'unexpected',
    });
  });
});
