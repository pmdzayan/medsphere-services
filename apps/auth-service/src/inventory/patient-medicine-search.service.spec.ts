import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PatientMedicineSearchService } from './patient-medicine-search.service';

const identity = {
  userId: '10000000-0000-4000-8000-000000000001',
  membershipId: '10000000-0000-4000-8000-000000000002',
  tenantId: '10000000-0000-4000-8000-000000000003',
  sessionId: '10000000-0000-4000-8000-000000000004',
  securityVersion: 1,
  tokenId: '10000000-0000-4000-8000-000000000005',
};

function listing(index = 1) {
  const suffix = String(index).padStart(12, '0');
  return {
    providerId: `20000000-0000-4000-8000-${suffix}`,
    productId: `30000000-0000-4000-8000-${suffix}`,
    provider: {
      tenantId: `40000000-0000-4000-8000-${suffix}`,
      businessName: `Pharmacy ${index}`,
      city: 'Vaniyambadi',
      state: 'Tamil Nadu',
      latitude: 12.6816,
      longitude: 78.6201,
    },
    product: {
      name: 'Paracetamol',
      genericName: 'Paracetamol',
      brand: 'AIM Test',
      strength: '500 mg',
      dosageForm: 'TABLET',
      requiresPrescription: false,
    },
  };
}

function createHarness() {
  const database = {
    tenantMembership: { findFirst: jest.fn().mockResolvedValue({ id: identity.membershipId }) },
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: identity.tenantId }) },
    inventory: { findMany: jest.fn().mockResolvedValue([listing()]) },
  };
  const reconciliation = {
    resolveProviderProducts: jest.fn().mockImplementation(
      async (_tenantId: string, _providerId: string, productIds: string[]) =>
        new Map(
          productIds.map((productId) => [
            productId,
            {
              requestId: null,
              requestStatus: 'NONE',
              requestedAt: null,
              expiresAt: null,
              respondedAt: null,
              availabilityState: 'CONFIRMATION_REQUIRED',
              confirmationSource: null,
              confirmedAt: null,
              retryAfterAt: null,
            },
          ]),
        ),
    ),
  };
  return {
    database,
    reconciliation,
    service: new PatientMedicineSearchService(
      { client: database } as never,
      reconciliation as never,
    ),
  };
}

describe('PatientMedicineSearchService', () => {
  it('requires the accepted personal NONE context before catalog access', async () => {
    const { service, database } = createHarness();
    database.tenant.findFirst.mockResolvedValue(null);
    await expect(
      service.search(identity, { q: 'paracetamol', limit: 20, offset: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.inventory.findMany).not.toHaveBeenCalled();
  });

  it('uses canonical reconciliation and never invents raw-stock availability', async () => {
    const { service, reconciliation } = createHarness();
    const result = await service.search(identity, {
      q: 'paracetamol',
      city: 'Vaniyambadi',
      state: 'Tamil Nadu',
      limit: 20,
      offset: 0,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        availability: 'CONFIRMATION_REQUIRED',
        distanceKm: null,
      }),
    );
    expect(reconciliation.resolveProviderProducts).toHaveBeenCalledTimes(1);
  });

  it('rejects radius without precise coordinates even when it equals the default radius', async () => {
    const { service, database } = createHarness();
    await expect(
      service.search(identity, { q: 'paracetamol', radiusKm: 10, limit: 20, offset: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.inventory.findMany).not.toHaveBeenCalled();
  });

  it('rejects incomplete manual area input before catalog access', async () => {
    const { service, database } = createHarness();
    await expect(
      service.search(identity, { q: 'paracetamol', city: 'Vaniyambadi', limit: 20, offset: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.inventory.findMany).not.toHaveBeenCalled();
  });

  it('fails closed before distance ranking when the precise candidate set exceeds 500', async () => {
    const { service, database, reconciliation } = createHarness();
    database.inventory.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => listing(i + 1)),
    );
    await expect(
      service.search(identity, {
        q: 'paracetamol',
        latitude: 12.6816,
        longitude: 78.6201,
        radiusKm: 10,
        limit: 20,
        offset: 0,
      }),
    ).rejects.toThrow('Too many nearby matches');
    expect(database.inventory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501 }),
    );
    expect(reconciliation.resolveProviderProducts).not.toHaveBeenCalled();
  });
});
