import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { Prisma } from '@medsphere/database';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryDamageService } from './inventory-damage.service';
import { InventoryEventWriter } from './inventory-event-writer';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.9 PostgreSQL completed damaged-stock integrity', () => {
  const prisma = new PrismaService();
  const service = new InventoryDamageService(prisma, new AuditWriter(), new InventoryEventWriter());
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

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.9 tenant', slug: `g39-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@test.invalid`,
        passwordHash: 'integration-placeholder',
        firstName: 'Damage',
        lastName: 'Operator',
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
        businessName: 'G3.9 Pharmacy',
        ownerName: 'Owner',
        email: `${providerId}@test.invalid`,
        phone: '0000000000',
        address: 'Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13,
        longitude: 80,
        isVerified: true,
      },
    });
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('decrements available stock, preserves held/received, and replays the immutable result', async () => {
    const fixture = await stock(10, 2);
    const idempotencyKey = `success-${randomUUID()}`;
    const command = {
      actor,
      providerId,
      batchId: fixture.batchId,
      expectedVersion: 1,
      quantity: 2,
      idempotencyKey,
      reason: 'Confirmed crushed blister pack',
    };

    const first = await service.recordCompleted(command);
    await service.recordCompleted({
      ...command,
      expectedVersion: 2,
      quantity: 1,
      idempotencyKey: `later-${randomUUID()}`,
      reason: 'Second confirmed damaged unit',
    });
    const replay = await service.recordCompleted(command);

    expect(first).toMatchObject({
      providerId,
      inventoryId: fixture.inventoryId,
      productId: fixture.productId,
      batchId: fixture.batchId,
      quantity: 2,
      onHandBefore: 10,
      onHandAfter: 8,
      resultingBatchVersion: 2,
      replayed: false,
    });
    expect(replay).toEqual({ ...first, replayed: true });

    const [batch, movement, auditEvents, outboxEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
      prisma.client.stockMovement.findUniqueOrThrow({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      }),
      prisma.client.auditEvent.findMany({
        where: {
          tenantId,
          resourceId: fixture.batchId,
          eventType: 'inventory.stock.damaged',
        },
      }),
      prisma.client.outboxEvent.findMany({
        where: {
          tenantId,
          aggregateId: fixture.batchId,
          eventType: 'inventory.stock.damaged',
        },
        orderBy: { occurredAt: 'asc' },
      }),
    ]);
    expect(batch).toMatchObject({
      receivedQuantity: 10,
      onHandQuantity: 7,
      heldQuantity: 2,
      status: 'ACTIVE',
      version: 3,
    });
    expect(movement).toMatchObject({
      type: 'DAMAGED',
      delta: -2,
      onHandBefore: 10,
      onHandAfter: 8,
      referenceType: 'inventory.stock.damage',
      referenceId: fixture.batchId,
      reason: command.reason,
      actorType: 'TENANT_USER',
      actorMembershipId: membershipId,
      resultingBatchVersion: 2,
      occurredAt: first.occurredAt,
    });
    expect(movement.commandHash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: {
            productId: fixture.productId,
            quantity: 2,
            onHandBefore: 10,
            onHandAfter: 8,
          },
        }),
      ]),
    );
    expect(JSON.stringify(auditEvents)).not.toContain(command.reason);
    expect(outboxEvents).toHaveLength(2);
    expect(outboxEvents[0]).toMatchObject({
      eventType: 'inventory.stock.damaged',
      eventVersion: 1,
      aggregateType: 'Batch',
      aggregateId: fixture.batchId,
      actorType: 'TENANT_USER',
      actorMembershipId: membershipId,
      actorUserId: userId,
      payload: {
        providerId,
        inventoryId: fixture.inventoryId,
        productId: fixture.productId,
        quantity: 2,
        onHandBefore: 10,
        onHandAfter: 8,
        version: 2,
      },
    });
    expect(JSON.stringify(outboxEvents)).not.toContain(command.reason);
  });

  it('exhausts only an unheld zero balance and rejects missing, stale, expired, or held stock', async () => {
    const exhausted = await stock(2, 0);
    await service.recordCompleted({
      actor,
      providerId,
      batchId: exhausted.batchId,
      expectedVersion: 1,
      quantity: 2,
      idempotencyKey: `exhaust-${randomUUID()}`,
      reason: 'Both remaining units confirmed damaged',
    });
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: exhausted.batchId } }),
    ).resolves.toMatchObject({
      receivedQuantity: 2,
      onHandQuantity: 0,
      heldQuantity: 0,
      status: 'EXHAUSTED',
      version: 2,
    });

    const held = await stock(10, 8);
    await expect(
      service.recordCompleted({
        actor,
        providerId,
        batchId: held.batchId,
        expectedVersion: 1,
        quantity: 3,
        idempotencyKey: `held-${randomUUID()}`,
        reason: 'Attempt exceeds available stock',
      }),
    ).rejects.toThrow('exceeds available stock');
    await expect(
      service.recordCompleted({
        actor,
        providerId,
        batchId: held.batchId,
        expectedVersion: 2,
        quantity: 1,
        idempotencyKey: `stale-${randomUUID()}`,
        reason: 'Stale expected version',
      }),
    ).rejects.toThrow('version conflict');

    const expired = await stock(5, 0, new Date('2020-01-01T00:00:00.000Z'));
    await expect(
      service.recordCompleted({
        actor,
        providerId,
        batchId: expired.batchId,
        expectedVersion: 1,
        quantity: 1,
        idempotencyKey: `expired-${randomUUID()}`,
        reason: 'Expired stock cannot use damage workflow',
      }),
    ).rejects.toThrow('expired');
    await expect(
      service.recordCompleted({
        actor,
        providerId,
        batchId: randomUUID(),
        expectedVersion: 1,
        quantity: 1,
        idempotencyKey: `missing-${randomUUID()}`,
        reason: 'Missing batch',
      }),
    ).rejects.toThrow('not found');

    const deleted = await stock(5, 0);
    await prisma.client.batch.update({
      where: { id: deleted.batchId },
      data: { deletedAt: new Date() },
    });
    await expect(
      service.recordCompleted({
        actor,
        providerId,
        batchId: deleted.batchId,
        expectedVersion: 1,
        quantity: 1,
        idempotencyKey: `deleted-${randomUUID()}`,
        reason: 'Deleted batch is concealed',
      }),
    ).rejects.toThrow('not found');

    const inactive = await stock(5, 0);
    await prisma.client.provider.update({ where: { id: providerId }, data: { isActive: false } });
    try {
      await expect(
        service.recordCompleted({
          actor,
          providerId,
          batchId: inactive.batchId,
          expectedVersion: 1,
          quantity: 1,
          idempotencyKey: `inactive-${randomUUID()}`,
          reason: 'Inactive provider is concealed',
        }),
      ).rejects.toThrow('Provider inventory not found');
    } finally {
      await prisma.client.provider.update({ where: { id: providerId }, data: { isActive: true } });
    }
  });

  it('allows one expected-version race winner and conceals replay after access revocation', async () => {
    const fixture = await stock(8, 0);
    const commands = ['a', 'b'].map((suffix) => ({
      actor,
      providerId,
      batchId: fixture.batchId,
      expectedVersion: 1,
      quantity: 2,
      idempotencyKey: `${suffix}-${randomUUID()}`,
      reason: `Concurrent confirmed damage ${suffix}`,
    }));
    const outcomes = await Promise.allSettled(
      commands.map((command) => service.recordCompleted(command)),
    );

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const winnerIndex = outcomes.findIndex(({ status }) => status === 'fulfilled');
    await prisma.client.membershipProviderAccess.deleteMany({
      where: { tenantId, membershipId, providerId },
    });
    await expect(service.recordCompleted(commands[winnerIndex]!)).rejects.toThrow(
      'Provider inventory not found',
    );
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
  });

  it('rolls back batch and movement when audit persistence fails', async () => {
    const fixture = await stock(6, 1);
    const idempotencyKey = `rollback-${randomUUID()}`;
    class FailingAuditWriter extends AuditWriter {
      override async appendTenantUser(): Promise<void> {
        throw new Error('forced audit failure');
      }
    }
    const failingService = new InventoryDamageService(
      prisma,
      new FailingAuditWriter(),
      new InventoryEventWriter(),
    );

    await expect(
      failingService.recordCompleted({
        actor,
        providerId,
        batchId: fixture.batchId,
        expectedVersion: 1,
        quantity: 2,
        idempotencyKey,
        reason: 'Rollback fixture',
      }),
    ).rejects.toThrow('forced audit failure');
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
    ).resolves.toMatchObject({ onHandQuantity: 6, heldQuantity: 1, version: 1 });
    await expect(
      prisma.client.stockMovement.count({ where: { tenantId, idempotencyKey } }),
    ).resolves.toBe(0);
  });

  it('rolls back state, movement, and audit when outbox persistence fails', async () => {
    const fixture = await stock(6, 1);
    const idempotencyKey = `outbox-rollback-${randomUUID()}`;
    class FailingInventoryEventWriter extends InventoryEventWriter {
      override async appendTenantUser(): Promise<void> {
        throw new Error('forced outbox failure');
      }
    }
    const failingService = new InventoryDamageService(
      prisma,
      new AuditWriter(),
      new FailingInventoryEventWriter(),
    );

    await expect(
      failingService.recordCompleted({
        actor,
        providerId,
        batchId: fixture.batchId,
        expectedVersion: 1,
        quantity: 2,
        idempotencyKey,
        reason: 'Outbox rollback fixture',
      }),
    ).rejects.toThrow('forced outbox failure');
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
    ).resolves.toMatchObject({ onHandQuantity: 6, heldQuantity: 1, version: 1 });
    await expect(
      prisma.client.stockMovement.count({ where: { tenantId, idempotencyKey } }),
    ).resolves.toBe(0);
    await expect(
      prisma.client.auditEvent.count({
        where: { tenantId, resourceId: fixture.batchId, eventType: 'inventory.stock.damaged' },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.client.outboxEvent.count({ where: { tenantId, aggregateId: fixture.batchId } }),
    ).resolves.toBe(0);
  });

  it('rolls back the batch when movement persistence fails', async () => {
    const fixture = await stock(6, 1);
    const idempotencyKey = `movement-rollback-${randomUUID()}`;
    await prisma.client.$executeRaw(
      Prisma.sql`DROP TRIGGER IF EXISTS "G39_forced_movement_failure" ON "StockMovement"`,
    );
    await prisma.client.$executeRaw(
      Prisma.sql`CREATE OR REPLACE FUNCTION g39_reject_forced_movement()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."referenceType" = 'inventory.stock.damage'
             AND NEW."reason" = 'G3.9 forced movement failure' THEN
            RAISE EXCEPTION 'forced movement failure';
          END IF;
          RETURN NEW;
        END $$`,
    );
    await prisma.client.$executeRaw(
      Prisma.sql`CREATE TRIGGER "G39_forced_movement_failure"
        BEFORE INSERT ON "StockMovement"
        FOR EACH ROW EXECUTE FUNCTION g39_reject_forced_movement()`,
    );
    try {
      await expect(
        service.recordCompleted({
          actor,
          providerId,
          batchId: fixture.batchId,
          expectedVersion: 1,
          quantity: 2,
          idempotencyKey,
          reason: 'G3.9 forced movement failure',
        }),
      ).rejects.toThrow('forced movement failure');
    } finally {
      await prisma.client.$executeRaw(
        Prisma.sql`DROP TRIGGER IF EXISTS "G39_forced_movement_failure" ON "StockMovement"`,
      );
      await prisma.client.$executeRaw(
        Prisma.sql`DROP FUNCTION IF EXISTS g39_reject_forced_movement()`,
      );
    }
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: fixture.batchId } }),
    ).resolves.toMatchObject({ onHandQuantity: 6, heldQuantity: 1, version: 1 });
    await expect(
      prisma.client.stockMovement.count({ where: { tenantId, idempotencyKey } }),
    ).resolves.toBe(0);
  });

  it('installs the permission and rejects malformed G3.9 movement rows at the database boundary', async () => {
    const fixture = await stock(4, 0);
    await expect(
      prisma.client.permission.findUniqueOrThrow({ where: { name: 'inventory.stock.damage' } }),
    ).resolves.toMatchObject({ name: 'inventory.stock.damage' });

    await expect(
      prisma.client.stockMovement.create({
        data: {
          id: randomUUID(),
          tenantId,
          inventoryId: fixture.inventoryId,
          batchId: fixture.batchId,
          providerId,
          productId: fixture.productId,
          type: 'ADJUSTMENT',
          delta: -1,
          onHandBefore: 4,
          onHandAfter: 3,
          referenceType: 'inventory.stock.damage',
          referenceId: fixture.batchId,
          reason: 'Invalid movement type',
          idempotencyKey: `invalid-${randomUUID()}`,
          commandHash: 'a'.repeat(64),
          resultingBatchVersion: 2,
          actorType: 'TENANT_USER',
          actorMembershipId: membershipId,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.client.stockMovement.create({
        data: {
          id: randomUUID(),
          tenantId,
          inventoryId: fixture.inventoryId,
          batchId: fixture.batchId,
          providerId,
          productId: fixture.productId,
          type: 'DAMAGED',
          delta: -1,
          onHandBefore: 4,
          onHandAfter: 3,
          referenceType: 'inventory.stock.damage',
          referenceId: fixture.batchId,
          reason: null,
          idempotencyKey: `invalid-null-${randomUUID()}`,
          commandHash: null,
          resultingBatchVersion: 2,
          actorType: 'TENANT_USER',
          actorMembershipId: membershipId,
        },
      }),
    ).rejects.toThrow();
  });

  async function stock(
    onHandQuantity: number,
    heldQuantity: number,
    expiryDate = new Date('2030-01-01T00:00:00.000Z'),
  ) {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'G3.9 Medicine',
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
        sellingPrice: '12.00',
        mrp: '15.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
      },
    });
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId,
        inventoryId,
        providerId,
        productId,
        batchNumber: `G39-${randomUUID()}`,
        manufacturingDate: new Date('2019-01-01T00:00:00.000Z'),
        expiryDate,
        receivedQuantity: onHandQuantity,
        onHandQuantity,
        heldQuantity,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
      },
    });
    return { productId, inventoryId, batchId };
  }
});
