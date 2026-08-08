import { Test, TestingModule } from '@nestjs/testing';
import { ReservationService } from './reservation.service';
import { ReservationRepository } from './reservation.repository';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationStatus } from './enums/reservation-status.enum';
import { ReservationType } from './enums/reservation-type.enum';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

interface MockReservationRecord {
  id: string;
  userId: string;
  providerId: string;
  reservationType: string;
  status: string;
  scheduledAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const fixedDate = new Date('2026-12-31T10:00:00.000Z');
const fixedCreatedAt = new Date('2026-07-01T10:00:00.000Z');
const fixedUpdatedAt = new Date('2026-07-01T10:00:00.000Z');
const fixedDeletedAt = new Date('2026-07-02T10:00:00.000Z');

const buildRecord = (overrides: Partial<MockReservationRecord> = {}): MockReservationRecord => ({
  id: 'reservation-1',
  userId: 'user-1',
  providerId: 'provider-1',
  reservationType: ReservationType.MEDICINE_PICKUP,
  status: ReservationStatus.PENDING,
  scheduledAt: fixedDate,
  notes: null,
  createdAt: fixedCreatedAt,
  updatedAt: fixedUpdatedAt,
  deletedAt: null,
  ...overrides,
});

describe('ReservationService — legacy characterization', () => {
  let service: ReservationService;
  let repository: jest.Mocked<ReservationRepository>;

  const mockRecord = buildRecord();
  const mockDeletedRecord = buildRecord({
    id: 'reservation-deleted',
    deletedAt: fixedDeletedAt,
  });

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUser: jest.fn(),
      findByProvider: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReservationService, { provide: ReservationRepository, useValue: mockRepository }],
    }).compile();

    service = module.get<ReservationService>(ReservationService);
    repository = module.get(ReservationRepository);
  });

  describe('create — legacy characterization', () => {
    const baseDto: CreateReservationDto = {
      providerId: 'provider-1',
      reservationType: ReservationType.MEDICINE_PICKUP,
      scheduledAt: '2026-12-31T10:00:00.000Z',
    };

    it('should reject past scheduling', async () => {
      // Legacy characterization: past-date rejection is enforced
      const pastDto: CreateReservationDto = {
        ...baseDto,
        scheduledAt: '2020-01-01T00:00:00.000Z',
      };

      await expect(service.create('user-1', pastDto)).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should create a reservation with the supplied userId', async () => {
      // Legacy characterization: repository.create receives the userId from the service parameter
      repository.create.mockResolvedValue(mockRecord);

      const result = await service.create('user-1', baseDto);

      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
      expect(result.userId).toBe('user-1');
    });

    it('should accept future scheduling', async () => {
      // Legacy characterization: future dates are accepted
      repository.create.mockResolvedValue(mockRecord);

      const result = await service.create('user-1', baseDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('reservation-1');
    });
  });

  describe('findById — legacy characterization', () => {
    it('should return a reservation for the owning user', async () => {
      repository.findById.mockResolvedValue(mockRecord);

      const result = await service.findById('user-1', 'reservation-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('reservation-1');
    });

    it('should reject access by a different user', async () => {
      // Legacy characterization: cross-user access is forbidden
      repository.findById.mockResolvedValue(mockRecord);

      await expect(service.findById('other-user', 'reservation-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException for missing reservation', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should treat soft-deleted records as missing', async () => {
      // Legacy characterization: soft-deleted records are treated as not found
      repository.findById.mockResolvedValue(mockDeletedRecord);

      await expect(service.findById('user-1', 'reservation-deleted')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByUser — legacy characterization', () => {
    it('should return only non-deleted reservations for the user', async () => {
      repository.findByUser.mockResolvedValue([mockRecord, mockDeletedRecord]);

      const results = await service.findByUser('user-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('reservation-1');
    });
  });

  describe('update — legacy characterization', () => {
    it('should reject update by a different user', async () => {
      repository.findById.mockResolvedValue(mockRecord);

      await expect(
        service.update('other-user', 'reservation-1', { status: ReservationStatus.CONFIRMED }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject rescheduling to the past', async () => {
      repository.findById.mockResolvedValue(mockRecord);

      await expect(
        service.update('user-1', 'reservation-1', {
          scheduledAt: '2020-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should map response fields correctly', async () => {
      // Legacy characterization: response DTO maps scheduledAt, createdAt, updatedAt as ISO strings
      repository.findById.mockResolvedValue(mockRecord);
      repository.update.mockResolvedValue({
        ...mockRecord,
        status: ReservationStatus.CONFIRMED,
      });

      const result = await service.update('user-1', 'reservation-1', {
        status: ReservationStatus.CONFIRMED,
      });

      expect(result.scheduledAt).toBe('2026-12-31T10:00:00.000Z');
      expect(result.createdAt).toBe('2026-07-01T10:00:00.000Z');
      expect(result.updatedAt).toBe('2026-07-01T10:00:00.000Z');
    });

    it('should map notes to undefined when null', async () => {
      // Legacy characterization: null notes become undefined in response
      repository.findById.mockResolvedValue(mockRecord);
      repository.update.mockResolvedValue({ ...mockRecord, notes: null });

      const result = await service.update('user-1', 'reservation-1', {});

      expect(result.notes).toBeUndefined();
    });

    it('should map notes to string when present', async () => {
      // Legacy characterization: non-null notes are preserved
      repository.findById.mockResolvedValue(mockRecord);
      repository.update.mockResolvedValue({ ...mockRecord, notes: 'Some notes' });

      const result = await service.update('user-1', 'reservation-1', {});

      expect(result.notes).toBe('Some notes');
    });
  });

  describe('transition matrix — legacy characterization', () => {
    beforeEach(() => {
      repository.update.mockImplementation(
        (_id: string, data: Record<string, unknown>) =>
          Promise.resolve({ ...mockRecord, ...data }) as Promise<MockReservationRecord>,
      );
    });

    interface TransitionCase {
      from: ReservationStatus;
      to: ReservationStatus;
      expectedAccept: boolean;
      note?: string;
    }

    const cases: TransitionCase[] = [
      { from: ReservationStatus.PENDING, to: ReservationStatus.CONFIRMED, expectedAccept: true },
      { from: ReservationStatus.PENDING, to: ReservationStatus.CANCELLED, expectedAccept: true },
      { from: ReservationStatus.PENDING, to: ReservationStatus.EXPIRED, expectedAccept: true },
      { from: ReservationStatus.PENDING, to: ReservationStatus.READY, expectedAccept: false },
      { from: ReservationStatus.PENDING, to: ReservationStatus.COMPLETED, expectedAccept: false },
      { from: ReservationStatus.CONFIRMED, to: ReservationStatus.READY, expectedAccept: true },
      { from: ReservationStatus.CONFIRMED, to: ReservationStatus.CANCELLED, expectedAccept: true },
      {
        from: ReservationStatus.CONFIRMED,
        to: ReservationStatus.EXPIRED,
        expectedAccept: true,
        note: 'legacy READY does NOT accept EXPIRED, but ADR-005 requires READY→EXPIRED',
      },
      { from: ReservationStatus.CONFIRMED, to: ReservationStatus.COMPLETED, expectedAccept: false },
      { from: ReservationStatus.READY, to: ReservationStatus.COMPLETED, expectedAccept: true },
      { from: ReservationStatus.READY, to: ReservationStatus.CANCELLED, expectedAccept: true },
      {
        from: ReservationStatus.READY,
        to: ReservationStatus.EXPIRED,
        expectedAccept: false,
        note: 'LEGACY READY→EXPIRED IS REJECTED. ADR-005 target table REQUIRES READY→EXPIRED. This is a significant difference between the implementations.',
      },
      { from: ReservationStatus.COMPLETED, to: ReservationStatus.PENDING, expectedAccept: false },
      { from: ReservationStatus.COMPLETED, to: ReservationStatus.CANCELLED, expectedAccept: false },
      { from: ReservationStatus.COMPLETED, to: ReservationStatus.EXPIRED, expectedAccept: false },
      { from: ReservationStatus.CANCELLED, to: ReservationStatus.PENDING, expectedAccept: false },
      { from: ReservationStatus.EXPIRED, to: ReservationStatus.PENDING, expectedAccept: false },
    ];

    cases.forEach(({ from, to, expectedAccept, note }) => {
      it(`${from} → ${to} is ${expectedAccept ? 'ACCEPTED' : 'REJECTED'}${note ? ` (${note})` : ''}`, async () => {
        repository.findById.mockResolvedValue(buildRecord({ status: from }));

        const promise = service.update('user-1', 'reservation-1', { status: to });

        if (expectedAccept) {
          const result = await promise;
          expect(result.status).toBe(to);
        } else {
          await expect(promise).rejects.toThrow(BadRequestException);
        }
      });
    });
  });

  describe('remove — legacy characterization', () => {
    it('should reject removal by a different user', async () => {
      repository.findById.mockResolvedValue(mockRecord);

      await expect(service.remove('other-user', 'reservation-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should soft-delete the reservation', async () => {
      repository.findById.mockResolvedValue(mockRecord);
      repository.softDelete.mockResolvedValue(mockDeletedRecord);

      await service.remove('user-1', 'reservation-1');

      expect(repository.softDelete).toHaveBeenCalledWith('reservation-1');
    });

    it('should throw NotFoundException for already deleted reservation', async () => {
      repository.findById.mockResolvedValue(mockDeletedRecord);

      await expect(service.remove('user-1', 'reservation-deleted')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
