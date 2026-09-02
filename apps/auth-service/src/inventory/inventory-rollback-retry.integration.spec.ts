import { randomUUID } from 'node:crypto';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryDamageService } from './inventory-damage.service';
import { InventoryEventWriter } from './inventory-event-writer';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Post-audit CG-CONC-02 rollback then same-key retry integrity', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor: AuthenticatedIdentity = {
    tenantId,
    userId,
    membershipId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const service = new InventoryDamageService(prisma, new AuditWriter(), new InventoryEventWriter());

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'CG-CONC-02 tenant',
        slug: `cg-conc-02-${tenantId}`,
      },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Rollback',
        lastName: 'Operator',
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'CG-CONC-02 Pharmacy',
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
      data: {
        id: randomUUID(),
        tenantId,
        membershipId,
        providerId,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('rolls back a failed command and lets the identical key create one final evidence set', async () => {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    const idempotencyKey = `cg-conc-02-${randomUUID()}`;

    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'CG-CONC-02 Medicine',
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
        batchNumber: `CG-CONC-02-${batchId}`,
        expiryDate: new Date('2030-01-01T00:00:00.000Z'),
        receivedQuantity: 6,
        onHandQuantity: 6,
        heldQuantity: 1,
        purchasePrice: '100.00',
        sellingPrice: '120.00',
      },
    });

    const command = {
      actor,
      providerId,
      batchId,
      expectedVersion: 1,
      quantity: 2,
      idempotencyKey,
      reason: 'CG-CONC-02 forced rollback then retry',
    };

    class FailingInventoryEventWriter extends InventoryEventWriter {
      override async appendTenantUser(): Promise<void> {
        throw new Error('CG-CONC-02 forced outbox failure');
      }
    }

    const failingService = new InventoryDamageService(
      prisma,
      new AuditWriter(),
      new FailingInventoryEventWriter(),
    );

    await expect(failingService.recordCompleted(command)).rejects.toThrow(
      'CG-CONC-02 forced outbox failure',
    );

    const [rolledBackBatch, rolledBackMovements, rolledBackAudits, rolledBackEvents] =
      await Promise.all([
        prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
        prisma.client.stockMovement.count({ where: { tenantId, idempotencyKey } }),
        prisma.client.auditEvent.count({
          where: {
            tenantId,
            resourceId: batchId,
            eventType: 'inventory.stock.damaged',
          },
        }),
        prisma.client.outboxEvent.count({
          where: {
            tenantId,
            aggregateId: batchId,
            eventType: 'inventory.stock.damaged',
          },
        }),
      ]);

    expect(rolledBackBatch).toMatchObject({
      onHandQuantity: 6,
      heldQuantity: 1,
      version: 1,
    });
    expect(rolledBackMovements).toBe(0);
    expect(rolledBackAudits).toBe(0);
    expect(rolledBackEvents).toBe(0);

    const firstSuccess = await service.recordCompleted(command);
    const replay = await service.recordCompleted(command);

    expect(firstSuccess).toMatchObject({
      batchId,
      quantity: 2,
      onHandBefore: 6,
      onHandAfter: 4,
      resultingBatchVersion: 2,
      replayed: false,
    });
    expect(replay).toEqual({ ...firstSuccess, replayed: true });

    const [finalBatch, finalMovements, finalAudits, finalEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.client.stockMovement.count({ where: { tenantId, idempotencyKey } }),
      prisma.client.auditEvent.count({
        where: {
          tenantId,
          resourceId: batchId,
          eventType: 'inventory.stock.damaged',
        },
      }),
      prisma.client.outboxEvent.count({
        where: {
          tenantId,
          aggregateId: batchId,
          eventType: 'inventory.stock.damaged',
        },
      }),
    ]);

    expect(finalBatch).toMatchObject({
      onHandQuantity: 4,
      heldQuantity: 1,
      version: 2,
    });
    expect(finalMovements).toBe(1);
    expect(finalAudits).toBe(1);
    expect(finalEvents).toBe(1);
  });
});
