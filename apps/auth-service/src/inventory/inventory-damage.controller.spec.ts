import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS } from '../authorization/permission.constants';
import { REQUIRED_PERMISSIONS_KEY } from '../authorization/require-permissions.decorator';
import { InventoryController } from './inventory.controller';

describe('G3.9 damaged-stock HTTP contract', () => {
  it('uses only the accepted protected private no-store route', () => {
    const handler = InventoryController.prototype.recordDamagedStock;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'providers/:providerId/batches/:batchId/damage',
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      PERMISSIONS.inventoryStockDamage,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([{ name: 'Cache-Control', value: 'private, no-store' }]),
    );
  });
});
