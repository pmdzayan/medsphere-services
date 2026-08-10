import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RecordCompletedTransferDto } from './inventory-transfer.dto';
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const valid = () => ({
  destinationProviderId: '00000000-0000-4000-8000-000000000002',
  sourceBatchId: '00000000-0000-4000-8000-000000000003',
  expectedSourceVersion: 1,
  quantity: 2,
  idempotencyKey: 'transfer-1',
});
describe('RecordCompletedTransferDto', () => {
  it('accepts its bounded command', async () => {
    await expect(
      pipe.transform(valid(), { type: 'body', metatype: RecordCompletedTransferDto }),
    ).resolves.toMatchObject(valid());
  });
  it.each([
    'tenantId',
    'membershipId',
    'userId',
    'permission',
    'sourceInventoryId',
    'destinationBatchId',
    'accessToken',
  ])('rejects client authority %s', async (field) => {
    await expect(
      pipe.transform(
        { ...valid(), [field]: 'untrusted' },
        { type: 'body', metatype: RecordCompletedTransferDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    { quantity: 0 },
    { quantity: 2_147_483_648 },
    { expectedSourceVersion: 0 },
    { destinationProviderId: 'bad' },
    { sourceBatchId: 'bad' },
    { idempotencyKey: '' },
  ])('rejects unsafe input %#', async (change) => {
    await expect(
      pipe.transform(
        { ...valid(), ...change },
        { type: 'body', metatype: RecordCompletedTransferDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
