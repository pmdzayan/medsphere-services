import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS } from '../authorization/permission.constants';
import { REQUIRED_PERMISSIONS_KEY } from '../authorization/require-permissions.decorator';
import { InventoryController } from './inventory.controller';
describe('G3.8 transfer HTTP contract', () => {
  it('uses only the accepted protected no-store route', () => {
    const h = InventoryController.prototype.recordCompletedTransfer;
    expect(Reflect.getMetadata(PATH_METADATA, h)).toBe('providers/:providerId/transfers');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, h)).toBe(200);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, h)).toEqual([
      PERMISSIONS.inventoryStockTransfer,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, h)).toEqual(
      expect.arrayContaining([{ name: 'Cache-Control', value: 'private, no-store' }]),
    );
  });
});
