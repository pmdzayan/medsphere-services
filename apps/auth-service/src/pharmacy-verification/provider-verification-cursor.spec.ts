// See provider-verification.service.spec.ts for why this mock is
// required -- the real `PlatformRepository` (transitively imported by
// the service module) pulls in the generated Prisma client, which
// cannot be generated in this environment.
jest.mock('../platform/platform.repository', () => ({
  PlatformRepository: class {},
}));

import {
  encodeQueueCursor,
  decodeQueueCursor,
  ProviderVerificationService,
} from './provider-verification.service';

/**
 * Candidate Task 0039 (PROVISIONAL, item 4). Focused tests for the
 * opaque, deterministic keyset-pagination cursor used by
 * `listReviewQueue` (`submittedAt DESC, id DESC`).
 */

const VALID_UUID = '11111111-2222-4222-8222-333333333333';

describe('provider-verification cursor encode/decode (candidate Task 0039, item 4)', () => {
  it('round-trips submittedAt and id exactly', () => {
    const submittedAt = new Date('2026-05-01T10:00:00.000Z');
    const cursor = encodeQueueCursor(submittedAt, VALID_UUID);
    const decoded = decodeQueueCursor(cursor);
    expect(decoded.submittedAt.toISOString()).toBe(submittedAt.toISOString());
    expect(decoded.id).toBe(VALID_UUID);
  });

  it('the cursor is opaque (base64url, not a readable plain string)', () => {
    const cursor = encodeQueueCursor(new Date(), VALID_UUID);
    expect(cursor).not.toContain(VALID_UUID);
    expect(cursor).not.toContain('|');
  });

  it('rejects a malformed base64/opaque cursor', () => {
    // base64url decoding is lenient, but the decoded content still
    // fails the separator check, correctly rejecting garbage input.
    expect(() => decodeQueueCursor('!!!not-a-valid-cursor!!!')).toThrow(
      'Malformed pagination cursor',
    );
  });

  it('rejects a cursor missing the separator', () => {
    const noSeparator = Buffer.from('2026-05-01T10:00:00.000Z', 'utf8').toString('base64url');
    expect(() => decodeQueueCursor(noSeparator)).toThrow('Malformed pagination cursor');
  });

  it('rejects an invalid date component', () => {
    const badDate = Buffer.from(`not-a-date|${VALID_UUID}`, 'utf8').toString('base64url');
    expect(() => decodeQueueCursor(badDate)).toThrow('Malformed pagination cursor');
  });

  it('rejects an empty id component', () => {
    const emptyId = Buffer.from('2026-05-01T10:00:00.000Z|', 'utf8').toString('base64url');
    expect(() => decodeQueueCursor(emptyId)).toThrow('Malformed pagination cursor');
  });

  it('CORRECTION 4 (mandatory): rejects an id component that is not a valid UUID', () => {
    const badId = Buffer.from('2026-05-01T10:00:00.000Z|not-a-uuid-at-all', 'utf8').toString(
      'base64url',
    );
    expect(() => decodeQueueCursor(badId)).toThrow('Malformed pagination cursor');
  });

  it('CORRECTION 4 (mandatory): rejects an id component that looks close to a UUID but is malformed (wrong segment lengths)', () => {
    const almostUuid = Buffer.from(
      '2026-05-01T10:00:00.000Z|11111111-222-4222-8222-333333333333',
      'utf8',
    ).toString('base64url');
    expect(() => decodeQueueCursor(almostUuid)).toThrow('Malformed pagination cursor');
  });

  it('rejects a structurally valid UUID from a different version', () => {
    const cursor = Buffer.from(
      '2026-05-01T10:00:00.000Z|11111111-2222-1222-8222-333333333333',
    ).toString('base64url');
    expect(() => decodeQueueCursor(cursor)).toThrow('Malformed pagination cursor');
  });
});

describe('listReviewQueue -- deterministic keyset pagination (candidate Task 0039, item 4)', () => {
  function buildQueueRows() {
    // Two rows share the EXACT same submittedAt -- the tie-break (id
    // DESC) is what must keep pagination deterministic.
    const tie = new Date('2026-05-01T10:00:00.000Z');
    return [
      {
        id: '11111111-1111-4111-8111-111111111111',
        providerId: 'p1',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: tie,
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Alpha' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        providerId: 'p2',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: tie,
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Beta' },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        providerId: 'p3',
        status: 'APPROVED',
        isCurrent: true,
        submittedAt: new Date('2026-04-01T10:00:00.000Z'),
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Gamma' },
      },
    ];
  }

  function futureDate() {
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }

  function buildQueueService(rows: ReturnType<typeof buildQueueRows>) {
    const client = {
      providerVerification: {
        findMany: jest
          .fn()
          .mockImplementation(
            ({ where, take }: { where: { AND: Record<string, unknown>[] }; take: number }) => {
              let matches = [...rows];
              for (const condition of where.AND) {
                if ('status' in condition) {
                  matches = matches.filter((r) => r.status === condition.status);
                }
                if ('provider' in condition) {
                  const c = condition as {
                    provider: { businessName: { contains: string; mode: string } };
                  };
                  const needle = c.provider.businessName.contains.toLowerCase();
                  matches = matches.filter((r) =>
                    r.provider.businessName.toLowerCase().includes(needle),
                  );
                }
                if ('OR' in condition) {
                  const clauses = condition.OR as Array<Record<string, unknown>>;
                  matches = matches.filter((r) =>
                    clauses.some((clause) => {
                      if ('isCurrent' in clause) return r.isCurrent === clause.isCurrent;
                      if ('status' in clause && typeof clause.status === 'object') {
                        return (clause.status as { in: string[] }).in.includes(r.status);
                      }
                      if ('submittedAt' in clause && 'id' in clause) {
                        const c = clause as { submittedAt: Date; id: { lt: string } };
                        return (
                          r.submittedAt.getTime() === c.submittedAt.getTime() && r.id < c.id.lt
                        );
                      }
                      if ('submittedAt' in clause) {
                        const c = clause as { submittedAt: { lt: Date } };
                        return r.submittedAt.getTime() < c.submittedAt.lt.getTime();
                      }
                      return false;
                    }),
                  );
                }
              }
              matches.sort(
                (a, b) =>
                  b.submittedAt.getTime() - a.submittedAt.getTime() || (a.id < b.id ? 1 : -1),
              );
              return Promise.resolve(matches.slice(0, take));
            },
          ),
      },
    } as never;
    const prisma = { client } as never;
    const audit = { appendTenantUser: jest.fn(), appendPlatformUser: jest.fn() } as never;
    const platformRepository = { findEffectivePlatformPermissions: jest.fn() } as never;
    return new ProviderVerificationService(prisma, audit, platformRepository);
  }

  it('two records with identical submittedAt paginate deterministically by id, with no duplicate or skipped row across pages', async () => {
    const service = buildQueueService(buildQueueRows());
    const page1 = await service.listReviewQueue({ limit: 1 });
    expect(page1.data).toHaveLength(1);
    expect(page1.data[0].id).toBe('22222222-2222-4222-8222-222222222222'); // higher id wins the tie
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await service.listReviewQueue({ limit: 1, cursor: page1.nextCursor! });
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(page2.data[0].id).not.toBe(page1.data[0].id); // no duplicate

    const page3 = await service.listReviewQueue({ limit: 1, cursor: page2.nextCursor! });
    expect(page3.data).toHaveLength(1);
    expect(page3.data[0].id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('the final page returns nextCursor=null', async () => {
    const service = buildQueueService(buildQueueRows());
    const page1 = await service.listReviewQueue({ limit: 10 });
    expect(page1.data).toHaveLength(3);
    expect(page1.nextCursor).toBeNull();
  });

  it('a status filter remains stable across pages', async () => {
    const service = buildQueueService(buildQueueRows());
    const page1 = await service.listReviewQueue({ limit: 1, status: 'PENDING' });
    expect(page1.data[0].status).toBe('PENDING');
    const page2 = await service.listReviewQueue({
      limit: 1,
      status: 'PENDING',
      cursor: page1.nextCursor!,
    });
    expect(page2.data[0].status).toBe('PENDING');
    expect(page2.nextCursor).toBeNull();
  });

  it('CORRECTION (item 2, mandatory): businessNameSearch remains stable across pages -- no duplicate, no skipped match, unrelated businesses never leak in', async () => {
    // 4 rows genuinely match "Pharma" (bounded search), each with a
    // distinct submittedAt so pagination has a real, deterministic
    // order to walk; 1 unrelated row must never appear in any page.
    const tie = new Date('2026-05-01T10:00:00.000Z');
    const rows = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        providerId: 'p1',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: new Date(tie.getTime() + 3000),
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'City Pharma One' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        providerId: 'p2',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: new Date(tie.getTime() + 2000),
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Metro Pharma Two' },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        providerId: 'p3',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: new Date(tie.getTime() + 1000),
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Valley Pharma Three' },
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        providerId: 'p4',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: tie,
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Hillside Pharma Four' },
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        providerId: 'p5',
        status: 'PENDING',
        isCurrent: true,
        submittedAt: new Date(tie.getTime() + 5000),
        licenseExpiryDate: futureDate(),
        provider: { businessName: 'Unrelated Hospital Group' },
      },
    ];
    const service = buildQueueService(rows);

    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page: { data: typeof rows; nextCursor: string | null } = await service.listReviewQueue({
        limit: 2,
        businessNameSearch: 'Pharma',
        cursor: cursor ?? undefined,
      });
      pages += 1;
      for (const row of page.data) {
        expect(row.provider.businessName.toLowerCase()).toContain('pharma');
        expect(seen).not.toContain(row.id); // no duplicate
        seen.push(row.id);
      }
      cursor = page.nextCursor;
    } while (cursor);

    expect(pages).toBeGreaterThanOrEqual(2); // genuinely crossed at least two pages
    expect(seen).toHaveLength(4); // all 4 matching rows found, none skipped
    expect(seen).not.toContain('55555555-5555-4555-8555-555555555555'); // unrelated business never leaked in
  });
});
