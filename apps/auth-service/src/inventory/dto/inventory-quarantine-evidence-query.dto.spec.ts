import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InventoryQuarantineEvidenceQueryDto } from './inventory-quarantine-evidence-query.dto';

describe('InventoryQuarantineEvidenceQueryDto', () => {
  it('transforms bounded pagination', async () => {
    const dto = plainToInstance(InventoryQuarantineEvidenceQueryDto, {
      limit: '25',
      offset: '10',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ limit: 25, offset: 10 });
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: 10_001 }])(
    'rejects invalid pagination: %o',
    async (input) => {
      expect(
        await validate(plainToInstance(InventoryQuarantineEvidenceQueryDto, input)),
      ).not.toHaveLength(0);
    },
  );
});
