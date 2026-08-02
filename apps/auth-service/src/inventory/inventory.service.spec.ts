import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const identity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };
  let repository: jest.Mocked<InventoryRepository>;
  let service: InventoryService;

  beforeEach(() => {
    repository = {
      hasProviderAccess: jest.fn(),
      listStock: jest.fn(),
    } as unknown as jest.Mocked<InventoryRepository>;
    service = new InventoryService(repository);
  });

  it('conceals stock when the active membership has no trusted provider assignment', async () => {
    repository.hasProviderAccess.mockResolvedValue(false);

    await expect(
      service.listStock(identity, randomUUID(), { limit: 50, offset: 0 }),
    ).rejects.toThrow(NotFoundException);
    expect(repository.listStock).not.toHaveBeenCalled();
  });

  it('uses trusted tenant context and excludes expired stock from available quantity', async () => {
    const providerId = randomUUID();
    repository.hasProviderAccess.mockResolvedValue(true);
    repository.listStock.mockResolvedValue({
      total: 1,
      data: [
        {
          id: randomUUID(),
          productId: randomUUID(),
          sku: 'MED-001',
          sellingPrice: new Prisma.Decimal('100.00'),
          mrp: new Prisma.Decimal('120.00'),
          isVisible: true,
          product: { name: 'Medicine', genericName: 'Generic', brand: 'Brand' },
          batches: [
            {
              id: randomUUID(),
              batchNumber: 'VALID',
              manufacturingDate: null,
              expiryDate: new Date(Date.now() + 86_400_000),
              status: 'ACTIVE',
              onHandQuantity: 20,
              heldQuantity: 3,
            },
            {
              id: randomUUID(),
              batchNumber: 'EXPIRED',
              manufacturingDate: null,
              expiryDate: new Date(Date.now() - 86_400_000),
              status: 'EXPIRED',
              onHandQuantity: 10,
              heldQuantity: 1,
            },
          ],
        },
      ],
    });

    const result = await service.listStock(identity, providerId, { limit: 25, offset: 0 });

    expect(repository.hasProviderAccess).toHaveBeenCalledWith(identity, providerId);
    expect(repository.listStock).toHaveBeenCalledWith(identity.tenantId, providerId, {
      limit: 25,
      offset: 0,
    });
    expect(result.data[0]).toMatchObject({
      sellingPrice: '100.00',
      mrp: '120.00',
      totalOnHandQuantity: 30,
      totalHeldQuantity: 4,
      totalAvailableQuantity: 17,
      batches: [
        expect.objectContaining({ batchNumber: 'VALID', availableQuantity: 17 }),
        expect.objectContaining({ batchNumber: 'EXPIRED', availableQuantity: 0 }),
      ],
    });
  });
});
