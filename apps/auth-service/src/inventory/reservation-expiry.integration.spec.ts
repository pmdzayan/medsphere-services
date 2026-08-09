import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { ReservationLifecycleService } from './reservation-lifecycle.service';

const describeExpiryInfrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

describeExpiryInfrastructure('G3.7 PostgreSQL reservation expiry integrity', () => {
  const prisma = new PrismaService();
  const service = new ReservationExpiryService(prisma, new AuditWriter());
  const lifecycle = new ReservationLifecycleService(prisma, new AuditWriter());
  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const identity: AuthenticatedIdentity = {
    userId,
    membershipId,
    tenantId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.7 expiry tenant', slug: `g37-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Expiry',
        lastName: 'Subject',
      },
    });
    await prisma.client.tenantMembership.create({
      data: { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'G3.7 Pharmacy',
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

  it('expires every active state, releases exact multi-batch holds, and writes system evidence once', async () => {
    const fixtures = await Promise.all([
      createReservation('PENDING', [2, 3]),
      createReservation('CONFIRMED', [4]),
      createReservation('READY', [5]),
    ]);

    const result = await service.run({ batchSize: 2, maximumRecords: 10 });

    expect(result).toMatchObject({ expired: 3, failed: 0 });
    for (const fixture of fixtures) {
      const [reservation, allocations, batches, command, audit] = await Promise.all([
        prisma.client.medicineReservation.findUniqueOrThrow({
          where: { id: fixture.reservationId },
        }),
        prisma.client.medicineReservationAllocation.findMany({
          where: { reservationId: fixture.reservationId },
        }),
        prisma.client.batch.findMany({ where: { id: { in: fixture.batchIds } } }),
        prisma.client.medicineReservationCommand.findFirstOrThrow({
          where: { reservationId: fixture.reservationId, commandType: 'EXPIRE' },
        }),
        prisma.client.auditEvent.findFirstOrThrow({
          where: {
            tenantId,
            resourceId: fixture.reservationId,
            eventType: 'inventory.reservation.expired',
          },
        }),
      ]);
      expect(reservation).toMatchObject({ status: 'EXPIRED', version: 2 });
      expect(allocations.every((allocation) => allocation.status === 'RELEASED')).toBe(true);
      expect(
        allocations.every(
          (allocation) => allocation.releasedAt?.getTime() === reservation.expiredAt?.getTime(),
        ),
      ).toBe(true);
      expect(
        batches.every((batch) => batch.onHandQuantity === 20 && batch.heldQuantity === 0),
      ).toBe(true);
      expect(command).toMatchObject({ resultingStatus: 'EXPIRED', resultingVersion: 2 });
      expect(command.commandHash).toMatch(/^[0-9a-f]{64}$/);
      expect(audit).toMatchObject({
        scope: 'TENANT',
        actorType: 'SYSTEM',
        actorMembershipId: null,
        platformActorUserId: null,
      });
    }

    const replay = await service.run({ batchSize: 10, maximumRecords: 10 });
    expect(replay).toMatchObject({ selected: 0, expired: 0, failed: 0 });
  });

  it('allows only one release when two workers overlap', async () => {
    const fixture = await createReservation('PENDING', [6]);
    const outcomes = await Promise.all([
      service.run({ batchSize: 10, maximumRecords: 10 }),
      service.run({ batchSize: 10, maximumRecords: 10 }),
    ]);

    expect(outcomes.reduce((total, outcome) => total + outcome.expired, 0)).toBe(1);
    expect(outcomes.reduce((total, outcome) => total + outcome.failed, 0)).toBe(0);
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchIds[0] } }),
    ).resolves.toMatchObject({ onHandQuantity: 20, heldQuantity: 0, version: 2 });
    await expect(
      prisma.client.auditEvent.count({
        where: { resourceId: fixture.reservationId, eventType: 'inventory.reservation.expired' },
      }),
    ).resolves.toBe(1);
  });

  it('allows expiry to be the only valid winner when a due reservation races staff completion', async () => {
    const fixture = await createReservation('READY', [7]);
    const outcomes = await Promise.allSettled([
      service.run({ batchSize: 10, maximumRecords: 10 }),
      lifecycle.transition({
        actor: identity,
        providerId,
        reservationId: fixture.reservationId,
        transition: 'COMPLETE',
        expectedVersion: 1,
        idempotencyKey: `complete-race-${randomUUID()}`,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const [reservation, batch, expiryCommands, stockMovements] = await Promise.all([
      prisma.client.medicineReservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
      }),
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchIds[0] } }),
      prisma.client.medicineReservationCommand.count({
        where: { reservationId: fixture.reservationId, commandType: 'EXPIRE' },
      }),
      prisma.client.stockMovement.count({ where: { referenceId: fixture.reservationId } }),
    ]);
    expect(reservation).toMatchObject({ status: 'EXPIRED', version: 2 });
    expect(batch).toMatchObject({ onHandQuantity: 20, heldQuantity: 0, version: 2 });
    expect(expiryCommands).toBe(1);
    expect(stockMovements).toBe(0);
  });

  it('rolls back a corrupt hold without fabricating expiry success', async () => {
    const fixture = await createReservation('CONFIRMED', [4]);
    await prisma.client.batch.update({
      where: { id: fixture.batchIds[0] },
      data: { heldQuantity: 1 },
    });

    const result = await service.run({ batchSize: 10, maximumRecords: 10 });

    expect(result).toMatchObject({ selected: 1, expired: 0, failed: 1 });
    await expect(
      prisma.client.medicineReservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
      }),
    ).resolves.toMatchObject({ status: 'CONFIRMED', version: 1, expiredAt: null });
    await expect(
      prisma.client.medicineReservationAllocation.findFirstOrThrow({
        where: { reservationId: fixture.reservationId },
      }),
    ).resolves.toMatchObject({ status: 'HELD', releasedAt: null });
    await expect(
      prisma.client.auditEvent.count({ where: { resourceId: fixture.reservationId } }),
    ).resolves.toBe(0);
  });

  async function createReservation(
    status: 'PENDING' | 'CONFIRMED' | 'READY',
    quantities: number[],
  ) {
    const reservationId = randomUUID();
    const createdAt = new Date(Date.now() - 120_000);
    const expiresAt = new Date(Date.now() - 60_000);
    const confirmedAt = status === 'PENDING' ? undefined : new Date(createdAt.getTime() + 10_000);
    const readyAt = status === 'READY' ? new Date(createdAt.getTime() + 20_000) : undefined;
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId: userId,
        status,
        createdAt,
        expiresAt,
        confirmedAt,
        readyAt,
        idempotencyKey: `fixture-${reservationId}`,
        creationHash: 'a'.repeat(64),
      },
    });

    const batchIds: string[] = [];
    for (const quantity of quantities) {
      const productId = randomUUID();
      const inventoryId = randomUUID();
      const batchId = randomUUID();
      const itemId = randomUUID();
      batchIds.push(batchId);
      await prisma.client.product.create({
        data: {
          id: productId,
          name: 'G3.7 Medicine',
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
          batchNumber: `G37-${batchId}`,
          expiryDate: new Date('2030-01-01T00:00:00.000Z'),
          receivedQuantity: 20,
          onHandQuantity: 20,
          heldQuantity: quantity,
          purchasePrice: '100.00',
          sellingPrice: '120.00',
        },
      });
      await prisma.client.medicineReservationItem.create({
        data: { id: itemId, tenantId, reservationId, providerId, productId, quantity },
      });
      await prisma.client.medicineReservationAllocation.create({
        data: {
          id: randomUUID(),
          tenantId,
          reservationId,
          itemId,
          inventoryId,
          batchId,
          providerId,
          productId,
          quantity,
        },
      });
    }
    return { reservationId, batchIds };
  }
});
