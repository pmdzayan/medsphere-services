import { InventoryEventWriter } from './inventory-event-writer';

const actor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  membershipId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
};
const occurredAt = new Date('2026-08-14T12:00:00.000Z');

describe('InventoryEventWriter', () => {
  const writer = new InventoryEventWriter();

  it('writes a versioned tenant-user envelope with a minimal payload', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event-1' });

    await writer.appendTenantUser({ outboxEvent: { create } } as never, actor, {
      eventType: 'inventory.reservation.ready',
      aggregateType: 'MedicineReservation',
      aggregateId: 'reservation-1',
      occurredAt,
      payload: { providerId: 'provider-1', status: 'READY', version: 3 },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        tenantId: actor.tenantId,
        eventType: 'inventory.reservation.ready',
        eventVersion: 1,
        aggregateType: 'MedicineReservation',
        aggregateId: 'reservation-1',
        actorType: 'TENANT_USER',
        actorMembershipId: actor.membershipId,
        actorUserId: actor.userId,
        systemService: null,
        payload: { providerId: 'provider-1', status: 'READY', version: 3 },
        occurredAt,
        availableAt: occurredAt,
      }),
      select: { id: true },
    });
  });

  it('writes a system-attributed envelope and preserves payload privacy validation', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event-2' });
    await writer.appendTenantSystem(
      { outboxEvent: { create } } as never,
      actor.tenantId,
      'reservation-expiry-worker',
      {
        eventType: 'inventory.reservation.expired',
        aggregateType: 'MedicineReservation',
        aggregateId: 'reservation-1',
        occurredAt,
        payload: { status: 'EXPIRED', cause: 'RESERVATION_EXPIRY' },
      },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: 'SYSTEM',
          systemService: 'reservation-expiry-worker',
          actorMembershipId: null,
          actorUserId: null,
        }),
      }),
    );

    await expect(
      writer.appendTenantUser({ outboxEvent: { create } } as never, actor, {
        eventType: 'inventory.reservation.created',
        aggregateType: 'MedicineReservation',
        aggregateId: 'reservation-2',
        occurredAt,
        payload: { patientEmail: 'not-allowed@test.invalid' },
      }),
    ).rejects.toThrow('sensitive key');
  });
});
