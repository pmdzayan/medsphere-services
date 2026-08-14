import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryQuarantineService } from './inventory-quarantine.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.11 PostgreSQL one-way batch quarantine integrity', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId, membershipId };
  const service = new InventoryQuarantineService(prisma, new AuditWriter());

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.11 quarantine tenant', slug: `g311-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Batch',
        lastName: 'Quarantine',
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'G3.11 Pharmacy',
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
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('preserves physical stock, creates no movement, and records immutable actor evidence', async () => {
    const fixture = await createStock(0);
    const command = quarantineCommand(fixture.batchId, 'QUALITY_SUSPECT');
    const result = await service.quarantine(command);
    expect(result).toMatchObject({
      batchId: fixture.batchId,
      status: 'QUARANTINED',
      reasonCode: 'QUALITY_SUSPECT',
      onHandQuantity: 20,
      affectedReservationCount: 0,
      releasedUnitCount: 0,
      resultingBatchVersion: 2,
      replayed: false,
    });

    const [batch, record, audit, movements, permission] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
      prisma.client.batchQuarantineRecord.findUniqueOrThrow({
        where: { batchId: fixture.batchId },
      }),
      prisma.client.auditEvent.findFirstOrThrow({
        where: { eventType: 'inventory.batch.quarantined', resourceId: fixture.batchId },
      }),
      prisma.client.stockMovement.count({ where: { batchId: fixture.batchId } }),
      prisma.client.permission.findUniqueOrThrow({
        where: { name: 'inventory.batch.quarantine' },
      }),
    ]);
    expect(batch).toMatchObject({
      status: 'QUARANTINED',
      receivedQuantity: 20,
      onHandQuantity: 20,
      heldQuantity: 0,
      version: 2,
    });
    expect(record).toMatchObject({
      actorMembershipId: membershipId,
      reasonCode: 'QUALITY_SUSPECT',
      onHandQuantity: 20,
      affectedReservationCount: 0,
      releasedUnitCount: 0,
      resultingBatchVersion: 2,
    });
    expect(record.createdAt.getTime()).toBe(record.occurredAt.getTime());
    expect(audit).toMatchObject({ actorMembershipId: membershipId, actorType: 'TENANT_USER' });
    expect(audit.occurredAt.getTime()).toBe(record.occurredAt.getTime());
    expect(movements).toBe(0);
    expect(permission.name).toBe('inventory.batch.quarantine');

    await expect(
      prisma.client.batchQuarantineRecord.update({
        where: { batchId: fixture.batchId },
        data: { onHandQuantity: 0 },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('cancels a multi-batch reservation and releases every hold atomically', async () => {
    const due = await createStock(3);
    const future = await createStock(2, due);
    const reservationId = randomUUID();
    const itemId = randomUUID();
    const readyAt = new Date();
    const createdAt = new Date(readyAt.getTime() - 1_000);
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId: userId,
        status: 'READY',
        confirmedAt: readyAt,
        readyAt,
        createdAt,
        expiresAt: new Date(readyAt.getTime() + 86_400_000),
        idempotencyKey: `g311-reservation-${reservationId}`,
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

    await expect(
      service.quarantine(quarantineCommand(due.batchId, 'TEMPERATURE_EXCURSION')),
    ).resolves.toMatchObject({
      affectedReservationCount: 1,
      releasedUnitCount: 5,
      resultingBatchVersion: 3,
    });

    const [reservation, allocations, quarantined, other, commands, cancellationAudit, movements] =
      await Promise.all([
        prisma.client.medicineReservation.findUniqueOrThrow({ where: { id: reservationId } }),
        prisma.client.medicineReservationAllocation.findMany({ where: { reservationId } }),
        prisma.client.batch.findUniqueOrThrow({ where: { id: due.batchId } }),
        prisma.client.batch.findUniqueOrThrow({ where: { id: future.batchId } }),
        prisma.client.medicineReservationCommand.count({ where: { reservationId } }),
        prisma.client.auditEvent.findFirstOrThrow({
          where: { eventType: 'inventory.reservation.cancelled', resourceId: reservationId },
        }),
        prisma.client.stockMovement.count({ where: { referenceId: reservationId } }),
      ]);
    expect(reservation).toMatchObject({ status: 'CANCELLED', version: 2 });
    expect(allocations.every(({ status }) => status === 'RELEASED')).toBe(true);
    expect(quarantined).toMatchObject({
      status: 'QUARANTINED',
      onHandQuantity: 20,
      heldQuantity: 0,
      version: 3,
    });
    expect(other).toMatchObject({
      status: 'ACTIVE',
      onHandQuantity: 20,
      heldQuantity: 0,
      version: 2,
    });
    expect(commands).toBe(1);
    expect(cancellationAudit).toMatchObject({ actorType: 'SYSTEM', actorMembershipId: null });
    expect(cancellationAudit.metadata).toMatchObject({ cause: 'BATCH_QUARANTINE' });
    expect(movements).toBe(0);
  });

  it('returns one immutable receipt when identical commands overlap', async () => {
    const fixture = await createStock(0);
    const command = quarantineCommand(fixture.batchId, 'PACKAGING_COMPROMISED');
    const results = await Promise.all([service.quarantine(command), service.quarantine(command)]);
    expect(results.filter(({ replayed }) => !replayed)).toHaveLength(1);
    expect(results.filter(({ replayed }) => replayed)).toHaveLength(1);
    await expect(
      prisma.client.batchQuarantineRecord.count({ where: { batchId: fixture.batchId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.client.auditEvent.count({
        where: { eventType: 'inventory.batch.quarantined', resourceId: fixture.batchId },
      }),
    ).resolves.toBe(1);
  });

  it('rejects mismatched replay and invalid cross-tenant evidence', async () => {
    const fixture = await createStock(0);
    const original = quarantineCommand(fixture.batchId, 'STORAGE_DEVIATION');
    await service.quarantine(original);
    await expect(
      service.quarantine({ ...original, reasonCode: 'QUALITY_SUSPECT' }),
    ).rejects.toThrow('another command');

    const crossFixture = await createStock(0);
    const otherTenantId = randomUUID();
    await prisma.client.tenant.create({
      data: { id: otherTenantId, name: 'Other G3.11 tenant', slug: `g311-other-${otherTenantId}` },
    });
    const evidenceTime = new Date();
    await expect(
      prisma.client.batchQuarantineRecord.create({
        data: {
          id: randomUUID(),
          tenantId: otherTenantId,
          inventoryId: crossFixture.inventoryId,
          providerId,
          productId: crossFixture.productId,
          batchId: crossFixture.batchId,
          actorMembershipId: membershipId,
          reasonCode: 'QUALITY_SUSPECT',
          onHandQuantity: 20,
          affectedReservationCount: 0,
          releasedUnitCount: 0,
          idempotencyKey: `cross-${randomUUID()}`,
          commandHash: 'b'.repeat(64),
          resultingBatchVersion: 2,
          occurredAt: evidenceTime,
          createdAt: evidenceTime,
        },
      }),
    ).rejects.toThrow();
  });

  function quarantineCommand(
    batchId: string,
    reasonCode:
      'QUALITY_SUSPECT' | 'TEMPERATURE_EXCURSION' | 'PACKAGING_COMPROMISED' | 'STORAGE_DEVIATION',
  ) {
    return {
      actor,
      providerId,
      batchId,
      expectedVersion: 1,
      idempotencyKey: `g311-${randomUUID()}`,
      reasonCode,
    } as const;
  }

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

  async function createStock(
    heldQuantity: number,
    existing?: { productId: string; inventoryId: string },
  ) {
    const productId = existing?.productId ?? randomUUID();
    if (!existing) {
      await prisma.client.product.create({
        data: {
          id: productId,
          name: 'G3.11 Medicine',
          brand: 'Fixture Brand',
          category: 'MEDICINE',
          manufacturer: 'Fixture Manufacturer',
          dosageForm: 'TABLET',
          strength: '10 mg',
        },
      });
    }
    const inventoryId = existing?.inventoryId ?? randomUUID();
    if (!existing) {
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
    }
    const batchId = randomUUID();
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId,
        inventoryId,
        providerId,
        productId,
        batchNumber: `G311-${batchId}`,
        expiryDate: new Date(Date.now() + 86_400_000),
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
