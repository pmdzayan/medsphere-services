import { isSerializableConflict, withSerializableRetry } from '@medsphere/database';

describe('shared serializable retry - raw PostgreSQL conflicts', () => {
  it('recognizes Prisma P2034 as a serializable conflict', () => {
    expect(
      isSerializableConflict({
        code: 'P2034',
      }),
    ).toBe(true);
  });

  it('recognizes raw-query P2010 with PostgreSQL SQLSTATE 40001', () => {
    expect(
      isSerializableConflict({
        code: 'P2010',
        meta: {
          code: '40001',
          message: 'could not serialize access due to concurrent update',
        },
      }),
    ).toBe(true);
  });

  it('does not treat unrelated raw-query P2010 errors as serializable conflicts', () => {
    expect(
      isSerializableConflict({
        code: 'P2010',
        meta: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      }),
    ).toBe(false);
  });

  it('retries a raw PostgreSQL 40001 conflict and returns the later result', async () => {
    let transactionAttempts = 0;
    let operationAttempts = 0;

    const client = {
      $transaction: jest.fn(
        async (
          operation: (transaction: object) => Promise<string>,
          options: { isolationLevel: 'Serializable' },
        ) => {
          transactionAttempts += 1;

          expect(options).toEqual({
            isolationLevel: 'Serializable',
          });

          return operation({});
        },
      ),
    };

    const result = await withSerializableRetry(
      client as never,
      async () => {
        operationAttempts += 1;

        if (operationAttempts === 1) {
          throw {
            code: 'P2010',
            meta: {
              code: '40001',
              message: 'could not serialize access due to concurrent update',
            },
          };
        }

        return 'retried-successfully';
      },
      2,
    );

    expect(result).toBe('retried-successfully');
    expect(transactionAttempts).toBe(2);
    expect(operationAttempts).toBe(2);
  });

  it('does not retry a non-40001 P2010 raw-query failure', async () => {
    let operationAttempts = 0;

    const failure = {
      code: 'P2010',
      meta: {
        code: '23503',
        message: 'foreign key violation',
      },
    };

    const client = {
      $transaction: jest.fn(async (operation: (transaction: object) => Promise<unknown>) =>
        operation({}),
      ),
    };

    await expect(
      withSerializableRetry(
        client as never,
        async () => {
          operationAttempts += 1;
          throw failure;
        },
        3,
      ),
    ).rejects.toBe(failure);

    expect(operationAttempts).toBe(1);
  });
});
