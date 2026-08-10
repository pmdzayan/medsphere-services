import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecordDamagedStockDto } from './inventory-damage.dto';

const valid = {
  expectedVersion: 1,
  quantity: 2,
  idempotencyKey: 'damage-1',
  reason: 'Confirmed broken packaging',
};

describe('RecordDamagedStockDto', () => {
  it('trims the bounded text fields and accepts database-safe integers', async () => {
    const dto = plainToInstance(RecordDamagedStockDto, {
      ...valid,
      idempotencyKey: ' damage-1 ',
      reason: ' Confirmed broken packaging ',
    });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual(
      [],
    );
    expect(dto).toMatchObject({
      idempotencyKey: 'damage-1',
      reason: 'Confirmed broken packaging',
    });
  });

  it.each([
    { expectedVersion: 0 },
    { expectedVersion: 2_147_483_648 },
    { quantity: 0 },
    { quantity: 2_147_483_648 },
    { idempotencyKey: ' ' },
    { idempotencyKey: 'x'.repeat(121) },
    { reason: ' ' },
    { reason: 'x'.repeat(501) },
  ])('rejects invalid input %j', async (change) => {
    const dto = plainToInstance(RecordDamagedStockDto, { ...valid, ...change });
    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects client-supplied authority and stock result fields', async () => {
    const dto = plainToInstance(RecordDamagedStockDto, {
      ...valid,
      tenantId: 'client-tenant',
      membershipId: 'client-membership',
      userId: 'client-user',
      providerId: 'client-provider',
      batchId: 'client-batch',
      permission: 'inventory.stock.damage',
      accessToken: 'client-token',
      onHandAfter: 0,
      actorType: 'SYSTEM',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'tenantId',
        'membershipId',
        'userId',
        'providerId',
        'batchId',
        'permission',
        'accessToken',
        'onHandAfter',
        'actorType',
      ]),
    );
  });
});
