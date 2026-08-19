import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { ReservationCreationService } from './reservation-creation.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Post-audit CG-INV-01 scarce-stock reservation concurrency', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const subjectUserId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId: actorUserId, membershipId };
  const service = new ReservationCreationService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'CG-INV-01 tenant', slug: `cg-inv-01-${tenantId}` },
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
        businessName: 'CG-INV-01 Pharmacy',
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

  it('allows exactly one winner when two independent reservations race for one available hold', async () => {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    const firstIdempotencyKey = `cg-inv-01-a-${randomUUID()}`;
    const secondIdempotencyKey = `cg-inv-01-b-${randomUUID()}`;

    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'CG-INV-01 Medicine',
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
        batchNumber: `CG-INV-01-${batchId}`,
        expiryDate: new Date(Date.now() + 10 * 86_400_000),
        receivedQuantity: 5,
        onHandQuantity: 5,
        heldQuantity: 0,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });

    const baseCommand = {
      actor,
      providerId,
      subjectUserId,
      expiresAt: new Date(Date.now() + 86_400_000),
      items: [{ productId, quantity: 5 }],
    } as const;
    const results = await Promise.allSettled([
      service.create({ ...baseCommand, idempotencyKey: firstIdempotencyKey }),
      service.create({ ...baseCommand, idempotencyKey: secondIdempotencyKey }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: expect.any(ConflictException) });

    const reservations = await prisma.client.medicineReservation.findMany({
      where: {
        tenantId,
        idempotencyKey: { in: [firstIdempotencyKey, secondIdempotencyKey] },
      },
      select: { id: true, idempotencyKey: true, status: true },
    });
    expect(reservations).toHaveLength(1);
    const winningReservation = reservations[0]!;

    const [batch, allocations, audits, outboxEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.client.medicineReservationAllocation.findMany({
        where: { reservationId: winningReservation.id },
      }),
      prisma.client.auditEvent.findMany({
        where: {
          tenantId,
          eventType: 'inventory.reservation.created',
          resourceId: winningReservation.id,
        },
      }),
      prisma.client.outboxEvent.findMany({
        where: {
          tenantId,
          eventType: 'inventory.reservation.created',
          aggregateId: winningReservation.id,
        },
      }),
    ]);

    expect(winningReservation.status).toBe('PENDING');
    expect(batch.onHandQuantity).toBe(5);
    expect(batch.heldQuantity).toBe(5);
    expect(batch.heldQuantity).toBeLessThanOrEqual(batch.onHandQuantity);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ batchId, quantity: 5 });
    expect(audits).toHaveLength(1);
    expect(outboxEvents).toHaveLength(1);
  });
});
