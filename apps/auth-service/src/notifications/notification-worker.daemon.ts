import type { ServiceLogger } from '@medsphere/logger';
import type { NotificationWorkerRunConfig } from './notification-worker.config';
import { executeNotificationWorker } from './notification-worker.runner';
import type { NotificationWorkerService } from './notification-worker.service';

export const NOTIFICATION_WORKER_DEFAULT_POLL_INTERVAL_MS = 5_000;
export const NOTIFICATION_WORKER_MINIMUM_POLL_INTERVAL_MS = 1_000;
export const NOTIFICATION_WORKER_MAXIMUM_POLL_INTERVAL_MS = 300_000;

export function parseNotificationWorkerPollInterval(environment: NodeJS.ProcessEnv): number {
  const raw = environment.NOTIFICATION_WORKER_POLL_INTERVAL_MS;
  if (raw === undefined) return NOTIFICATION_WORKER_DEFAULT_POLL_INTERVAL_MS;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('NOTIFICATION_WORKER_POLL_INTERVAL_MS must be a positive integer');
  }

  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < NOTIFICATION_WORKER_MINIMUM_POLL_INTERVAL_MS ||
    value > NOTIFICATION_WORKER_MAXIMUM_POLL_INTERVAL_MS
  ) {
    throw new Error(
      `NOTIFICATION_WORKER_POLL_INTERVAL_MS must be between ${NOTIFICATION_WORKER_MINIMUM_POLL_INTERVAL_MS} and ${NOTIFICATION_WORKER_MAXIMUM_POLL_INTERVAL_MS}`,
    );
  }
  return value;
}

export async function runNotificationWorkerDaemon(
  service: Pick<NotificationWorkerService, 'run'>,
  config: NotificationWorkerRunConfig,
  pollIntervalMs: number,
  logger: ServiceLogger,
  signal: AbortSignal,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void> = sleepUntilNextPoll,
): Promise<void> {
  while (!signal.aborted) {
    const result = await executeNotificationWorker(service, config, logger);
    if (signal.aborted) break;

    if (result !== 0) {
      logger.warn('Notification delivery daemon backing off after worker failure', {
        pollIntervalMs,
      });
    }

    try {
      await sleep(pollIntervalMs, signal);
    } catch (error) {
      if (signal.aborted) break;
      throw error;
    }
  }

  logger.info('Notification delivery daemon stopped', { reason: 'shutdown-signal' });
}

function sleepUntilNextPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
