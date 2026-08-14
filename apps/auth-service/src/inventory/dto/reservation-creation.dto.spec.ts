import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProviderReservationDto } from './reservation-creation.dto';

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('CreateProviderReservationDto', () => {
  it('accepts a bounded normalized reservation command', async () => {
    const dto = plainToInstance(CreateProviderReservationDto, {
      subjectUserId: uuid('1'),
      expiresAt: '2026-09-01T00:00:00.000Z',
      items: [{ productId: uuid('2'), quantity: 3 }],
      idempotencyKey: '  reservation-create-1  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.idempotencyKey).toBe('reservation-create-1');
  });

  it('rejects malformed subjects, items, quantities, expiry, and short keys', async () => {
    const dto = plainToInstance(CreateProviderReservationDto, {
      subjectUserId: 'not-a-uuid',
      expiresAt: 'tomorrow',
      items: [{ productId: 'not-a-uuid', quantity: 0 }],
      idempotencyKey: 'short',
    });

    expect((await validate(dto)).map(({ property }) => property).sort()).toEqual([
      'expiresAt',
      'idempotencyKey',
      'items',
      'subjectUserId',
    ]);
  });
});
