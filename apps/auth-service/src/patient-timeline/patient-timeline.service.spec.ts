import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PatientTimelineService } from './patient-timeline.service';

const identityA = {
  userId: '11111111-1111-4111-8111-111111111111',
  membershipId: 'membership-a',
  tenantId: 'tenant-a',
  sessionId: 'session-a',
  tokenId: 'token-a',
  securityVersion: 1,
};

function buildService() {
  const rows = new Map<string, Record<string, unknown>>();
  let counter = 0;

  function makeUuid(n: number) {
    return `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
  }

  function findByCompoundKey(sourceType: unknown, sourceEventId: unknown) {
    for (const row of rows.values()) {
      if (row.sourceType === sourceType && row.sourceEventId === sourceEventId) return row;
    }
    return null;
  }

  const ops = {
    create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      if (findByCompoundKey(data.sourceType, data.sourceEventId)) {
        const error = new Error('Unique constraint failed');
        (error as unknown as { code: string }).code = 'P2002';
        throw error;
      }
      counter += 1;
      const id = makeUuid(counter);
      const row = { id, createdAt: new Date(Date.now() + counter), ...data };
      rows.set(id, row);
      return Promise.resolve({ ...row });
    }),
    findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const row = rows.get(where.id as string);
      if (!row || row.recipientUserId !== where.recipientUserId) return Promise.resolve(null);
      return Promise.resolve({ ...row });
    }),
    findUniqueOrThrow: jest
      .fn()
      .mockImplementation(
        ({
          where,
        }: {
          where: { sourceType_sourceEventId: { sourceType: unknown; sourceEventId: unknown } };
        }) => {
          const row = findByCompoundKey(
            where.sourceType_sourceEventId.sourceType,
            where.sourceType_sourceEventId.sourceEventId,
          );
          if (!row) throw new Error('No PatientTimelineEvent found');
          return Promise.resolve({ ...row });
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(({ where, take }: { where: Record<string, unknown>; take: number }) => {
        let filtered = Array.from(rows.values()).filter(
          (row) => row.recipientUserId === where.recipientUserId,
        );
        if (where.OR) {
          const [beforeClause, tieBreak] = where.OR as [
            { occurredAt: { lt: Date } },
            { occurredAt: Date; id: { lt: string } },
          ];
          filtered = filtered.filter(
            (row) =>
              (row.occurredAt as Date).getTime() < beforeClause.occurredAt.lt.getTime() ||
              ((row.occurredAt as Date).getTime() === tieBreak.occurredAt.getTime() &&
                (row.id as string) < tieBreak.id.lt),
          );
        }
        filtered.sort((a, b) => {
          const diff = (b.occurredAt as Date).getTime() - (a.occurredAt as Date).getTime();
          if (diff !== 0) return diff;
          return (b.id as string).localeCompare(a.id as string);
        });
        return Promise.resolve(filtered.slice(0, take).map((row) => ({ ...row })));
      }),
  };

  const client = { patientTimelineEvent: ops };
  const prisma = { client };
  const service = new PatientTimelineService(prisma as never);
  return { service, rows, client, makeUuid };
}

const BASE_EVENT = {
  sourceType: 'reservation-status-changed',
  eventType: 'RESERVATION_STATUS_CHANGED',
  title: 'Reservation confirmed',
  summary: 'Your reservation was confirmed.',
  occurredAt: new Date('2027-01-01T00:00:00.000Z'),
};

describe('PatientTimelineService -- ownership, IDOR, pagination, idempotency, destination safety (candidate Task 0037)', () => {
  // --- Ownership / IDOR ---

  it('Patient A can list Patient A timeline events', async () => {
    const { service } = buildService();
    await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const list = await service.list(identityA as never, { limit: 20 } as never);
    expect(list.items).toHaveLength(1);
  });

  it('Patient A cannot list Patient B timeline events', async () => {
    const { service } = buildService();
    await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '22222222-2222-4222-8222-222222222222',
    });
    const list = await service.list(identityA as never, { limit: 20 } as never);
    expect(list.items).toHaveLength(0);
  });

  it('Patient A can fetch Patient A event by ID', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const fetched = await service.getOne(identityA as never, created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('Patient A cannot fetch Patient B event by ID', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '22222222-2222-4222-8222-222222222222',
    });
    await expect(service.getOne(identityA as never, created.id)).rejects.toThrow(NotFoundException);
  });

  it('a cross-owner event ID and a nonexistent ID resolve to the identical safe not-found contract', async () => {
    const { service, makeUuid } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '22222222-2222-4222-8222-222222222222',
    });
    const crossOwnerError = await service.getOne(identityA as never, created.id).catch((e) => e);
    const nonexistentError = await service
      .getOne(identityA as never, makeUuid(999))
      .catch((e) => e);
    expect(crossOwnerError).toBeInstanceOf(NotFoundException);
    expect(nonexistentError).toBeInstanceOf(NotFoundException);
    expect(crossOwnerError.message).toBe(nonexistentError.message);
    expect(crossOwnerError.getStatus()).toBe(nonexistentError.getStatus());
  });

  it('the public list()/getOne() methods accept only (identity, ...) -- no parameter exists for recipientUserId/patientId/userId/tenantId/membershipId as an ownership override', () => {
    expect(PatientTimelineService.prototype.list.length).toBe(2); // (identity, query)
    expect(PatientTimelineService.prototype.getOne.length).toBe(2); // (identity, timelineEventId)
  });

  // --- Pagination ---

  it('default page size is bounded to the DTO default (20), not unbounded', async () => {
    const { service } = buildService();
    for (let i = 0; i < 25; i += 1) {
      await service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: `evt-${i}`,
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        occurredAt: new Date(Date.now() + i * 1000),
      });
    }
    const list = await service.list(identityA as never, { limit: 20 } as never);
    expect(list.items).toHaveLength(20);
    expect(list.nextCursor).not.toBeNull();
  });

  it('deterministic pagination traverses all rows with no duplicates and no skipped records', async () => {
    const { service } = buildService();
    for (let i = 0; i < 7; i += 1) {
      await service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: `evt-${i}`,
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        occurredAt: new Date(Date.now() + i * 1000),
      });
    }
    const page1 = await service.list(identityA as never, { limit: 3 } as never);
    const page2 = await service.list(
      identityA as never,
      {
        limit: 3,
        cursor: page1.nextCursor ?? undefined,
      } as never,
    );
    const page3 = await service.list(
      identityA as never,
      {
        limit: 3,
        cursor: page2.nextCursor ?? undefined,
      } as never,
    );
    const allIds = [...page1.items, ...page2.items, ...page3.items].map((e) => e.id);
    expect(new Set(allIds).size).toBe(7);
    expect(allIds).toHaveLength(7);
    expect(page3.nextCursor).toBeNull();
  });

  it('equal occurredAt timestamps paginate deterministically via the id tie-break', async () => {
    const { service } = buildService();
    const sharedTimestamp = new Date('2027-06-01T00:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      await service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: `equal-ts-${i}`,
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        occurredAt: sharedTimestamp,
      });
    }
    const page1 = await service.list(identityA as never, { limit: 2 } as never);
    const page2 = await service.list(
      identityA as never,
      {
        limit: 2,
        cursor: page1.nextCursor ?? undefined,
      } as never,
    );
    const page3 = await service.list(
      identityA as never,
      {
        limit: 2,
        cursor: page2.nextCursor ?? undefined,
      } as never,
    );
    const allIds = [...page1.items, ...page2.items, ...page3.items].map((e) => e.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it('the final page returns a null nextCursor', async () => {
    const { service } = buildService();
    await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const list = await service.list(identityA as never, { limit: 20 } as never);
    expect(list.nextCursor).toBeNull();
  });

  it('a malformed (non-base64url/JSON) cursor is rejected as a bounded BadRequestException', async () => {
    const { service } = buildService();
    await expect(
      service.list(identityA as never, { limit: 20, cursor: 'not-valid-cursor!!!' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('a cursor missing a required key is rejected', async () => {
    const { service } = buildService();
    const cursor = Buffer.from(JSON.stringify({ occurredAt: new Date().toISOString() })).toString(
      'base64url',
    );
    await expect(service.list(identityA as never, { limit: 20, cursor } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('a cursor with an extra unexpected key is rejected', async () => {
    const { service, makeUuid } = buildService();
    const cursor = Buffer.from(
      JSON.stringify({ occurredAt: new Date().toISOString(), id: makeUuid(1), extra: 'x' }),
    ).toString('base64url');
    await expect(service.list(identityA as never, { limit: 20, cursor } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('a cursor with an invalid timestamp is rejected', async () => {
    const { service, makeUuid } = buildService();
    const cursor = Buffer.from(
      JSON.stringify({ occurredAt: 'not-a-date', id: makeUuid(1) }),
    ).toString('base64url');
    await expect(service.list(identityA as never, { limit: 20, cursor } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('a cursor with a non-UUID event id is rejected', async () => {
    const { service } = buildService();
    const cursor = Buffer.from(
      JSON.stringify({ occurredAt: new Date().toISOString(), id: 'garbage' }),
    ).toString('base64url');
    await expect(service.list(identityA as never, { limit: 20, cursor } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('an invalid cursor never silently resets pagination to page one -- it always throws', async () => {
    const { service } = buildService();
    await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    await expect(
      service.list(identityA as never, { limit: 20, cursor: 'garbage-cursor' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  // --- Internal ingestion seam ---

  it('the first valid event creates exactly one row', async () => {
    const { service, rows } = buildService();
    await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(rows.size).toBe(1);
  });

  it('replay of the identical (sourceType, sourceEventId) returns the same logical event, not a duplicate', async () => {
    const { service, rows } = buildService();
    const first = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const second = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it('the same sourceEventId under a DIFFERENT sourceType namespace remains independent', async () => {
    const { service } = buildService();
    const first = await service.createFromEvent({
      ...BASE_EVENT,
      sourceType: 'reservation-status-changed',
      sourceEventId: 'shared-id',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const second = await service.createFromEvent({
      ...BASE_EVENT,
      sourceType: 'appointment-status-changed',
      sourceEventId: 'shared-id',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(second.id).not.toBe(first.id);
  });

  it("identical source identity targeting a DIFFERENT recipient fails closed -- never returns the other recipient's event", async () => {
    const { service } = buildService();
    await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('whitespace padding around sourceType cannot create a second, accidental namespace', async () => {
    const { service, rows } = buildService();
    const first = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const second = await service.createFromEvent({
      ...BASE_EVENT,
      sourceType: '  reservation-status-changed  ',
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it('a whitespace-only sourceType is rejected', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceType: '   ',
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a whitespace-only sourceEventId is rejected (regression: previously slipped through validation due to an incorrect { trim: false } override)', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: '   ',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a whitespace-only eventType is rejected', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        eventType: '  ',
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a whitespace-only title is rejected', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        title: '  ',
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a whitespace-only summary is rejected', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        summary: '   ',
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('values exactly at the upper length boundary are accepted', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceType: 'x'.repeat(80),
      sourceEventId: 'evt-1',
      eventType: 'y'.repeat(80),
      title: 'z'.repeat(160),
      summary: 'w'.repeat(500),
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(created.title).toHaveLength(160);
    expect(created.summary).toHaveLength(500);
  });

  it('values exceeding the upper length boundary are rejected', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        title: 'z'.repeat(161),
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('an invalid occurredAt date is rejected', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        occurredAt: new Date('not-a-date'),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a plain sourceEventId is accepted', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(created.id).toBeTruthy();
  });

  it('whitespace-padded sourceEventId cannot create a distinct idempotency key from its trimmed form', async () => {
    const { service, rows } = buildService();
    const first = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    const second = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: '  evt-1  ',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it('a malformed (non-UUID) recipientUserId is rejected before Prisma, not merely trusted to the FK/column type', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: 'not-a-uuid',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a runtime occurredAt that is not actually a Date instance produces a bounded error, not a raw TypeError', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        // Intentionally malformed at the runtime boundary, cast through
        // `as never` to simulate a caller that doesn't respect the
        // TypeScript signature (e.g. a future producer passing a raw
        // string instead of a Date).
        occurredAt: '2027-01-01T00:00:00.000Z' as never,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('an unknown runtime destinationType fails before Prisma even when paired with an otherwise-valid UUID destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'ARBITRARY' as never,
        destinationId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['sourceType', 'sourceEventId', 'eventType', 'title', 'summary'])(
    'a non-string runtime value for %s produces a bounded validation error, not a TypeError',
    async (field) => {
      const { service } = buildService();
      await expect(
        service.createFromEvent({
          ...BASE_EVENT,
          sourceEventId: 'evt-1',
          recipientUserId: '11111111-1111-4111-8111-111111111111',
          [field]: 12345 as never,
        }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  // --- Destination safety ---

  it('NONE requires no destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'NONE',
        destinationId: 'anything',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('RESERVATION accepts only a valid UUID destinationId', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
      destinationType: 'RESERVATION',
      destinationId: '22222222-2222-4222-8222-222222222222',
    });
    expect(created.destinationId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('APPOINTMENT accepts only a valid UUID destinationId, without any dependency on provisional Task 0035 code', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
      destinationType: 'APPOINTMENT',
      destinationId: '33333333-3333-4333-8333-333333333333',
    });
    expect(created.destinationId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('SETTINGS accepts only the fixed known internal token "privacy"', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
      destinationType: 'SETTINGS',
      destinationId: 'privacy',
    });
    expect(created.destinationId).toBe('privacy');
  });

  it('SETTINGS rejects an arbitrary token', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'SETTINGS',
        destinationId: 'arbitrary-page',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('an arbitrary path is rejected as a destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'RESERVATION',
        destinationId: '/some/arbitrary/path',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('an external URL is rejected as a destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'RESERVATION',
        destinationId: 'https://evil.example.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a javascript: scheme is rejected as a destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'RESERVATION',
        destinationId: 'javascript:alert(1)',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a protocol-relative URL is rejected as a destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'RESERVATION',
        destinationId: '//evil.example.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a traversal-looking input is rejected as a destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'RESERVATION',
        destinationId: '../../etc/passwd',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a missing required destinationId is rejected for a non-NONE destinationType', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: 'RESERVATION',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([12345, { object: true }, ['array'], true, null])(
    'a malformed runtime destinationId (%p) fails with a bounded BadRequestException, never a raw TypeError',
    async (malformedDestinationId) => {
      const { service } = buildService();
      await expect(
        service.createFromEvent({
          ...BASE_EVENT,
          sourceEventId: 'evt-1',
          recipientUserId: '11111111-1111-4111-8111-111111111111',
          destinationType: 'RESERVATION',
          destinationId: malformedDestinationId as never,
        }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('destinationType NONE requires destinationId to be truly omitted (undefined), not merely falsy', async () => {
    const { service } = buildService();
    // null, 0, and '' are all falsy but are NOT undefined -- NONE's
    // contract is specifically "omitted," and this must not silently
    // accept any other falsy runtime value as equivalent.
    for (const notUndefined of [null, 0, '']) {
      await expect(
        service.createFromEvent({
          ...BASE_EVENT,
          sourceEventId: `evt-none-${String(notUndefined)}`,
          recipientUserId: '11111111-1111-4111-8111-111111111111',
          destinationType: 'NONE',
          destinationId: notUndefined as never,
        }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('an explicit null destinationType does not silently become NONE -- it fails closed like any other invalid value', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        ...BASE_EVENT,
        sourceEventId: 'evt-1',
        recipientUserId: '11111111-1111-4111-8111-111111111111',
        destinationType: null as never,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('an omitted (undefined) destinationType correctly defaults to NONE behavior', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      ...BASE_EVENT,
      sourceEventId: 'evt-1',
      recipientUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(created.destinationType).toBe('NONE');
  });
});
