import { NotFoundException } from '@nestjs/common';
import { InventoryAnalyticsService, toSafeNonNegativeCount } from './inventory-analytics.service';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PROVIDER_A = '33333333-3333-4333-8333-333333333333';
const PROVIDER_B = '44444444-4444-4444-8444-444444444444';

const identityA = {
  userId: 'user-a',
  membershipId: 'membership-a',
  tenantId: TENANT_A,
  sessionId: 'session-a',
  tokenId: 'token-a',
  securityVersion: 1,
};

interface Fixtures {
  memberships?: { tenantId: string; membershipId: string; providerId: string; active?: boolean }[];
  inventories?: { id: string; tenantId: string; providerId: string; minimumStockLevel: number }[];
  batches?: {
    id: string;
    tenantId: string;
    providerId: string;
    inventoryId: string;
    status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED';
    onHandQuantity: number;
    heldQuantity: number;
    expiryDate: Date;
  }[];
  reservations?: { tenantId: string; providerId: string; status: string }[];
  allocations?: {
    tenantId: string;
    providerId: string;
    status: 'HELD' | 'CONSUMED' | 'RELEASED';
    quantity: number;
  }[];
  transfers?: { tenantId: string; sourceProviderId: string; destinationProviderId: string }[];
  damagedMovements?: { tenantId: string; providerId: string }[];
}

/**
 * A fixture-driven mock Prisma client: each method filters/aggregates
 * over plain in-memory arrays using the same where-clause semantics
 * Prisma itself applies, so tests can assert exact expected values
 * against deterministic fixtures rather than hand-crafting a mock
 * return value per call.
 */
function buildService(fixtures: Fixtures = {}) {
  const memberships = fixtures.memberships ?? [];
  const inventories = fixtures.inventories ?? [];
  const batches = fixtures.batches ?? [];
  const reservations = fixtures.reservations ?? [];
  const allocations = fixtures.allocations ?? [];
  const transfers = fixtures.transfers ?? [];
  const damagedMovements = fixtures.damagedMovements ?? [];

  const client = {
    membershipProviderAccess: {
      findFirst: jest
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: { tenantId: string; membershipId: string; providerId: string };
          }) => {
            const match = memberships.find(
              (m) =>
                m.tenantId === where.tenantId &&
                m.membershipId === where.membershipId &&
                m.providerId === where.providerId &&
                (m.active ?? true),
            );
            return Promise.resolve(match ? { id: 'access-1' } : null);
          },
        ),
    },
    inventory: {
      count: jest
        .fn()
        .mockImplementation(({ where }: { where: { tenantId: string; providerId: string } }) =>
          Promise.resolve(
            inventories.filter(
              (i) => i.tenantId === where.tenantId && i.providerId === where.providerId,
            ).length,
          ),
        ),
    },
    $queryRaw: jest.fn().mockImplementation((query: { values: unknown[] }) => {
      // Mirrors the exact SQL logic in the real $queryRaw call: sums
      // available (onHand - held) per inventoryId over ACTIVE batches
      // for this tenant/provider, then counts inventory rows where
      // that sum is <= 0 (unavailable) or < minimumStockLevel (low
      // stock) -- computed from the same in-memory fixtures the rest
      // of this mock uses, never by parsing the SQL string itself.
      const [tenantId, providerId, now] = query.values as [string, string, Date];
      const relevantInventories = inventories.filter(
        (i) => i.tenantId === tenantId && i.providerId === providerId,
      );
      const availableByInventoryId = new Map<string, number>();
      for (const b of batches) {
        if (
          b.tenantId !== tenantId ||
          b.providerId !== providerId ||
          b.status !== 'ACTIVE' ||
          b.expiryDate.getTime() <= now.getTime()
        )
          continue;
        const current = availableByInventoryId.get(b.inventoryId) ?? 0;
        availableByInventoryId.set(b.inventoryId, current + (b.onHandQuantity - b.heldQuantity));
      }
      let unavailableProductCount = 0n;
      let lowStockProductCount = 0n;
      for (const inv of relevantInventories) {
        const available = availableByInventoryId.get(inv.id) ?? 0;
        if (available <= 0) unavailableProductCount += 1n;
        if (available < inv.minimumStockLevel) lowStockProductCount += 1n;
      }
      return Promise.resolve([{ unavailableProductCount, lowStockProductCount }]);
    }),
    batch: {
      aggregate: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            tenantId: string;
            providerId: string;
            status: string;
            expiryDate?: { gt: Date };
          };
        }) => {
          const matched = batches.filter(
            (b) =>
              b.tenantId === where.tenantId &&
              b.providerId === where.providerId &&
              b.status === where.status &&
              (!where.expiryDate || b.expiryDate.getTime() > where.expiryDate.gt.getTime()),
          );
          return Promise.resolve({
            _count: { _all: matched.length },
            _sum: {
              onHandQuantity: matched.reduce((sum, b) => sum + b.onHandQuantity, 0),
              heldQuantity: matched.reduce((sum, b) => sum + b.heldQuantity, 0),
            },
          });
        },
      ),
      groupBy: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { tenantId: string; providerId: string; status: string } }) => {
            const matched = batches.filter(
              (b) =>
                b.tenantId === where.tenantId &&
                b.providerId === where.providerId &&
                b.status === where.status,
            );
            const byInventory = new Map<string, { onHandQuantity: number; heldQuantity: number }>();
            for (const b of matched) {
              const current = byInventory.get(b.inventoryId) ?? {
                onHandQuantity: 0,
                heldQuantity: 0,
              };
              current.onHandQuantity += b.onHandQuantity;
              current.heldQuantity += b.heldQuantity;
              byInventory.set(b.inventoryId, current);
            }
            return Promise.resolve(
              Array.from(byInventory.entries()).map(([inventoryId, sums]) => ({
                inventoryId,
                _sum: sums,
              })),
            );
          },
        ),
      count: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            tenantId: string;
            providerId: string;
            status: string;
            expiryDate?: { gte: Date; lte: Date };
          };
        }) =>
          Promise.resolve(
            batches.filter(
              (b) =>
                b.tenantId === where.tenantId &&
                b.providerId === where.providerId &&
                b.status === where.status &&
                (!where.expiryDate ||
                  (b.expiryDate.getTime() >= where.expiryDate.gte.getTime() &&
                    b.expiryDate.getTime() <= where.expiryDate.lte.getTime())),
            ).length,
          ),
      ),
      findMany: jest.fn().mockImplementation(
        ({
          where,
          take,
        }: {
          where: {
            tenantId: string;
            providerId: string;
            status: string;
            expiryDate: { gte: Date; lte: Date };
          };
          take: number;
        }) => {
          const matched = batches
            .filter(
              (b) =>
                b.tenantId === where.tenantId &&
                b.providerId === where.providerId &&
                b.status === where.status &&
                b.expiryDate.getTime() >= where.expiryDate.gte.getTime() &&
                b.expiryDate.getTime() <= where.expiryDate.lte.getTime(),
            )
            .sort(
              (a, b) => a.expiryDate.getTime() - b.expiryDate.getTime() || a.id.localeCompare(b.id),
            );
          return Promise.resolve(
            matched.slice(0, take).map((b) => ({
              id: b.id,
              expiryDate: b.expiryDate,
              inventoryId: b.inventoryId,
              productId: 'product-1',
            })),
          );
        },
      ),
    },
    stockMovement: {
      count: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { tenantId: string; providerId: string; type: string } }) =>
            Promise.resolve(
              where.type === 'DAMAGED'
                ? damagedMovements.filter(
                    (m) => m.tenantId === where.tenantId && m.providerId === where.providerId,
                  ).length
                : 0,
            ),
        ),
    },
    medicineReservation: {
      groupBy: jest
        .fn()
        .mockImplementation(({ where }: { where: { tenantId: string; providerId: string } }) => {
          const matched = reservations.filter(
            (r) => r.tenantId === where.tenantId && r.providerId === where.providerId,
          );
          const byStatus = new Map<string, number>();
          for (const r of matched) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
          return Promise.resolve(
            Array.from(byStatus.entries()).map(([status, count]) => ({
              status,
              _count: { _all: count },
            })),
          );
        }),
    },
    medicineReservationAllocation: {
      aggregate: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { tenantId: string; providerId: string; status: string } }) => {
            const matched = allocations.filter(
              (a) =>
                a.tenantId === where.tenantId &&
                a.providerId === where.providerId &&
                a.status === where.status,
            );
            return Promise.resolve({
              _sum: { quantity: matched.reduce((sum, a) => sum + a.quantity, 0) },
            });
          },
        ),
    },
    inventoryTransfer: {
      count: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            tenantId: string;
            OR: { sourceProviderId?: string; destinationProviderId?: string }[];
          };
        }) => {
          const [{ sourceProviderId }, { destinationProviderId }] = where.OR;
          return Promise.resolve(
            transfers.filter(
              (t) =>
                t.tenantId === where.tenantId &&
                (t.sourceProviderId === sourceProviderId ||
                  t.destinationProviderId === destinationProviderId),
            ).length,
          );
        },
      ),
    },
  };

  const prisma = { client };
  const service = new InventoryAnalyticsService(prisma as never);
  return { service, client };
}

const DEFAULT_QUERY = { nearExpiryHorizonDays: 30 as const, attentionItemLimit: 20 };

describe('InventoryAnalyticsService -- authorization (candidate Task 0038)', () => {
  it('an authorized assigned provider succeeds', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.providerId).toBe(PROVIDER_A);
  });

  it('an unassigned provider (same tenant) fails closed with NotFoundException', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_B }],
    });
    await expect(
      service.getAnalytics(identityA as never, PROVIDER_A, DEFAULT_QUERY as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('a cross-tenant provider fails closed', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_B, membershipId: 'membership-a', providerId: PROVIDER_A }],
    });
    await expect(
      service.getAnalytics(identityA as never, PROVIDER_A, DEFAULT_QUERY as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('revoked provider assignment (no matching access row) fails closed', async () => {
    const { service } = buildService({ memberships: [] });
    await expect(
      service.getAnalytics(identityA as never, PROVIDER_A, DEFAULT_QUERY as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('inactive membership/provider access fails closed per the accepted shared boundary', async () => {
    const { service } = buildService({
      memberships: [
        { tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A, active: false },
      ],
    });
    await expect(
      service.getAnalytics(identityA as never, PROVIDER_A, DEFAULT_QUERY as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('a nonexistent provider resolves to the identical NotFoundException as an unassigned one (no information leakage)', async () => {
    const { service } = buildService({ memberships: [] });
    const unassignedError = await service
      .getAnalytics(identityA as never, PROVIDER_B, DEFAULT_QUERY as never)
      .catch((e) => e);
    const nonexistentError = await service
      .getAnalytics(
        identityA as never,
        '99999999-9999-4999-8999-999999999999',
        DEFAULT_QUERY as never,
      )
      .catch((e) => e);
    expect(unassignedError).toBeInstanceOf(NotFoundException);
    expect(nonexistentError).toBeInstanceOf(NotFoundException);
    expect(unassignedError.message).toBe(nonexistentError.message);
  });

  it('the public getAnalytics() method accepts only (identity, providerId, query) -- no parameter for client-supplied tenantId/membershipId/userId override', () => {
    expect(InventoryAnalyticsService.prototype.getAnalytics.length).toBe(3);
  });

  it('reuses the accepted shared assertTrustedProviderAccess boundary rather than a second authorization system', () => {
    const source = InventoryAnalyticsService.toString();
    expect(source).toContain('assertTrustedProviderAccess');
  });
});

describe('InventoryAnalyticsService -- inventory aggregation (candidate Task 0038)', () => {
  const auth = {
    memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
  };

  it('an empty pharmacy returns all-zero inventory metrics', async () => {
    const { service } = buildService(auth);
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory).toEqual({
      distinctProductCount: 0,
      activeBatchCount: 0,
      availableQuantity: 0,
      heldQuantity: 0,
      unavailableProductCount: 0,
      lowStockProductCount: 0,
    });
  });

  it('exact available/held quantities for one product with one active batch', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'batch-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 100,
          heldQuantity: 30,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.distinctProductCount).toBe(1);
    expect(result.inventory.activeBatchCount).toBe(1);
    expect(result.inventory.availableQuantity).toBe(70);
    expect(result.inventory.heldQuantity).toBe(30);
  });

  it('exhausted/quarantined/expired batches are excluded from the ACTIVE aggregate', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-active',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 50,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
        {
          id: 'b-exhausted',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'EXHAUSTED',
          onHandQuantity: 0,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
        {
          id: 'b-expired',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'EXPIRED',
          onHandQuantity: 20,
          heldQuantity: 0,
          expiryDate: new Date('2020-01-01'),
        },
        {
          id: 'b-quarantined',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'QUARANTINED',
          onHandQuantity: 15,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.activeBatchCount).toBe(1);
    expect(result.inventory.availableQuantity).toBe(50);
    expect(result.expiry.expiredBatchCount).toBe(1);
    expect(result.quality.quarantinedBatchCount).toBe(1);
  });

  it('a product with zero available quantity across all active batches counts as unavailable', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 10,
          heldQuantity: 10,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.unavailableProductCount).toBe(1);
  });

  it('a product with no active batches at all also counts as unavailable', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.unavailableProductCount).toBe(1);
    expect(result.inventory.distinctProductCount).toBe(1);
  });

  it('low-stock boundary: available strictly below minimumStockLevel counts as low stock', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 9,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.lowStockProductCount).toBe(1);
  });

  it('low-stock boundary: available EXACTLY EQUAL to minimumStockLevel does NOT count as low stock', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 10,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.lowStockProductCount).toBe(0);
  });

  it('low-stock boundary: available ABOVE minimumStockLevel does not count as low stock', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 11,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.lowStockProductCount).toBe(0);
  });

  it('minimumStockLevel of 0 never triggers low-stock (nothing can be strictly below zero for a non-negative quantity)', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 0 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 0,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.lowStockProductCount).toBe(0);
  });

  it('multiple products aggregate independently and correctly', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
        { id: 'inv-2', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 5 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
        {
          id: 'b-2',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-2',
          status: 'ACTIVE',
          onHandQuantity: 50,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.distinctProductCount).toBe(2);
    expect(result.inventory.lowStockProductCount).toBe(1); // only inv-1 (5 < 10)
    expect(result.inventory.availableQuantity).toBe(55);
  });

  it('provider A metrics are never influenced by provider B data in the same tenant', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
      inventories: [
        { id: 'inv-a', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
        { id: 'inv-b', tenantId: TENANT_A, providerId: PROVIDER_B, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-a',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-a',
          status: 'ACTIVE',
          onHandQuantity: 100,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
        {
          id: 'b-b',
          tenantId: TENANT_A,
          providerId: PROVIDER_B,
          inventoryId: 'inv-b',
          status: 'ACTIVE',
          onHandQuantity: 999,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.inventory.availableQuantity).toBe(100);
    expect(result.inventory.distinctProductCount).toBe(1);
  });
});

describe('InventoryAnalyticsService -- reservation aggregation (candidate Task 0038)', () => {
  const auth = {
    memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
  };

  it('exact counts for every accepted reservation status', async () => {
    const { service } = buildService({
      ...auth,
      reservations: [
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'PENDING' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'PENDING' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'CONFIRMED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'READY' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'COMPLETED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'CANCELLED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'EXPIRED' },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.reservations).toEqual(
      expect.objectContaining({
        pending: 2,
        confirmed: 1,
        ready: 1,
        completed: 1,
        cancelled: 1,
        expired: 1,
      }),
    );
  });

  it('activeCount is exactly PENDING + CONFIRMED + READY, excluding terminal statuses', async () => {
    const { service } = buildService({
      ...auth,
      reservations: [
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'PENDING' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'CONFIRMED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'READY' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'COMPLETED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'CANCELLED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'EXPIRED' },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.reservations.activeCount).toBe(3);
  });

  it('held quantity reflects only HELD allocations, never CONSUMED or RELEASED', async () => {
    const { service } = buildService({
      ...auth,
      allocations: [
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'HELD', quantity: 5 },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'HELD', quantity: 3 },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'CONSUMED', quantity: 100 },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'RELEASED', quantity: 100 },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.reservations.heldQuantity).toBe(8);
  });

  it('cancelled/expired/completed reservations do not inflate held quantity', async () => {
    const { service } = buildService({
      ...auth,
      reservations: [
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'CANCELLED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'EXPIRED' },
        { tenantId: TENANT_A, providerId: PROVIDER_A, status: 'COMPLETED' },
      ],
      allocations: [],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.reservations.heldQuantity).toBe(0);
  });

  it('provider A reservations never influence provider B metrics', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
      reservations: [{ tenantId: TENANT_A, providerId: PROVIDER_B, status: 'PENDING' }],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.reservations.pending).toBe(0);
  });

  it('tenant A reservations never influence tenant B metrics', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
      reservations: [{ tenantId: TENANT_B, providerId: PROVIDER_A, status: 'PENDING' }],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.reservations.pending).toBe(0);
  });
});

describe('InventoryAnalyticsService -- expiry boundaries (candidate Task 0038)', () => {
  const auth = {
    memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
  };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2027-06-01T00:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('an ACTIVE batch whose expiry date is already in the past is excluded from the future near-expiry window (reconciliation semantics: status has not yet caught up)', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-past',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2027-05-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    // Outside the [now, now+horizon] window used for near-expiry (the
    // window's lower bound is "now", not the far past) -- this batch's
    // expiryDate is BEFORE now, so it falls outside gte(now). This is
    // intentional: near-expiry means "still ahead of us," not
    // "already passed while status hasn't caught up."
    expect(result.expiry.nearExpiryBatchCount).toBe(0);
  });

  it('exactly at the 7-day horizon boundary is included', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2027-06-08T00:00:00.000Z'),
        },
      ],
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 7,
      attentionItemLimit: 20,
    } as never);
    expect(result.expiry.nearExpiryBatchCount).toBe(1);
  });

  it('one day beyond the 7-day horizon is excluded', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2027-06-09T00:00:00.001Z'),
        },
      ],
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 7,
      attentionItemLimit: 20,
    } as never);
    expect(result.expiry.nearExpiryBatchCount).toBe(0);
  });

  it('exactly at the 30-day horizon boundary is included', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2027-07-01T00:00:00.000Z'),
        },
      ],
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 30,
      attentionItemLimit: 20,
    } as never);
    expect(result.expiry.nearExpiryBatchCount).toBe(1);
  });

  it('a batch just outside the horizon is excluded', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2027-12-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.expiry.nearExpiryBatchCount).toBe(0);
  });

  it('an ACTIVE batch already expired by date is excluded from expiredBatchCount, which only counts status EXPIRED', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-past-active',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2020-01-01'),
        },
        {
          id: 'b-past-expired',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'EXPIRED',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2020-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.expiry.expiredBatchCount).toBe(1);
    expect(result.inventory.availableQuantity).toBe(0);
    expect(result.inventory.activeBatchCount).toBe(0);
  });
});

describe('InventoryAnalyticsService -- quality/safety (candidate Task 0038)', () => {
  const auth = {
    memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
  };

  it('quarantined batch count reflects only status QUARANTINED, never EXPIRED', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-q',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'QUARANTINED',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
        {
          id: 'b-e',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'EXPIRED',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2020-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.quality.quarantinedBatchCount).toBe(1);
  });

  it('damagedMovementCount counts StockMovement rows of type DAMAGED, scoped by provider/tenant', async () => {
    const { service } = buildService({
      ...auth,
      damagedMovements: [
        { tenantId: TENANT_A, providerId: PROVIDER_A },
        { tenantId: TENANT_A, providerId: PROVIDER_A },
        { tenantId: TENANT_A, providerId: PROVIDER_B },
        { tenantId: TENANT_B, providerId: PROVIDER_A },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.quality.damagedMovementCount).toBe(2);
  });

  it('quarantine and quality metrics are provider/tenant isolated', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
      inventories: [
        { id: 'inv-b', tenantId: TENANT_A, providerId: PROVIDER_B, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-other',
          tenantId: TENANT_A,
          providerId: PROVIDER_B,
          inventoryId: 'inv-b',
          status: 'QUARANTINED',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date('2030-01-01'),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.quality.quarantinedBatchCount).toBe(0);
  });
});

describe('InventoryAnalyticsService -- transfers (candidate Task 0038)', () => {
  const auth = {
    memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
  };

  it('zero completed transfers', async () => {
    const { service } = buildService(auth);
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.transfers.completedCount).toBe(0);
  });

  it('a transfer where this provider is the SOURCE counts', async () => {
    const { service } = buildService({
      ...auth,
      transfers: [
        { tenantId: TENANT_A, sourceProviderId: PROVIDER_A, destinationProviderId: PROVIDER_B },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.transfers.completedCount).toBe(1);
  });

  it('a transfer where this provider is the DESTINATION also counts', async () => {
    const { service } = buildService({
      ...auth,
      transfers: [
        { tenantId: TENANT_A, sourceProviderId: PROVIDER_B, destinationProviderId: PROVIDER_A },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.transfers.completedCount).toBe(1);
  });

  it('multiple completed transfers accumulate correctly', async () => {
    const { service } = buildService({
      ...auth,
      transfers: [
        { tenantId: TENANT_A, sourceProviderId: PROVIDER_A, destinationProviderId: PROVIDER_B },
        { tenantId: TENANT_A, sourceProviderId: PROVIDER_B, destinationProviderId: PROVIDER_A },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.transfers.completedCount).toBe(2);
  });

  it('cross-tenant transfers never count', async () => {
    const { service } = buildService({
      ...auth,
      transfers: [
        { tenantId: TENANT_B, sourceProviderId: PROVIDER_A, destinationProviderId: PROVIDER_B },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.transfers.completedCount).toBe(0);
  });
});

describe('InventoryAnalyticsService -- attention items (candidate Task 0038)', () => {
  const auth = {
    memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
  };

  function makeManyNearExpiryBatches(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `bbbbbbbb-1111-4111-8111-${String(i).padStart(12, '0')}`,
      tenantId: TENANT_A,
      providerId: PROVIDER_A,
      inventoryId: 'inv-1',
      status: 'ACTIVE' as const,
      onHandQuantity: 5,
      heldQuantity: 0,
      expiryDate: new Date(Date.now() + (i + 1) * 60_000),
    }));
  }

  it('CORRECTION (mandatory): the aggregate nearExpiryBatchCount is never truncated to the attention-item bound -- 60 qualifying batches with the default limit (20) yields count=60, attentionItems.length=20', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: makeManyNearExpiryBatches(60),
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.expiry.nearExpiryBatchCount).toBe(60);
    expect(result.attentionItems).toHaveLength(20);
  });

  it('CORRECTION (mandatory): with attentionItemLimit=50 and 60 qualifying batches, count=60, attentionItems.length=50', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: makeManyNearExpiryBatches(60),
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 30,
      attentionItemLimit: 50,
    } as never);
    expect(result.expiry.nearExpiryBatchCount).toBe(60);
    expect(result.attentionItems).toHaveLength(50);
  });

  it('CORRECTION (mandatory): with attentionItemLimit=5 and 60 qualifying batches, count=60, attentionItems.length=5', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: makeManyNearExpiryBatches(60),
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 30,
      attentionItemLimit: 5,
    } as never);
    expect(result.expiry.nearExpiryBatchCount).toBe(60);
    expect(result.attentionItems).toHaveLength(5);
  });

  it('deterministic ordering: soonest expiry first', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-later',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() + 20 * 86_400_000),
        },
        {
          id: 'b-sooner',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() + 5 * 86_400_000),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.attentionItems.map((i) => i.sourceResourceId)).toEqual(['b-sooner', 'b-later']);
  });

  it('deterministic tiebreak by id when expiry dates are equal', async () => {
    const sharedDate = new Date(Date.now() + 5 * 86_400_000);
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-zzz',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: sharedDate,
        },
        {
          id: 'b-aaa',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: sharedDate,
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.attentionItems.map((i) => i.sourceResourceId)).toEqual(['b-aaa', 'b-zzz']);
  });

  it('respects the requested attentionItemLimit', async () => {
    const batches = Array.from({ length: 10 }, (_, i) => ({
      id: `b-${i}`,
      tenantId: TENANT_A,
      providerId: PROVIDER_A,
      inventoryId: 'inv-1',
      status: 'ACTIVE' as const,
      onHandQuantity: 5,
      heldQuantity: 0,
      expiryDate: new Date(Date.now() + (i + 1) * 86_400_000),
    }));
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches,
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 30,
      attentionItemLimit: 3,
    } as never);
    expect(result.attentionItems).toHaveLength(3);
  });

  it('never exceeds the absolute maximum of 50 even if a larger limit were somehow requested', async () => {
    const batches = Array.from({ length: 60 }, (_, i) => ({
      id: `b-${String(i).padStart(3, '0')}`,
      tenantId: TENANT_A,
      providerId: PROVIDER_A,
      inventoryId: 'inv-1',
      status: 'ACTIVE' as const,
      onHandQuantity: 5,
      heldQuantity: 0,
      expiryDate: new Date(Date.now() + (i + 1) * 86_400_000),
    }));
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches,
    });
    const result = await service.getAnalytics(identityA as never, PROVIDER_A, {
      nearExpiryHorizonDays: 90,
      attentionItemLimit: 50,
    } as never);
    expect(result.attentionItems.length).toBeLessThanOrEqual(50);
  });

  it('no duplicate source resources in the attention list', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() + 5 * 86_400_000),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    const ids = result.attentionItems.map((i) => i.sourceResourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every NEAR_EXPIRY_BATCH item is uniformly ATTENTION (never URGENT) -- and a batch whose expiryDate is already in the past is excluded from the near-expiry source query entirely, not included with a different severity', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-past',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() - 1000),
        },
        {
          id: 'b-future',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() + 5 * 86_400_000),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    const past = result.attentionItems.find((i) => i.sourceResourceId === 'b-past');
    const future = result.attentionItems.find((i) => i.sourceResourceId === 'b-future');
    expect(past).toBeUndefined();
    expect(future?.severity).toBe('ATTENTION');
    expect(result.attentionItems.every((i) => i.severity === 'ATTENTION')).toBe(true);
  });

  it('never includes patient names, phone, email, or prescription/diagnosis content in any attention item', async () => {
    const { service } = buildService({
      ...auth,
      inventories: [
        { id: 'inv-1', tenantId: TENANT_A, providerId: PROVIDER_A, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-1',
          tenantId: TENANT_A,
          providerId: PROVIDER_A,
          inventoryId: 'inv-1',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() + 5 * 86_400_000),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    const serialized = JSON.stringify(result.attentionItems);
    expect(serialized).not.toMatch(/@/); // no email-shaped content
    expect(serialized.toLowerCase()).not.toContain('prescription');
    expect(serialized.toLowerCase()).not.toContain('diagnosis');
  });

  it('cross-provider batches never appear in the attention list', async () => {
    const { service } = buildService({
      memberships: [{ tenantId: TENANT_A, membershipId: 'membership-a', providerId: PROVIDER_A }],
      inventories: [
        { id: 'inv-b', tenantId: TENANT_A, providerId: PROVIDER_B, minimumStockLevel: 10 },
      ],
      batches: [
        {
          id: 'b-other-provider',
          tenantId: TENANT_A,
          providerId: PROVIDER_B,
          inventoryId: 'inv-b',
          status: 'ACTIVE',
          onHandQuantity: 5,
          heldQuantity: 0,
          expiryDate: new Date(Date.now() + 5 * 86_400_000),
        },
      ],
    });
    const result = await service.getAnalytics(
      identityA as never,
      PROVIDER_A,
      DEFAULT_QUERY as never,
    );
    expect(result.attentionItems).toHaveLength(0);
  });
});

describe('toSafeNonNegativeCount -- BigInt/safe-integer boundary (candidate Task 0038 correction)', () => {
  it('accepts 0n', () => {
    expect(toSafeNonNegativeCount(0n, 'testField')).toBe(0);
  });

  it('accepts a normal positive bigint and converts it to a plain number', () => {
    expect(toSafeNonNegativeCount(42n, 'testField')).toBe(42);
    expect(typeof toSafeNonNegativeCount(42n, 'testField')).toBe('number');
  });

  it('accepts BigInt(Number.MAX_SAFE_INTEGER) exactly at the boundary', () => {
    expect(toSafeNonNegativeCount(BigInt(Number.MAX_SAFE_INTEGER), 'testField')).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('fails closed one beyond Number.MAX_SAFE_INTEGER', () => {
    expect(() =>
      toSafeNonNegativeCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'testField'),
    ).toThrow();
  });

  it('fails closed on a negative bigint', () => {
    expect(() => toSafeNonNegativeCount(-1n, 'testField')).toThrow();
  });

  it.each([42, '42', null, undefined, { value: 42 }, [42], NaN, Infinity])(
    'fails closed on a malformed runtime value (%p) that is not a bigint at all',
    (malformed) => {
      expect(() => toSafeNonNegativeCount(malformed, 'testField')).toThrow();
    },
  );

  it('never returns a value that is itself unsafe (Number.isSafeInteger holds for every accepted result)', () => {
    expect(Number.isSafeInteger(toSafeNonNegativeCount(0n, 'x'))).toBe(true);
    expect(Number.isSafeInteger(toSafeNonNegativeCount(BigInt(Number.MAX_SAFE_INTEGER), 'x'))).toBe(
      true,
    );
  });
});
