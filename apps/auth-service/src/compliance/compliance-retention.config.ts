export interface ComplianceRetentionWorkerConfig {
  readonly batchSize: number;
}

export function parseComplianceRetentionEnvironment(
  environment: NodeJS.ProcessEnv,
): ComplianceRetentionWorkerConfig {
  const raw = environment.COMPLIANCE_RETENTION_BATCH_SIZE?.trim();
  if (!raw) return { batchSize: 25 };

  const batchSize = Number(raw);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error('COMPLIANCE_RETENTION_BATCH_SIZE must be an integer between 1 and 100');
  }
  return { batchSize };
}
