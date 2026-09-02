import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryCommandService } from './inventory-command.service';

const describeInventoryInfrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeInventoryInfrastructure('G3.2 PostgreSQL inventory command integrity', () => {
  const prisma = new PrismaService();
  const service = new InventoryCommandService(prisma, new AuditWriter());
  const tenantId = randomUUID();
  const userId = randomUUID();
  const unassignedUserId = randomUUID();
  const membershipId = randomUUID();
  const unassignedMembershipId = randomUUID();
  const providerId = randomUUID();
  const productId = randomUUID();
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
      data: { id: tenantId, name: 'G3.2 inventory tenant', slug: `g32-${tenantId}` },
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Inventory',
          lastName: 'Operator',
        },
        {
          id: unassignedUserId,
          email: `${unassignedUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Unassigned',
          lastName: 'Operator',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipId,
          tenantId,
          userId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
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
        businessName: 'G3.2 Pharmacy',
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
        name: 'G3.2 Medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('atomically configures a listing, receives a batch, adjusts stock, and records audit evidence', async () => {
    const configured = await service.configureInventory({
      actor: identity,
      providerId,
      productId,
      sku: 'G32-001',
      sellingPrice: '120.00',
      mrp: '135.00',
      discountPercentage: '5.00',
      taxPercentage: '5.00',
      minimumStockLevel: 10,
      isVisible: true,
      idempotencyKey: `configure-${randomUUID()}`,
    });

    const receiptKey = `receive-${randomUUID()}`;
    const received = await service.receiveBatch({
      actor: identity,
      providerId,
      productId,
      batchNumber: `BATCH-${randomUUID()}`,
      manufacturingDate: new Date('2026-01-01T00:00:00.000Z'),
      expiryDate: new Date('2030-01-01T00:00:00.000Z'),
      quantity: 20,
      purchasePrice: '100.00',
      sellingPrice: '120.00',
      idempotencyKey: receiptKey,
    });

    const adjusted = await service.adjustBatch({
      actor: identity,
      providerId,
      batchId: received.batchId,
      expectedVersion: received.batchVersion,
      delta: -2,
      reason: 'Verified integration cycle count',
      idempotencyKey: `adjust-${randomUUID()}`,
    });

    expect(configured).toMatchObject({ version: 1, replayed: false });
    expect(received).toMatchObject({ onHandBefore: 0, onHandAfter: 20, replayed: false });
    expect(adjusted).toMatchObject({ onHandBefore: 20, onHandAfter: 18, batchVersion: 2 });

    const [batch, movementCount, eventTypes] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: received.batchId } }),
      prisma.client.stockMovement.count({ where: { tenantId, batchId: received.batchId } }),
      prisma.client.auditEvent.findMany({
        where: {
          tenantId,
          eventType: {
            in: [
              'inventory.listing.configured',
              'inventory.batch.received',
              'inventory.stock.adjusted',
            ],
          },
        },
        select: { eventType: true },
      }),
    ]);
    expect(batch).toMatchObject({ onHandQuantity: 18, heldQuantity: 0, version: 2 });
    expect(movementCount).toBe(2);
    expect(new Set(eventTypes.map((event) => event.eventType))).toEqual(
      new Set([
        'inventory.listing.configured',
        'inventory.batch.received',
        'inventory.stock.adjusted',
      ]),
    );

    await expect(
      service.receiveBatch({
        actor: unassignedIdentity,
        providerId,
        productId,
        batchNumber: 'CONCEALED-REPLAY',
        expiryDate: new Date('2030-01-01T00:00:00.000Z'),
        quantity: 20,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
        idempotencyKey: receiptKey,
      }),
    ).rejects.toThrow('Provider inventory not found');
  });

  it('allows exactly one winner for concurrent adjustments at the same expected version', async () => {
    const configured = await service.configureInventory({
      actor: identity,
      providerId,
      productId: await createAdditionalProduct(),
      sellingPrice: '50.00',
      mrp: '60.00',
      discountPercentage: '0.00',
      taxPercentage: '5.00',
      minimumStockLevel: 1,
      isVisible: true,
      idempotencyKey: `configure-race-${randomUUID()}`,
    });
    const listing = await prisma.client.inventory.findUniqueOrThrow({
      where: { id: configured.inventoryId },
      select: { productId: true },
    });
    const received = await service.receiveBatch({
      actor: identity,
      providerId,
      productId: listing.productId,
      batchNumber: `RACE-${randomUUID()}`,
      expiryDate: new Date('2030-01-01T00:00:00.000Z'),
      quantity: 10,
      purchasePrice: '40.00',
      sellingPrice: '50.00',
      idempotencyKey: `receive-race-${randomUUID()}`,
    });

    const outcomes = await Promise.allSettled([
      service.adjustBatch({
        actor: identity,
        providerId,
        batchId: received.batchId,
        expectedVersion: 1,
        delta: -1,
        reason: 'Concurrent count A',
        idempotencyKey: `race-a-${randomUUID()}`,
      }),
      service.adjustBatch({
        actor: identity,
        providerId,
        batchId: received.batchId,
        expectedVersion: 1,
        delta: -1,
        reason: 'Concurrent count B',
        idempotencyKey: `race-b-${randomUUID()}`,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: received.batchId } }),
    ).resolves.toMatchObject({ onHandQuantity: 9, version: 2 });
  });

  async function createAdditionalProduct(): Promise<string> {
    const id = randomUUID();
    await prisma.client.product.create({
      data: {
        id,
        name: 'G3.2 Race Medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '20 mg',
      },
    });
    return id;
  }
});
