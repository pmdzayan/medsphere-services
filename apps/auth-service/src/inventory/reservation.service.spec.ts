import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { ReservationRepository } from './reservation.repository';
import { ReservationService } from './reservation.service';

describe('ReservationService', () => {
  const identity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };
  let repository: jest.Mocked<ReservationRepository>;
  let service: ReservationService;

  beforeEach(() => {
    repository = {
      hasProviderAccess: jest.fn(),
      list: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<ReservationRepository>;
    service = new ReservationService(repository);
  });

  it('conceals reservations from an unassigned membership', async () => {
    repository.hasProviderAccess.mockResolvedValue(false);

    await expect(service.list(identity, randomUUID(), { limit: 50, offset: 0 })).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('maps only operational reservation data without patient identity or notes', async () => {
    const providerId = randomUUID();
    const reservationId = randomUUID();
    repository.hasProviderAccess.mockResolvedValue(true);
    repository.find.mockResolvedValue({
      id: reservationId,
      status: 'CONFIRMED',
      version: 2,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      items: [
        {
          productId: randomUUID(),
          quantity: 3,
          product: { name: 'Medicine', genericName: 'Generic', brand: 'Brand' },
          allocations: [
            {
              batchId: randomUUID(),
              quantity: 3,
              status: 'HELD',
              batch: { batchNumber: 'BATCH-1' },
            },
          ],
        },
      ],
    });

    const result = await service.get(identity, providerId, reservationId);

    expect(repository.find).toHaveBeenCalledWith(identity.tenantId, providerId, reservationId);
    expect(result).toMatchObject({ id: reservationId, totalQuantity: 3 });
    expect(result).not.toHaveProperty('subjectUserId');
    expect(result).not.toHaveProperty('notes');
  });
});
