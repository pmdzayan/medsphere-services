import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationCreationService } from './reservation-creation.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.16 PostgreSQL staff reservation creation integrity', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const subjectUserId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId: actorUserId, membershipId };
  const service = new ReservationCreationService(prisma, new AuditWriter());

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.16 reservation tenant', slug: `g316-${tenantId}` },
    });
    await prisma.client.user.createMany({
      data: [actorUserId, subjectUserId].map((id, index) => ({
        id,
        email: `${id}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: index === 0 ? 'Staff' : 'Subject',
        lastName: 'Reservation',
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
        businessName: 'G3.16 Pharmacy',
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

  it('persists exact FEFO holds and replays without duplicating them', async () => {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const firstBatchId = randomUUID();
    const laterBatchId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'G3.16 Medicine',
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
    await prisma.client.batch.createMany({
      data: [
        {
          id: laterBatchId,
          tenantId,
          inventoryId,
          providerId,
          productId,
          batchNumber: `G316-L-${laterBatchId}`,
          expiryDate: new Date(Date.now() + 10 * 86_400_000),
          receivedQuantity: 10,
          onHandQuantity: 10,
          heldQuantity: 1,
          purchasePrice: '100.00',
          sellingPrice: '120.00',
        },
        {
          id: firstBatchId,
          tenantId,
          inventoryId,
          providerId,
          productId,
          batchNumber: `G316-F-${firstBatchId}`,
          expiryDate: new Date(Date.now() + 5 * 86_400_000),
          receivedQuantity: 5,
          onHandQuantity: 5,
          heldQuantity: 0,
          purchasePrice: '100.00',
          sellingPrice: '120.00',
        },
      ],
    });
    const command = {
      actor,
      providerId,
      subjectUserId,
      expiresAt: new Date(Date.now() + 86_400_000),
      items: [{ productId, quantity: 7 }],
      idempotencyKey: `g316-${randomUUID()}`,
    } as const;

    const created = await service.create(command);
    const replay = await service.create(command);
    const [batches, allocations, audits, permission] = await Promise.all([
      prisma.client.batch.findMany({
        where: { id: { in: [firstBatchId, laterBatchId] } },
        orderBy: { expiryDate: 'asc' },
      }),
      prisma.client.medicineReservationAllocation.findMany({
        where: { reservationId: created.reservationId },
        orderBy: { batch: { expiryDate: 'asc' } },
      }),
      prisma.client.auditEvent.findMany({
        where: { eventType: 'inventory.reservation.created', resourceId: created.reservationId },
      }),
      prisma.client.permission.findUniqueOrThrow({
        where: { name: 'inventory.reservations.create' },
      }),
    ]);

    expect(created).toMatchObject({ status: 'PENDING', totalQuantity: 7, replayed: false });
    expect(replay).toEqual({ ...created, replayed: true });
    expect(batches.map(({ heldQuantity }) => heldQuantity)).toEqual([5, 3]);
    expect(allocations.map(({ quantity }) => quantity)).toEqual([5, 2]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorType: 'TENANT_USER',
      actorMembershipId: membershipId,
      tenantId,
    });
    expect(permission.name).toBe('inventory.reservations.create');
  });
});
