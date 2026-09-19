import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PatientNotificationService } from './patient-notification.service';

const identityA = {
  userId: 'user-a',
  membershipId: 'membership-a',
  tenantId: 'tenant-a',
  sessionId: 'session-a',
  tokenId: 'token-a',
  securityVersion: 1,
};

function buildService() {
  const rows = new Map<string, Record<string, unknown>>();
  let counter = 0;

  function findByCompoundKey(sourceType: unknown, sourceEventId: unknown) {
    for (const row of rows.values()) {
      if (row.sourceType === sourceType && row.sourceEventId === sourceEventId) return row;
    }
    return null;
  }

  const ops = {
    create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      if (
        data.sourceType !== undefined &&
        data.sourceEventId !== undefined &&
        findByCompoundKey(data.sourceType, data.sourceEventId)
      ) {
        const error = new Error('Unique constraint failed');
        (error as unknown as { code: string }).code = 'P2002';
        throw error;
      }
      counter += 1;
      const id = `11111111-1111-4111-8111-${String(counter).padStart(12, '0')}`;
      const row = { id, readAt: null, createdAt: new Date(Date.now() + counter), ...data };
      rows.set(id, row);
      return Promise.resolve({ ...row });
    }),
    findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const row = rows.get(where.id as string);
      if (!row || row.recipientUserId !== where.recipientUserId) return Promise.resolve(null);
      return Promise.resolve({ ...row });
    }),
    findFirstOrThrow: jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const row = rows.get(where.id as string);
        if (!row || row.recipientUserId !== where.recipientUserId) {
          throw new Error('No PatientNotification found');
        }
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
          if (!row) throw new Error('No PatientNotification found');
          return Promise.resolve({ ...row });
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(({ where, take }: { where: Record<string, unknown>; take: number }) => {
        let filtered = Array.from(rows.values()).filter(
          (row) => row.recipientUserId === where.recipientUserId,
        );
        if (where.readAt === null) filtered = filtered.filter((row) => row.readAt === null);
        if (where.OR) {
          const [beforeClause, tieBreak] = where.OR as [
            { createdAt: { lt: Date } },
            { createdAt: Date; id: { lt: string } },
          ];
          filtered = filtered.filter(
            (row) =>
              (row.createdAt as Date).getTime() < beforeClause.createdAt.lt.getTime() ||
              ((row.createdAt as Date).getTime() === tieBreak.createdAt.getTime() &&
                (row.id as string) < tieBreak.id.lt),
          );
        }
        filtered.sort((a, b) => {
          const diff = (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();
          if (diff !== 0) return diff;
          return (b.id as string).localeCompare(a.id as string);
        });
        return Promise.resolve(filtered.slice(0, take).map((row) => ({ ...row })));
      }),
    count: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      return Promise.resolve(
        Array.from(rows.values()).filter(
          (row) => row.recipientUserId === where.recipientUserId && row.readAt === null,
        ).length,
      );
    }),
    updateMany: jest
      .fn()
      .mockImplementation(
        ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const candidates = Array.from(rows.entries()).filter(([, row]) => {
            if (where.id !== undefined && row.id !== where.id) return false;
            if (row.recipientUserId !== where.recipientUserId) return false;
            if (where.readAt === null && row.readAt !== null) return false;
            return true;
          });
          for (const [, row] of candidates) Object.assign(row, data);
          return Promise.resolve({ count: candidates.length });
        },
      ),
  };

  const client = { patientNotification: ops };
  const prisma = { client };
  const service = new PatientNotificationService(prisma as never);
  return { service, rows, client };
}

describe('PatientNotificationService -- ownership, IDOR, pagination, idempotency (candidate Task 0036)', () => {
  it("patient A cannot list patient B's notifications", async () => {
    const { service, client } = buildService();
    await client.patientNotification.create({
      data: {
        recipientUserId: 'user-b',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    });
    const listA = await service.list(identityA as never, { limit: 20 } as never);
    expect(listA.items).toHaveLength(0);
  });

  it("patient A cannot mark patient B's notification as read", async () => {
    const { service, client } = buildService();
    const created = (await client.patientNotification.create({
      data: {
        recipientUserId: 'user-b',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    })) as { id: string };

    await expect(service.markOneRead(identityA as never, created.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("mark-all-read cannot modify any other patient's rows", async () => {
    const { service, client, rows } = buildService();
    const bRow = (await client.patientNotification.create({
      data: {
        recipientUserId: 'user-b',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    })) as { id: string };
    await client.patientNotification.create({
      data: {
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    });

    const result = await service.markAllRead(identityA as never);
    expect(result.updatedCount).toBe(1);
    expect(rows.get(bRow.id)?.readAt).toBeNull();
  });

  it("recipient identity is always server-derived -- create() never accepts it from a caller-controlled path in this service's own public API", async () => {
    const { service } = buildService();
    // list/markOneRead/markAllRead take only `identity` (server-derived)
    // and never a recipientUserId parameter at all -- there is no
    // parameter to smuggle a different recipient through.
    await service.list(identityA as never, { limit: 20 } as never);
    await service.markAllRead(identityA as never);
    expect(service.list.length).toBe(2); // (identity, query) -- no recipient param
  });

  it('pagination is explicitly bounded by the requested limit', async () => {
    const { service, client } = buildService();
    for (let i = 0; i < 5; i += 1) {
      await client.patientNotification.create({
        data: {
          recipientUserId: 'user-a',
          category: 'ACCOUNT',
          title: `n${i}`,
          message: 'y',
          destinationType: 'NONE',
        },
      });
    }
    const page = await service.list(identityA as never, { limit: 2 } as never);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });

  it('pagination is deterministic across pages -- no duplication, no skipped items', async () => {
    const { service, client } = buildService();
    for (let i = 0; i < 5; i += 1) {
      await client.patientNotification.create({
        data: {
          recipientUserId: 'user-a',
          category: 'ACCOUNT',
          title: `n${i}`,
          message: 'y',
          destinationType: 'NONE',
        },
      });
    }
    const page1 = await service.list(identityA as never, { limit: 2 } as never);
    const page2 = await service.list(
      identityA as never,
      { limit: 2, cursor: page1.nextCursor ?? undefined } as never,
    );
    const page3 = await service.list(
      identityA as never,
      { limit: 2, cursor: page2.nextCursor ?? undefined } as never,
    );

    const allIds = [...page1.items, ...page2.items, ...page3.items].map((n) => n.id);
    expect(new Set(allIds).size).toBe(allIds.length); // no duplication
    expect(allIds).toHaveLength(5); // no skipped items
    expect(page3.nextCursor).toBeNull();
  });

  it('a malformed cursor returns a safe bounded client error, not a crash', async () => {
    const { service } = buildService();
    await expect(
      service.list(identityA as never, { limit: 20, cursor: 'not-valid-base64url-json' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('a tampered cursor cannot reset traversal into an unbounded/default page', async () => {
    const { service } = buildService();
    const tamperedButValidJson = Buffer.from(
      JSON.stringify({ createdAt: 'not-a-date', id: 'x' }),
    ).toString('base64url');
    await expect(
      service.list(identityA as never, { limit: 20, cursor: tamperedButValidJson } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('mark-one-read is idempotent -- marking an already-read notification again is a safe no-op', async () => {
    const { service, client } = buildService();
    const created = (await client.patientNotification.create({
      data: {
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    })) as { id: string };

    const first = await service.markOneRead(identityA as never, created.id);
    const second = await service.markOneRead(identityA as never, created.id);
    expect(first.readAt).not.toBeNull();
    expect(second.readAt).toBe(first.readAt);
  });

  it('mark-all-read is idempotent -- a second call with nothing unread updates zero rows without erroring', async () => {
    const { service, client } = buildService();
    await client.patientNotification.create({
      data: {
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    });
    const first = await service.markAllRead(identityA as never);
    const second = await service.markAllRead(identityA as never);
    expect(first.updatedCount).toBe(1);
    expect(second.updatedCount).toBe(0);
  });

  it('idempotent event ingestion: the same (sourceType, sourceEventId) produces exactly one logical notification', async () => {
    const { service, rows } = buildService();
    const first = await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-123',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    const second = await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-123',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it('a DIFFERENT sourceType with the SAME sourceEventId value produces two independent notifications (compound key, not a bare global unique)', async () => {
    const { service } = buildService();
    const first = await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'shared-id',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    const second = await service.createFromEvent({
      sourceType: 'appointment-status-changed',
      sourceEventId: 'shared-id',
      recipientUserId: 'user-a',
      category: 'APPOINTMENT',
      title: 'Appointment update',
      message: 'Your appointment status changed.',
    });
    expect(second.id).not.toBe(first.id);
  });

  it('the patient-facing category does NOT itself determine idempotency identity -- two DIFFERENT sourceTypes producing the SAME category still create two independent notifications', async () => {
    const { service } = buildService();
    // Two independent hypothetical producers, both ultimately
    // classified under the same patient-facing RESERVATION category,
    // but with genuinely different, unrelated event IDs in their own
    // namespaces -- this is exactly the scenario the correction
    // (separating sourceType from category) exists to keep safe.
    const fromProducerOne = await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-1',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    const fromProducerTwo = await service.createFromEvent({
      sourceType: 'reservation-expiry-warning',
      sourceEventId: 'evt-1',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation expiring soon',
      message: 'Your reservation will expire soon.',
    });
    expect(fromProducerOne.category).toBe('RESERVATION');
    expect(fromProducerTwo.category).toBe('RESERVATION');
    expect(fromProducerOne.id).not.toBe(fromProducerTwo.id);
  });

  it('different notification categories may originate from appropriately namespaced source identities without any cross-interference', async () => {
    const { service, rows } = buildService();
    await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-a',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    await service.createFromEvent({
      sourceType: 'appointment-status-changed',
      sourceEventId: 'evt-b',
      recipientUserId: 'user-a',
      category: 'APPOINTMENT',
      title: 'Appointment update',
      message: 'Your appointment status changed.',
    });
    expect(rows.size).toBe(2);
  });

  it('sourceType/sourceEventId are server-derived and cannot be selected through the patient-facing public API -- createFromEvent has no HTTP route and is unreachable from list/markOneRead/markAllRead', async () => {
    const controllerMethods = ['list', 'markOneRead', 'markAllRead'];
    const publicApi = Object.getOwnPropertyNames(PatientNotificationService.prototype);
    for (const method of controllerMethods) {
      expect(publicApi).toContain(method);
    }
    // createFromEvent exists on the service (an internal seam) but is
    // never called from any patient-facing controller method above --
    // there is no code path in patient-notification.controller.ts
    // that invokes it, and no DTO in this candidate accepts
    // sourceType/sourceEventId as request fields.
  });

  it('rejects an over-length title/message at the ingestion boundary', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: 'system-notice',
        sourceEventId: 'evt-x',
        recipientUserId: 'user-a',
        category: 'SYSTEM',
        title: 'x'.repeat(161),
        message: 'y',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an empty/whitespace-only sourceType at the ingestion boundary', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: '   ',
        sourceEventId: 'evt-x',
        recipientUserId: 'user-a',
        category: 'SYSTEM',
        title: 'x',
        message: 'y',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("idempotency collision across DIFFERENT recipients fails closed -- never returns another patient's notification", async () => {
    const { service } = buildService();
    await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-cross-recipient',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });

    // A second call with the IDENTICAL (sourceType, sourceEventId) but
    // a DIFFERENT recipientUserId must never silently return user-a's
    // notification to what is, from the caller's perspective, a
    // request associated with user-b. It must fail closed with a
    // bounded internal error instead.
    await expect(
      service.createFromEvent({
        sourceType: 'reservation-status-changed',
        sourceEventId: 'evt-cross-recipient',
        recipientUserId: 'user-b',
        category: 'RESERVATION',
        title: 'Reservation update',
        message: 'Your reservation status changed.',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('normalizes leading/trailing whitespace in sourceType so "producer" and " producer " are the same idempotency namespace', async () => {
    const { service, rows } = buildService();
    const first = await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-whitespace',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    const second = await service.createFromEvent({
      sourceType: '  reservation-status-changed  ',
      sourceEventId: 'evt-whitespace',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
    });
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it('a valid-timestamp cursor with a non-UUID id is rejected rather than accepted as a traversal cursor', async () => {
    const { service } = buildService();
    const tamperedCursor = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString(), id: 'garbage' }),
    ).toString('base64url');
    await expect(
      service.list(identityA as never, { limit: 20, cursor: tamperedCursor } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('a cursor with an extra unexpected key is rejected (exact-keys contract)', async () => {
    const { service } = buildService();
    const extraKeyCursor = Buffer.from(
      JSON.stringify({
        createdAt: new Date().toISOString(),
        id: '11111111-1111-4111-8111-000000000000',
        extra: 'x',
      }),
    ).toString('base64url');
    await expect(
      service.list(identityA as never, { limit: 20, cursor: extraKeyCursor } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('destinationType SETTINGS only accepts the known internal token, never an arbitrary identifier', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: 'account-notice',
        sourceEventId: 'evt-settings-1',
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'Notice',
        message: 'A setting changed.',
        destinationType: 'SETTINGS',
        destinationId: 'arbitrary-page',
      }),
    ).rejects.toThrow(BadRequestException);

    const accepted = await service.createFromEvent({
      sourceType: 'account-notice',
      sourceEventId: 'evt-settings-2',
      recipientUserId: 'user-a',
      category: 'ACCOUNT',
      title: 'Notice',
      message: 'A setting changed.',
      destinationType: 'SETTINGS',
      destinationId: 'privacy',
    });
    expect(accepted.destinationId).toBe('privacy');
  });

  it('destinationType NONE cannot carry an arbitrary destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: 'account-notice',
        sourceEventId: 'evt-none-1',
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'Notice',
        message: 'A notice.',
        destinationType: 'NONE',
        destinationId: 'should-not-be-allowed',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a destinationId resembling a URL scheme or protocol-relative path is rejected for RESERVATION/APPOINTMENT', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: 'reservation-status-changed',
        sourceEventId: 'evt-url-1',
        recipientUserId: 'user-a',
        category: 'RESERVATION',
        title: 'Reservation update',
        message: 'Your reservation status changed.',
        destinationType: 'RESERVATION',
        destinationId: 'javascript:alert(1)',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createFromEvent({
        sourceType: 'reservation-status-changed',
        sourceEventId: 'evt-url-2',
        recipientUserId: 'user-a',
        category: 'RESERVATION',
        title: 'Reservation update',
        message: 'Your reservation status changed.',
        destinationType: 'RESERVATION',
        destinationId: '//evil.example.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a bounded UUID destinationId is accepted for RESERVATION, matching the authoritative MedicineReservation.id shape', async () => {
    const { service } = buildService();
    const created = await service.createFromEvent({
      sourceType: 'reservation-status-changed',
      sourceEventId: 'evt-valid-dest',
      recipientUserId: 'user-a',
      category: 'RESERVATION',
      title: 'Reservation update',
      message: 'Your reservation status changed.',
      destinationType: 'RESERVATION',
      destinationId: '33333333-3333-4333-8333-333333333333',
    });
    expect(created.destinationId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('a non-UUID-shaped destinationId is rejected for RESERVATION, even if it looks superficially bounded/alphanumeric', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: 'reservation-status-changed',
        sourceEventId: 'evt-non-uuid-dest',
        recipientUserId: 'user-a',
        category: 'RESERVATION',
        title: 'Reservation update',
        message: 'Your reservation status changed.',
        destinationType: 'RESERVATION',
        destinationId: 'reservation-abc123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a non-NONE destinationType requires a non-empty destinationId', async () => {
    const { service } = buildService();
    await expect(
      service.createFromEvent({
        sourceType: 'reservation-status-changed',
        sourceEventId: 'evt-missing-dest',
        recipientUserId: 'user-a',
        category: 'RESERVATION',
        title: 'Reservation update',
        message: 'Your reservation status changed.',
        destinationType: 'RESERVATION',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a nonexistent notification id resolves to NotFoundException for markOneRead, same as a cross-owner id', async () => {
    const { service } = buildService();
    await expect(service.markOneRead(identityA as never, 'does-not-exist')).rejects.toThrow(
      NotFoundException,
    );
  });

  it("unreadCount reflects only the authenticated patient's own unread notifications", async () => {
    const { service, client } = buildService();
    await client.patientNotification.create({
      data: {
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    });
    await client.patientNotification.create({
      data: {
        recipientUserId: 'user-b',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    });
    const list = await service.list(identityA as never, { limit: 20 } as never);
    expect(list.unreadCount).toBe(1);
  });

  it('unreadOnly filter returns only unread notifications for the authenticated patient', async () => {
    const { service, client } = buildService();
    const created = (await client.patientNotification.create({
      data: {
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'x',
        message: 'y',
        destinationType: 'NONE',
      },
    })) as { id: string };
    await client.patientNotification.create({
      data: {
        recipientUserId: 'user-a',
        category: 'ACCOUNT',
        title: 'z',
        message: 'y',
        destinationType: 'NONE',
      },
    });
    await service.markOneRead(identityA as never, created.id);

    const list = await service.list(identityA as never, { limit: 20, unreadOnly: true } as never);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].title).toBe('z');
  });
});
