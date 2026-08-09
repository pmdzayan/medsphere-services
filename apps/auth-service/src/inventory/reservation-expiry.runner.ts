import type { ServiceLogger } from '@medsphere/logger';
import type { ReservationExpiryConfig } from './reservation-expiry.config';
import type { ReservationExpiryService } from './reservation-expiry.service';

export async function executeReservationExpiryWorker(
  service: Pick<ReservationExpiryService, 'run'>,
  config: ReservationExpiryConfig,
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
      logger.warn('Reservation expiry worker completed with failures', metadata);
      return 1;
    }
    logger.info('Reservation expiry worker completed', metadata);
    return 0;
  } catch {
    logger.error('Reservation expiry worker failed', undefined, { category: 'unexpected' });
    return 1;
  }
}
