import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelPatientReservationDto } from './cancel-patient-reservation.dto';
import { CreatePatientReservationDto } from './create-patient-reservation.dto';
import { PatientMedicineSearchQueryDto } from './patient-medicine-search-query.dto';
import { PatientReservationQueryDto } from './patient-reservation-query.dto';

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const strict = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('Task 0034 patient medicine DTO boundaries', () => {
  it('accepts bounded manual and precise search queries', async () => {
    const manual = plainToInstance(PatientMedicineSearchQueryDto, {
      q: 'paracetamol',
      city: 'Vaniyambadi',
      state: 'Tamil Nadu',
      limit: 25,
      offset: 0,
    });
    const precise = plainToInstance(PatientMedicineSearchQueryDto, {
      q: 'paracetamol',
      latitude: 12.6816,
      longitude: 78.6201,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });
    await expect(validate(manual, strict)).resolves.toHaveLength(0);
    await expect(validate(precise, strict)).resolves.toHaveLength(0);
  });

  it('rejects whitespace-only, unbounded and unknown search input', async () => {
    const dto = plainToInstance(PatientMedicineSearchQueryDto, {
      q: '   ',
      city: '   ',
      state: 'Tamil Nadu',
      radiusKm: 51,
      limit: 26,
      offset: 501,
      userId: uuid('9'),
    });
    const properties = (await validate(dto, strict)).map((error) => error.property);
    expect(properties).toEqual(
      expect.arrayContaining(['q', 'city', 'radiusKm', 'limit', 'offset', 'userId']),
    );
  });

  it('accepts create without expiresAt and rejects ownership injection and oversized quantities', async () => {
    const valid = plainToInstance(CreatePatientReservationDto, {
      items: [{ productId: uuid('1'), quantity: 2 }],
      idempotencyKey: 'reserve-1',
    });
    await expect(validate(valid, strict)).resolves.toHaveLength(0);

    const forged = plainToInstance(CreatePatientReservationDto, {
      items: [{ productId: uuid('1'), quantity: 101 }],
      idempotencyKey: 'reserve-2',
      subjectUserId: uuid('2'),
      tenantId: uuid('3'),
    });
    const properties = (await validate(forged, strict)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['items', 'subjectUserId', 'tenantId']));
  });

  it.each(['', '   ', ' key', 'key '])(
    'rejects non-canonical idempotency key %p at the DTO boundary',
    async (idempotencyKey) => {
      const create = plainToInstance(CreatePatientReservationDto, {
        items: [{ productId: uuid('1'), quantity: 1 }],
        idempotencyKey,
      });
      const cancel = plainToInstance(CancelPatientReservationDto, {
        expectedVersion: 1,
        idempotencyKey,
      });
      expect((await validate(create, strict)).map((error) => error.property)).toContain(
        'idempotencyKey',
      );
      expect((await validate(cancel, strict)).map((error) => error.property)).toContain(
        'idempotencyKey',
      );
    },
  );

  it('bounds cancellation version and reservation list pagination', async () => {
    const cancel = plainToInstance(CancelPatientReservationDto, {
      expectedVersion: Number.MAX_SAFE_INTEGER + 1,
      idempotencyKey: 'cancel-1',
    });
    expect((await validate(cancel, strict)).map((error) => error.property)).toContain(
      'expectedVersion',
    );

    const invalidQuery = plainToInstance(PatientReservationQueryDto, {
      status: 'DRAFT',
      limit: 26,
      offset: 501,
    });
    expect((await validate(invalidQuery, strict)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['status', 'limit', 'offset']),
    );
  });
});
