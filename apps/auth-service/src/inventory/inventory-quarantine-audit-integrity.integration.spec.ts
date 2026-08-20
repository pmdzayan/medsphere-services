import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { InventoryQuarantineService } from './inventory-quarantine.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

/**
 * Post-audit Task 4 -- audit integrity for the inventory quarantine path.
 *
 * Existing coverage already proves this exact pattern (forced audit-insert
 * failure rolling back the enclosing transaction) for the authorization
 * domain's createRole -- authorization-audit.integration.spec.ts,
 * 'rolls back a protected role mutation when its audit insert fails'.
 * That proves AuditWriter's own validation/constraint behavior, but not
 * that an inventory privileged mutation shares the same atomic guarantee.
 * G3.11's own rollback coverage (inventory-rollback-retry.integration.spec.ts)
 * forces a failure in the domain-event outbox writer, not the audit writer.
 * Neither closes this specific gap; this file does.
 */
infrastructure('Post-audit Task 4 inventory quarantine audit integrity', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId, membershipId };
  const service = new InventoryQuarantineService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
  );

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'Task4-AI tenant', slug: `task4-ai-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Audit',
        lastName: 'Integrity',
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
        businessName: 'Task4-AI Pharmacy',
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

  async function seedBatch() {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Task4-AI Medicine',
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
        batchNumber: `TASK4-AI-${batchId}`,
        expiryDate: new Date(Date.now() + 86_400_000),
        receivedQuantity: 5,
        onHandQuantity: 5,
        heldQuantity: 0,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });
    return batchId;
  }

  it('rolls back a batch quarantine entirely when its audit insert fails', async () => {
    const batchId = await seedBatch();

    // AuditWriter validates ipAddress via the database's own @db.Inet
    // column type -- an invalid value fails the insert deep inside the
    // same transaction as the quarantine mutation, after the business
    // write has already been attempted. The whole transaction must roll
    // back, not just the audit insert.
    await expect(
      service.quarantine({
        actor,
        providerId,
        batchId,
        expectedVersion: 1,
        idempotencyKey: `task4-ai-rollback-${randomUUID()}`,
        reasonCode: 'QUALITY_SUSPECT',
        request: { ipAddress: 'not-an-ip-address' },
      }),
    ).rejects.toBeDefined();

    const [batch, quarantineRecords, auditEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.client.batchQuarantineRecord.findMany({ where: { batchId } }),
      prisma.client.auditEvent.findMany({ where: { tenantId, resourceId: batchId } }),
    ]);

    // No partial mutation: the batch remains ACTIVE at its original
    // version and quantities, no quarantine record was created, and no
    // audit event -- misleading or otherwise -- exists for this batch.
    expect(batch).toMatchObject({
      status: 'ACTIVE',
      version: 1,
      onHandQuantity: 5,
      heldQuantity: 0,
    });
    expect(quarantineRecords).toHaveLength(0);
    expect(auditEvents).toHaveLength(0);
  });

  it("preserves the request correlation identifier on a successful quarantine's audit evidence", async () => {
    const batchId = await seedBatch();
    const requestId = `task4-ai-correlation-${randomUUID()}`;

    await service.quarantine({
      actor,
      providerId,
      batchId,
      expectedVersion: 1,
      idempotencyKey: `task4-ai-correlation-${randomUUID()}`,
      reasonCode: 'QUALITY_SUSPECT',
      request: { requestId },
    });

    const event = await prisma.client.auditEvent.findFirstOrThrow({
      where: {
        tenantId,
        resourceId: batchId,
        eventType: 'inventory.batch.quarantined',
      },
    });

    // Accurate success evidence: correct event type, outcome, tenant,
    // actor, resource scope, and the correlation identifier the caller
    // supplied -- not silently dropped or replaced.
    expect(event).toMatchObject({
      outcome: 'SUCCEEDED',
      tenantId,
      actorMembershipId: membershipId,
      resourceType: 'Batch',
      resourceId: batchId,
      requestId,
    });
  });
});
