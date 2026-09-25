import { ConflictException } from '@nestjs/common';
import { ReservationLifecycleService } from './reservation-lifecycle.service';

function createHarness() {
  const transaction = {
    membershipProviderAccess: { findFirst: jest.fn() },
    medicineReservationCommand: { findUnique: jest.fn(), create: jest.fn() },
    medicineReservation: { findFirst: jest.fn(), updateMany: jest.fn() },
    patientNotification: { create: jest.fn() },
    patientTimelineEvent: { create: jest.fn() },
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

  it('rejects direct READY completion so pickup verification cannot be bypassed', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });

    await expect(
      harness.service.transition({
        actor,
        providerId: 'provider-1',
        reservationId: 'reservation-1',
        transition: 'COMPLETE',
        expectedVersion: 3,
        idempotencyKey: 'complete-1',
      }),
    ).rejects.toThrow('Reservation completion requires pickup-authorized POS checkout');

    expect(harness.transaction.medicineReservationCommand.findUnique).not.toHaveBeenCalled();
    expect(harness.transaction.medicineReservation.findFirst).not.toHaveBeenCalled();
    expect(harness.transaction.batch.updateMany).not.toHaveBeenCalled();
    expect(harness.transaction.medicineReservationAllocation.updateMany).not.toHaveBeenCalled();
    expect(harness.transaction.stockMovement.create).not.toHaveBeenCalled();
    expect(harness.audit.appendTenantUser).not.toHaveBeenCalled();
    expect(harness.events.appendTenantUser).not.toHaveBeenCalled();
  });

  it('writes a single patient inbox entry in the successful READY transition transaction', async () => {
    const harness = createHarness();
    harness.transaction.membershipProviderAccess.findFirst.mockResolvedValue({ id: 'access-1' });
    harness.transaction.medicineReservationCommand.findUnique.mockResolvedValue(null);
    harness.transaction.medicineReservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      subjectUserId: 'personal-patient-1',
      status: 'CONFIRMED',
      version: 2,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      items: [{ quantity: 4 }],
      allocations: [allocation],
    });
    harness.transaction.medicineReservation.updateMany.mockResolvedValue({ count: 1 });
    harness.transaction.medicineReservationCommand.create.mockResolvedValue({ id: 'command-1' });

    const command = {
      actor,
      providerId: 'provider-1',
      reservationId: 'reservation-1',
      transition: 'READY' as const,
      expectedVersion: 2,
      idempotencyKey: 'ready-1',
    };
    const result = await harness.service.transition(command);
    expect(result).toMatchObject({ status: 'READY', version: 3, replayed: false });
    expect(harness.transaction.patientNotification.create).toHaveBeenCalledTimes(1);
    expect(harness.transaction.patientNotification.create).toHaveBeenCalledWith({
      data: {
        recipientUserId: 'personal-patient-1',
        category: 'RESERVATION',
        title: 'Reservation ready',
        message: 'Your medicine reservation is ready for pickup.',
        destinationType: 'RESERVATION',
        destinationId: 'reservation-1',
        sourceType: 'reservation-ready-v1',
        sourceEventId: 'reservation-1',
      },
    });

    harness.transaction.medicineReservationCommand.findUnique.mockResolvedValue({
      reservationId: 'reservation-1',
      commandHash:
        harness.transaction.medicineReservationCommand.create.mock.calls[0][0].data.commandHash,
      resultingStatus: 'READY',
      resultingVersion: 3,
      reservation: { allocations: [{ quantity: 4 }] },
    });
    await expect(harness.service.transition(command)).resolves.toMatchObject({
      status: 'READY',
      replayed: true,
    });
    expect(harness.transaction.patientNotification.create).toHaveBeenCalledTimes(1);
    expect(harness.transaction.patientTimelineEvent.create).toHaveBeenCalledTimes(1);
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
