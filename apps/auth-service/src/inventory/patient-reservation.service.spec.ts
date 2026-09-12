import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientReservationService } from './patient-reservation.service';

const identity = {
  userId: '10000000-0000-4000-8000-000000000001',
  membershipId: '10000000-0000-4000-8000-000000000002',
  tenantId: '10000000-0000-4000-8000-000000000003',
  sessionId: '10000000-0000-4000-8000-000000000004',
  securityVersion: 1,
  tokenId: '10000000-0000-4000-8000-000000000005',
};
const providerTenantId = '20000000-0000-4000-8000-000000000001';
const providerId = '20000000-0000-4000-8000-000000000002';
const productId = '30000000-0000-4000-8000-000000000001';
const reservationId = '40000000-0000-4000-8000-000000000001';

function createHarness() {
  const replay = {
    id: reservationId,
    subjectUserId: identity.userId,
    creationHash: '',
    expiresAt: new Date('2026-09-13T00:00:00.000Z'),
    items: [{ quantity: 1 }],
  };
  const transaction = {
    inventory: { count: jest.fn().mockResolvedValue(1) },
    batch: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    medicineReservation: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    medicineReservationItem: { create: jest.fn() },
    medicineReservationAllocation: { create: jest.fn() },
    medicineReservationCommand: { findUnique: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ occurredAt: new Date('2026-09-12T12:00:00.000Z') }]),
  };
  const client = {
    tenantMembership: { findFirst: jest.fn().mockResolvedValue({ id: identity.membershipId }) },
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: identity.tenantId }) },
    provider: {
      findFirst: jest.fn().mockResolvedValue({ id: providerId, tenantId: providerTenantId }),
    },
    medicineReservation: transaction.medicineReservation,
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = { appendPlatformUser: jest.fn() };
  const events = { appendTenantSystem: jest.fn() };
  return {
    replay,
    transaction,
    client,
    service: new PatientReservationService({ client } as never, audit as never, events as never),
  };
}

describe('PatientReservationService', () => {
  it('requires personal NONE context before listing reservations', async () => {
    const { service, client } = createHarness();
    client.tenant.findFirst.mockResolvedValue(null);
    await expect(service.list(identity, { limit: 20, offset: 0 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.medicineReservation.findMany).not.toHaveBeenCalled();
  });

  it('scopes list and detail reads exclusively to the authenticated global user', async () => {
    const { service, client } = createHarness();
    await service.list(identity, { limit: 20, offset: 0 });
    expect(client.medicineReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subjectUserId: identity.userId } }),
    );

    await expect(service.get(identity, reservationId)).rejects.toBeInstanceOf(NotFoundException);
    expect(client.medicineReservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: reservationId, subjectUserId: identity.userId } }),
    );
  });

  it.each(['', '   ', ' key', 'key '])(
    'rejects non-canonical create idempotency key %p before provider access',
    async (idempotencyKey) => {
      const { service, client } = createHarness();
      await expect(
        service.create({
          identity,
          providerId,
          items: [{ productId, quantity: 1 }],
          idempotencyKey,
          request: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.provider.findFirst).not.toHaveBeenCalled();
    },
  );

  it('replays a successful create before rechecking current listing eligibility', async () => {
    const { service, transaction } = createHarness();
    const command = {
      identity,
      providerId,
      items: [{ productId, quantity: 1 }],
      idempotencyKey: 'reserve-1',
      request: {},
    };

    const creationHash = createHash('sha256')
      .update(
        JSON.stringify({
          subjectUserId: identity.userId,
          providerId,
          requestedExpiresAt: null,
          items: command.items,
        }),
      )
      .digest('hex');
    transaction.medicineReservation.findUnique.mockResolvedValue({
      id: reservationId,
      subjectUserId: identity.userId,
      creationHash,
      expiresAt: new Date('2026-09-13T00:00:00.000Z'),
      items: [{ quantity: 1 }],
    });
    transaction.inventory.count.mockResolvedValue(0);

    const result = await service.create(command);
    expect(result).toEqual(
      expect.objectContaining({ reservationId, replayed: true, totalQuantity: 1 }),
    );
    expect(transaction.inventory.count).not.toHaveBeenCalled();
    expect(transaction.batch.findMany).not.toHaveBeenCalled();
  });
});
