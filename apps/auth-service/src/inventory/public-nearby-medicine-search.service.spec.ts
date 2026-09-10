import {
  calculateDistanceKm,
  PublicNearbyMedicineSearchService,
} from './public-nearby-medicine-search.service';
import type { PublicAvailabilityResolution } from './availability-request.types';

function inventoryListing(overrides: Record<string, unknown> = {}) {
  return {
    providerId: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    provider: {
      tenantId: '00000000-0000-4000-8000-000000000001',
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

function resolution(
  availabilityState: PublicAvailabilityResolution['availabilityState'],
): PublicAvailabilityResolution {
  return {
    requestId: null,
    requestStatus: 'NONE',
    requestedAt: null,
    expiresAt: null,
    respondedAt: null,
    availabilityState,
    confirmationSource: null,
    confirmedAt: null,
    retryAfterAt: null,
  };
}

function createHarness() {
  const inventoryFindMany = jest.fn();
  const resolveProviderProducts = jest.fn();

  const prisma = {
    client: {
      inventory: {
        findMany: inventoryFindMany,
      },
    },
  };

  const reconciliation = {
    resolveProviderProducts,
  };

  const service = new PublicNearbyMedicineSearchService(prisma as never, reconciliation as never);

  return {
    service,
    inventoryFindMany,
    resolveProviderProducts,
  };
}

describe('PublicNearbyMedicineSearchService', () => {
  it('calculates zero distance for the same coordinates', () => {
    expect(calculateDistanceKm(12.9716, 77.5946, 12.9716, 77.5946)).toBeCloseTo(0);
  });

  it('excludes providers outside the requested radius', async () => {
    const { service, inventoryFindMany, resolveProviderProducts } = createHarness();

    inventoryFindMany.mockResolvedValue([
      inventoryListing({
        provider: {
          tenantId: '00000000-0000-4000-8000-000000000001',
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
    expect(resolveProviderProducts).not.toHaveBeenCalled();
  });

  it('orders providers by distance before pagination', async () => {
    const { service, inventoryFindMany, resolveProviderProducts } = createHarness();

    inventoryFindMany.mockResolvedValue([
      inventoryListing({
        providerId: '33333333-3333-4333-8333-333333333333',
        provider: {
          tenantId: '00000000-0000-4000-8000-000000000002',
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
          tenantId: '00000000-0000-4000-8000-000000000003',
          businessName: 'Closer Pharmacy',
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: 12.98,
          longitude: 77.59,
        },
      }),
    ]);

    resolveProviderProducts.mockResolvedValue(
      new Map([['22222222-2222-4222-8222-222222222222', resolution('UNKNOWN')]]),
    );

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

  it('reports AVAILABLE only from the canonical trust resolution', async () => {
    const { service, inventoryFindMany, resolveProviderProducts } = createHarness();

    inventoryFindMany.mockResolvedValue([inventoryListing()]);
    resolveProviderProducts.mockResolvedValue(
      new Map([['22222222-2222-4222-8222-222222222222', resolution('AVAILABLE')]]),
    );

    const result = await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.availability).toBe('AVAILABLE');
  });

  it('never presents UNKNOWN/confirmation-required evidence as confidently available', async () => {
    const { service, inventoryFindMany, resolveProviderProducts } = createHarness();

    inventoryFindMany.mockResolvedValue([
      inventoryListing({ productId: '22222222-2222-4222-8222-222222222222' }),
      inventoryListing({ productId: '77777777-7777-4777-8777-777777777777' }),
    ]);
    resolveProviderProducts.mockResolvedValue(
      new Map([
        ['22222222-2222-4222-8222-222222222222', resolution('CONFIRMATION_REQUIRED')],
        ['77777777-7777-4777-8777-777777777777', resolution('UNKNOWN')],
      ]),
    );

    const result = await service.search({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(result.data.map((row) => row.availability).sort()).toEqual([
      'CONFIRMATION_REQUIRED',
      'UNKNOWN',
    ]);
  });

  it('queries only active verified providers scoped to their tenants', async () => {
    const { service, inventoryFindMany, resolveProviderProducts } = createHarness();

    inventoryFindMany.mockResolvedValue([inventoryListing()]);
    resolveProviderProducts.mockResolvedValue(
      new Map([['22222222-2222-4222-8222-222222222222', resolution('UNKNOWN')]]),
    );

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
    expect(resolveProviderProducts).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      ['22222222-2222-4222-8222-222222222222'],
    );
  });
});
