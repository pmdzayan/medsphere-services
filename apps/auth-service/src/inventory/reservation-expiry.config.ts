export interface ReservationExpiryConfig {
  readonly batchSize: number;
  readonly maximumRecords: number;
}

export const RESERVATION_EXPIRY_DEFAULT_BATCH_SIZE = 50;
export const RESERVATION_EXPIRY_MAXIMUM_BATCH_SIZE = 100;
export const RESERVATION_EXPIRY_DEFAULT_MAXIMUM_RECORDS = 500;
export const RESERVATION_EXPIRY_HARD_MAXIMUM_RECORDS = 1_000;

export function parseReservationExpiryEnvironment(
  environment: NodeJS.ProcessEnv,
): ReservationExpiryConfig {
  return {
    batchSize: parseBoundedInteger(
      environment.RESERVATION_EXPIRY_BATCH_SIZE,
      RESERVATION_EXPIRY_DEFAULT_BATCH_SIZE,
      RESERVATION_EXPIRY_MAXIMUM_BATCH_SIZE,
      'RESERVATION_EXPIRY_BATCH_SIZE',
    ),
    maximumRecords: parseBoundedInteger(
      environment.RESERVATION_EXPIRY_MAX_RECORDS,
      RESERVATION_EXPIRY_DEFAULT_MAXIMUM_RECORDS,
      RESERVATION_EXPIRY_HARD_MAXIMUM_RECORDS,
      'RESERVATION_EXPIRY_MAX_RECORDS',
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
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}
