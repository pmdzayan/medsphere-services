import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ApplyInventoryImportDto, StageInventoryImportDto } from './inventory-import.dto';

const strict = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('Task 0042 inventory import DTO boundaries', () => {
  const validRow = {
    rowNumber: 2,
    identifier: '4006381333931',
    batchNumber: 'B-1',
    expiryDate: '2030-01-01',
    quantity: '10',
    purchasePrice: '5.00',
    mrp: '8.00',
    sellingPrice: '7.50',
  };

  it('accepts a bounded staging command and exact apply command', async () => {
    const stage = plainToInstance(StageInventoryImportDto, {
      sourceFormat: 'CSV',
      sourceFileName: 'inventory.csv',
      contentHash: 'a'.repeat(64),
      stageIdempotencyKey: 'stage-command-1',
      mapping: { Barcode: 'identifier' },
      rows: [validRow],
    });
    const apply = plainToInstance(ApplyInventoryImportDto, {
      idempotencyKey: 'apply-command-1',
    });

    await expect(validate(stage, strict)).resolves.toHaveLength(0);
    await expect(validate(apply, strict)).resolves.toHaveLength(0);
  });

  it('rejects more than 500 rows, unknown ownership fields, and malformed hashes', async () => {
    const stage = plainToInstance(StageInventoryImportDto, {
      sourceFormat: 'CSV',
      sourceFileName: 'inventory.csv',
      contentHash: 'not-a-sha256',
      stageIdempotencyKey: 'stage-command-2',
      mapping: { Barcode: 'identifier' },
      rows: Array.from({ length: 501 }, (_, index) => ({
        ...validRow,
        rowNumber: index + 2,
      })),
      tenantId: '10000000-0000-4000-8000-000000000001',
      providerId: '10000000-0000-4000-8000-000000000002',
    });

    const properties = (await validate(stage, strict)).map((error) => error.property);
    expect(properties).toEqual(
      expect.arrayContaining(['contentHash', 'rows', 'tenantId', 'providerId']),
    );
  });

  it.each([' inventory.csv', 'inventory.csv ', 'bad\u0000name.csv'])(
    'rejects unsafe source filename %p',
    async (sourceFileName) => {
      const stage = plainToInstance(StageInventoryImportDto, {
        sourceFormat: 'CSV',
        sourceFileName,
        contentHash: 'b'.repeat(64),
        stageIdempotencyKey: 'stage-command-3',
        mapping: { Barcode: 'identifier' },
        rows: [validRow],
      });
      expect((await validate(stage, strict)).map((error) => error.property)).toContain(
        'sourceFileName',
      );
    },
  );
});
