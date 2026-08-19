import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { InventoryQuarantineService } from './inventory-quarantine.service';
import { ReservationCreationService } from './reservation-creation.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Post-audit CG-CONC-01 reservation vs unavailable-stock concurrency', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const subjectUserId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId: actorUserId, membershipId };
  const reservations = new ReservationCreationService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );
  const quarantine = new InventoryQuarantineService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'CG-CONC-01 tenant', slug: `cg-conc-01-${tenantId}` },
    });
    await prisma.client.user.createMany({
      data: [actorUserId, subjectUserId].map((id, index) => ({
        id,
        email: `${id}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: index === 0 ? 'Staff' : 'Subject',
        lastName: 'Concurrency',
      })),
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        { id: membershipId, tenantId, userId: actorUserId, status: 'ACTIVE', joinedAt: new Date() },
        {
          id: randomUUID(),
          tenantId,
          userId: subjectUserId,
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
        businessName: 'CG-CONC-01 Pharmacy',
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

  it('leaves one internally consistent winner when reservation creation races batch quarantine', async () => {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    const reservationKey = `cg-conc-01-res-${randomUUID()}`;
    const quarantineKey = `cg-conc-01-quarantine-${randomUUID()}`;

    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'CG-CONC-01 Medicine',
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
        batchNumber: `CG-CONC-01-${batchId}`,
        expiryDate: new Date(Date.now() + 86_400_000),
        receivedQuantity: 5,
        onHandQuantity: 5,
        heldQuantity: 0,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });

    const [reservationResult, quarantineResult] = await Promise.allSettled([
      reservations.create({
        actor,
        providerId,
        subjectUserId,
        expiresAt: new Date(Date.now() + 43_200_000),
        items: [{ productId, quantity: 5 }],
        idempotencyKey: reservationKey,
      }),
      quarantine.quarantine({
        actor,
        providerId,
        batchId,
        expectedVersion: 1,
        idempotencyKey: quarantineKey,
        reasonCode: 'QUALITY_SUSPECT',
      }),
    ]);

    const fulfilled = [reservationResult, quarantineResult].filter(
      (result) => result.status === 'fulfilled',
    );
    const rejected = [reservationResult, quarantineResult].filter(
      (result) => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: expect.any(ConflictException) });

    const [batch, persistedReservations, allocations, quarantineRecords, audits, outboxEvents, movements] =
      await Promise.all([
        prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
        prisma.client.medicineReservation.findMany({
          where: { tenantId, idempotencyKey: reservationKey },
          select: { id: true, status: true, version: true },
        }),
        prisma.client.medicineReservationAllocation.findMany({
          where: { tenantId, batchId },
          select: { reservationId: true, batchId: true, quantity: true, status: true },
        }),
        prisma.client.batchQuarantineRecord.findMany({
          where: { tenantId, idempotencyKey: quarantineKey },
        }),
        prisma.client.auditEvent.findMany({
          where: {
            tenantId,
            eventType: { in: ['inventory.reservation.created', 'inventory.batch.quarantined'] },
          },
          select: { eventType: true, resourceId: true },
        }),
        prisma.client.outboxEvent.findMany({
          where: {
            tenantId,
            eventType: { in: ['inventory.reservation.created', 'inventory.batch.quarantined'] },
          },
          select: { eventType: true, aggregateId: true },
        }),
        prisma.client.stockMovement.count({ where: { batchId } }),
      ]);

    expect(batch.onHandQuantity).toBe(5);
    expect(batch.heldQuantity).toBeLessThanOrEqual(batch.onHandQuantity);
    expect(movements).toBe(0);

    if (reservationResult.status === 'fulfilled') {
      expect(quarantineResult.status).toBe('rejected');
      expect(batch).toMatchObject({ status: 'ACTIVE', onHandQuantity: 5, heldQuantity: 5 });
      expect(persistedReservations).toHaveLength(1);
      expect(persistedReservations[0]).toMatchObject({ status: 'PENDING', version: 1 });
      expect(allocations).toHaveLength(1);
      expect(allocations[0]).toMatchObject({
        reservationId: reservationResult.value.reservationId,
        batchId,
        quantity: 5,
        status: 'HELD',
      });
      expect(quarantineRecords).toHaveLength(0);
      expect(audits).toEqual([
        { eventType: 'inventory.reservation.created', resourceId: reservationResult.value.reservationId },
      ]);
      expect(outboxEvents).toEqual([
        { eventType: 'inventory.reservation.created', aggregateId: reservationResult.value.reservationId },
      ]);
      return;
    }

    expect(quarantineResult.status).toBe('fulfilled');
    expect(batch).toMatchObject({ status: 'QUARANTINED', onHandQuantity: 5, heldQuantity: 0 });
    expect(persistedReservations).toHaveLength(0);
    expect(allocations).toHaveLength(0);
    expect(quarantineRecords).toHaveLength(1);
    expect(quarantineRecords[0]).toMatchObject({
      batchId,
      affectedReservationCount: 0,
      releasedUnitCount: 0,
    });
    expect(audits).toEqual([{ eventType: 'inventory.batch.quarantined', resourceId: batchId }]);
    expect(outboxEvents).toEqual([
      { eventType: 'inventory.batch.quarantined', aggregateId: batchId },
    ]);
  });
});
