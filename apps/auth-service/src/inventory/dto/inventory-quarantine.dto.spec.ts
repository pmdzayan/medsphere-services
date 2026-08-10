import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuarantineBatchDto } from './inventory-quarantine.dto';

describe('QuarantineBatchDto', () => {
  it.each([
    'QUALITY_SUSPECT',
    'TEMPERATURE_EXCURSION',
    'PACKAGING_COMPROMISED',
    'STORAGE_DEVIATION',
  ])('accepts the allowlisted reason %s', async (reasonCode) => {
    const value = plainToInstance(QuarantineBatchDto, {
      expectedVersion: 1,
      idempotencyKey: 'quarantine-1',
      reasonCode,
    });
    await expect(validate(value)).resolves.toHaveLength(0);
  });

  it('rejects free text, short keys, invalid versions, and client authority fields', async () => {
    const value = plainToInstance(QuarantineBatchDto, {
      expectedVersion: 0,
      idempotencyKey: 'short',
      reasonCode: 'OTHER',
      tenantId: 'client-controlled',
      actorMembershipId: 'client-controlled',
      reason: 'free text',
    });
    const errors = await validate(value, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'expectedVersion',
        'idempotencyKey',
        'reasonCode',
        'tenantId',
        'actorMembershipId',
        'reason',
      ]),
    );
  });
});
