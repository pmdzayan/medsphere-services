import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationLifecycleService } from './reservation-lifecycle.service';

const describeReservationInfrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

describeReservationInfrastructure('G3.3 PostgreSQL reservation lifecycle integrity', () => {
  const prisma = new PrismaService();
  const service = new ReservationLifecycleService(prisma, new AuditWriter());
  const tenantId = randomUUID();
  const userId = randomUUID();
  const unassignedUserId = randomUUID();
  const membershipId = randomUUID();
  const unassignedMembershipId = randomUUID();
  const providerId = randomUUID();
  const identity: AuthenticatedIdentity = {
    userId,
    membershipId,
    tenantId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };
  const unassignedIdentity: AuthenticatedIdentity = {
    userId: unassignedUserId,
    membershipId: unassignedMembershipId,
    tenantId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.3 reservation tenant', slug: `g33-${tenantId}` },
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Reservation',
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
        businessName: 'G3.3 Pharmacy',
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

  it('atomically consumes held stock and conceals the durable replay from unassigned staff', async () => {
    const fixture = await createReservation('READY');
    const idempotencyKey = `complete-${randomUUID()}`;
    const completed = await service.transition({
      actor: identity,
      providerId,
      reservationId: fixture.reservationId,
      transition: 'COMPLETE',
      expectedVersion: 1,
      idempotencyKey,
    });

    expect(completed).toMatchObject({ status: 'COMPLETED', version: 2, replayed: false });
    const [batch, allocation, movement, audit, receipt] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
      prisma.client.medicineReservationAllocation.findUniqueOrThrow({
        where: { id: fixture.allocationId },
      }),
      prisma.client.stockMovement.findFirstOrThrow({
        where: { tenantId, referenceId: fixture.reservationId },
      }),
      prisma.client.auditEvent.findFirstOrThrow({
        where: {
          tenantId,
          resourceId: fixture.reservationId,
          eventType: 'inventory.reservation.completed',
        },
      }),
      prisma.client.medicineReservationCommand.findUniqueOrThrow({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      }),
    ]);
    expect(batch).toMatchObject({ onHandQuantity: 6, heldQuantity: 0, version: 2 });
    expect(allocation).toMatchObject({ status: 'CONSUMED' });
    expect(movement).toMatchObject({ delta: -4, onHandBefore: 10, onHandAfter: 6 });
    expect(movement.commandHash).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.actorMembershipId).toBe(membershipId);
    expect(receipt.commandHash).toBe(movement.commandHash);

    await expect(
      service.transition({
        actor: unassignedIdentity,
        providerId,
        reservationId: fixture.reservationId,
        transition: 'COMPLETE',
        expectedVersion: 1,
        idempotencyKey,
      }),
    ).rejects.toThrow('Provider inventory not found');
  });

  it('allows exactly one winner for concurrent transitions at one expected version', async () => {
    const fixture = await createReservation('PENDING');
    const outcomes = await Promise.allSettled([
      service.transition({
        actor: identity,
        providerId,
        reservationId: fixture.reservationId,
        transition: 'CONFIRM',
        expectedVersion: 1,
        idempotencyKey: `confirm-race-${randomUUID()}`,
      }),
      service.transition({
        actor: identity,
        providerId,
        reservationId: fixture.reservationId,
        transition: 'CANCEL',
        expectedVersion: 1,
        idempotencyKey: `cancel-race-${randomUUID()}`,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const reservation = await prisma.client.medicineReservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
    });
    expect(reservation.version).toBe(2);
    expect(['CONFIRMED', 'CANCELLED']).toContain(reservation.status);
  });

  async function createReservation(status: 'PENDING' | 'READY') {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    const reservationId = randomUUID();
    const itemId = randomUUID();
    const allocationId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'G3.3 Medicine',
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
        taxPercentage: '5.00',
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
        batchNumber: `G33-${batchId}`,
        expiryDate: new Date('2030-01-01T00:00:00.000Z'),
        receivedQuantity: 10,
        onHandQuantity: 10,
        heldQuantity: 4,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId: userId,
        status,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        idempotencyKey: `fixture-${reservationId}`,
        creationHash: 'a'.repeat(64),
      },
    });
    await prisma.client.medicineReservationItem.create({
      data: { id: itemId, tenantId, reservationId, providerId, productId, quantity: 4 },
    });
    await prisma.client.medicineReservationAllocation.create({
      data: {
        id: allocationId,
        tenantId,
        reservationId,
        itemId,
        inventoryId,
        batchId,
        providerId,
        productId,
        quantity: 4,
      },
    });
    return { reservationId, batchId, allocationId };
  }
});
