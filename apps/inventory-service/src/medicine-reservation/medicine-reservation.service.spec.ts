import { SerializableRetryError } from '@medsphere/database';
import { MedicineReservationService } from './medicine-reservation.service';

function createHarness() {
  const transaction = {
    tenantMembership: { findFirst: jest.fn() },
    provider: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    batch: { findMany: jest.fn(), updateMany: jest.fn() },
    medicineReservation: { findUnique: jest.fn(), create: jest.fn() },
    medicineReservationItem: { create: jest.fn() },
    medicineReservationAllocation: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const client = {
    ...transaction,
    $transaction: jest.fn(async (operation: (database: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendTenantUser: jest.fn() };
  const service = new MedicineReservationService({ client } as never, audit as never);
  return { audit, client, service, transaction };
}

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1' };
const command = {
  actor,
  providerId: 'provider-1',
  subjectUserId: 'subject-1',
  expiresAt: new Date('2026-08-01T00:00:00.000Z'),
  items: [{ productId: 'product-1', quantity: 7 }],
  idempotencyKey: 'reservation-1',
} as const;

describe('MedicineReservationService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-07-31T00:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('creates deterministic FEFO holds, typed allocations, and audit atomically', async () => {
    const harness = createHarness();
    harness.transaction.medicineReservation.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.provider.findFirst.mockResolvedValue({ id: 'provider-1' });
    harness.transaction.user.findFirst.mockResolvedValue({ id: 'subject-1' });
    harness.transaction.batch.findMany.mockResolvedValue([
      {
        id: 'batch-later',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-06-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 10,
        heldQuantity: 1,
        version: 4,
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
      },
      {
        id: 'batch-first',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-01-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 5,
        heldQuantity: 0,
        version: 2,
        status: 'ACTIVE',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservation.create.mockResolvedValue({ id: 'reservation-created' });
    harness.transaction.medicineReservationItem.create.mockResolvedValue({ id: 'item-created' });
    harness.transaction.medicineReservationAllocation.create.mockResolvedValue({
      id: 'allocation-created',
    });

    const result = await harness.service.create(command);

    expect(harness.client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(harness.transaction.batch.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'batch-first',
          onHandQuantity: 5,
          heldQuantity: 0,
          version: 2,
        }),
        data: { heldQuantity: { increment: 5 }, version: { increment: 1 } },
      }),
    );
    expect(harness.transaction.batch.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'batch-later', heldQuantity: 1, version: 4 }),
        data: { heldQuantity: { increment: 2 }, version: { increment: 1 } },
      }),
    );
    expect(harness.transaction.medicineReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: actor.tenantId,
          subjectUserId: 'subject-1',
          creationHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(harness.audit.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        eventType: 'inventory.reservation.created',
        metadata: { itemCount: 1, totalQuantity: 7, expiresAt: command.expiresAt.toISOString() },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ status: 'PENDING', version: 1, totalQuantity: 7, replayed: false }),
    );
  });

  it('replays a matching creation without taking new stock holds', async () => {
    const harness = createHarness();
    let creationHash = '';
    harness.transaction.medicineReservation.findUnique.mockImplementation(async () => {
      if (!creationHash) return null;
      return {
        id: 'reservation-1',
        status: 'PENDING',
        version: 1,
        creationHash,
        items: [{ quantity: 7 }],
      };
    });
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.provider.findFirst.mockResolvedValue({ id: 'provider-1' });
    harness.transaction.user.findFirst.mockResolvedValue({ id: 'subject-1' });
    harness.transaction.batch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-01-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 10,
        heldQuantity: 0,
        version: 1,
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);
    harness.transaction.batch.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservation.create.mockImplementation(async (args) => {
      creationHash = args.data.creationHash;
      return { id: args.data.id };
    });
    harness.transaction.medicineReservationItem.create.mockResolvedValue({ id: 'item-1' });
    harness.transaction.medicineReservationAllocation.create.mockResolvedValue({ id: 'hold-1' });

    await harness.service.create(command);
    harness.transaction.batch.updateMany.mockClear();
    harness.audit.appendTenantUser.mockClear();
    const replay = await harness.service.create(command);

    expect(replay).toEqual({
      reservationId: 'reservation-1',
      status: 'PENDING',
      version: 1,
      itemCount: 1,
      totalQuantity: 7,
      replayed: true,
    });
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
    expect(harness.audit.appendTenantUser).not.toHaveBeenCalled();
  });

  it('retries a lost stock hold and never writes an allocation for it', async () => {
    const harness = createHarness();
    harness.transaction.medicineReservation.findUnique.mockResolvedValue(null);
    harness.transaction.tenantMembership.findFirst.mockResolvedValue({ id: actor.membershipId });
    harness.transaction.provider.findFirst.mockResolvedValue({ id: 'provider-1' });
    harness.transaction.user.findFirst.mockResolvedValue({ id: 'subject-1' });
    harness.transaction.batch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        inventoryId: 'inventory-1',
        expiryDate: new Date('2027-01-01T00:00:00.000Z'),
        manufacturingDate: null,
        onHandQuantity: 10,
        heldQuantity: 0,
        version: 1,
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
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
