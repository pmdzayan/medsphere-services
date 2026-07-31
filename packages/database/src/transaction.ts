import { Prisma } from '@prisma/client';

const DEFAULT_SERIALIZABLE_ATTEMPTS = 3;

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
    }
  }

  throw new Error('Serializable transaction retry invariant violated');
}
