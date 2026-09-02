import { randomUUID } from 'node:crypto';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.20 PostgreSQL assigned-provider quarantine evidence', () => {
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
  const batchId = randomUUID();
  const recordId = randomUUID();
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
      data: { id: tenantId, name: 'G3.20 evidence tenant', slug: `g320-${tenantId}` },
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Evidence',
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
        businessName: 'G3.20 Pharmacy',
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
        name: 'G3.20 Medicine',
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
        sku: 'G320-001',
        sellingPrice: '100.00',
        mrp: '120.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
        isVisible: false,
      },
    });
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId,
        inventoryId,
        providerId,
        productId,
        batchNumber: 'QUARANTINE-EVIDENCE',
        expiryDate: new Date('2030-01-01T00:00:00.000Z'),
        receivedQuantity: 10,
        onHandQuantity: 10,
        heldQuantity: 0,
        purchasePrice: '80.00',
        sellingPrice: '100.00',
        status: 'QUARANTINED',
        version: 2,
      },
    });
    await prisma.client.batchQuarantineRecord.create({
      data: {
        id: recordId,
        tenantId,
        inventoryId,
        providerId,
        productId,
        batchId,
        actorMembershipId: membershipId,
        reasonCode: 'PACKAGING_COMPROMISED',
        onHandQuantity: 10,
        affectedReservationCount: 1,
        releasedUnitCount: 2,
        idempotencyKey: `g320-${randomUUID()}`,
        commandHash: 'a'.repeat(64),
        resultingBatchVersion: 2,
        occurredAt: new Date('2026-08-14T01:00:00.000Z'),
        createdAt: new Date('2026-08-14T01:00:00.000Z'),
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('returns immutable evidence without command secrets', async () => {
    const result = await service.listQuarantineEvidence(identity, providerId, {
      limit: 25,
      offset: 0,
    });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          recordId,
          batchId,
          actorMembershipId: membershipId,
          batchNumber: 'QUARANTINE-EVIDENCE',
          currentStatus: 'QUARANTINED',
          reasonCode: 'PACKAGING_COMPROMISED',
          onHandQuantity: 10,
          affectedReservationCount: 1,
          releasedUnitCount: 2,
          resultingBatchVersion: 2,
        }),
      ],
      total: 1,
      limit: 25,
      offset: 0,
    });
    expect(result.data[0]).not.toHaveProperty('idempotencyKey');
    expect(result.data[0]).not.toHaveProperty('commandHash');
  });

  it('conceals evidence from an unassigned membership', async () => {
    await expect(
      service.listQuarantineEvidence(unassignedIdentity, providerId, { limit: 25, offset: 0 }),
    ).rejects.toThrow('Provider quarantine evidence not found');
  });
});
