export interface BatchExpiryConfig {
  readonly batchSize: number;
  readonly maximumRecords: number;
  readonly maximumReservationsPerBatch: number;
  readonly maximumAllocationsPerBatch: number;
}

export const BATCH_EXPIRY_DEFAULT_BATCH_SIZE = 50;
export const BATCH_EXPIRY_MAXIMUM_BATCH_SIZE = 100;
export const BATCH_EXPIRY_DEFAULT_MAXIMUM_RECORDS = 500;
export const BATCH_EXPIRY_HARD_MAXIMUM_RECORDS = 1_000;
export const BATCH_EXPIRY_DEFAULT_MAXIMUM_RESERVATIONS = 100;
export const BATCH_EXPIRY_HARD_MAXIMUM_RESERVATIONS = 500;
export const BATCH_EXPIRY_DEFAULT_MAXIMUM_ALLOCATIONS = 1_000;
export const BATCH_EXPIRY_HARD_MAXIMUM_ALLOCATIONS = 5_000;

export function parseBatchExpiryEnvironment(environment: NodeJS.ProcessEnv): BatchExpiryConfig {
  return {
    batchSize: parseBoundedInteger(
      environment.BATCH_EXPIRY_BATCH_SIZE,
      BATCH_EXPIRY_DEFAULT_BATCH_SIZE,
      BATCH_EXPIRY_MAXIMUM_BATCH_SIZE,
      'BATCH_EXPIRY_BATCH_SIZE',
    ),
    maximumRecords: parseBoundedInteger(
      environment.BATCH_EXPIRY_MAX_RECORDS,
      BATCH_EXPIRY_DEFAULT_MAXIMUM_RECORDS,
      BATCH_EXPIRY_HARD_MAXIMUM_RECORDS,
      'BATCH_EXPIRY_MAX_RECORDS',
    ),
    maximumReservationsPerBatch: parseBoundedInteger(
      environment.BATCH_EXPIRY_MAX_RESERVATIONS,
      BATCH_EXPIRY_DEFAULT_MAXIMUM_RESERVATIONS,
      BATCH_EXPIRY_HARD_MAXIMUM_RESERVATIONS,
      'BATCH_EXPIRY_MAX_RESERVATIONS',
    ),
    maximumAllocationsPerBatch: parseBoundedInteger(
      environment.BATCH_EXPIRY_MAX_ALLOCATIONS,
      BATCH_EXPIRY_DEFAULT_MAXIMUM_ALLOCATIONS,
      BATCH_EXPIRY_HARD_MAXIMUM_ALLOCATIONS,
      'BATCH_EXPIRY_MAX_ALLOCATIONS',
    ),
  };
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}
