import { randomUUID } from 'node:crypto';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.18 PostgreSQL assigned-provider expiry worklist', () => {
  const prisma = new PrismaService();
  const service = new InventoryService(new InventoryRepository(prisma));
  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const unassignedUserId = randomUUID();
  const unassignedMembershipId = randomUUID();
  const providerId = randomUUID();
  const productId = randomUUID();
  const inventoryId = randomUUID();
  const dueBatchId = randomUUID();
  const identity: AuthenticatedIdentity = {
    userId,
    membershipId,
    tenantId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const unassignedIdentity: AuthenticatedIdentity = {
    userId: unassignedUserId,
    membershipId: unassignedMembershipId,
    tenantId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.18 expiry tenant', slug: `g318-${tenantId}` },
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Expiry',
          lastName: 'Reader',
        },
        {
          id: unassignedUserId,
          email: `${unassignedUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Unassigned',
          lastName: 'Reader',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
        {
          id: unassignedMembershipId,
          tenantId,
          userId: unassignedUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'G3.18 Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${providerId}@medsphere.test`,
        phone: '0000000000',
        address: 'Fixture address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13.0827,
        longitude: 80.2707,
        isVerified: true,
      },
    });
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'G3.18 Medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });
    await prisma.client.inventory.create({
      data: {
        id: inventoryId,
        tenantId,
        providerId,
        productId,
        sku: 'G318-001',
        sellingPrice: '100.00',
        mrp: '120.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
        isVisible: true,
      },
    });
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
    const now = Date.now();
    await prisma.client.batch.createMany({
      data: [
        {
          id: dueBatchId,
          tenantId,
          inventoryId,
          providerId,
          productId,
          batchNumber: 'DUE',
          expiryDate: new Date(now + 2 * 86_400_000),
          receivedQuantity: 10,
          onHandQuantity: 10,
          heldQuantity: 3,
          purchasePrice: '80.00',
          sellingPrice: '100.00',
        },
        {
          id: randomUUID(),
          tenantId,
          inventoryId,
          providerId,
          productId,
          batchNumber: 'OUTSIDE-HORIZON',
          expiryDate: new Date(now + 60 * 86_400_000),
          receivedQuantity: 10,
          onHandQuantity: 10,
          purchasePrice: '80.00',
          sellingPrice: '100.00',
        },
        {
          id: randomUUID(),
          tenantId,
          inventoryId,
          providerId,
          productId,
          batchNumber: 'QUARANTINED',
          expiryDate: new Date(now + 3 * 86_400_000),
          receivedQuantity: 10,
          onHandQuantity: 10,
          purchasePrice: '80.00',
          sellingPrice: '100.00',
          status: 'QUARANTINED',
        },
      ],
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('returns only active future on-hand batches inside the requested horizon', async () => {
    const result = await service.listExpiryWorklist(identity, providerId, {
      horizonDays: 30,
      limit: 25,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.data).toEqual([
      expect.objectContaining({
        batchId: dueBatchId,
        batchNumber: 'DUE',
        onHandQuantity: 10,
        heldQuantity: 3,
        availableQuantity: 7,
      }),
    ]);
    expect(result.horizonEndsAt.getTime() - result.asOf.getTime()).toBe(30 * 86_400_000);
  });

  it('conceals the provider from an unassigned membership', async () => {
    await expect(
      service.listExpiryWorklist(unassignedIdentity, providerId, {
        horizonDays: 30,
        limit: 25,
        offset: 0,
      }),
    ).rejects.toThrow('Provider expiry worklist not found');
  });
});
