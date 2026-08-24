import type { ServiceLogger } from '@medsphere/logger';
import type { NotificationWorkerRunConfig } from './notification-worker.config';
import type {
  NotificationWorkerConfig,
  NotificationWorkerService,
  NotificationWorkerSummary,
} from './notification-worker.service';

export async function executeNotificationWorker(
  service: Pick<NotificationWorkerService, 'run'>,
  config: NotificationWorkerRunConfig,
  logger: ServiceLogger,
): Promise<number> {
  try {
    const runConfig: NotificationWorkerConfig = {
      limit: config.limit,
      leaseMs: config.leaseMs,
      maximumAttempts: config.maximumAttempts,
    };
    const summary: NotificationWorkerSummary = await service.run(runConfig);
    const metadata = {
      claimed: summary.claimed,
      delivered: summary.delivered,
      failed: summary.failed,
      deadLettered: summary.deadLettered,
    };
    if (summary.failed > 0 || summary.deadLettered > 0) {
      logger.warn('Notification delivery worker completed with failures', metadata);
      return 1;
    }
    logger.info('Notification delivery worker completed', metadata);
    return 0;
  } catch {
    logger.error('Notification delivery worker failed', undefined, { category: 'unexpected' });
    return 1;
  }
}
