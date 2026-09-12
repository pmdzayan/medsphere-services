import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { PatientReservationService } from './patient-reservation.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Task 0034 PostgreSQL patient reservation integrity', () => {
  const prisma = new PrismaService();
  const service = new PatientReservationService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  const providerTenantId = randomUUID();
  const providerId = randomUUID();
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const firstIdentity = identity(firstUserId, randomUUID(), randomUUID());
  const secondIdentity = identity(secondUserId, randomUUID(), randomUUID());

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        {
          id: providerTenantId,
          name: 'Task 0034 provider tenant',
          slug: `t0034-provider-${providerTenantId}`,
          organizationType: 'PHARMACY',
        },
        {
          id: firstIdentity.tenantId,
          name: 'Task 0034 personal one',
          slug: `t0034-personal-1-${firstIdentity.tenantId}`,
          organizationType: 'NONE',
        },
        {
          id: secondIdentity.tenantId,
          name: 'Task 0034 personal two',
          slug: `t0034-personal-2-${secondIdentity.tenantId}`,
          organizationType: 'NONE',
        },
      ],
    });

    await prisma.client.user.createMany({
      data: [firstUserId, secondUserId].map((id, index) => ({
        id,
        email: `${id}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: `Patient${index + 1}`,
        lastName: 'Task0034',
      })),
    });

    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: firstIdentity.membershipId,
          tenantId: firstIdentity.tenantId,
          userId: firstUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: secondIdentity.membershipId,
          tenantId: secondIdentity.tenantId,
          userId: secondUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });

    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId: providerTenantId,
        providerType: 'PHARMACY',
        businessName: 'Task 0034 Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${providerId}@medsphere.test`,
        phone: '0000000000',
        address: 'Fixture address',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        postalCode: '560001',
        latitude: 12.9716,
        longitude: 77.5946,
        isVerified: true,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('allows exactly one winner when two patients race for the final unit', async () => {
    const stock = await createStock([{ quantity: 1, expiresInDays: 10 }]);
    const firstKey = `race-a-${randomUUID()}`;
    const secondKey = `race-b-${randomUUID()}`;

    const outcomes = await Promise.allSettled([
      service.create({
        identity: firstIdentity,
        providerId,
        items: [{ productId: stock.productId, quantity: 1 }],
        idempotencyKey: firstKey,
      }),
      service.create({
        identity: secondIdentity,
        providerId,
        items: [{ productId: stock.productId, quantity: 1 }],
        idempotencyKey: secondKey,
      }),
    ]);

    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof service.create>>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictException);

    const winner = fulfilled[0]!.value;
    const expectedWinnerUserId = outcomes[0]?.status === 'fulfilled' ? firstUserId : secondUserId;
    const [reservation, batch, allocations, audits, events] = await Promise.all([
      prisma.client.medicineReservation.findUniqueOrThrow({ where: { id: winner.reservationId } }),
      prisma.client.batch.findUniqueOrThrow({ where: { id: stock.batchIds[0]! } }),
      prisma.client.medicineReservationAllocation.findMany({
        where: { reservationId: winner.reservationId },
      }),
      prisma.client.auditEvent.findMany({
        where: {
          eventType: 'inventory.reservation.created',
          resourceId: winner.reservationId,
        },
      }),
      prisma.client.outboxEvent.findMany({
        where: {
          tenantId: providerTenantId,
          eventType: 'inventory.reservation.created',
          aggregateId: winner.reservationId,
        },
      }),
    ]);

    expect(reservation).toMatchObject({
      tenantId: providerTenantId,
      providerId,
      subjectUserId: expectedWinnerUserId,
      status: 'PENDING',
    });
    expect(batch).toMatchObject({ onHandQuantity: 1, heldQuantity: 1 });
    expect(batch.heldQuantity).toBeLessThanOrEqual(batch.onHandQuantity);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ quantity: 1, status: 'HELD' });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      scope: 'PLATFORM',
      actorType: 'PLATFORM_USER',
      platformActorUserId: expectedWinnerUserId,
    });
    expect(JSON.stringify(audits[0]?.metadata)).not.toMatch(
      /query|latitude|longitude|email|phone/i,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: providerTenantId,
      actorType: 'SYSTEM',
      systemService: 'patient-reservations',
    });
  });

  it('allocates FEFO across batches and replays create without duplicating holds', async () => {
    const stock = await createStock([
      { quantity: 2, expiresInDays: 5 },
      { quantity: 3, expiresInDays: 10 },
    ]);
    const idempotencyKey = `fefo-${randomUUID()}`;
    const command = {
      identity: firstIdentity,
      providerId,
      items: [{ productId: stock.productId, quantity: 3 }],
      idempotencyKey,
    } as const;

    const created = await service.create(command);
    const replay = await service.create(command);
    const [batches, allocations] = await Promise.all([
      prisma.client.batch.findMany({
        where: { id: { in: stock.batchIds } },
        orderBy: { expiryDate: 'asc' },
      }),
      prisma.client.medicineReservationAllocation.findMany({
        where: { reservationId: created.reservationId },
        orderBy: { batch: { expiryDate: 'asc' } },
      }),
    ]);

    expect(created).toMatchObject({
      status: 'PENDING',
      itemCount: 1,
      totalQuantity: 3,
      replayed: false,
    });
    expect(replay).toEqual({ ...created, replayed: true });
    expect(batches.map((batch) => batch.heldQuantity)).toEqual([2, 1]);
    expect(allocations.map((allocation) => allocation.quantity)).toEqual([2, 1]);
  });

  it('keeps reservations owner-only and cancellation releases stock exactly once', async () => {
    const stock = await createStock([{ quantity: 3, expiresInDays: 10 }]);
    const created = await service.create({
      identity: firstIdentity,
      providerId,
      items: [{ productId: stock.productId, quantity: 2 }],
      idempotencyKey: `create-${randomUUID()}`,
    });

    await expect(service.get(secondIdentity, created.reservationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.cancel({
        identity: secondIdentity,
        reservationId: created.reservationId,
        expectedVersion: 1,
        idempotencyKey: `foreign-cancel-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const cancellationKey = `cancel-${randomUUID()}`;
    const cancelled = await service.cancel({
      identity: firstIdentity,
      reservationId: created.reservationId,
      expectedVersion: 1,
      idempotencyKey: cancellationKey,
    });
    const replay = await service.cancel({
      identity: firstIdentity,
      reservationId: created.reservationId,
      expectedVersion: 1,
      idempotencyKey: cancellationKey,
    });

    const [batch, allocations, audits, events] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: stock.batchIds[0]! } }),
      prisma.client.medicineReservationAllocation.findMany({
        where: { reservationId: created.reservationId },
      }),
      prisma.client.auditEvent.findMany({
        where: {
          eventType: 'inventory.reservation.cancelled',
          resourceId: created.reservationId,
        },
      }),
      prisma.client.outboxEvent.findMany({
        where: {
          tenantId: providerTenantId,
          eventType: 'inventory.reservation.cancelled',
          aggregateId: created.reservationId,
        },
      }),
    ]);

    expect(cancelled).toMatchObject({ status: 'CANCELLED', version: 2, replayed: false });
    expect(replay).toEqual({ ...cancelled, replayed: true });
    expect(batch).toMatchObject({ onHandQuantity: 3, heldQuantity: 0 });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.status).toBe('RELEASED');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.platformActorUserId).toBe(firstUserId);
    expect(events).toHaveLength(1);
  });

  it('fails closed when a provider is paired with stock from another provider tenant', async () => {
    const stock = await createStock([{ quantity: 2, expiresInDays: 10 }]);
    const foreignTenantId = randomUUID();
    const foreignProviderId = randomUUID();

    await prisma.client.tenant.create({
      data: {
        id: foreignTenantId,
        name: 'Task 0034 foreign pharmacy tenant',
        slug: `t0034-foreign-${foreignTenantId}`,
        organizationType: 'PHARMACY',
      },
    });
    await prisma.client.provider.create({
      data: {
        id: foreignProviderId,
        tenantId: foreignTenantId,
        providerType: 'PHARMACY',
        businessName: 'Foreign Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${foreignProviderId}@medsphere.test`,
        phone: '0000000000',
        address: 'Foreign address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13.0827,
        longitude: 80.2707,
        isVerified: true,
      },
    });

    await expect(
      service.create({
        identity: firstIdentity,
        providerId: foreignProviderId,
        items: [{ productId: stock.productId, quantity: 1 }],
        idempotencyKey: `foreign-provider-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      await prisma.client.medicineReservation.count({
        where: { providerId: foreignProviderId, subjectUserId: firstUserId },
      }),
    ).toBe(0);
  });

  it('rolls back holds and reservation rows when audit append fails', async () => {
    const stock = await createStock([{ quantity: 2, expiresInDays: 10 }]);
    const forcedFailure = new Error('forced Task 0034 audit failure');
    const rollbackService = new PatientReservationService(
      prisma,
      {
        appendPlatformUser: jest.fn().mockRejectedValue(forcedFailure),
      } as never,
      new InventoryEventWriter(),
    );
    const idempotencyKey = `rollback-${randomUUID()}`;
    const [auditCountBefore, eventCountBefore] = await Promise.all([
      prisma.client.auditEvent.count(),
      prisma.client.outboxEvent.count(),
    ]);

    await expect(
      rollbackService.create({
        identity: firstIdentity,
        providerId,
        items: [{ productId: stock.productId, quantity: 1 }],
        idempotencyKey,
      }),
    ).rejects.toBe(forcedFailure);

    const [batch, reservationCount, allocationCount, auditCountAfter, eventCountAfter] =
      await Promise.all([
        prisma.client.batch.findUniqueOrThrow({ where: { id: stock.batchIds[0]! } }),
        prisma.client.medicineReservation.count({
          where: { tenantId: providerTenantId, idempotencyKey },
        }),
        prisma.client.medicineReservationAllocation.count({
          where: { batchId: stock.batchIds[0]! },
        }),
        prisma.client.auditEvent.count(),
        prisma.client.outboxEvent.count(),
      ]);

    expect(batch.heldQuantity).toBe(0);
    expect(reservationCount).toBe(0);
    expect(allocationCount).toBe(0);
    expect(auditCountAfter).toBe(auditCountBefore);
    expect(eventCountAfter).toBe(eventCountBefore);
  });

  async function createStock(
    batches: ReadonlyArray<{ quantity: number; expiresInDays: number }>,
  ): Promise<{ productId: string; inventoryId: string; batchIds: string[] }> {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchIds = batches.map(() => randomUUID());

    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Task 0034 Medicine',
        genericName: 'Fixture medicine',
        brand: 'AIM Test',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });
    await prisma.client.inventory.create({
      data: {
        id: inventoryId,
        tenantId: providerTenantId,
        providerId,
        productId,
        sellingPrice: '100.00',
        mrp: '110.00',
        discountPercentage: '0.00',
        taxPercentage: '0.00',
        minimumStockLevel: 1,
      },
    });
    await prisma.client.batch.createMany({
      data: batches.map((batch, index) => ({
        id: batchIds[index]!,
        tenantId: providerTenantId,
        inventoryId,
        providerId,
        productId,
        batchNumber: `T0034-${batchIds[index]!}`,
        expiryDate: new Date(Date.now() + batch.expiresInDays * 86_400_000),
        receivedQuantity: batch.quantity,
        onHandQuantity: batch.quantity,
        heldQuantity: 0,
        purchasePrice: '80.00',
        sellingPrice: '100.00',
      })),
    });

    return { productId, inventoryId, batchIds };
  }
});

function identity(userId: string, membershipId: string, tenantId: string): AuthenticatedIdentity {
  return {
    userId,
    membershipId,
    tenantId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
}
