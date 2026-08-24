import {
  NOTIFICATION_WORKER_DEFAULT_LEASE_MS,
  NOTIFICATION_WORKER_DEFAULT_LIMIT,
  NOTIFICATION_WORKER_DEFAULT_MAXIMUM_ATTEMPTS,
  parseNotificationWorkerEnvironment,
} from './notification-worker.config';

describe('notification worker configuration', () => {
  it('uses bounded defaults', () => {
    expect(parseNotificationWorkerEnvironment({})).toEqual({
      limit: NOTIFICATION_WORKER_DEFAULT_LIMIT,
      leaseMs: NOTIFICATION_WORKER_DEFAULT_LEASE_MS,
      maximumAttempts: NOTIFICATION_WORKER_DEFAULT_MAXIMUM_ATTEMPTS,
    });
  });

  it('accepts explicit bounded positive integers', () => {
    expect(
      parseNotificationWorkerEnvironment({
        NOTIFICATION_WORKER_LIMIT: '100',
        NOTIFICATION_WORKER_LEASE_MS: '300000',
        NOTIFICATION_WORKER_MAX_ATTEMPTS: '10',
      }),
    ).toEqual({ limit: 100, leaseMs: 300_000, maximumAttempts: 10 });
  });

  it.each([
    ['NOTIFICATION_WORKER_LIMIT', '0'],
    ['NOTIFICATION_WORKER_LIMIT', '101'],
    ['NOTIFICATION_WORKER_LIMIT', ' 10'],
    ['NOTIFICATION_WORKER_LEASE_MS', '-1'],
    ['NOTIFICATION_WORKER_LEASE_MS', '300001'],
    ['NOTIFICATION_WORKER_LEASE_MS', '1.5'],
    ['NOTIFICATION_WORKER_MAX_ATTEMPTS', '0'],
    ['NOTIFICATION_WORKER_MAX_ATTEMPTS', '11'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => parseNotificationWorkerEnvironment({ [name]: value })).toThrow(name);
  });
});
