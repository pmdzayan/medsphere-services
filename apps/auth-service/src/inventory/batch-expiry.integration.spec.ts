import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { BatchExpiryService } from './batch-expiry.service';

const describeInfrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

const config = {
  batchSize: 10,
  maximumRecords: 50,
  maximumReservationsPerBatch: 20,
  maximumAllocationsPerBatch: 100,
};

describeInfrastructure('G3.10 PostgreSQL physical batch expiry integrity', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const providerId = randomUUID();
  const service = new BatchExpiryService(prisma, new AuditWriter());

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.10 expiry tenant', slug: `g310-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Batch',
        lastName: 'Expiry',
      },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'G3.10 Pharmacy',
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
  });

  afterAll(async () => prisma.client.$disconnect());

  it('preserves physical quantity, creates no movement, and records one immutable expiry', async () => {
    const fixture = await createStock(0, true);
    await expect(service.run(config)).resolves.toMatchObject({ reconciled: 1, failed: 0 });
    const [batch, record, audit, movements] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
      prisma.client.batchExpiryRecord.findUniqueOrThrow({ where: { batchId: fixture.batchId } }),
      prisma.client.auditEvent.findFirstOrThrow({
        where: { eventType: 'inventory.batch.expired', resourceId: fixture.batchId },
      }),
      prisma.client.stockMovement.count({ where: { batchId: fixture.batchId } }),
    ]);
    expect(batch).toMatchObject({ status: 'EXPIRED', onHandQuantity: 20, heldQuantity: 0 });
    expect(record).toMatchObject({ onHandQuantity: 20, resultingBatchVersion: 2 });
    expect(record.createdAt.getTime()).toBe(record.reconciledAt.getTime());
    expect(audit.occurredAt.getTime()).toBe(record.reconciledAt.getTime());
    expect(movements).toBe(0);
    await expect(
      prisma.client.batchExpiryRecord.update({
        where: { batchId: fixture.batchId },
        data: { onHandQuantity: 0 },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('expires a multi-batch reservation once and releases every hold atomically', async () => {
    const due = await createStock(3, true);
    const future = await createStock(2, false, due.productId);
    const reservationId = randomUUID();
    const itemId = randomUUID();
    const createdAt = new Date(Date.now() - 1_000);
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId: userId,
        status: 'CONFIRMED',
        createdAt,
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        idempotencyKey: `g310-${reservationId}`,
        creationHash: 'a'.repeat(64),
      },
    });
    await prisma.client.medicineReservationItem.create({
      data: {
        id: itemId,
        tenantId,
        reservationId,
        providerId,
        productId: due.productId,
        quantity: 5,
      },
    });
    await prisma.client.medicineReservationAllocation.createMany({
      data: [
        allocation(reservationId, itemId, due, 3),
        allocation(reservationId, itemId, future, 2),
      ],
    });

    await expect(service.run(config)).resolves.toMatchObject({
      reconciled: 1,
      affectedReservations: 1,
      releasedUnits: 5,
      failed: 0,
    });
    const [reservation, allocations, dueBatch, futureBatch, commands, movements, audit] =
      await Promise.all([
        prisma.client.medicineReservation.findUniqueOrThrow({ where: { id: reservationId } }),
        prisma.client.medicineReservationAllocation.findMany({ where: { reservationId } }),
        prisma.client.batch.findUniqueOrThrow({ where: { id: due.batchId } }),
        prisma.client.batch.findUniqueOrThrow({ where: { id: future.batchId } }),
        prisma.client.medicineReservationCommand.count({ where: { reservationId } }),
        prisma.client.stockMovement.count({ where: { referenceId: reservationId } }),
        prisma.client.auditEvent.findFirstOrThrow({
          where: { eventType: 'inventory.reservation.expired', resourceId: reservationId },
        }),
      ]);
    expect(reservation).toMatchObject({ status: 'EXPIRED', version: 2 });
    expect(allocations.every(({ status }) => status === 'RELEASED')).toBe(true);
    expect(dueBatch).toMatchObject({ status: 'EXPIRED', onHandQuantity: 20, heldQuantity: 0 });
    expect(futureBatch).toMatchObject({ status: 'ACTIVE', onHandQuantity: 20, heldQuantity: 0 });
    expect(commands).toBe(1);
    expect(movements).toBe(0);
    expect(audit.metadata).toMatchObject({ cause: 'BATCH_EXPIRY' });
  });

  it('allows only one reconciliation when workers overlap', async () => {
    const fixture = await createStock(0, true);
    const outcomes = await Promise.all([service.run(config), service.run(config)]);
    expect(outcomes.reduce((sum, outcome) => sum + outcome.reconciled, 0)).toBe(1);
    expect(outcomes.reduce((sum, outcome) => sum + outcome.failed, 0)).toBe(0);
    await expect(
      prisma.client.batchExpiryRecord.count({ where: { batchId: fixture.batchId } }),
    ).resolves.toBe(1);
  });

  function allocation(
    reservationId: string,
    itemId: string,
    stock: { productId: string; inventoryId: string; batchId: string },
    quantity: number,
  ) {
    return {
      id: randomUUID(),
      tenantId,
      reservationId,
      itemId,
      inventoryId: stock.inventoryId,
      batchId: stock.batchId,
      providerId,
      productId: stock.productId,
      quantity,
    };
  }

  async function createStock(heldQuantity: number, due: boolean, existingProductId?: string) {
    const productId = existingProductId ?? randomUUID();
    if (!existingProductId) {
      await prisma.client.product.create({
        data: {
          id: productId,
          name: 'G3.10 Medicine',
          brand: 'Fixture Brand',
          category: 'MEDICINE',
          manufacturer: 'Fixture Manufacturer',
          dosageForm: 'TABLET',
          strength: '10 mg',
        },
      });
    }
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    await prisma.client.inventory.create({
      data: {
        id: inventoryId,
        tenantId,
        providerId,
        productId,
        sellingPrice: '120.00',
        mrp: '135.00',
        discountPercentage: '0.00',
        taxPercentage: '0.00',
        minimumStockLevel: 1,
      },
    });
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId,
        inventoryId,
        providerId,
        productId,
        batchNumber: `G310-${batchId}`,
        expiryDate: new Date(Date.now() + (due ? -60_000 : 86_400_000)),
        receivedQuantity: 20,
        onHandQuantity: 20,
        heldQuantity,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });
    return { productId, inventoryId, batchId };
  }
});
