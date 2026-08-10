import { createHash } from 'node:crypto';
import { InventoryQuarantineService } from './inventory-quarantine.service';

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };
const command = {
  actor,
  providerId: 'provider-1',
  batchId: 'batch-1',
  expectedVersion: 1,
  idempotencyKey: 'quarantine-command-1',
  reasonCode: 'QUALITY_SUSPECT',
} as const;
const occurredAt = new Date('2026-08-10T14:00:00.000Z');

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: command.batchId,
    tenantId: actor.tenantId,
    inventoryId: 'inventory-1',
    providerId: command.providerId,
    productId: 'product-1',
    status: 'ACTIVE',
    expiryDate: new Date('2027-08-10T00:00:00.000Z'),
    receivedQuantity: 20,
    onHandQuantity: 20,
    heldQuantity: 0,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

function harness() {
  const transaction = {
    membershipProviderAccess: { findFirst: jest.fn() },
    batchQuarantineRecord: { findUnique: jest.fn(), create: jest.fn() },
    batch: { findFirst: jest.fn(), updateMany: jest.fn() },
    medicineReservation: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    medicineReservationAllocation: { findMany: jest.fn(), updateMany: jest.fn() },
    medicineReservationCommand: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const client = {
    ...transaction,
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendTenantUser: jest.fn(), appendTenantSystem: jest.fn() };
  return {
    transaction,
    client,
    audit,
    service: new InventoryQuarantineService({ client } as never, audit as never),
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
        idempotencyKey: command.idempotencyKey,
        reasonCode: command.reasonCode,
      }),
    )
    .digest('hex');
}

function prepareNoHolds(h: ReturnType<typeof harness>) {
  h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
  h.transaction.batchQuarantineRecord.findUnique.mockResolvedValue(null);
  h.transaction.$queryRaw.mockResolvedValue([{ occurredAt }]);
  h.transaction.batch.findFirst
    .mockResolvedValueOnce(batch())
    .mockResolvedValueOnce(batch({ version: 1 }));
  h.transaction.medicineReservation.findMany.mockResolvedValue([]);
  h.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
  h.transaction.batchQuarantineRecord.create.mockResolvedValue({ id: 'record-1' });
}

describe('InventoryQuarantineService', () => {
  it('rejects invalid values before opening a transaction', async () => {
    const h = harness();
    await expect(h.service.quarantine({ ...command, expectedVersion: 0 })).rejects.toThrow(
      'positive database-safe',
    );
    await expect(h.service.quarantine({ ...command, idempotencyKey: 'short' })).rejects.toThrow(
      '8 to 120',
    );
    await expect(
      h.service.quarantine({ ...command, reasonCode: 'FREE_TEXT' as never }),
    ).rejects.toThrow('Unsupported');
    expect(h.client.$transaction).not.toHaveBeenCalled();
  });

  it('authorizes before replay and returns only the immutable receipt on exact replay', async () => {
    const h = harness();
    h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    h.transaction.batchQuarantineRecord.findUnique.mockResolvedValue({
      batchId: command.batchId,
      reasonCode: command.reasonCode,
      onHandQuantity: 20,
      affectedReservationCount: 1,
      releasedUnitCount: 2,
      commandHash: expectedHash(),
      resultingBatchVersion: 3,
      occurredAt,
    });
    await expect(h.service.quarantine(command)).resolves.toEqual({
      batchId: command.batchId,
      status: 'QUARANTINED',
      reasonCode: command.reasonCode,
      onHandQuantity: 20,
      affectedReservationCount: 1,
      releasedUnitCount: 2,
      resultingBatchVersion: 3,
      occurredAt,
      replayed: true,
    });
    expect(h.transaction.membershipProviderAccess.findFirst).toHaveBeenCalled();
    expect(h.transaction.batch.findFirst).not.toHaveBeenCalled();
  });

  it('rejects mismatched replay without reading the batch', async () => {
    const h = harness();
    h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    h.transaction.batchQuarantineRecord.findUnique.mockResolvedValue({
      commandHash: '0'.repeat(64),
    });
    await expect(h.service.quarantine(command)).rejects.toThrow('another command');
    expect(h.transaction.batch.findFirst).not.toHaveBeenCalled();
  });

  it('preserves physical stock, creates no movement, and records the actor atomically', async () => {
    const h = harness();
    prepareNoHolds(h);

    await expect(h.service.quarantine(command)).resolves.toEqual({
      batchId: command.batchId,
      status: 'QUARANTINED',
      reasonCode: command.reasonCode,
      onHandQuantity: 20,
      affectedReservationCount: 0,
      releasedUnitCount: 0,
      resultingBatchVersion: 2,
      occurredAt,
      replayed: false,
    });
    expect(h.transaction.batch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          receivedQuantity: 20,
          onHandQuantity: 20,
          heldQuantity: 0,
          version: 1,
        }),
        data: { status: 'QUARANTINED', version: { increment: 1 } },
      }),
    );
    expect(h.transaction.batchQuarantineRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorMembershipId: actor.membershipId,
        commandHash: expectedHash(),
        idempotencyKey: command.idempotencyKey,
        onHandQuantity: 20,
        resultingBatchVersion: 2,
        createdAt: occurredAt,
        occurredAt,
      }),
      select: { id: true },
    });
    expect(h.audit.appendTenantUser).toHaveBeenCalledWith(
      h.transaction,
      expect.objectContaining({
        eventType: 'inventory.batch.quarantined',
        actorMembershipId: actor.membershipId,
        occurredAt,
      }),
    );
    expect((h.transaction as Record<string, unknown>).stockMovement).toBeUndefined();
  });

  it('releases complete multi-batch holds and cancels the affected reservation once', async () => {
    const h = harness();
    h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    h.transaction.batchQuarantineRecord.findUnique.mockResolvedValue(null);
    h.transaction.$queryRaw.mockResolvedValue([{ occurredAt }]);
    h.transaction.batch.findFirst
      .mockResolvedValueOnce(batch({ heldQuantity: 2 }))
      .mockResolvedValueOnce(batch({ heldQuantity: 0, version: 2 }));
    h.transaction.medicineReservation.findMany.mockResolvedValue([{ id: 'reservation-1' }]);
    h.transaction.medicineReservationAllocation.findMany.mockResolvedValue([
      { id: 'allocation-1' },
      { id: 'allocation-2' },
    ]);
    h.transaction.medicineReservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      tenantId: actor.tenantId,
      providerId: command.providerId,
      status: 'READY',
      version: 4,
      items: [{ quantity: 5 }],
      allocations: [
        {
          id: 'allocation-1',
          inventoryId: 'inventory-1',
          batchId: command.batchId,
          productId: 'product-1',
          quantity: 2,
          status: 'HELD',
          batch: { onHandQuantity: 20, heldQuantity: 2, version: 1 },
        },
        {
          id: 'allocation-2',
          inventoryId: 'inventory-2',
          batchId: 'batch-2',
          productId: 'product-1',
          quantity: 3,
          status: 'HELD',
          batch: { onHandQuantity: 10, heldQuantity: 3, version: 7 },
        },
      ],
    });
    h.transaction.batch.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    h.transaction.medicineReservationAllocation.updateMany.mockResolvedValue({ count: 1 });
    h.transaction.medicineReservation.updateMany.mockResolvedValue({ count: 1 });
    h.transaction.medicineReservationCommand.create.mockResolvedValue({ id: 'command-1' });
    h.transaction.batchQuarantineRecord.create.mockResolvedValue({ id: 'record-1' });

    await expect(h.service.quarantine(command)).resolves.toMatchObject({
      affectedReservationCount: 1,
      releasedUnitCount: 5,
      resultingBatchVersion: 3,
    });
    expect(h.transaction.medicineReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'CANCELLED', cancelledAt: occurredAt, version: { increment: 1 } },
      }),
    );
    expect(h.transaction.medicineReservationCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ commandType: 'CANCEL', resultingStatus: 'CANCELLED' }),
      select: { id: true },
    });
    expect(h.audit.appendTenantSystem).toHaveBeenCalledWith(
      h.transaction,
      expect.objectContaining({
        eventType: 'inventory.reservation.cancelled',
        metadata: expect.objectContaining({ cause: 'BATCH_QUARANTINE', totalQuantity: 5 }),
      }),
    );
  });

  it('fails closed on terminal, expired, stale, or unbounded candidates', async () => {
    for (const candidate of [
      batch({ status: 'EXHAUSTED' }),
      batch({ expiryDate: new Date('2020-01-01T00:00:00.000Z') }),
      batch({ version: 2 }),
    ]) {
      const h = harness();
      h.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
      h.transaction.batchQuarantineRecord.findUnique.mockResolvedValue(null);
      h.transaction.$queryRaw.mockResolvedValue([{ occurredAt }]);
      h.transaction.batch.findFirst.mockResolvedValue(candidate);
      await expect(h.service.quarantine(command)).rejects.toThrow();
      expect(h.transaction.batch.updateMany).not.toHaveBeenCalled();
    }

    const limited = harness();
    limited.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    limited.transaction.batchQuarantineRecord.findUnique.mockResolvedValue(null);
    limited.transaction.$queryRaw.mockResolvedValue([{ occurredAt }]);
    limited.transaction.batch.findFirst.mockResolvedValue(batch());
    limited.transaction.medicineReservation.findMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({ id: `reservation-${index}` })),
    );
    await expect(limited.service.quarantine(command)).rejects.toThrow('reservation limit');
    expect(limited.transaction.batch.updateMany).not.toHaveBeenCalled();
  });
});
