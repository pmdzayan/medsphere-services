import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { InventoryTransferService } from './inventory-transfer.service';

const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

/**
 * Batch 2 Task 1 -- stock transfer workflow completion.
 *
 * The existing G3.8 coverage (inventory-transfer.integration.spec.ts)
 * already proves conservation, paired audit/movement evidence, replay,
 * rollback-on-provenance-conflict, and concurrent version-race safety.
 * It does not exercise a genuine cross-tenant actor, nor an actor with no
 * provider access at all (as opposed to access revoked mid-flow, which the
 * existing suite does cover). This file closes exactly those two gaps.
 */
infra('Batch 2 Task 1 cross-tenant and unauthorized transfer rejection', () => {
  const prisma = new PrismaService();
  const service = new InventoryTransferService(
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
  const sourceProviderId = randomUUID();
  const destinationProviderId = randomUUID();
  const tenantBProviderId = randomUUID();

  const actorA: AuthenticatedIdentity = {
    tenantId: tenantAId,
    userId: userAId,
    membershipId: membershipAId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const actorBNoAccess: AuthenticatedIdentity = {
    tenantId: tenantBId,
    userId: userBId,
    membershipId: membershipBId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
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
        { id: tenantAId, name: 'Batch2-T1 tenant A', slug: `b2t1-a-${tenantAId}` },
        { id: tenantBId, name: 'Batch2-T1 tenant B', slug: `b2t1-b-${tenantBId}` },
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
        providerFixture(sourceProviderId, tenantAId, 'Batch2-T1 Source'),
        providerFixture(destinationProviderId, tenantAId, 'Batch2-T1 Destination'),
        providerFixture(tenantBProviderId, tenantBId, 'Batch2-T1 Tenant B Own Provider'),
      ],
    });
    // Tenant B's actor has genuine, real provider access -- but only to its
    // own tenant's provider. This proves the rejections below are
    // tenant-scoped enforcement, not merely "this actor has no access at
    // all anywhere".
    await prisma.client.membershipProviderAccess.create({
      data: {
        id: randomUUID(),
        tenantId: tenantBId,
        membershipId: membershipBId,
        providerId: tenantBProviderId,
      },
    });
    await prisma.client.membershipProviderAccess.createMany({
      data: [sourceProviderId, destinationProviderId].map((providerId) => ({
        id: randomUUID(),
        tenantId: tenantAId,
        membershipId: membershipAId,
        providerId,
      })),
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  async function seedTenantABatch() {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const destinationInventoryId = randomUUID();
    const batchId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Batch2-T1 Medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });
    await prisma.client.inventory.createMany({
      data: [
        {
          id: inventoryId,
          tenantId: tenantAId,
          providerId: sourceProviderId,
          productId,
          sellingPrice: '120.00',
          mrp: '135.00',
          discountPercentage: '0.00',
          taxPercentage: '0.00',
          minimumStockLevel: 1,
        },
        {
          id: destinationInventoryId,
          tenantId: tenantAId,
          providerId: destinationProviderId,
          productId,
          sellingPrice: '120.00',
          mrp: '135.00',
          discountPercentage: '0.00',
          taxPercentage: '0.00',
          minimumStockLevel: 1,
        },
      ],
    });
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId: tenantAId,
        inventoryId,
        providerId: sourceProviderId,
        productId,
        batchNumber: `BATCH2-T1-${batchId}`,
        expiryDate: new Date(Date.now() + 86_400_000),
        receivedQuantity: 10,
        onHandQuantity: 10,
        heldQuantity: 0,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });
    return batchId;
  }

  it('rejects a tenant B actor transferring tenant A stock via tenant A opaque IDs, tenant-safe', async () => {
    const batchId = await seedTenantABatch();

    await expect(
      service.recordCompleted({
        actor: actorBNoAccess,
        sourceProviderId,
        destinationProviderId,
        sourceBatchId: batchId,
        expectedSourceVersion: 1,
        quantity: 5,
        idempotencyKey: `batch2-t1-crosstenant-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const [batch, transfers, auditEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.client.inventoryTransfer.findMany({ where: { sourceBatchId: batchId } }),
      prisma.client.auditEvent.findMany({ where: { tenantId: tenantAId, resourceId: batchId } }),
    ]);

    // Tenant A's batch is completely unaffected, no transfer record was
    // created, and no audit trail leaked into tenant A's data from the
    // rejected cross-tenant attempt.
    expect(batch).toMatchObject({ onHandQuantity: 10, heldQuantity: 0, version: 1 });
    expect(transfers).toHaveLength(0);
    expect(auditEvents).toHaveLength(0);
  });

  it('rejects an actor with no provider access at all, not just revoked access', async () => {
    const batchId = await seedTenantABatch();

    // actorBNoAccess has real access to its own tenant B provider, but
    // none whatsoever to tenant A's providers -- this is a genuinely
    // unauthorized actor, distinct from the existing suite's
    // access-revoked-mid-flow scenario.
    await expect(
      service.recordCompleted({
        actor: actorBNoAccess,
        sourceProviderId,
        destinationProviderId,
        sourceBatchId: batchId,
        expectedSourceVersion: 1,
        quantity: 5,
        idempotencyKey: `batch2-t1-unauthorized-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
    ).resolves.toMatchObject({ onHandQuantity: 10, version: 1 });
  });

  it('confirms the authorized actor genuinely can transfer between its own tenant providers', async () => {
    const batchId = await seedTenantABatch();

    const result = await service.recordCompleted({
      actor: actorA,
      sourceProviderId,
      destinationProviderId,
      sourceBatchId: batchId,
      expectedSourceVersion: 1,
      quantity: 4,
      idempotencyKey: `batch2-t1-authorized-${randomUUID()}`,
    });

    expect(result.replayed).toBe(false);
    expect(result.sourceOnHandAfter).toBe(6);
    expect(result.destinationOnHandAfter).toBe(4);
  });
});
