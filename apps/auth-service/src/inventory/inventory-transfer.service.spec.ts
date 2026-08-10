import { createHash } from 'node:crypto';
import { InventoryTransferService } from './inventory-transfer.service';
const actor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };
const command = {
  actor,
  sourceProviderId: 'source',
  destinationProviderId: 'destination',
  sourceBatchId: 'batch',
  expectedSourceVersion: 1,
  quantity: 2,
  idempotencyKey: 'transfer-1',
} as const;
function harness() {
  const tx = {
    membershipProviderAccess: { findFirst: jest.fn() },
    inventoryTransfer: { findUnique: jest.fn(), create: jest.fn() },
    batch: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    inventory: { findFirst: jest.fn() },
    stockMovement: { createMany: jest.fn() },
    auditEvent: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const client = {
    ...tx,
    $transaction: jest.fn(async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    tx,
    client,
    service: new InventoryTransferService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
    ),
  };
}
describe('InventoryTransferService', () => {
  it('rejects same-provider and unsafe quantities before a transaction', async () => {
    const h = harness();
    await expect(
      h.service.recordCompleted({ ...command, destinationProviderId: 'source' }),
    ).rejects.toThrow('must be different');
    await expect(
      h.service.recordCompleted({ ...command, quantity: 2_147_483_648 }),
    ).rejects.toThrow('database-safe');
    expect(h.client.$transaction).not.toHaveBeenCalled();
  });
  it('checks both assignments before replay', async () => {
    const h = harness();
    h.tx.membershipProviderAccess.findFirst
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce(null);
    await expect(h.service.recordCompleted(command)).rejects.toThrow(
      'Provider inventory not found',
    );
    expect(h.tx.inventoryTransfer.findUnique).not.toHaveBeenCalled();
  });
  it('returns immutable exact replay and rejects hash mismatch', async () => {
    const h = harness();
    h.tx.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'a' });
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: actor.tenantId,
          sourceProviderId: 'source',
          destinationProviderId: 'destination',
          sourceBatchId: 'batch',
          expectedSourceVersion: 1,
          quantity: 2,
          idempotencyKey: 'transfer-1',
          reason: null,
        }),
      )
      .digest('hex');
    const receipt = {
      id: 't',
      productId: 'p',
      sourceProviderId: 'source',
      destinationProviderId: 'destination',
      sourceInventoryId: 'si',
      destinationInventoryId: 'di',
      sourceBatchId: 'batch',
      destinationBatchId: 'db',
      sourceMovementId: 'sm',
      destinationMovementId: 'dm',
      quantity: 2,
      commandHash: hash,
      sourceOnHandAfter: 8,
      destinationOnHandAfter: 2,
      sourceBatchVersion: 2,
      destinationBatchVersion: 1,
      completedAt: new Date(),
    };
    h.tx.inventoryTransfer.findUnique.mockResolvedValue(receipt);
    await expect(h.service.recordCompleted(command)).resolves.toMatchObject({
      transferId: 't',
      replayed: true,
      sourceOnHandAfter: 8,
    });
    h.tx.inventoryTransfer.findUnique.mockResolvedValue({
      ...receipt,
      commandHash: '0'.repeat(64),
    });
    await expect(h.service.recordCompleted(command)).rejects.toThrow('another transfer');
  });
});
