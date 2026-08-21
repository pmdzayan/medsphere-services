import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { ReservationCreationService } from './reservation-creation.service';

const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

/**
 * Batch 2 Task 2 -- patient-safe reservation creation.
 *
 * Existing coverage already proves FEFO correctness, idempotent replay,
 * concurrent-oversell prevention (twice, once against another reservation
 * and once against batch quarantine), and expiry/lifecycle concurrency.
 * None of it exercises a genuine cross-tenant actor attempting reservation
 * creation using another tenant's real opaque provider/product IDs. This
 * file closes exactly that gap, following the same pattern already
 * established for quarantine (Batch 1 Task 2) and transfer (Batch 2
 * Task 1).
 */
infra('Batch 2 Task 2 cross-tenant reservation-creation rejection', () => {
  const prisma = new PrismaService();
  const service = new ReservationCreationService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const providerAId = randomUUID();
  const providerBId = randomUUID();

  const actorB: AuthenticatedIdentity = {
    tenantId: tenantBId,
    userId: userBId,
    membershipId: membershipBId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };

  function providerFixture(id: string, tenantId: string, name: string) {
    return {
      id,
      tenantId,
      providerType: 'PHARMACY' as const,
      businessName: name,
      ownerName: 'Owner',
      email: `${id}@test.invalid`,
      phone: '0000000000',
      address: 'Address',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      postalCode: '600001',
      latitude: 13,
      longitude: 80,
      isVerified: true,
    };
  }

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Batch2-T2-XT tenant A', slug: `b2t2xt-a-${tenantAId}` },
        { id: tenantBId, name: 'Batch2-T2-XT tenant B', slug: `b2t2xt-b-${tenantBId}` },
      ],
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userAId,
          email: `${userAId}@test.invalid`,
          passwordHash: 'integration-placeholder',
          firstName: 'Tenant',
          lastName: 'A',
        },
        {
          id: userBId,
          email: `${userBId}@test.invalid`,
          passwordHash: 'integration-placeholder',
          firstName: 'Tenant',
          lastName: 'B',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipAId,
          tenantId: tenantAId,
          userId: userAId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: membershipBId,
          tenantId: tenantBId,
          userId: userBId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
    await prisma.client.provider.createMany({
      data: [
        providerFixture(providerAId, tenantAId, 'Batch2-T2-XT Provider A'),
        providerFixture(providerBId, tenantBId, 'Batch2-T2-XT Provider B'),
      ],
    });
    // Tenant B's actor has genuine, real provider access -- but only to
    // its own tenant's provider, proving the rejection below is
    // tenant-scoped enforcement, not blanket denial.
    await prisma.client.membershipProviderAccess.create({
      data: {
        id: randomUUID(),
        tenantId: tenantBId,
        membershipId: membershipBId,
        providerId: providerBId,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('rejects a tenant B actor creating a reservation against tenant A opaque IDs, tenant-safe', async () => {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Batch2-T2-XT Medicine',
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
        tenantId: tenantAId,
        providerId: providerAId,
        productId,
        sellingPrice: '20.00',
        mrp: '25.00',
        discountPercentage: '0.00',
        taxPercentage: '0.00',
      },
    });
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId: tenantAId,
        inventoryId,
        providerId: providerAId,
        productId,
        batchNumber: `BATCH2-T2-XT-${batchId}`,
        expiryDate: new Date(Date.now() + 30 * 86_400_000),
        receivedQuantity: 10,
        onHandQuantity: 10,
        heldQuantity: 0,
        purchasePrice: '15.00',
        sellingPrice: '20.00',
      },
    });

    // Tenant B's actor attempts to reserve tenant A's real product at
    // tenant A's real provider, for itself as subject. Reuses tenant A's
    // actual opaque IDs -- nothing fabricated to "match".
    await expect(
      service.create({
        actor: actorB,
        providerId: providerAId,
        subjectUserId: userBId,
        expiresAt: new Date(Date.now() + 3_600_000),
        items: [{ productId, quantity: 2 }],
        idempotencyKey: `batch2-t2-xt-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const [batch, reservations, auditEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.client.medicineReservation.findMany({ where: { providerId: providerAId } }),
      prisma.client.auditEvent.findMany({ where: { tenantId: tenantAId, resourceId: batchId } }),
    ]);

    // Tenant A's stock is completely unaffected, no reservation was
    // created, and no audit trail leaked into tenant A's data from the
    // rejected cross-tenant attempt.
    expect(batch).toMatchObject({ onHandQuantity: 10, heldQuantity: 0, version: 1 });
    expect(reservations).toHaveLength(0);
    expect(auditEvents).toHaveLength(0);
  });
});
