import { executeNotificationWorker } from './notification-worker.runner';

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

const config = { limit: 25, leaseMs: 30_000, maximumAttempts: 5 };

describe('executeNotificationWorker', () => {
  it('invokes the existing NotificationWorkerService.run() rather than duplicating delivery logic', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({ claimed: 0, delivered: 0, failed: 0, deadLettered: 0 });

    await executeNotificationWorker(service as never, config, logger);

    expect(service.run).toHaveBeenCalledTimes(1);
    expect(service.run).toHaveBeenCalledWith({
      limit: config.limit,
      leaseMs: config.leaseMs,
      maximumAttempts: config.maximumAttempts,
    });
  });

  it('returns success and logs bounded aggregate counts when nothing was eligible', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({ claimed: 0, delivered: 0, failed: 0, deadLettered: 0 });

    await expect(executeNotificationWorker(service as never, config, logger)).resolves.toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      'Notification delivery worker completed',
      expect.objectContaining({ claimed: 0, delivered: 0, failed: 0, deadLettered: 0 }),
    );
  });

  it('fails closed and reports a non-zero exit when no provider is configured -- never a false success or external-delivery claim', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({ claimed: 1, delivered: 0, failed: 1, deadLettered: 0 });

    await expect(executeNotificationWorker(service as never, config, logger)).resolves.toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Notification delivery worker completed with failures',
      expect.objectContaining({ claimed: 1, delivered: 0, failed: 1 }),
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      'Notification delivery worker completed',
      expect.anything(),
    );
  });

  it('returns non-zero when deliveries are dead-lettered', async () => {
    const { service, logger } = harness();
    service.run.mockResolvedValue({ claimed: 5, delivered: 3, failed: 0, deadLettered: 2 });

    await expect(executeNotificationWorker(service as never, config, logger)).resolves.toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Notification delivery worker completed with failures',
      expect.objectContaining({ deadLettered: 2 }),
    );
  });

  it('returns non-zero for an unexpected run failure without swallowing it as success', async () => {
    const { service, logger } = harness();
    service.run.mockRejectedValue(new Error('database unavailable'));

    await expect(executeNotificationWorker(service as never, config, logger)).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith('Notification delivery worker failed', undefined, {
      category: 'unexpected',
    });
  });
});
