import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import {
  isInfrastructureTestEnabled,
  requireEnv,
} from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { InventoryQuarantineService } from './inventory-quarantine.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

/**
 * Existing coverage (inventory-quarantine.integration.spec.ts) proves a direct,
 * mismatched-tenant Prisma write is rejected by referential integrity. That is
 * database-constraint evidence, not proof that a real, authenticated actor from
 * one tenant is rejected by the actual authorization path when targeting another
 * tenant's resource through the real service call. This spec closes that gap.
 */
infrastructure('Post-audit Task 2 cross-tenant actor-driven mutation rejection', () => {
  const prisma = new PrismaService();
  const service = new InventoryQuarantineService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantAUserId = randomUUID();
  const tenantBUserId = randomUUID();
  const tenantAMembershipId = randomUUID();
  const tenantBMembershipId = randomUUID();
  const tenantAProviderId = randomUUID();
  const tenantBProviderId = randomUUID();

  const tenantBActor = {
    tenantId: tenantBId,
    userId: tenantBUserId,
    membershipId: tenantBMembershipId,
  };

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Task2-XT tenant A', slug: `task2-xt-a-${tenantAId}` },
        { id: tenantBId, name: 'Task2-XT tenant B', slug: `task2-xt-b-${tenantBId}` },
      ],
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: tenantAUserId,
          email: `${tenantAUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'TenantA',
          lastName: 'Staff',
        },
        {
          id: tenantBUserId,
          email: `${tenantBUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'TenantB',
          lastName: 'Staff',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: tenantAMembershipId,
          tenantId: tenantAId,
          userId: tenantAUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: tenantBMembershipId,
          tenantId: tenantBId,
          userId: tenantBUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
    await prisma.client.provider.createMany({
      data: [
        {
          id: tenantAProviderId,
          tenantId: tenantAId,
          providerType: 'PHARMACY',
          businessName: 'Task2-XT Pharmacy A',
          ownerName: 'Fixture Owner A',
          email: `${tenantAProviderId}@medsphere.test`,
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
        {
          id: tenantBProviderId,
          tenantId: tenantBId,
          providerType: 'PHARMACY',
          businessName: 'Task2-XT Pharmacy B',
          ownerName: 'Fixture Owner B',
          email: `${tenantBProviderId}@medsphere.test`,
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
      ],
    });
    // Tenant B's actor has genuine, real provider access — but only to tenant B's
    // own provider. This proves the rejection below is tenant-scoped enforcement,
    // not merely "this actor has no provider access at all".
    await prisma.client.membershipProviderAccess.create({
      data: {
        id: randomUUID(),
        tenantId: tenantBId,
        membershipId: tenantBMembershipId,
        providerId: tenantBProviderId,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it(
    'rejects a tenant B actor quarantining a tenant A batch via tenant A opaque IDs, tenant-safe',
    async () => {
      const productId = randomUUID();
      const inventoryId = randomUUID();
      const batchId = randomUUID();

      await prisma.client.product.create({
        data: {
          id: productId,
          name: 'Task2-XT Medicine',
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
          providerId: tenantAProviderId,
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
          tenantId: tenantAId,
          inventoryId,
          providerId: tenantAProviderId,
          productId,
          batchNumber: `TASK2-XT-${batchId}`,
          expiryDate: new Date(Date.now() + 86_400_000),
          receivedQuantity: 5,
          onHandQuantity: 5,
          heldQuantity: 0,
          purchasePrice: '100.00',
          sellingPrice: '120.00',
        },
      });

      // Tenant B's authenticated actor attempts to quarantine tenant A's real batch,
      // reusing tenant A's real opaque providerId and batchId. No tenant-B fixture
      // is fabricated to "match" tenant A's IDs — these are tenant A's actual records.
      await expect(
        service.quarantine({
          actor: tenantBActor,
          providerId: tenantAProviderId,
          batchId,
          expectedVersion: 1,
          idempotencyKey: `task2-xt-${randomUUID()}`,
          reasonCode: 'QUALITY_SUSPECT',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const [batch, quarantineRecords, audits] = await Promise.all([
        prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
        prisma.client.batchQuarantineRecord.findMany({ where: { batchId } }),
        prisma.client.auditEvent.findMany({
          where: { tenantId: tenantAId, resourceId: batchId },
        }),
      ]);

      // Tenant A's batch is completely unaffected, and the rejection produced no
      // audit trail attributing an event to tenant A's resource from tenant B's
      // actor — the failure did not leak existence or detail into tenant A's data.
      expect(batch).toMatchObject({
        status: 'ACTIVE',
        onHandQuantity: 5,
        heldQuantity: 0,
        version: 1,
      });
      expect(quarantineRecords).toHaveLength(0);
      expect(audits).toHaveLength(0);
    },
  );
});
