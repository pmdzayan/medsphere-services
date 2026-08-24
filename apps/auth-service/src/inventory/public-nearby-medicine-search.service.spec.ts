import {
  calculateDistanceKm,
  PublicNearbyMedicineSearchService,
} from './public-nearby-medicine-search.service';

function inventoryListing(overrides: Record<string, unknown> = {}) {
  return {
    providerId: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    provider: {
      businessName: 'Test Pharmacy',
      city: 'Bengaluru',
      state: 'Karnataka',
      latitude: 12.9716,
      longitude: 77.5946,
    },
    product: {
      name: 'Paracetamol',
      genericName: 'Paracetamol',
      brand: 'Test Brand',
      strength: '500 mg',
      dosageForm: 'TABLET',
      requiresPrescription: false,
    },
    ...overrides,
  };
}

function createHarness() {
  const inventoryFindMany = jest.fn();
  const batchGroupBy = jest.fn();

  const prisma = {
    client: {
      inventory: {
        findMany: inventoryFindMany,
      },
      batch: {
        groupBy: batchGroupBy,
      },
    },
  };

  const service = new PublicNearbyMedicineSearchService(prisma as never);

  return {
    service,
    inventoryFindMany,
    batchGroupBy,
  };
}

describe('PublicNearbyMedicineSearchService', () => {
  it('calculates zero distance for the same coordinates', () => {
    expect(calculateDistanceKm(12.9716, 77.5946, 12.9716, 77.5946)).toBeCloseTo(0);
  });

  it('excludes providers outside the requested radius', async () => {
    const { service, inventoryFindMany, batchGroupBy } = createHarness();

    inventoryFindMany.mockResolvedValue([
      inventoryListing({
        provider: {
          businessName: 'Far Pharmacy',
          city: 'Chennai',
          state: 'Tamil Nadu',
          latitude: 13.0827,
          longitude: 80.2707,
        },
      }),
    ]);

    const result = await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(result.data).toEqual([]);
    expect(batchGroupBy).not.toHaveBeenCalled();
  });

  it('orders providers by distance before pagination', async () => {
    const { service, inventoryFindMany, batchGroupBy } = createHarness();

    inventoryFindMany.mockResolvedValue([
      inventoryListing({
        providerId: '33333333-3333-4333-8333-333333333333',
        provider: {
          businessName: 'Farther Pharmacy',
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: 13.05,
          longitude: 77.59,
        },
      }),
      inventoryListing({
        providerId: '44444444-4444-4444-8444-444444444444',
        provider: {
          businessName: 'Closer Pharmacy',
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: 12.98,
          longitude: 77.59,
        },
      }),
    ]);

    batchGroupBy.mockResolvedValue([]);

    const result = await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 50,
      limit: 20,
      offset: 0,
    });

    expect(result.data.map((row) => row.providerName)).toEqual([
      'Closer Pharmacy',
      'Farther Pharmacy',
    ]);
    expect(result.data[0]!.distanceKm).toBeLessThan(result.data[1]!.distanceKm);
  });

  it('reports stock only when active eligible batch quantity remains after holds', async () => {
    const { service, inventoryFindMany, batchGroupBy } = createHarness();

    inventoryFindMany.mockResolvedValue([inventoryListing()]);
    batchGroupBy.mockResolvedValue([
      {
        providerId: '11111111-1111-4111-8111-111111111111',
        productId: '22222222-2222-4222-8222-222222222222',
        _sum: {
          onHandQuantity: 8,
          heldQuantity: 3,
        },
      },
    ]);

    const result = await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.availability).toBe('IN_STOCK');
  });

  it('reports out of stock when held quantity consumes all on-hand stock', async () => {
    const { service, inventoryFindMany, batchGroupBy } = createHarness();

    inventoryFindMany.mockResolvedValue([inventoryListing()]);
    batchGroupBy.mockResolvedValue([
      {
        providerId: '11111111-1111-4111-8111-111111111111',
        productId: '22222222-2222-4222-8222-222222222222',
        _sum: {
          onHandQuantity: 5,
          heldQuantity: 5,
        },
      },
    ]);

    const result = await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(result.data[0]!.availability).toBe('OUT_OF_STOCK');
  });

  it('queries only active verified providers and eligible stock', async () => {
    const { service, inventoryFindMany, batchGroupBy } = createHarness();

    inventoryFindMany.mockResolvedValue([inventoryListing()]);
    batchGroupBy.mockResolvedValue([]);

    await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(inventoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: expect.objectContaining({
            isActive: true,
            isVerified: true,
            deletedAt: null,
            latitude: expect.objectContaining({
              gte: expect.any(Number),
              lte: expect.any(Number),
            }),
            longitude: expect.objectContaining({
              gte: expect.any(Number),
              lte: expect.any(Number),
            }),
          }),
        }),
      }),
    );

    expect(batchGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          expiryDate: { gt: expect.any(Date) },
          provider: {
            isActive: true,
            isVerified: true,
            deletedAt: null,
          },
        }),
      }),
    );
  });
});
