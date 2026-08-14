import { ReservationExpiryService } from './reservation-expiry.service';

const asOf = new Date('2026-08-09T00:00:00.000Z');
const candidate = { id: 'reservation-1', tenantId: 'tenant-1', providerId: 'provider-1' };

function activeReservation(overrides: Record<string, unknown> = {}) {
  return {
    ...candidate,
    status: 'CONFIRMED',
    version: 3,
    expiresAt: new Date('2026-08-08T23:00:00.000Z'),
    items: [{ quantity: 4 }],
    allocations: [
      {
        id: 'allocation-1',
        inventoryId: 'inventory-1',
        batchId: 'batch-1',
        productId: 'product-1',
        quantity: 4,
        status: 'HELD',
        batch: { onHandQuantity: 10, heldQuantity: 4, version: 6 },
      },
    ],
    ...overrides,
  };
}

function createHarness() {
  const transaction = {
    medicineReservation: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    medicineReservationAllocation: { updateMany: jest.fn() },
    medicineReservationCommand: { create: jest.fn() },
    batch: { updateMany: jest.fn() },
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
  const events = { appendTenantSystem: jest.fn() };
  const service = new ReservationExpiryService(
    { client } as never,
    audit as never,
    events as never,
  );
  transaction.medicineReservation.updateMany.mockResolvedValue({ count: 1 });
  transaction.medicineReservationAllocation.updateMany.mockResolvedValue({ count: 1 });
  transaction.medicineReservationCommand.create.mockResolvedValue({ id: 'command-1' });
  transaction.batch.updateMany.mockResolvedValue({ count: 1 });
  return { audit, client, events, service, transaction };
}

describe('ReservationExpiryService', () => {
  it('expires due stock holds atomically with system audit and unchanged on-hand stock', async () => {
    const harness = createHarness();
    harness.client.medicineReservation.findMany
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue(activeReservation());

    const summary = await harness.service.run({ batchSize: 10, maximumRecords: 100 });

    expect(summary).toMatchObject({ selected: 1, expired: 1, skipped: 0, failed: 0 });
    expect(harness.client.medicineReservation.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: { in: ['PENDING', 'CONFIRMED', 'READY'] },
        expiresAt: { lte: asOf },
      },
      orderBy: [{ expiresAt: 'asc' }, { tenantId: 'asc' }, { id: 'asc' }],
      take: 10,
      select: { id: true, tenantId: true, providerId: true },
    });
    expect(harness.transaction.batch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: candidate.tenantId,
        providerId: candidate.providerId,
        onHandQuantity: 10,
        heldQuantity: 4,
        version: 6,
      }),
      data: { heldQuantity: { decrement: 4 }, version: { increment: 1 } },
    });
    expect(harness.transaction.medicineReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'EXPIRED', expiredAt: asOf, version: { increment: 1 } },
      }),
    );
    expect(harness.transaction.medicineReservationCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commandType: 'EXPIRE',
        resultingStatus: 'EXPIRED',
        resultingVersion: 4,
        idempotencyKey: 'expiry:reservation-1:3',
        commandHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      select: { id: true },
    });
    expect(harness.audit.appendTenantSystem).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        tenantId: candidate.tenantId,
        eventType: 'inventory.reservation.expired',
        metadata: {
          previousStatus: 'CONFIRMED',
          version: 4,
          totalQuantity: 4,
        },
      }),
    );
    expect(harness.events.appendTenantSystem).toHaveBeenCalledWith(
      harness.transaction,
      candidate.tenantId,
      'reservation-expiry-worker',
      expect.objectContaining({
        eventType: 'inventory.reservation.expired',
        payload: expect.objectContaining({ cause: 'RESERVATION_EXPIRY', status: 'EXPIRED' }),
      }),
    );
  });

  it('skips a reservation that became terminal after selection', async () => {
    const harness = createHarness();
    harness.client.medicineReservation.findMany
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue(
      activeReservation({ status: 'CANCELLED' }),
    );

    await expect(
      harness.service.run({ batchSize: 10, maximumRecords: 100 }),
    ).resolves.toMatchObject({ selected: 1, expired: 0, skipped: 1, failed: 0 });
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
  });

  it('skips a reservation that is no longer due after selection', async () => {
    const harness = createHarness();
    harness.client.medicineReservation.findMany
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue(
      activeReservation({ expiresAt: new Date('2026-08-09T01:00:00.000Z') }),
    );

    await expect(
      harness.service.run({ batchSize: 10, maximumRecords: 100 }),
    ).resolves.toMatchObject({ selected: 1, expired: 0, skipped: 1, failed: 0 });
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
  });

  it('counts an invalid reservation, continues, and never retries it within the run', async () => {
    const harness = createHarness();
    const second = { ...candidate, id: 'reservation-2' };
    harness.client.medicineReservation.findMany
      .mockResolvedValueOnce([candidate, second])
      .mockResolvedValueOnce([]);
    harness.transaction.medicineReservation.findFirst
      .mockResolvedValueOnce(activeReservation({ allocations: [] }))
      .mockResolvedValueOnce(activeReservation({ id: second.id }));

    const summary = await harness.service.run({ batchSize: 2, maximumRecords: 2 });

    expect(summary).toMatchObject({
      selected: 2,
      expired: 1,
      skipped: 0,
      failed: 1,
      failures: { invariant_conflict: 1 },
    });
    expect(harness.client.medicineReservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects unbounded run configuration before querying the database', async () => {
    const harness = createHarness();
    await expect(harness.service.run({ batchSize: 101, maximumRecords: 100 })).rejects.toThrow(
      'batch size',
    );
    expect(harness.client.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports an audit failure as a failed record instead of claiming expiry success', async () => {
    const harness = createHarness();
    harness.client.medicineReservation.findMany
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue(activeReservation());
    harness.audit.appendTenantSystem.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      harness.service.run({ batchSize: 10, maximumRecords: 100 }),
    ).resolves.toMatchObject({
      selected: 1,
      expired: 0,
      skipped: 0,
      failed: 1,
      failures: { unexpected: 1 },
    });
  });
});
