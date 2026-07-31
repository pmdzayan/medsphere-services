import { ConflictException } from '@nestjs/common';
import { StockService } from './stock.service';

function createHarness() {
  const transaction = {
    stockMovement: { findUnique: jest.fn(), create: jest.fn() },
    inventoryConfigurationCommand: { findUnique: jest.fn(), create: jest.fn() },
    tenantMembership: { findFirst: jest.fn() },
    provider: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    inventory: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    batch: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };
  const client = {
    ...transaction,
    $transaction: jest.fn(async (operation: (database: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendTenantUser: jest.fn() };
  const service = new StockService({ client } as never, audit as never);
  return { audit, client, service, transaction };
}

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1' };

describe('StockService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-07-31T00:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('creates an inventory configuration with an atomic command receipt and audit', async () => {
    const harness = createHarness();
    harness.transaction.inventoryConfigurationCommand.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.provider.findFirst.mockResolvedValue({ id: 'provider-1' });
    harness.transaction.product.findFirst.mockResolvedValue({ id: 'product-1' });
    harness.transaction.inventory.findUnique.mockResolvedValue(null);
    harness.transaction.inventory.create.mockResolvedValue({ id: 'inventory-created' });
    harness.transaction.inventoryConfigurationCommand.create.mockResolvedValue({ id: 'command-1' });

    const result = await harness.service.configureInventory({
      actor,
      providerId: 'provider-1',
      productId: 'product-1',
      sku: 'SKU-001',
      sellingPrice: '12.00',
      mrp: '15.00',
      discountPercentage: '5.00',
      taxPercentage: '5.00',
      minimumStockLevel: 10,
      isVisible: true,
      idempotencyKey: 'configure-1',
    });

    expect(harness.transaction.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: actor.tenantId,
          providerId: 'provider-1',
          productId: 'product-1',
          minimumStockLevel: 10,
        }),
      }),
    );
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({ eventType: 'inventory.listing.configured' }),
    );
    expect(harness.transaction.inventoryConfigurationCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'configure-1',
          resultingVersion: 1,
          configurationHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ version: 1, replayed: false }));
  });

  it('returns a matching configuration receipt without repeating the mutation', async () => {
    const harness = createHarness();
    let capturedHash = '';
    const command = {
      actor,
      providerId: 'provider-1',
      productId: 'product-1',
      expectedVersion: 1,
      sellingPrice: '12.00',
      mrp: '15.00',
      discountPercentage: '5.00',
      taxPercentage: '5.00',
      minimumStockLevel: 10,
      isVisible: true,
      idempotencyKey: 'configure-1',
    } as const;
    harness.transaction.inventoryConfigurationCommand.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.provider.findFirst.mockResolvedValue({ id: 'provider-1' });
    harness.transaction.product.findFirst.mockResolvedValue({ id: 'product-1' });
    harness.transaction.inventory.findUnique.mockResolvedValue({
      id: 'inventory-1',
      version: 1,
      deletedAt: null,
    });
    harness.transaction.inventory.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.inventoryConfigurationCommand.create.mockImplementation(async (args) => {
      capturedHash = args.data.configurationHash;
      return { id: 'command-1' };
    });
    await harness.service.configureInventory(command);

    harness.transaction.inventoryConfigurationCommand.findUnique.mockResolvedValue({
      inventoryId: 'inventory-1',
      configurationHash: capturedHash,
      resultingVersion: 2,
    });
    harness.transaction.inventory.updateMany.mockClear();
    harness.audit.appendTenantUser.mockClear();
    const replay = await harness.service.configureInventory(command);

    expect(replay).toEqual({ inventoryId: 'inventory-1', version: 2, replayed: true });
    expect(harness.transaction.inventory.updateMany).not.toHaveBeenCalled();
    expect(harness.audit.appendTenantUser).not.toHaveBeenCalled();
  });

  it('receives a batch, movement, and audit in one serializable transaction', async () => {
    const harness = createHarness();
    harness.transaction.stockMovement.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.inventory.findFirst.mockResolvedValue({ id: 'inventory-1' });
    harness.transaction.batch.findUnique.mockResolvedValue(null);
    harness.transaction.batch.create.mockResolvedValue({ id: 'batch-created' });
    harness.transaction.stockMovement.create.mockResolvedValue({ id: 'movement-created' });

    const result = await harness.service.receiveBatch({
      actor,
      inventoryId: 'inventory-1',
      providerId: 'provider-1',
      productId: 'product-1',
      batchNumber: 'BATCH-001',
      expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      quantity: 20,
      purchasePrice: '10.00',
      sellingPrice: '12.00',
      idempotencyKey: 'receive-1',
    });

    expect(harness.client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(harness.transaction.batch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inventoryId: 'inventory-1',
          onHandQuantity: 20,
          heldQuantity: 0,
        }),
      }),
    );
    expect(harness.transaction.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: 20,
          onHandBefore: 0,
          onHandAfter: 20,
          actorMembershipId: actor.membershipId,
        }),
      }),
    );
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({ eventType: 'inventory.batch.received' }),
    );
    expect(result).toEqual(expect.objectContaining({ onHandAfter: 20, replayed: false }));
  });

  it('returns an idempotent receipt replay without repeating writes or audit', async () => {
    const harness = createHarness();
    harness.transaction.stockMovement.findUnique.mockResolvedValue({
      id: 'movement-1',
      type: 'STOCK_IN',
      inventoryId: 'inventory-1',
      batchId: 'batch-1',
      delta: 20,
      onHandBefore: 0,
      onHandAfter: 20,
      referenceType: 'inventory.batch.receive',
      referenceId: 'batch-1',
      batch: { version: 1 },
    });

    const result = await harness.service.receiveBatch({
      actor,
      inventoryId: 'inventory-1',
      providerId: 'provider-1',
      productId: 'product-1',
      batchNumber: 'BATCH-001',
      expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      quantity: 20,
      purchasePrice: '10.00',
      sellingPrice: '12.00',
      idempotencyKey: 'receive-1',
    });

    expect(result.replayed).toBe(true);
    expect(harness.transaction.tenantMembership.findFirst).not.toHaveBeenCalled();
    expect(harness.transaction.batch.create).not.toHaveBeenCalled();
    expect(harness.audit.appendTenantUser).not.toHaveBeenCalled();
  });

  it('rejects an adjustment that would consume held stock before any write', async () => {
    const harness = createHarness();
    harness.transaction.stockMovement.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      inventoryId: 'inventory-1',
      productId: 'product-1',
      receivedQuantity: 20,
      onHandQuantity: 10,
      heldQuantity: 8,
      expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      version: 3,
    });

    await expect(
      harness.service.adjustBatch({
        actor,
        batchId: 'batch-1',
        providerId: 'provider-1',
        expectedVersion: 3,
        delta: -3,
        idempotencyKey: 'adjust-1',
        reason: 'Verified cycle count',
      }),
    ).rejects.toThrow('consume held stock');
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
    expect(harness.transaction.stockMovement.create).not.toHaveBeenCalled();
  });

  it('uses an optimistic conditional update and records the exact adjustment equation', async () => {
    const harness = createHarness();
    harness.transaction.stockMovement.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      inventoryId: 'inventory-1',
      productId: 'product-1',
      receivedQuantity: 20,
      onHandQuantity: 10,
      heldQuantity: 2,
      expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      version: 3,
    });
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.stockMovement.create.mockResolvedValue({ id: 'movement-1' });

    const result = await harness.service.adjustBatch({
      actor,
      batchId: 'batch-1',
      providerId: 'provider-1',
      expectedVersion: 3,
      delta: -4,
      idempotencyKey: 'adjust-1',
      reason: 'Verified cycle count',
    });

    expect(harness.transaction.batch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'batch-1',
        tenantId: actor.tenantId,
        version: 3,
        onHandQuantity: 10,
        heldQuantity: 2,
      },
      data: { onHandQuantity: 6, status: 'ACTIVE', version: { increment: 1 } },
    });
    expect(harness.transaction.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delta: -4, onHandBefore: 10, onHandAfter: 6 }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ onHandAfter: 6, batchVersion: 4 }));
  });

  it('rejects a lost optimistic update and leaves movement/audit unwritten', async () => {
    const harness = createHarness();
    harness.transaction.stockMovement.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      inventoryId: 'inventory-1',
      productId: 'product-1',
      receivedQuantity: 20,
      onHandQuantity: 10,
      heldQuantity: 0,
      expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      version: 3,
    });
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      harness.service.adjustBatch({
        actor,
        batchId: 'batch-1',
        providerId: 'provider-1',
        expectedVersion: 3,
        delta: -1,
        idempotencyKey: 'adjust-1',
        reason: 'Verified cycle count',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.transaction.stockMovement.create).not.toHaveBeenCalled();
    expect(harness.audit.appendTenantUser).not.toHaveBeenCalled();
  });
});
