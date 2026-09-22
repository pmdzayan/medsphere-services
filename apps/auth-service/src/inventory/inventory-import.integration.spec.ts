import { randomInt, randomUUID } from 'node:crypto';

import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityEvidenceService } from './availability-evidence.service';
import { InventoryImportService } from './inventory-import.service';

const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infra('Task 0042 PostgreSQL pharmacy inventory import integrity', () => {
  const prisma = new PrismaService();
  const service = new InventoryImportService(
    prisma,
    new AuditWriter(),
    new AvailabilityEvidenceService(),
  );

  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId, membershipId };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'Task 0042 tenant', slug: `task0042-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@task0042.invalid`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Import',
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
        businessName: 'Task 0042 Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${providerId}@task0042.invalid`,
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

  it('keeps staging non-mutating, applies all rows atomically, and replays one immutable receipt', async () => {
    const first = await product('First');
    const second = await product('Second');
    const identifier = makeEan13();
    await prisma.client.productIdentifier.create({
      data: {
        id: randomUUID(),
        productId: first,
        type: 'EAN',
        value: identifier,
        normalizedValue: identifier.padStart(14, '0'),
        isPrimary: true,
      },
    });

    const staged = await service.stage(actor, providerId, {
      sourceFormat: 'CSV',
      sourceFileName: 'task-0042-valid.csv',
      contentHash: 'a'.repeat(64),
      stageIdempotencyKey: `stage-${randomUUID()}`,
      mapping: validMapping(),
      rows: [
        row(2, { identifier, batchNumber: `B-${randomUUID()}`, quantity: '7' }),
        row(3, { productId: second, batchNumber: `B-${randomUUID()}`, quantity: '11' }),
      ],
    });

    expect(staged).toMatchObject({
      status: 'STAGED',
      rowCount: 2,
      validRowCount: 2,
      invalidRowCount: 0,
      replayed: false,
    });

    const [inventoryBefore, batchesBefore, movementsBefore] = await Promise.all([
      prisma.client.inventory.count({
        where: { tenantId, providerId, productId: { in: [first, second] } },
      }),
      prisma.client.batch.count({
        where: { tenantId, providerId, productId: { in: [first, second] } },
      }),
      prisma.client.stockMovement.count({
        where: { tenantId, providerId, productId: { in: [first, second] } },
      }),
    ]);
    expect({ inventoryBefore, batchesBefore, movementsBefore }).toEqual({
      inventoryBefore: 0,
      batchesBefore: 0,
      movementsBefore: 0,
    });

    const applyKey = `apply-${randomUUID()}`;
    const applied = await service.apply(actor, providerId, staged.importJobId, {
      idempotencyKey: applyKey,
    });
    const replay = await service.apply(actor, providerId, staged.importJobId, {
      idempotencyKey: applyKey,
    });

    expect(applied).toMatchObject({
      appliedRowCount: 2,
      totalQuantity: 18,
      replayed: false,
    });
    expect(replay).toEqual({ ...applied, replayed: true });

    const [inventories, batches, movements, observations, receipts, audits] = await Promise.all([
      prisma.client.inventory.findMany({
        where: { tenantId, providerId, productId: { in: [first, second] } },
        orderBy: { productId: 'asc' },
      }),
      prisma.client.batch.findMany({
        where: { tenantId, providerId, productId: { in: [first, second] } },
        orderBy: { productId: 'asc' },
      }),
      prisma.client.stockMovement.findMany({
        where: { tenantId, providerId, productId: { in: [first, second] } },
        orderBy: { productId: 'asc' },
      }),
      prisma.client.batchStockObservation.findMany({
        where: { tenantId, providerId, productId: { in: [first, second] } },
        orderBy: { productId: 'asc' },
      }),
      prisma.client.inventoryImportReceipt.findMany({
        where: { tenantId, providerId, importJobId: staged.importJobId },
      }),
      prisma.client.auditEvent.findMany({
        where: {
          tenantId,
          resourceId: staged.importJobId,
          eventType: { in: ['inventory.import.staged', 'inventory.import.applied'] },
        },
      }),
    ]);

    expect(inventories).toHaveLength(2);
    expect(
      batches.map(({ receivedQuantity, onHandQuantity, heldQuantity }) => ({
        receivedQuantity,
        onHandQuantity,
        heldQuantity,
      })),
    ).toEqual([
      { receivedQuantity: 7, onHandQuantity: 7, heldQuantity: 0 },
      { receivedQuantity: 11, onHandQuantity: 11, heldQuantity: 0 },
    ]);
    expect(
      movements.map(({ type, delta, onHandBefore, onHandAfter }) => ({
        type,
        delta,
        onHandBefore,
        onHandAfter,
      })),
    ).toEqual([
      { type: 'STOCK_IN', delta: 7, onHandBefore: 0, onHandAfter: 7 },
      { type: 'STOCK_IN', delta: 11, onHandBefore: 0, onHandAfter: 11 },
    ]);
    expect(observations.map(({ observedOnHandQuantity }) => observedOnHandQuantity)).toEqual([
      7, 11,
    ]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      id: applied.receiptId,
      appliedRowCount: 2,
      totalQuantity: 18,
      actorMembershipId: membershipId,
    });
    expect(audits.map(({ eventType }) => eventType).sort()).toEqual([
      'inventory.import.applied',
      'inventory.import.staged',
    ]);

    await expect(
      prisma.client.inventoryImportReceipt.update({
        where: { id: applied.receiptId },
        data: { totalQuantity: 999 },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('never mutates stock when a staged row is invalid', async () => {
    const productId = await product('Invalid');
    const staged = await service.stage(actor, providerId, {
      sourceFormat: 'CSV',
      sourceFileName: 'task-0042-invalid.csv',
      contentHash: 'b'.repeat(64),
      stageIdempotencyKey: `stage-${randomUUID()}`,
      mapping: validMapping(),
      rows: [
        row(2, {
          productId,
          batchNumber: `B-${randomUUID()}`,
          expiryDate: '2020-01-01',
          quantity: '5',
        }),
      ],
    });

    expect(staged).toMatchObject({ validRowCount: 0, invalidRowCount: 1 });
    expect(staged.rows[0].validationErrors).toContain('EXPIRY_DATE_NOT_FUTURE');

    await expect(
      service.apply(actor, providerId, staged.importJobId, {
        idempotencyKey: `apply-${randomUUID()}`,
      }),
    ).rejects.toThrow('contains invalid rows');

    await expect(
      prisma.client.inventory.count({ where: { tenantId, providerId, productId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.client.stockMovement.count({ where: { tenantId, providerId, productId } }),
    ).resolves.toBe(0);
  });

  it('fails closed when inventory changes after preview and leaves no imported batch', async () => {
    const productId = await product('Stale');
    const inventoryId = randomUUID();
    await prisma.client.inventory.create({
      data: {
        id: inventoryId,
        tenantId,
        providerId,
        productId,
        sellingPrice: '12.00',
        mrp: '15.00',
        discountPercentage: '0.00',
        taxPercentage: '0.00',
        minimumStockLevel: 1,
      },
    });

    const batchNumber = `B-${randomUUID()}`;
    const staged = await service.stage(actor, providerId, {
      sourceFormat: 'XLSX',
      sourceFileName: 'task-0042-stale.xlsx',
      contentHash: 'c'.repeat(64),
      stageIdempotencyKey: `stage-${randomUUID()}`,
      mapping: validMapping(),
      rows: [row(2, { productId, batchNumber, quantity: '4' })],
    });
    expect(staged).toMatchObject({ validRowCount: 1, invalidRowCount: 0 });

    await prisma.client.inventory.update({
      where: { id: inventoryId },
      data: { version: { increment: 1 }, sellingPrice: '13.00' },
    });

    await expect(
      service.apply(actor, providerId, staged.importJobId, {
        idempotencyKey: `apply-${randomUUID()}`,
      }),
    ).rejects.toThrow('changed after import preview');

    await expect(
      prisma.client.batch.count({ where: { tenantId, providerId, productId, batchNumber } }),
    ).resolves.toBe(0);
    await expect(
      prisma.client.inventoryImportReceipt.count({ where: { importJobId: staged.importJobId } }),
    ).resolves.toBe(0);
  });

  it('conceals a provider when the actor belongs to another tenant', async () => {
    const otherTenantId = randomUUID();
    const otherUserId = randomUUID();
    const otherMembershipId = randomUUID();
    await prisma.client.tenant.create({
      data: {
        id: otherTenantId,
        name: 'Task 0042 other tenant',
        slug: `task0042-other-${otherTenantId}`,
      },
    });
    await prisma.client.user.create({
      data: {
        id: otherUserId,
        email: `${otherUserId}@task0042.invalid`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Other',
        lastName: 'Operator',
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: otherMembershipId,
        tenantId: otherTenantId,
        userId: otherUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    const productId = await product('Tenant isolation');
    await expect(
      service.stage(
        { tenantId: otherTenantId, userId: otherUserId, membershipId: otherMembershipId },
        providerId,
        {
          sourceFormat: 'CSV',
          sourceFileName: 'cross-tenant.csv',
          contentHash: 'd'.repeat(64),
          stageIdempotencyKey: `stage-${randomUUID()}`,
          mapping: validMapping(),
          rows: [row(2, { productId, batchNumber: `B-${randomUUID()}` })],
        },
      ),
    ).rejects.toThrow('Provider inventory not found');
  });

  async function product(label: string): Promise<string> {
    const productId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: `Task 0042 ${label} Medicine`,
        brand: `Brand ${label}`,
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });
    return productId;
  }

  function validMapping() {
    return {
      Product: 'productId',
      Barcode: 'identifier',
      Batch: 'batchNumber',
      Expiry: 'expiryDate',
      Quantity: 'quantity',
      Purchase: 'purchasePrice',
      MRP: 'mrp',
      Selling: 'sellingPrice',
    } as const;
  }

  function row(
    rowNumber: number,
    override: Partial<{
      productId: string;
      identifier: string;
      batchNumber: string;
      manufacturingDate: string;
      expiryDate: string;
      quantity: string;
    }> = {},
  ) {
    return {
      rowNumber,
      sellingPrice: '12.00',
      mrp: '15.00',
      discountPercentage: '0.00',
      taxPercentage: '5.00',
      minimumStockLevel: '2',
      isVisible: 'true',
      batchNumber: override.batchNumber ?? `B-${randomUUID()}`,
      manufacturingDate: override.manufacturingDate ?? '2026-01-01',
      expiryDate: override.expiryDate ?? '2030-01-01',
      quantity: override.quantity ?? '3',
      purchasePrice: '10.00',
      ...(override.productId ? { productId: override.productId } : {}),
      ...(override.identifier ? { identifier: override.identifier } : {}),
    };
  }

  function makeEan13(): string {
    const payload = String(randomInt(100_000_000_000, 1_000_000_000_000));
    let sum = 0;
    for (let index = payload.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
      sum += Number(payload[index]) * (position % 2 === 0 ? 3 : 1);
    }
    return `${payload}${(10 - (sum % 10)) % 10}`;
  }
});
