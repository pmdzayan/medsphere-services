/**
 * Task 0028 - Privacy-safe live demand analytics service unit tests.
 *
 * Covers the required counting semantics, deterministic boundary semantics,
 * fail-closed authorization boundaries, bounded windows, and the privacy-leak
 * contract of the serialized response.
 */
import { NotFoundException } from '@nestjs/common';
import { assertPharmacyProviderAccess, assertTrustedProviderAccess } from './inventory-access';
import {
  AvailabilityRequestDemandAnalyticsService,
  compareDemandProducts,
  type AvailabilityRequestDemandProduct,
} from './availability-request-demand.service';

jest.mock('./inventory-access', () => ({
  assertTrustedProviderAccess: jest.fn(),
  assertPharmacyProviderAccess: jest.fn(),
}));

const trustedAccessMock = jest.mocked(assertTrustedProviderAccess);
const pharmacyAccessMock = jest.mocked(assertPharmacyProviderAccess);

const NOW = new Date('2026-09-17T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const ACTOR = {
  tenantId: 'tenant-a',
  membershipId: 'membership-a',
  userId: 'user-a',
} as never;

interface RequestGroupFixture {
  readonly productId: string;
  readonly status: 'PENDING' | 'RESPONDED' | 'EXPIRED';
  readonly _count: { readonly _all: number };
  // Raw rows may carry identifying fields; the aggregate must never surface
  // them. Keeping an open index signature lets the privacy-leak test feed
  // sentinel values that the reduction must drop.
  readonly [key: string]: unknown;
}

interface EvidenceGroupFixture {
  readonly productId: string;
  readonly outcome: 'AVAILABLE' | 'UNAVAILABLE' | 'CHECK_LATER';
  readonly _count: { readonly _all: number };
  readonly [key: string]: unknown;
}

interface ProductFixture {
  readonly id: string;
  readonly name: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly manufacturer: string;
}

function buildHarness(options: {
  requestGroups?: readonly RequestGroupFixture[];
  evidenceGroups?: readonly EvidenceGroupFixture[];
  products?: readonly ProductFixture[];
}) {
  const requestGroups = options.requestGroups ?? [];
  const evidenceGroups = options.evidenceGroups ?? [];
  const displays = new Map((options.products ?? []).map((item) => [item.id, item]));

  const requestByProduct = new Map<
    string,
    { liveRequestCount: number; pendingCount: number; respondedCount: number; expiredCount: number }
  >();

  for (const row of requestGroups) {
    const current = requestByProduct.get(row.productId) ?? {
      liveRequestCount: 0,
      pendingCount: 0,
      respondedCount: 0,
      expiredCount: 0,
    };
    current.liveRequestCount += row._count._all;
    if (row.status === 'PENDING') current.pendingCount += row._count._all;
    if (row.status === 'RESPONDED') current.respondedCount += row._count._all;
    if (row.status === 'EXPIRED') current.expiredCount += row._count._all;
    requestByProduct.set(row.productId, current);
  }

  const evidenceByProduct = new Map<
    string,
    { availableCount: number; unavailableCount: number; checkLaterCount: number }
  >();
  for (const row of evidenceGroups) {
    const current = evidenceByProduct.get(row.productId) ?? {
      availableCount: 0,
      unavailableCount: 0,
      checkLaterCount: 0,
    };
    if (row.outcome === 'AVAILABLE') current.availableCount += row._count._all;
    if (row.outcome === 'UNAVAILABLE') current.unavailableCount += row._count._all;
    if (row.outcome === 'CHECK_LATER') current.checkLaterCount += row._count._all;
    evidenceByProduct.set(row.productId, current);
  }

  const totals = [...requestByProduct.values()].reduce(
    (result, item) => ({
      liveRequestCount: result.liveRequestCount + item.liveRequestCount,
      pendingCount: result.pendingCount + item.pendingCount,
      respondedCount: result.respondedCount + item.respondedCount,
      expiredCount: result.expiredCount + item.expiredCount,
    }),
    { liveRequestCount: 0, pendingCount: 0, respondedCount: 0, expiredCount: 0 },
  );

  const databaseProducts = [...requestByProduct.entries()]
    .flatMap(([productId, counts]) => {
      const display = displays.get(productId);
      if (!display) return [];
      const evidence = evidenceByProduct.get(productId) ?? {
        availableCount: 0,
        unavailableCount: 0,
        checkLaterCount: 0,
      };
      return [{ productId, ...display, ...counts, ...evidence }];
    })
    .map(({ id: _id, ...row }) => row);

  const queryRaw = jest.fn().mockImplementation(() => {
    const callNumber = queryRaw.mock.calls.length;
    return Promise.resolve(callNumber % 2 === 1 ? [totals] : databaseProducts);
  });

  const client = { $queryRaw: queryRaw };
  const service = new AvailabilityRequestDemandAnalyticsService({ client } as never);

  return { service, queryRaw };
}

function rawQueryValues(queryRaw: jest.Mock, callIndex: number): readonly unknown[] {
  return queryRaw.mock.calls[callIndex].slice(1);
}

function rawQueryText(queryRaw: jest.Mock, callIndex: number): string {
  return (queryRaw.mock.calls[callIndex][0] as readonly string[]).join('?');
}

function product(
  overrides: Partial<AvailabilityRequestDemandProduct> & { productId: string },
): AvailabilityRequestDemandProduct {
  return {
    name: 'Medicinal Name',
    strength: '10mg',
    dosageForm: 'TABLET',
    manufacturer: 'Acme Pharma',
    liveRequestCount: 0,
    pendingCount: 0,
    respondedCount: 0,
    expiredCount: 0,
    availableCount: 0,
    unavailableCount: 0,
    checkLaterCount: 0,
    ...overrides,
  };
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first === undefined) return [];
    return flattenKeys(first, prefix);
  }
  if (value !== null && typeof value === 'object') {
    const keys: string[] = [];
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const dotted = prefix ? `${prefix}.${key}` : key;
      keys.push(dotted);
      keys.push(...flattenKeys(child, dotted));
    }
    return keys;
  }
  return [];
}

describe('AvailabilityRequestDemandAnalyticsService - Task 0028', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trustedAccessMock.mockResolvedValue(undefined);
    pharmacyAccessMock.mockResolvedValue(undefined);
  });

  it('returns zero totals and an empty product list when no requests exist in the window', async () => {
    const harness = buildHarness({});

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );

    expect(result.totals).toEqual({
      liveRequestCount: 0,
      pendingCount: 0,
      respondedCount: 0,
      expiredCount: 0,
    });
    expect(result.products).toEqual([]);
    expect(result.window.days).toBe(7);
    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
  });

  it('aggregates multiple products independently', async () => {
    const harness = buildHarness({
      requestGroups: [
        { productId: 'p1', status: 'PENDING', _count: { _all: 2 } },
        { productId: 'p2', status: 'RESPONDED', _count: { _all: 1 } },
      ],
      evidenceGroups: [{ productId: 'p2', outcome: 'AVAILABLE', _count: { _all: 1 } }],
      products: [
        { id: 'p1', name: 'Alpha', strength: '10mg', dosageForm: 'TABLET', manufacturer: 'Acme' },
        { id: 'p2', name: 'Beta', strength: '5mg', dosageForm: 'SYRUP', manufacturer: 'Cure' },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );

    expect(result.totals.liveRequestCount).toBe(3);
    expect(result.totals.pendingCount).toBe(2);
    expect(result.totals.respondedCount).toBe(1);

    const byId = new Map(result.products.map((item) => [item.productId, item]));
    expect(byId.get('p1')).toMatchObject({ pendingCount: 2, respondedCount: 0, availableCount: 0 });
    expect(byId.get('p2')).toMatchObject({ respondedCount: 1, availableCount: 1 });
  });

  it.each([
    ['PENDING', 'pendingCount'],
    ['RESPONDED', 'respondedCount'],
    ['EXPIRED', 'expiredCount'],
  ])('counts the %s status at product and total level', async (status, key) => {
    const harness = buildHarness({
      requestGroups: [{ productId: 'p1', status: status as never, _count: { _all: 4 } }],
      evidenceGroups: [],
      products: [
        { id: 'p1', name: 'Alpha', strength: '10mg', dosageForm: 'TABLET', manufacturer: 'Acme' },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 30, limit: 25 },
      { now: NOW },
    );

    expect(result.totals.liveRequestCount).toBe(4);
    expect((result.totals as unknown as Record<string, number>)[key]).toBe(4);
    expect((result.products[0] as unknown as Record<string, number>)[key]).toBe(4);
  });

  it.each([
    ['AVAILABLE', 'availableCount'],
    ['UNAVAILABLE', 'unavailableCount'],
    ['CHECK_LATER', 'checkLaterCount'],
  ])('counts %s pharmacist-confirmation evidence', async (outcome, key) => {
    const harness = buildHarness({
      requestGroups: [{ productId: 'p1', status: 'RESPONDED', _count: { _all: 2 } }],
      evidenceGroups: [{ productId: 'p1', outcome: outcome as never, _count: { _all: 2 } }],
      products: [
        { id: 'p1', name: 'Alpha', strength: '10mg', dosageForm: 'TABLET', manufacturer: 'Acme' },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );

    expect((result.products[0] as unknown as Record<string, number>)[key]).toBe(2);
  });

  it('never interprets the absence of confirmation evidence as unavailable', async () => {
    const harness = buildHarness({
      requestGroups: [{ productId: 'p1', status: 'RESPONDED', _count: { _all: 1 } }],
      evidenceGroups: [],
      products: [
        { id: 'p1', name: 'Alpha', strength: '10mg', dosageForm: 'TABLET', manufacturer: 'Acme' },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );

    expect(result.products[0]).toMatchObject({
      respondedCount: 1,
      availableCount: 0,
      unavailableCount: 0,
      checkLaterCount: 0,
    });
    expect(result.totals.respondedCount).toBe(1);
    expect(result.totals.liveRequestCount).toBe(1);
    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe('AvailabilityRequestDemandAnalyticsService deterministic and bounded behavior - Task 0028', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trustedAccessMock.mockResolvedValue(undefined);
    pharmacyAccessMock.mockResolvedValue(undefined);
  });

  it('orders products deterministically by liveRequestCount DESC then display fields then productId', () => {
    const ordered = [
      product({
        productId: 'p-id-2',
        name: 'Alpha',
        strength: '500mg',
        dosageForm: 'TABLET',
        liveRequestCount: 5,
      }),
      product({
        productId: 'p-id-1',
        name: 'Alpha',
        strength: '500mg',
        dosageForm: 'TABLET',
        liveRequestCount: 5,
      }),
      product({
        productId: 'x',
        name: 'Beta',
        strength: '250mg',
        dosageForm: 'TABLET',
        liveRequestCount: 7,
      }),
      product({
        productId: 'y',
        name: 'Alpha',
        strength: '250mg',
        dosageForm: 'TABLET',
        liveRequestCount: 5,
      }),
    ].sort(compareDemandProducts);

    // x has the highest liveRequestCount; the remaining three are ordered by
    // name, then strength, then productId.
    expect(ordered.map((item) => item.productId)).toEqual(['x', 'y', 'p-id-1', 'p-id-2']);
  });

  it('orders the read response by liveRequestCount DESC with stable tie-breaking', async () => {
    const harness = buildHarness({
      requestGroups: [
        { productId: 'p1', status: 'PENDING', _count: { _all: 2 } },
        { productId: 'p2', status: 'PENDING', _count: { _all: 8 } },
        { productId: 'p3', status: 'PENDING', _count: { _all: 8 } },
      ],
      evidenceGroups: [],
      products: [
        {
          id: 'p2',
          name: 'Amoxicillin',
          strength: '250mg',
          dosageForm: 'CAPSULE',
          manufacturer: 'M',
        },
        {
          id: 'p3',
          name: 'Amoxicillin',
          strength: '500mg',
          dosageForm: 'CAPSULE',
          manufacturer: 'M',
        },
        {
          id: 'p1',
          name: 'Paracetamol',
          strength: '500mg',
          dosageForm: 'TABLET',
          manufacturer: 'M',
        },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );

    expect(result.products.map((item) => item.productId)).toEqual(['p2', 'p3', 'p1']);
  });

  it('applies the bounded result limit after aggregation and ordering', async () => {
    const harness = buildHarness({
      requestGroups: [
        { productId: 'p1', status: 'PENDING', _count: { _all: 1 } },
        { productId: 'p2', status: 'PENDING', _count: { _all: 2 } },
        { productId: 'p3', status: 'PENDING', _count: { _all: 3 } },
        { productId: 'p4', status: 'PENDING', _count: { _all: 4 } },
      ],
      evidenceGroups: [],
      products: [1, 2, 3, 4].map((n) => ({
        id: `p${n}`,
        name: `Name ${n}`,
        strength: '10mg',
        dosageForm: 'TABLET',
        manufacturer: 'M',
      })),
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 2 },
      { now: NOW },
    );

    expect(result.products).toHaveLength(2);
    expect(result.products.map((item) => item.productId)).toEqual(['p4', 'p3']);
    expect(result.totals.liveRequestCount).toBe(10);

    // Regression proof for the CTO correction: the product-level SQL itself
    // carries a parameterized LIMIT. The old groupBy/findMany implementation
    // had no database-level limit and would fail this assertion.
    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
    expect(rawQueryText(harness.queryRaw, 1)).toMatch(/LIMIT\s+\?/);
    expect(rawQueryValues(harness.queryRaw, 1)).toContain(2);
  });

  it.each([
    [7, '2026-09-10T12:00:00.000Z'],
    [1, '2026-09-16T12:00:00.000Z'],
    [90, '2026-06-19T12:00:00.000Z'],
  ])('derives a deterministic %d-day server-side window', async (days, expectedFrom) => {
    const harness = buildHarness({});

    await harness.service.readDemand(ACTOR, 'provider-a', { days, limit: 25 }, { now: NOW });

    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
    const values = rawQueryValues(harness.queryRaw, 0);
    expect(values).toContainEqual(new Date(expectedFrom));
    expect(values).toContainEqual(NOW);
    expect(values).toContain('tenant-a');
    expect(values).toContain('provider-a');
  });

  it('documents the returned window in the summary', async () => {
    const harness = buildHarness({});

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );

    expect(result.window).toEqual({
      from: '2026-09-10T12:00:00.000Z',
      to: '2026-09-17T12:00:00.000Z',
      days: 7,
    });
  });

  it('normalizes invalid values instead of trusting the caller (defense in depth)', async () => {
    const harness = buildHarness({});

    await harness.service.readDemand(ACTOR, 'provider-a', { days: 91, limit: 101 }, { now: NOW });
    expect(rawQueryValues(harness.queryRaw, 0)).toContainEqual(
      new Date(NOW.getTime() - 90 * DAY_MS),
    );

    await harness.service.readDemand(ACTOR, 'provider-a', { days: 0, limit: 0 }, { now: NOW });
    expect(rawQueryValues(harness.queryRaw, 2)).toContainEqual(
      new Date(NOW.getTime() - 1 * DAY_MS),
    );

    await harness.service.readDemand(ACTOR, 'provider-a', { days: 1.5, limit: 2.5 }, { now: NOW });
    expect(rawQueryValues(harness.queryRaw, 4)).toContainEqual(
      new Date(NOW.getTime() - 7 * DAY_MS),
    );
  });
});

describe('AvailabilityRequestDemandAnalyticsService authorization and privacy - Task 0028', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trustedAccessMock.mockResolvedValue(undefined);
    pharmacyAccessMock.mockResolvedValue(undefined);
  });

  it('requires trusted same-tenant provider access before any aggregation', async () => {
    const harness = buildHarness({});

    await harness.service.readDemand(ACTOR, 'provider-a', { days: 7, limit: 25 }, { now: NOW });

    expect(trustedAccessMock).toHaveBeenCalledWith(expect.anything(), ACTOR, 'provider-a');
    expect(pharmacyAccessMock).toHaveBeenCalledWith(expect.anything(), 'tenant-a', 'provider-a');
    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
  });

  it.each(['cross-tenant provider', 'unassigned/untrusted provider'])(
    'fails closed for %s via the trusted provider boundary',
    async () => {
      const harness = buildHarness({});
      trustedAccessMock.mockRejectedValue(new NotFoundException('Provider inventory not found'));

      await expect(
        harness.service.readDemand(ACTOR, 'provider-a', { days: 7, limit: 25 }, { now: NOW }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.queryRaw).not.toHaveBeenCalled();
    },
  );

  it('fails closed for a non-PHARMACY provider', async () => {
    const harness = buildHarness({});
    pharmacyAccessMock.mockRejectedValue(new NotFoundException('Provider inventory not found'));

    await expect(
      harness.service.readDemand(ACTOR, 'provider-a', { days: 7, limit: 25 }, { now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.queryRaw).not.toHaveBeenCalled();
  });

  it('does not leak request ids, evidence ids, responder identity, or request telemetry', async () => {
    const requestIdSentinel = '11111111-1111-4111-8111-111111111111';
    const evidenceIdSentinel = '22222222-2222-4222-8222-222222222222';
    const responderUserSentinel = '33333333-3333-4333-8333-333333333333';
    const responderMembershipSentinel = '44444444-4444-4444-8444-444444444444';
    const requestTimestamp = '2026-09-15T09:30:00.000Z';
    const auditCorrelationSentinel = 'audit-correlation-0028';

    const harness = buildHarness({
      requestGroups: [
        {
          // Raw database rows can carry identifying fields; the aggregate must
          // never surface them.
          productId: 'p1',
          status: 'RESPONDED',
          _count: { _all: 1 },
          id: requestIdSentinel,
          requestedAt: new Date(requestTimestamp),
          respondedAt: new Date(requestTimestamp),
          requestId: auditCorrelationSentinel,
        },
      ],
      evidenceGroups: [
        {
          productId: 'p1',
          outcome: 'AVAILABLE',
          _count: { _all: 1 },
          id: evidenceIdSentinel,
          responderUserId: responderUserSentinel,
          responderMembershipId: responderMembershipSentinel,
          confirmedAt: new Date(requestTimestamp),
        },
      ],
      products: [
        { id: 'p1', name: 'Alpha', strength: '10mg', dosageForm: 'TABLET', manufacturer: 'Acme' },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(requestIdSentinel);
    expect(serialized).not.toContain(evidenceIdSentinel);
    expect(serialized).not.toContain(responderUserSentinel);
    expect(serialized).not.toContain(responderMembershipSentinel);
    expect(serialized).not.toContain(requestTimestamp);
    expect(serialized).not.toContain(auditCorrelationSentinel);
    expect(serialized).not.toContain('203.0.113.1');
    expect(serialized).not.toContain('privacy-agent/1.0');
  });

  it('exposes only the bounded deterministic response contract keys', async () => {
    const harness = buildHarness({
      requestGroups: [{ productId: 'p1', status: 'PENDING', _count: { _all: 1 } }],
      evidenceGroups: [],
      products: [
        { id: 'p1', name: 'Alpha', strength: '10mg', dosageForm: 'TABLET', manufacturer: 'Acme' },
      ],
    });

    const result = await harness.service.readDemand(
      ACTOR,
      'provider-a',
      { days: 7, limit: 25 },
      { now: NOW },
    );
    const keys = flattenKeys(result).sort();

    expect(keys).toEqual(
      [
        'providerId',
        'window',
        'window.from',
        'window.to',
        'window.days',
        'totals',
        'totals.liveRequestCount',
        'totals.pendingCount',
        'totals.respondedCount',
        'totals.expiredCount',
        'products',
        'products.productId',
        'products.name',
        'products.strength',
        'products.dosageForm',
        'products.manufacturer',
        'products.liveRequestCount',
        'products.pendingCount',
        'products.respondedCount',
        'products.expiredCount',
        'products.availableCount',
        'products.unavailableCount',
        'products.checkLaterCount',
      ].sort(),
    );
  });
});
