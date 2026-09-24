import type { ServiceLogger } from '@medsphere/logger';
import type { ComplianceRetentionWorkerConfig } from './compliance-retention.config';
import type { ComplianceRetentionService } from './compliance-retention.service';

export async function executeComplianceRetentionWorker(
  service: Pick<ComplianceRetentionService, 'run'>,
  config: ComplianceRetentionWorkerConfig,
  logger: ServiceLogger,
): Promise<number> {
  try {
    const summary = await service.run(config);
    const metadata = {
      asOf: summary.asOf.toISOString(),
      selected: summary.selected,
      completed: summary.completed,
      held: summary.held,
      denied: summary.denied,
      skipped: summary.skipped,
      failed: summary.failed,
      affectedRows: summary.affectedRows,
    };
    if (summary.failed > 0) {
      logger.warn('Compliance retention worker completed with failures', metadata);
      return 1;
    }
    logger.info('Compliance retention worker completed', metadata);
    return 0;
  } catch {
    logger.error('Compliance retention worker failed', undefined, { category: 'unexpected' });
    return 1;
  }
}
