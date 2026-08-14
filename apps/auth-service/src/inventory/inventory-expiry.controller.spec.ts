import { HEADERS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS } from '../authorization/permission.constants';
import { REQUIRED_PERMISSIONS_KEY } from '../authorization/require-permissions.decorator';
import { InventoryController } from './inventory.controller';

describe('G3.18 expiry-worklist HTTP contract', () => {
  it('uses only the protected assigned-provider private no-store route', () => {
    const handler = InventoryController.prototype.listExpiryWorklist;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'providers/:providerId/expiry-worklist',
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      PERMISSIONS.inventoryStockRead,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([{ name: 'Cache-Control', value: 'private, no-store' }]),
    );
  });
});
