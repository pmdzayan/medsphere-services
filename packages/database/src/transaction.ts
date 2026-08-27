import { Prisma } from '@prisma/client';

const DEFAULT_SERIALIZABLE_ATTEMPTS = 3;
const BASE_SERIALIZABLE_BACKOFF_MS = 10;
const MAX_SERIALIZABLE_BACKOFF_MS = 100;

export class SerializableRetryError extends Error {
  public readonly code = 'P2034';

  constructor(message = 'Concurrent serializable update detected') {
    super(message);
    this.name = 'SerializableRetryError';
  }
}

export interface TransactionHost {
  $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
}

export function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

async function waitBeforeSerializableRetry(attempt: number): Promise<void> {
  const exponentialDelay = Math.min(
    BASE_SERIALIZABLE_BACKOFF_MS * 2 ** (attempt - 1),
    MAX_SERIALIZABLE_BACKOFF_MS,
  );

  const jitter = Math.floor(Math.random() * exponentialDelay);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, exponentialDelay + jitter);
  });
}

export async function withSerializableRetry<T>(
  client: TransactionHost,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  maximumAttempts = DEFAULT_SERIALIZABLE_ATTEMPTS,
): Promise<T> {
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 10) {
    throw new Error('Serializable transaction attempts must be between 1 and 10');
  }

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await client.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!hasPrismaCode(error, 'P2034') || attempt === maximumAttempts) {
        throw error;
      }

      await waitBeforeSerializableRetry(attempt);
    }
  }

  throw new Error('Serializable transaction retry invariant violated');
}
