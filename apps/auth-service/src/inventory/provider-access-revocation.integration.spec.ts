import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { ReservationCreationService } from './reservation-creation.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Post-audit Task 2 immediate provider-access revocation', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const subjectUserId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const providerAccessId = randomUUID();
  const actor = { tenantId, userId: actorUserId, membershipId };
  const service = new ReservationCreationService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'Task2-PAR tenant',
        slug: `task2-par-${tenantId}`,
      },
    });
    await prisma.client.user.createMany({
      data: [actorUserId, subjectUserId].map((id, index) => ({
        id,
        email: `${id}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: index === 0 ? 'Staff' : 'Subject',
        lastName: 'Revocation',
      })),
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipId,
          tenantId,
          userId: actorUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
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
        businessName: 'Task2-PAR Pharmacy',
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
      data: { id: providerAccessId, tenantId, membershipId, providerId },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('denies the same authenticated session immediately after provider-access is revoked, with no new login', async () => {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();

    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Task2-PAR Medicine',
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
        batchNumber: `TASK2-PAR-${batchId}`,
        expiryDate: new Date(Date.now() + 86_400_000),
        receivedQuantity: 10,
        onHandQuantity: 10,
        heldQuantity: 0,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });

    // Step 1: the actor's session genuinely has provider authority; the request succeeds.
    const beforeRevocation = await service.create({
      actor,
      providerId,
      subjectUserId,
      expiresAt: new Date(Date.now() + 43_200_000),
      items: [{ productId, quantity: 1 }],
      idempotencyKey: `task2-par-before-${randomUUID()}`,
    });
    expect(beforeRevocation.reservationId).toBeDefined();

    // Step 2: an administrator revokes provider access through authoritative PostgreSQL
    // state. The actor identity object above — the same one a live session would carry —
    // is never mutated. No JWT is altered and no re-login occurs.
    await prisma.client.membershipProviderAccess.delete({ where: { id: providerAccessId } });

    // Step 3: the identical, still-authenticated actor immediately retries. The very next
    // request must be denied without any new token.
    await expect(
      service.create({
        actor,
        providerId,
        subjectUserId,
        expiresAt: new Date(Date.now() + 43_200_000),
        items: [{ productId, quantity: 1 }],
        idempotencyKey: `task2-par-after-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const [batch, reservationsAfterRevocation] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.client.medicineReservation.findMany({
        where: { tenantId, providerId },
        select: { id: true },
      }),
    ]);

    // Only the one reservation created before revocation exists; the denied post-revocation
    // attempt left no trace, and stock held by the accepted reservation is unaffected.
    expect(reservationsAfterRevocation).toHaveLength(1);
    expect(batch.onHandQuantity).toBe(10);
    expect(batch.heldQuantity).toBe(1);
  });
});
