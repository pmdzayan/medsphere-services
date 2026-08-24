import {
  NOTIFICATION_WORKER_DEFAULT_POLL_INTERVAL_MS,
  parseNotificationWorkerPollInterval,
  runNotificationWorkerDaemon,
} from './notification-worker.daemon';

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

describe('notification worker daemon', () => {
  it('uses a bounded poll interval default', () => {
    expect(parseNotificationWorkerPollInterval({})).toBe(
      NOTIFICATION_WORKER_DEFAULT_POLL_INTERVAL_MS,
    );
  });

  it.each(['0', '999', '300001', '1.5', ' 5000'])('rejects unsafe poll interval %s', (value) => {
    expect(() =>
      parseNotificationWorkerPollInterval({ NOTIFICATION_WORKER_POLL_INTERVAL_MS: value }),
    ).toThrow('NOTIFICATION_WORKER_POLL_INTERVAL_MS');
  });

  it('runs repeatedly until shutdown without duplicating delivery logic', async () => {
    const { service, logger } = harness();
    const abortController = new AbortController();
    service.run.mockResolvedValue({ claimed: 0, delivered: 0, failed: 0, deadLettered: 0 });
    const sleep = jest.fn().mockImplementation(async () => {
      abortController.abort();
    });

    await runNotificationWorkerDaemon(
      service as never,
      config,
      5_000,
      logger,
      abortController.signal,
      sleep,
    );

    expect(service.run).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5_000, abortController.signal);
    expect(logger.info).toHaveBeenCalledWith('Notification delivery daemon stopped', {
      reason: 'shutdown-signal',
    });
  });

  it('backs off instead of tight-looping after a failed delivery cycle', async () => {
    const { service, logger } = harness();
    const abortController = new AbortController();
    service.run.mockResolvedValue({ claimed: 1, delivered: 0, failed: 1, deadLettered: 0 });
    const sleep = jest.fn().mockImplementation(async () => {
      abortController.abort();
    });

    await runNotificationWorkerDaemon(
      service as never,
      config,
      10_000,
      logger,
      abortController.signal,
      sleep,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'Notification delivery daemon backing off after worker failure',
      { pollIntervalMs: 10_000 },
    );
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
