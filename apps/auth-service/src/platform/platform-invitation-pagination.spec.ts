import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

import { PlatformInvitationService } from './platform-invitation.service';

function invitationRow(createdAt: Date, id = randomUUID()) {
  return {
    id,
    status: 'PENDING' as const,
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    acceptedAt: null,
    createdAt,
    role: { key: 'PLATFORM_ADMIN' },
  };
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('PlatformInvitationService pagination', () => {
  let findMany: jest.Mock;
  let service: PlatformInvitationService;

  beforeEach(() => {
    findMany = jest.fn();

    service = new PlatformInvitationService(
      {
        client: {
          platformInvitation: {
            findMany,
          },
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('uses limit + 1 and returns a deterministic continuation cursor', async () => {
    const newest = invitationRow(new Date('2026-09-05T12:03:00.000Z'));
    const second = invitationRow(new Date('2026-09-05T12:02:00.000Z'));
    const overflow = invitationRow(new Date('2026-09-05T12:01:00.000Z'));

    findMany.mockResolvedValueOnce([newest, second, overflow]);

    const result = await service.listInvitations(randomUUID(), 2, undefined);

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      include: { role: { select: { key: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });

    expect(result.data.map((entry) => entry.invitationId)).toEqual([newest.id, second.id]);
    expect(result.nextCursor).not.toBeNull();
    expect(result.limit).toBe(2);

    const decoded = JSON.parse(
      Buffer.from(result.nextCursor!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    expect(decoded).toEqual({
      c: second.createdAt.toISOString(),
      i: second.id,
    });
  });

  it('uses both createdAt and invitationId for continuation', async () => {
    const createdAt = '2026-09-05T12:02:00.000Z';
    const invitationId = randomUUID();
    const cursor = encodeCursor({
      c: createdAt,
      i: invitationId,
    });

    findMany.mockResolvedValueOnce([]);

    await service.listInvitations(randomUUID(), 2, cursor);

    expect(findMany).toHaveBeenCalledWith({
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
              lt: invitationId,
            },
          },
        ],
      },
      include: { role: { select: { key: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
  });

  it('returns null nextCursor on the final page', async () => {
    const only = invitationRow(new Date('2026-09-05T12:00:00.000Z'));

    findMany.mockResolvedValueOnce([only]);

    const result = await service.listInvitations(randomUUID(), 2, undefined);

    expect(result.data).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('rejects malformed cursors before querying PostgreSQL', async () => {
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
    ];

    for (const cursor of malformed) {
      findMany.mockClear();

      await expect(service.listInvitations(randomUUID(), 2, cursor)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(findMany).not.toHaveBeenCalled();
    }
  });

  it('rejects invalid page limits before querying PostgreSQL', async () => {
    await expect(service.listInvitations(randomUUID(), 0, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(service.listInvitations(randomUUID(), 101, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(findMany).not.toHaveBeenCalled();
  });
});
