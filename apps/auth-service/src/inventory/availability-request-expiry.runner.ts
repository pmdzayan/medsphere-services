import type { ServiceLogger } from '@medsphere/logger';
import type {
  AvailabilityRequestExpiryConfig,
  AvailabilityRequestExpiryService,
} from './availability-request-expiry.service';

export async function executeAvailabilityRequestExpiryWorker(
  service: Pick<AvailabilityRequestExpiryService, 'run'>,
  config: AvailabilityRequestExpiryConfig,
  logger: ServiceLogger,
): Promise<number> {
  try {
    const summary = await service.run(config);
    const metadata = {
      asOf: summary.asOf.toISOString(),
      selected: summary.selected,
      expired: summary.expired,
      skipped: summary.skipped,
      failed: summary.failed,
      failures: summary.failures,
    };
    if (summary.failed > 0) {
      logger.warn('Availability request expiry worker completed with failures', metadata);
      return 1;
    }
    logger.info('Availability request expiry worker completed', metadata);
    return 0;
  } catch {
    logger.error('Availability request expiry worker failed', undefined, {
      category: 'unexpected',
    });
    return 1;
  }
}
