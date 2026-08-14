import { ConflictException } from '@nestjs/common';
import { ReservationLifecycleService } from './reservation-lifecycle.service';

function createHarness() {
  const transaction = {
    membershipProviderAccess: { findFirst: jest.fn() },
    medicineReservationCommand: { findUnique: jest.fn(), create: jest.fn() },
    medicineReservation: { findFirst: jest.fn(), updateMany: jest.fn() },
    medicineReservationAllocation: { updateMany: jest.fn() },
    batch: { updateMany: jest.fn() },
    stockMovement: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const client = {
    ...transaction,
    $transaction: jest.fn(async (operation: (database: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendTenantUser: jest.fn() };
  const events = { appendTenantUser: jest.fn() };
  const service = new ReservationLifecycleService(
    { client } as never,
    audit as never,
    events as never,
  );
  return { audit, client, events, service, transaction };
}

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };
const allocation = {
  id: 'allocation-1',
  inventoryId: 'inventory-1',
  batchId: 'batch-1',
  productId: 'product-1',
  quantity: 4,
  batch: {
    onHandQuantity: 10,
    heldQuantity: 4,
    version: 6,
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
  },
};

describe('ReservationLifecycleService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-07-31T00:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('authorizes before looking up an idempotency receipt', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue(null);
    harness.transaction.medicineReservationCommand.findUnique.mockResolvedValue({
      reservationId: 'reservation-1',
    });

    await expect(
      harness.service.transition({
        actor,
        providerId: 'provider-1',
        reservationId: 'reservation-1',
        transition: 'CONFIRM',
        expectedVersion: 1,
        idempotencyKey: 'confirm-1',
      }),
    ).rejects.toThrow('Provider inventory not found');
    expect(harness.transaction.medicineReservationCommand.findUnique).not.toHaveBeenCalled();
  });

  it('completes a ready reservation with exact stock, movement hash, audit, and receipt', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    harness.transaction.medicineReservationCommand.findUnique.mockResolvedValue(null);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      status: 'READY',
      version: 3,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      items: [{ quantity: 4 }],
      allocations: [allocation],
    });
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservationAllocation.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.stockMovement.create.mockResolvedValue({ id: 'movement-1' });
    harness.transaction.medicineReservation.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservationCommand.create.mockResolvedValue({ id: 'command-1' });

    const result = await harness.service.transition({
      actor,
      providerId: 'provider-1',
      reservationId: 'reservation-1',
      transition: 'COMPLETE',
      expectedVersion: 3,
      idempotencyKey: 'complete-1',
    });

    expect(harness.transaction.batch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'batch-1',
        tenantId: actor.tenantId,
        onHandQuantity: 10,
        heldQuantity: 4,
        version: 6,
      }),
      data: {
        onHandQuantity: { decrement: 4 },
        heldQuantity: { decrement: 4 },
        status: 'ACTIVE',
        version: { increment: 1 },
      },
    });
    expect(harness.transaction.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'STOCK_OUT',
          delta: -4,
          onHandBefore: 10,
          onHandAfter: 6,
          commandHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          actorMembershipId: actor.membershipId,
          idempotencyKey: expect.stringMatching(/^reservation:[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(harness.events.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      actor,
      expect.objectContaining({
        eventType: 'inventory.reservation.completed',
        payload: expect.objectContaining({ status: 'COMPLETED', totalQuantity: 4, version: 4 }),
      }),
    );
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        eventType: 'inventory.reservation.completed',
        metadata: { previousStatus: 'READY', version: 4, totalQuantity: 4 },
      }),
    );
    expect(result).toEqual({
      reservationId: 'reservation-1',
      status: 'COMPLETED',
      version: 4,
      totalQuantity: 4,
      replayed: false,
    });
  });

  it('cancels an active reservation by releasing holds without changing on-hand stock', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    harness.transaction.medicineReservationCommand.findUnique.mockResolvedValue(null);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      status: 'PENDING',
      version: 1,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      items: [{ quantity: 4 }],
      allocations: [allocation],
    });
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservationAllocation.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservation.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservationCommand.create.mockResolvedValue({ id: 'command-1' });

    const result = await harness.service.transition({
      actor,
      providerId: 'provider-1',
      reservationId: 'reservation-1',
      transition: 'CANCEL',
      expectedVersion: 1,
      idempotencyKey: 'cancel-1',
    });

    expect(harness.transaction.batch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ onHandQuantity: 10, heldQuantity: 4, version: 6 }),
      data: { heldQuantity: { decrement: 4 }, version: { increment: 1 } },
    });
    expect(harness.transaction.stockMovement.create).not.toHaveBeenCalled();
    expect(result.status).toBe('CANCELLED');
  });

  it('blocks staff transitions after expiry for the future system worker', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    harness.transaction.medicineReservationCommand.findUnique.mockResolvedValue(null);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      status: 'PENDING',
      version: 1,
      expiresAt: new Date('2026-07-30T00:00:00.000Z'),
      items: [{ quantity: 4 }],
      allocations: [allocation],
    });

    await expect(
      harness.service.transition({
        actor,
        providerId: 'provider-1',
        reservationId: 'reservation-1',
        transition: 'CANCEL',
        expectedVersion: 1,
        idempotencyKey: 'cancel-expired-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
  });
});
