import type { ServiceLogger } from '@medsphere/logger';
import type { BatchExpiryConfig } from './batch-expiry.config';
import type { BatchExpiryService } from './batch-expiry.service';

export async function executeBatchExpiryWorker(
  service: Pick<BatchExpiryService, 'run'>,
  config: BatchExpiryConfig,
  logger: ServiceLogger,
): Promise<number> {
  try {
    const summary = await service.run(config);
    const metadata = {
      asOf: summary.asOf.toISOString(),
      selected: summary.selected,
      reconciled: summary.reconciled,
      skipped: summary.skipped,
      failed: summary.failed,
      affectedReservations: summary.affectedReservations,
      releasedUnits: summary.releasedUnits,
      failures: summary.failures,
    };
    if (summary.failed > 0) {
      logger.warn('Batch expiry worker completed with failures', metadata);
      return 1;
    }
    logger.info('Batch expiry worker completed', metadata);
    return 0;
  } catch {
    logger.error('Batch expiry worker failed', undefined, { category: 'unexpected' });
    return 1;
  }
}
