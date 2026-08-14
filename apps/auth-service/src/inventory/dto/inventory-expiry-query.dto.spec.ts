import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InventoryExpiryQueryDto } from './inventory-expiry-query.dto';

describe('InventoryExpiryQueryDto', () => {
  it('transforms bounded pagination and horizon values', async () => {
    const dto = plainToInstance(InventoryExpiryQueryDto, {
      horizonDays: '90',
      limit: '25',
      offset: '10',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ horizonDays: 90, limit: 25, offset: 10 });
  });

  it.each([
    { horizonDays: 0 },
    { horizonDays: 366 },
    { horizonDays: 1.5 },
    { limit: 101 },
    { offset: -1 },
  ])('rejects an invalid bounded query: %o', async (input) => {
    const dto = plainToInstance(InventoryExpiryQueryDto, input);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
