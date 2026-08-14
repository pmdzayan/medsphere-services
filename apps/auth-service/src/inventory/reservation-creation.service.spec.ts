import { ConflictException } from '@nestjs/common';
import { SerializableRetryError } from '@medsphere/database';
import { ReservationCreationService } from './reservation-creation.service';

function createHarness() {
  const transaction = {
    membershipProviderAccess: { findFirst: jest.fn() },
    medicineReservation: { findUnique: jest.fn(), create: jest.fn() },
    medicineReservationItem: { create: jest.fn() },
    medicineReservationAllocation: { create: jest.fn() },
    user: { findFirst: jest.fn() },
    batch: { findMany: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
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
  const service = new ReservationCreationService(
    { client } as never,
    audit as never,
    events as never,
  );
  return { audit, client, events, service, transaction };
}

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };
const command = {
  actor,
  providerId: 'provider-1',
  subjectUserId: 'subject-1',
  expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  items: [{ productId: 'product-1', quantity: 7 }],
  idempotencyKey: 'reservation-create-1',
} as const;

function arrangeAuthorized(harness: ReturnType<typeof createHarness>) {
  harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
  harness.transaction.medicineReservation.findUnique.mockResolvedValue(null);
  harness.transaction.$queryRaw.mockResolvedValue([
    { occurredAt: new Date('2026-08-14T00:00:00.000Z') },
  ]);
  harness.transaction.user.findFirst.mockResolvedValue({ id: 'subject-1' });
}

describe('ReservationCreationService', () => {
  it('authorizes before checking an idempotency receipt', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue(null);
    harness.transaction.medicineReservation.findUnique.mockResolvedValue({ id: 'reservation-1' });

    await expect(harness.service.create(command)).rejects.toThrow('Provider inventory not found');
    expect(harness.transaction.medicineReservation.findUnique).not.toHaveBeenCalled();
  });

  it('creates deterministic FEFO holds, aggregate rows, and bounded audit atomically', async () => {
    const harness = createHarness();
    arrangeAuthorized(harness);
    harness.transaction.batch.findMany.mockResolvedValue([
      {
        id: 'later',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-06-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 10,
        heldQuantity: 1,
        version: 4,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'first',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-01-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 5,
        heldQuantity: 0,
        version: 2,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservation.create.mockResolvedValue({ id: 'reservation-1' });
    harness.transaction.medicineReservationItem.create.mockResolvedValue({ id: 'item-1' });
    harness.transaction.medicineReservationAllocation.create.mockResolvedValue({ id: 'hold-1' });

    const result = await harness.service.create(command);

    expect(harness.client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(harness.transaction.batch.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'first', heldQuantity: 0, version: 2 }),
        data: { heldQuantity: { increment: 5 }, version: { increment: 1 } },
      }),
    );
    expect(harness.transaction.batch.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'later', heldQuantity: 1, version: 4 }),
        data: { heldQuantity: { increment: 2 }, version: { increment: 1 } },
      }),
    );
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        eventType: 'inventory.reservation.created',
        metadata: { itemCount: 1, totalQuantity: 7, expiresAt: command.expiresAt.toISOString() },
      }),
    );
    expect(harness.events.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      actor,
      expect.objectContaining({
        eventType: 'inventory.reservation.created',
        aggregateType: 'MedicineReservation',
        payload: expect.objectContaining({ status: 'PENDING', totalQuantity: 7 }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        version: 1,
        totalQuantity: 7,
        replayed: false,
      }),
    );
  });

  it('rejects a conflicting idempotency replay before taking holds', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    harness.transaction.medicineReservation.findUnique.mockResolvedValue({
      id: 'reservation-1',
      status: 'PENDING',
      version: 1,
      creationHash: 'different',
      items: [{ quantity: 7 }],
    });

    await expect(harness.service.create(command)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.transaction.batch.findMany).not.toHaveBeenCalled();
  });

  it('fails the transaction when a concurrent batch update loses', async () => {
    const harness = createHarness();
    arrangeAuthorized(harness);
    harness.transaction.batch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-01-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 10,
        heldQuantity: 0,
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    harness.transaction.medicineReservation.create.mockResolvedValue({ id: 'reservation-1' });
    harness.transaction.medicineReservationItem.create.mockResolvedValue({ id: 'item-1' });
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 0 });

    await expect(harness.service.create(command)).rejects.toBeInstanceOf(SerializableRetryError);
    expect(harness.transaction.medicineReservationAllocation.create).not.toHaveBeenCalled();
    expect(harness.audit.appendTenantUser).not.toHaveBeenCalled();
  });
});
