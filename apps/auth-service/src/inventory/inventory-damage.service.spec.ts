import { createHash } from 'node:crypto';
import { InventoryDamageService } from './inventory-damage.service';

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };
const command = {
  actor,
  providerId: 'provider-1',
  batchId: 'batch-1',
  expectedVersion: 1,
  quantity: 2,
  idempotencyKey: 'damage-1',
  reason: 'Confirmed damaged packaging',
} as const;

function harness() {
  const transaction = {
    membershipProviderAccess: { findFirst: jest.fn() },
    stockMovement: { findUnique: jest.fn(), create: jest.fn() },
    batch: { findFirst: jest.fn(), updateMany: jest.fn() },
    auditEvent: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const client = {
    ...transaction,
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendTenantUser: jest.fn() };
  return {
    transaction,
    client,
    audit,
    service: new InventoryDamageService({ client } as never, audit as never),
  };
}

function expectedHash(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        tenantId: actor.tenantId,
        providerId: command.providerId,
        batchId: command.batchId,
        expectedVersion: command.expectedVersion,
        quantity: command.quantity,
        idempotencyKey: command.idempotencyKey,
        reason: command.reason,
      }),
    )
    .digest('hex');
}

describe('InventoryDamageService', () => {
  it('rejects unsafe command values before opening a transaction', async () => {
    const h = harness();

    await expect(h.service.recordCompleted({ ...command, expectedVersion: 0 })).rejects.toThrow(
      'positive safe integer',
    );
    await expect(
      h.service.recordCompleted({ ...command, quantity: 2_147_483_648 }),
    ).rejects.toThrow('database-safe');
    await expect(h.service.recordCompleted({ ...command, reason: '' })).rejects.toThrow('1 to 500');
    await expect(h.service.recordCompleted({ ...command, reason: ' padded ' })).rejects.toThrow(
      '1 to 500',
    );
    expect(h.client.$transaction).not.toHaveBeenCalled();
  });

  it('checks live provider assignment before looking up replay receipts', async () => {
    const h = harness();
    h.transaction.membershipProviderAccess.findFirst.mockResolvedValue(null);

    await expect(h.service.recordCompleted(command)).rejects.toThrow(
      'Provider inventory not found',
    );
    expect(h.transaction.stockMovement.findUnique).not.toHaveBeenCalled();
  });

  it('returns the immutable movement snapshot on exact replay', async () => {
    const h = harness();
    const occurredAt = new Date('2026-08-10T12:00:00.000Z');
    h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    h.transaction.stockMovement.findUnique.mockResolvedValue({
      id: 'movement-1',
      providerId: command.providerId,
      inventoryId: 'inventory-1',
      productId: 'product-1',
      batchId: command.batchId,
      type: 'DAMAGED',
      delta: -2,
      onHandBefore: 10,
      onHandAfter: 8,
      referenceType: 'inventory.stock.damage',
      referenceId: command.batchId,
      commandHash: expectedHash(),
      resultingBatchVersion: 2,
      occurredAt,
    });

    await expect(h.service.recordCompleted(command)).resolves.toEqual({
      providerId: command.providerId,
      inventoryId: 'inventory-1',
      productId: 'product-1',
      batchId: command.batchId,
      movementId: 'movement-1',
      quantity: 2,
      onHandBefore: 10,
      onHandAfter: 8,
      resultingBatchVersion: 2,
      occurredAt,
      replayed: true,
    });
    expect(h.transaction.batch.findFirst).not.toHaveBeenCalled();
  });

  it('rejects same-key replay with a different command hash', async () => {
    const h = harness();
    h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    h.transaction.stockMovement.findUnique.mockResolvedValue({
      id: 'movement-1',
      providerId: command.providerId,
      inventoryId: 'inventory-1',
      productId: 'product-1',
      batchId: command.batchId,
      type: 'DAMAGED',
      delta: -2,
      onHandBefore: 10,
      onHandAfter: 8,
      referenceType: 'inventory.stock.damage',
      referenceId: command.batchId,
      commandHash: '0'.repeat(64),
      resultingBatchVersion: 2,
      occurredAt: new Date(),
    });

    await expect(h.service.recordCompleted(command)).rejects.toThrow('another command');
  });
});
