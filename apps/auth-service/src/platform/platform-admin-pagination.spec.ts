import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

import { PlatformRepository } from './platform.repository';

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('PlatformRepository admin pagination', () => {
  let findMany: jest.Mock;
  let repository: PlatformRepository;

  beforeEach(() => {
    findMany = jest.fn();

    repository = new PlatformRepository({
      client: {
        platformAccount: {
          findMany,
        },
      },
    } as never);
  });

  it('uses an exact valid (createdAt, platformAccountId) cursor', async () => {
    const createdAt = '2026-09-05T12:00:00.000Z';
    const platformAccountId = randomUUID();

    const cursor = encodeCursor({
      c: createdAt,
      i: platformAccountId,
    });

    findMany.mockResolvedValueOnce([]);

    await repository.listPlatformAccounts(10, cursor);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            {
              createdAt: {
                lt: new Date(createdAt),
              },
            },
            {
              createdAt: new Date(createdAt),
              id: {
                lt: platformAccountId,
              },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 11,
      }),
    );
  });

  it('treats undefined cursor as the first page', async () => {
    findMany.mockResolvedValueOnce([]);

    await repository.listPlatformAccounts(10, undefined);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
        },
        take: 11,
      }),
    );
  });

  it('rejects malformed supplied cursors before querying PostgreSQL', async () => {
    const validId = randomUUID();

    const malformed = [
      '',
      '%%%not-base64url%%%',
      encodeCursor({
        c: 'not-a-date',
        i: validId,
      }),
      encodeCursor({
        c: '2026-09-05T12:00:00.000Z',
        i: 'garbage',
      }),
      encodeCursor({
        c: '2026-09-05T12:00:00.000Z',
        i: '00000000-0000-1000-8000-000000000001',
      }),
      encodeCursor({
        c: '2026-09-05T12:00:00.000Z',
        i: validId,
        extra: true,
      }),
      encodeCursor({
        c: '2026-09-05T12:00:00Z',
        i: validId,
      }),
      encodeCursor({
        i: validId,
      }),
      encodeCursor({
        c: '2026-09-05T12:00:00.000Z',
      }),
    ];

    for (const cursor of malformed) {
      findMany.mockClear();

      await expect(repository.listPlatformAccounts(10, cursor)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(findMany).not.toHaveBeenCalled();
    }
  });

  it('rejects an oversized supplied cursor before querying PostgreSQL', async () => {
    await expect(repository.listPlatformAccounts(10, 'A'.repeat(1025))).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(findMany).not.toHaveBeenCalled();
  });
});
