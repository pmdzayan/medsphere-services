import { BatchExpiryService } from './batch-expiry.service';

const asOf = new Date('2026-08-10T12:00:00.000Z');
const candidate = {
  id: 'batch-1',
  tenantId: 'tenant-1',
  inventoryId: 'inventory-1',
  providerId: 'provider-1',
  productId: 'product-1',
};
const config = {
  batchSize: 10,
  maximumRecords: 100,
  maximumReservationsPerBatch: 50,
  maximumAllocationsPerBatch: 500,
};

function dueBatch(overrides: Record<string, unknown> = {}) {
  return {
    ...candidate,
    status: 'ACTIVE',
    receivedQuantity: 20,
    onHandQuantity: 20,
    heldQuantity: 4,
    expiryDate: new Date('2026-08-10T11:00:00.000Z'),
    version: 3,
    deletedAt: null,
    ...overrides,
  };
}

function reservation() {
  return {
    id: 'reservation-1',
    tenantId: candidate.tenantId,
    providerId: candidate.providerId,
    status: 'CONFIRMED',
    version: 2,
    expiresAt: new Date('2026-08-11T00:00:00.000Z'),
    items: [{ quantity: 4 }],
    allocations: [
      {
        id: 'allocation-1',
        inventoryId: candidate.inventoryId,
        batchId: candidate.id,
        productId: candidate.productId,
        quantity: 4,
        status: 'HELD',
        batch: { onHandQuantity: 20, heldQuantity: 4, version: 3 },
      },
    ],
  };
}

function createHarness() {
  const transaction = {
    batch: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    medicineReservation: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    medicineReservationAllocation: { findMany: jest.fn(), updateMany: jest.fn() },
    medicineReservationCommand: { create: jest.fn() },
    batchExpiryRecord: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const client = {
    ...transaction,
    $queryRaw: jest.fn().mockResolvedValue([{ asOf }]),
    $transaction: jest.fn(async (operation: (database: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendTenantSystem: jest.fn() };
  const service = new BatchExpiryService({ client } as never, audit as never);
  transaction.batch.findMany.mockResolvedValueOnce([candidate]).mockResolvedValueOnce([]);
  transaction.batch.findFirst
    .mockResolvedValueOnce(dueBatch())
    .mockResolvedValueOnce(dueBatch({ heldQuantity: 0, version: 4 }));
  transaction.medicineReservation.findMany.mockResolvedValue([{ id: 'reservation-1' }]);
  transaction.medicineReservationAllocation.findMany.mockResolvedValue([{ id: 'allocation-1' }]);
  transaction.medicineReservation.findFirst.mockResolvedValue(reservation());
  transaction.medicineReservationAllocation.updateMany.mockResolvedValue({ count: 1 });
  transaction.medicineReservation.updateMany.mockResolvedValue({ count: 1 });
  transaction.medicineReservationCommand.create.mockResolvedValue({ id: 'command-1' });
  transaction.batch.updateMany.mockResolvedValue({ count: 1 });
  transaction.batchExpiryRecord.create.mockResolvedValue({ id: 'expiry-1' });
  return { audit, client, service, transaction };
}

describe('BatchExpiryService', () => {
  it('releases reservations, preserves physical stock, and records immutable expiry evidence', async () => {
    const harness = createHarness();
    const summary = await harness.service.run(config);

    expect(summary).toMatchObject({
      selected: 1,
      reconciled: 1,
      failed: 0,
      affectedReservations: 1,
      releasedUnits: 4,
    });
    expect(harness.transaction.batch.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: candidate.id,
        receivedQuantity: 20,
        onHandQuantity: 20,
        heldQuantity: 0,
        version: 4,
      }),
      data: { status: 'EXPIRED', version: { increment: 1 } },
    });
    expect(harness.transaction.batchExpiryRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: candidate.id,
        onHandQuantity: 20,
        resultingBatchVersion: 5,
        reconciledAt: asOf,
        createdAt: asOf,
      }),
      select: { id: true },
    });
    expect(harness.audit.appendTenantSystem).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        eventType: 'inventory.reservation.expired',
        occurredAt: asOf,
        metadata: expect.objectContaining({ cause: 'BATCH_EXPIRY' }),
      }),
    );
    expect(harness.audit.appendTenantSystem).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        eventType: 'inventory.batch.expired',
        occurredAt: asOf,
        metadata: expect.objectContaining({ onHandQuantity: 20, resultingVersion: 5 }),
      }),
    );
    expect((harness.transaction as Record<string, unknown>).stockMovement).toBeUndefined();
  });

  it('skips a batch that is no longer due or active after selection', async () => {
    const harness = createHarness();
    harness.transaction.batch.findFirst
      .mockReset()
      .mockResolvedValueOnce(dueBatch({ status: 'EXPIRED' }));
    await expect(harness.service.run(config)).resolves.toMatchObject({
      selected: 1,
      reconciled: 0,
      skipped: 1,
      failed: 0,
    });
    expect(harness.transaction.batchExpiryRecord.create).not.toHaveBeenCalled();
  });

  it('fails a candidate closed before mutation when its reservation limit is exceeded', async () => {
    const harness = createHarness();
    harness.transaction.medicineReservation.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({ id: `reservation-${index}` })),
    );
    await expect(harness.service.run(config)).resolves.toMatchObject({
      selected: 1,
      reconciled: 0,
      failed: 1,
      failures: { limit_exceeded: 1 },
    });
    expect(harness.transaction.medicineReservationAllocation.updateMany).not.toHaveBeenCalled();
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid configuration before requesting database time', async () => {
    const harness = createHarness();
    await expect(
      harness.service.run({ ...config, maximumAllocationsPerBatch: 5_001 }),
    ).rejects.toThrow('allocation limit');
    expect(harness.client.$queryRaw).not.toHaveBeenCalled();
  });
});
